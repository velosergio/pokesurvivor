/* ============ room.js — una partida del cooperativo en el servidor (Node) ============
 *
 * Una sala = una simulación propia (sim.js, con su semilla) con TODOS los
 * jugadores dentro, avanzada con G.Step.team a 30 pasos por segundo (paso fijo
 * de 33 ms). El servidor manda en todo salvo en el movimiento propio, que lo
 * decide cada navegador y aquí sólo se VALIDA:
 *
 *   in     {seq,x,y,dx,dy,move}  posición pedida. Se acepta si desde la última
 *          aceptada no supera velocidad × tiempo × 1,25 + 8 px y el camino no
 *          atraviesa paredes ni objetos sólidos (se recorre con G.World.collide,
 *          como se mueve el propio jugador); si no, se lleva hasta donde se
 *          puede. Sin `in` en 0,5 s, o desconectado, el Pokémon se queda quieto.
 *          `move` (hueco activo) se aplica cuando el navegador lo cambia.
 *   pick   {choice}  elige carta de nivel, objeto o fusión (índice).
 *   reroll           cambia las cartas de nivel (1 por partida + Mejoras → Cambio de cartas).
 *   hold   {on}      pausa mientras el navegador elige algo por su cuenta.
 *   watch  {uid}     caído: mira a ese compañero vivo ('' = a ti mismo).
 *
 * Experiencia y nivel son del equipo (como en js/net/coop.js). Al subir, cada
 * jugador vivo recibe `level` y la partida se para hasta que eligen todos los
 * conectados (20 s como mucho por elección: luego, la primera). A un
 * desconectado se le elige la primera al momento.
 *
 * Cada 2 pasos, a cada jugador: `ev` (si hay eventos) y `snap` (binario,
 * proto.encSnap) con los enemigos a ≤ 950 px de ÉL (o, caído, del compañero
 * al que mira: focusOf) como cambios desde el último
 * snap (se lleva lo que sabe cada uno) y como mucho ~3 KB: si no cabe todo, van
 * los más cercanos y el resto en el siguiente.
 *
 * Desconectados: quien no vuelve en 20 s sale del campo (puede volver con
 * «Reconectar»). Si no queda nadie conectado, la partida se para y espera el
 * minuto del lobby (BACK_MS); pasado, se acaba ('empty').
 *
 * Fin: caídos todos 1,6 s (fuera de la arena de la grieta), o 1 h de partida.
 * A cada uno `over {results}` con su resumen; onOver(todos) y, si el tiempo
 * cuenta, la marca de grupo (rank.submitGroup). Un error en el paso cierra
 * sólo esta sala, con `over` de lo conseguido.
 *
 * Mensajes de `level` (todos con `options` = [{id, name, ...}]):
 *   kind 'level'  cartas de nivel: {id, type, name, tag, desc, icon, color}; lv = nivel; rr = cambios que quedan
 *   kind 'item'   objeto: [0] seguir con el tuyo, [1] ponerte el nuevo
 *   kind 'bond'   fusión: cada opción, los movimientos que se unen
 *
 * Eventos (`ev`, lista de listas; los que ya existían en coop.js con su forma):
 *   rift arena aw al jd jk wx ev hz fxr  (de los sistemas del juego, tal cual)
 *   say [txt, s] · pb [tx, ty] prop roto · c [jugador, move, nivel, aim, evol] ataque
 *   hn [id, daño, color] número grande · die [ids] enemigos tuyos que caen
 *   bd [id, dex] jefe vencido · sh [dex] shiny · rw [dex] Pokémon rescatado
 *   bomb [x, y] · mag · heal [jugador] · bio [bioma] · ja [x, y, anim, dir] Arceus
 *   wait [nombres] quién está eligiendo (vacía = sigue)
 *   kit [huecos, activo, objeto, vínculos, [velocidad, imán, × de la habilidad]] tu Pokémon (sólo a ti, al cambiar)
 *   tx [jugador, texto, color, grande, alto] aviso sobre un jugador («¡Esquiva!», «¡Robustez!»: Player.notice)
 *
 * Cada miembro trae `kit` del hello: { up: niveles de las mejoras de la tienda,
 * bind: atajos, ban: vetados, start / start2: movimientos iniciales elegidos,
 * nat / ab / tms: naturaleza, hueco de la habilidad y MT }. Con la cuenta de
 * servicio, lobby.js deja en `up` lo menos entre eso y la partida guardada
 * (rank.js checkKits) y en `saved` lo guardado que decide naturaleza,
 * habilidad y MT, que manda sobre nat / ab / tms (heroOf); perks() además
 * recorta cada mejora a su máximo. Con qué naturaleza y habilidad juega cada
 * uno se le cuenta en `started` (hero(uid)), para que su navegador lo lleve igual.
 * Clima de habilidad (Sequía, Llovizna...): como en solitario, cada jugador lo
 * pone al empezar y cada 3 min si no hay otro; con varios, el primero que toque.
 *
 * Altares, cofres y trampas los decide el servidor (interact.js); a los navegadores les llegan
 * `alt` (quién se lleva el poder), `chs` (cómo va la apertura de un cofre) y `pb` (roto/abierto/saltó).
 */
'use strict';
const { createSim } = require('./sim');
const proto = require('./proto');
const { BACK_MS } = require('./lobby');

/** Paso fijo. setInterval sólo acepta milisegundos enteros: 33 ms son ~30,3 Hz. */
const STEP_MS = Math.round(1000 / 30);
const DT = STEP_MS / 1000;
/** Como mucho estos pasos de golpe si el bucle se atrasa (~165 ms, como los 150 de antes). */
const MAX_CATCHUP = 5;
/** Un snap cada tantos pasos (~15/s). */
const SNAP_EVERY = 2;
/** Radio de lo que se manda a cada uno (y el de salida, con margen para que no parpadee). */
const NEAR = 950, NEAR_OUT = 1000;
/** Tamaño objetivo de un snap (bytes). */
const SNAP_BUDGET = 3000;
/** Sin `in` en este tiempo, quieto. */
const IN_STALE = 0.5;
/** Margen de la validación de movimiento. */
const SPEED_K = 1.25, SLACK = 8;
/** Tiempo máximo para elegir (s de pausa) y para volver tras un corte (s). */
const CHOICE_MAX = 20, BACK_MAX = 20;
/** Sin nadie conectado, la partida espera parada lo mismo que el lobby guarda el sitio (s). */
const EMPTY_MAX = BACK_MS / 1000;
/** Caídos todos este tiempo → fin. */
const DOWN_END = 1.6;
/** Tope de partida (los límites del ranking). */
const MAX_TIME = 3600;
/** Distancia a la que un compañero vivo te va levantando. */
const REVIVE_R = 56;
/** Un salto así en un paso es un viaje del juego (grieta, Sentencia). */
const TELEPORT = 200;
/** Tras un viaje, las posiciones muy lejanas son de antes del viaje: se ignoran. */
const TP_GRACE = 3, TP_FAR = 300;
/** Eventos de adorno (ataques, números) como mucho por envío. */
const COSMETIC_MAX = 40;
const SHOTS_MAX = 30, PICKUPS_ADD_MAX = 40, PICKUP_RESERVE = 12;

const PICK_KINDS = ['xp', 'xpBig', 'coin', 'heal', 'bomb', 'magnet', 'ticket', 'ticket10', 'item'];

const r1 = v => Math.round(v);
const r2 = v => Math.round(v * 100) / 100;
const str = v => (v == null ? '' : String(v));

/**
 * Crea una partida.
 * @param {object} o
 * @param {{uid:string,name:string,dex:number,shiny:boolean,kit?:object}[]} o.members  jugadores (1-4)
 * @param {number} o.seed
 * @param {(uid:string, msg:object) => (boolean|void)} o.send  false = no ha salido (se le reenvía todo)
 * @param {(results:object[]) => void} [o.onOver]
 * @param {{submitGroup: Function}} [o.rank]
 * @param {boolean} [o.ranked=true]  false: la marca no sube al ranking de grupo (lobby.js: algo no cuadra con la partida guardada, o condiciones a medida)
 * @param {object} [o.rules]  condiciones a medida de la sala (proto.RULES): ×enemigos, ×grietas, ×monedas, ×tickets
 * @param {{error: Function, warn: Function}} [o.logger=console]
 * @returns {{ input, pick, hold, watch, drop, back, hero, start, stop, tick, debug }}
 */
function createRoom({ members, seed = 1, send, onOver, rank, ranked = true, rules = null, logger = console } = {}) {
  if (!Array.isArray(members) || !members.length) throw new Error('createRoom necesita members');
  const sim = createSim({ seed: seed >>> 0 });
  const { G, clock } = sim;
  // Las esferas de Mundo Misterioso (js/systems/orbs.js) aún no van por el
  // protocolo (ni en la bolsa del snap ni como orden del jugador): en grupo no salen.
  G.Orbs.enabled = false;
  const ANIMS = ['Idle', 'Walk', 'Attack', 'Shoot', 'Charge', 'Hurt', 'Faint'];
  const TYPES = Object.keys(G.U.TYPE_COLOR);

  // ---------------- estado ----------------

  let time = 0, biome = 0, steps = 0, downT = 0, pendingLevels = 0;
  let over = false, stopped = false, timer = null, lastReal = 0, acc = 0;
  /** Equipo: nivel y experiencia compartidos; monedas y tickets, de todos. */
  const team = { level: 1, xp: 0, xpNext: G.Player.xpFor(1), coins: 0, t1: 0, t10: 0 };
  /** Eventos para todos desde el último envío (y cuántos son de adorno). */
  let evAll = [], cosmetic = 0;
  /** Enemigos que han caído desde el último envío (para `die`). */
  let died = new Set();
  let lastWait = '';

  /**
   * Con qué Pokémon juega un miembro (G.Mons.loadout): naturaleza, habilidad y
   * MT de su partida guardada en la nube (kit.saved) si se ha leído; si no (en
   * local, o no se pudo leer: la partida no sube al ranking), lo que pide su
   * navegador, quedándose sólo con lo que puede tener ese Pokémon.
   */
  function heroOf(dex, kit) {
    return G.Mons.loadout(dex, kit.saved && typeof kit.saved === 'object' ? kit.saved : G.Mons.saveOf(dex, kit));
  }

  /** Un jugador de la sala. */
  const seats = members.map((m, i) => {
    const dex = G.DEX_BY[m.dex] && G.SPRITE_META[m.dex] ? m.dex : 25;
    // Mejoras de la tienda (kit.up): perks() ya recorta cada una a su máximo.
    const kit = m.kit || {};
    const perks = G.Upgrades.perks(kit.up || {});
    const hero = heroOf(dex, kit);
    const pl = new G.Player(hero.mon, perks, !!m.shiny);
    if (hero.ability) pl.setAbility(hero.ability);
    pl.uid = m.uid; pl.tag = str(m.name);
    // Atajos (huecos fijos) y Veto, como en game.js startRun.
    (Array.isArray(kit.bind) ? kit.bind : []).forEach((id, j) => { if (id && G.Moves.BY_ID[id]) pl.bind[id] = j; });
    pl.banned = new Set((Array.isArray(kit.ban) ? kit.ban : []).filter(id => G.Moves.BY_ID[id]).slice(0, perks.bans));
    return {
      id: i, uid: m.uid, name: str(m.name), pl, perks, kit, hero: { nat: hero.mon.nature, ab: hero.slot },
      on: true, gone: false, offT: 0,
      in: null, inAt: -1, ack: 0, lastMove: -1, axis: [0, 0],
      accX: 0, accY: 0, accT: 0, tpT: -99,
      queue: [], holdOn: false, holdT: 0, watch: '',
      known: new Map(), pk: new Set(), ev: [], evCos: 0, kitSig: '', rr: 0,
      shinies: [], rescued: []
    };
  });
  const byUid = new Map(seats.map(s => [s.uid, s]));
  /** Los que siguen en la partida (los que se fueron del todo, no). */
  const active = () => seats.filter(s => !s.gone);
  const players = () => active().map(s => s.pl);
  const anchor = () => { const ps = players(); return ps.find(p => !p.dead) || ps[0] || seats[0].pl; };
  const seatOf = pl => seats.find(s => s.pl === pl);
  /**
   * Dónde mira un jugador (de dónde se le mandan enemigos, disparos y objetos):
   * su Pokémon o, si está caído, el compañero vivo que haya elegido con `watch`.
   * Al levantarse, o si el elegido cae o se va, vuelve a sí mismo.
   */
  function focusOf(s) {
    if (!s.watch) return s.pl;
    const w = s.pl.dead ? byUid.get(s.watch) : null;
    if (w && w !== s && !w.gone && !w.pl.dead) return w.pl;
    s.watch = '';
    return s.pl;
  }

  // ---------------- el juego dentro de la simulación ----------------

  /** Media de los bonus de experiencia, repartida entre los que sois (coop.js xpFactor). */
  function xpK() {
    const ps = players();
    const n = Math.max(1, ps.length);
    const avg = ps.reduce((s, p) => s + (p.xpMul || 1), 0) / n;
    return avg / (1 + 0.6 * (n - 1));
  }

  function gainTeamXp(v) {
    team.xp += v * xpK();
    while (team.xp >= team.xpNext) {
      team.xp -= team.xpNext;
      team.level++;
      team.xpNext = G.Player.xpFor(team.level);
      pendingLevels++;
    }
    syncLevel();
  }
  /** Cada jugador lleva el nivel del equipo (lo usan los daños y las cartas). */
  function syncLevel() { for (const s of seats) { s.pl.level = team.level; s.pl.xp = team.xp; s.pl.xpNext = team.xpNext; } }

  const pushAll = (ev, cos) => {
    if (cos) { if (cosmetic >= COSMETIC_MAX) return; cosmetic++; }
    evAll.push(ev);
  };
  const pushTo = (s, ev, cos) => {
    if (cos) { if (s.evCos >= COSMETIC_MAX) return; s.evCos++; }
    s.ev.push(ev);
  };

  G.Game = {
    get player() { return anchor(); },
    st: { get time() { return time; } },
    everyone: players,
    levelXp() { return Math.ceil((team.xpNext - team.xp + 1) / xpK()); },
    flash() {},
    curtain() {},
    /** Aviso sobre un jugador (Player.notice): a los navegadores, que no lo ven pasar aquí. */
    notice(p, text, color, big, dy) {
      const s = seatOf(p);
      if (s) pushAll(['tx', s.id, str(text), str(color), big ? 1 : 0, dy | 0], true);
    },
    offerBond() { offerBonds(); },
    get state() { return over ? 'over' : 'playing'; }
  };

  const coopOwn = {
    active: true, isHost: true, ANIMS, COLORS: ['#ffcb3d', '#5fc8ff', '#7ee07a', '#ff8ad8', '#ff8a3d', '#b48cff', '#4de0d0', '#ff5a6e', '#d6f06a', '#f4f8ff'],
    scaleRate: n => 1 + 0.75 * Math.min(3, Math.max(0, n - 1)) + 0.4 * Math.max(0, n - 4),
    scaleHp: n => 1 + 0.3 * Math.max(0, n - 1),
    /** Lo que multiplica la experiencia de un orbe (aquí no hay "tu" xpMul que quitar). */
    xpFactor: xpK,
    players, puppets: () => [],
    members: members.slice(),
    broadcast(ev) { pushAll(ev); },
    say(text, secs) { pushAll(['say', text, secs]); },
    propBroken(p) { pushAll(['pb', p.tx, p.ty]); },
    cast(pl, m) {
      const s = seatOf(pl);
      if (s) pushAll(['c', s.id, m.id, m.lvl, r2(pl.aim), m.evolved ? 1 : 0], true);
    },
    hurtShown(e, d, color) {
      if (!(e.boss || d >= 100)) return;
      for (const s of active()) {
        const f = focusOf(s);
        if (s.on && G.U.dist2(f.x, f.y, e.x, e.y) <= 700 * 700) pushTo(s, ['hn', e.id, d, color], true);
      }
    },
    enemyGone(e, wasKilled) {
      if (!wasKilled) return;
      died.add(e.id);
      if (e.boss || e.legend) pushAll(['bd', e.id, e.dex]);
    }
  };
  G.Coop = new Proxy(coopOwn, { get: (o, k) => (k in o ? o[k] : () => {}) });

  /** Shiny salvaje: para todo el equipo (como en el cooperativo de hoy). */
  G.onShinyCaught = e => {
    pushAll(['sh', e.dex]);
    for (const s of active()) s.shinies.push(e.dex);
  };
  /** Pokémon perdido llevado a casa: se une a todos. */
  G.onRescue = dex => {
    pushAll(['rw', dex]);
    for (const s of active()) s.rescued.push(dex);
  };

  // ---------------- arranque de la partida ----------------

  // El azar de la partida (G.RNG) sale de la semilla de la sala, antes de los reset.
  G.RNG.reseed(seed | 0 || 1);
  for (const m of [G.Projectiles, G.EnemyMgr, G.Pickups, G.Path, G.Hazards]) m.clear();
  for (const m of [G.Spawner, G.Rift, G.Judgment, G.Events, G.Weather]) m.reset();
  G.Combat.clearFields();
  // Condiciones a medida (después de los reset, que las dejan en lo normal).
  const pace = proto.cleanRules(rules);
  if (proto.customRules(pace)) ranked = false;
  G.Spawner.setPace(pace.spawn);
  G.Rift.setPace(pace.rift);
  G.Pickups.setRates(pace);
  G.World.reset(seed | 0 || 1);
  G.World.setBiome(0, true);
  seats.forEach((s, i) => {
    const p = s.pl;
    p.x = (i - (seats.length - 1) / 2) * 34; p.y = 0;
    G.World.collide(p);
    // Movimientos iniciales (Mejoras), como en game.js startRun: los elegidos si
    // tiene las mejoras y son de los suyos (con sus MT); si no, el de serie y,
    // con Repertorio, uno al azar.
    const [first, second] = G.startPicks(p.dex, { start: s.kit.start, start2: s.kit.start2, up: s.kit.up || {}, mon: p.mon });
    p.learnStart(first, second, s.perks.startMoves, l => G.U.pick(l));
    s.accX = p.x; s.accY = p.y;
  });
  syncLevel();
  G.Camera.x = 0; G.Camera.y = 0;

  // ---------------- recogida ----------------

  function collect(o, who) {
    who = who || anchor();
    const s = seatOf(who);
    switch (o.kind) {
      case 'xp': case 'xpBig': gainTeamXp(o.value); break;
      case 'coin': team.coins += o.value; break;
      case 'ticket': team.t1++; break;
      case 'ticket10': team.t10++; break;
      case 'heal': who.heal(who.maxHp * 0.3); if (s) pushAll(['heal', s.id]); break;
      case 'magnet': G.Pickups.pullAll(); pushAll(['mag']); break;
      case 'item': if (s) offerItem(s, o.value); break;
      case 'bomb': {
        const R = G.Camera.outerRadius();
        pushAll(['bomb', r1(who.x), r1(who.y)]);
        for (const e of G.EnemyMgr.all()) {
          if (e.dead || G.U.dist2(e.x, e.y, who.x, who.y) > R * R) continue;
          e.lastBy = who;
          e.hurt(60 + team.level * 14, '#ff7b3d', e.x - who.x, e.y - who.y, 160);
        }
        break;
      }
    }
  }

  // ---------------- elecciones (cartas, objetos, fusiones) ----------------

  const cardOut = c => ({ id: str(c.key), type: str(c.type), name: str(c.title), tag: str(c.tag), desc: str(c.desc), icon: str(c.icon), color: str(c.color) });
  const itemOut = id => ({ id: str(id), name: str((G.Items.BY[id] || {}).name) });
  const groupOut = ms => ({ id: ms.map(m => m.id).join('+'), name: ms.map(m => m.name).join(' + '), lv: ms.map(m => m.lvl) });

  /** Cambios de cartas que le quedan: 1 gratis por partida + los comprados (Mejoras → Cambio de cartas). */
  const rerollsLeft = s => Math.max(0, 1 + (s.perks.rerolls || 0) - s.rr);

  /** Mensaje de la elección que tiene delante (rr: cambios de cartas que le quedan). */
  /** left: s que le quedan para elegir (el navegador enseña la barra; tras cambiar cartas o volver, no empieza de cero). */
  function choiceMsg(c, s) {
    const left = Math.round(Math.max(0, CHOICE_MAX - (c.wait || 0)) * 10) / 10;
    if (c.kind === 'level') return { t: 'level', kind: 'level', lv: c.lv, rr: c.fixed ? 0 : rerollsLeft(s), left, options: c.options.map(cardOut) };
    if (c.kind === 'item') return { t: 'level', kind: 'item', left, options: [itemOut(c.cur), itemOut(c.next)] };
    return { t: 'level', kind: 'bond', left, options: c.options.map(groupOut) };
  }

  /** Añade una elección; a un desconectado se le resuelve al momento. */
  function enqueue(s, c) {
    c.wait = 0;
    s.queue.push(c);
    if (!s.on) { resolveAll(s); return; }
    if (s.queue.length === 1) send(s.uid, choiceMsg(c, s));
  }

  /** Resuelve la elección de delante con la opción i. */
  function resolve(s, i) {
    const c = s.queue.shift();
    if (!c) return;
    const p = s.pl;
    if (c.kind === 'level') {
      const card = c.options[i] || c.options[0];
      if (card) card.apply(p);
      // «Olvidar»: delante, la elección de qué movimiento (fija: no se cambia).
      // A un desconectado no se le hace olvidar nada.
      if (card && card.then && s.on) {
        const options = card.then(p);
        if (options.length) s.queue.unshift({ kind: 'level', lv: c.lv, options, fixed: true, wait: 0 });
      }
    }
    else if (c.kind === 'item') { if (i === 1 && p.item !== c.next) p.equip(c.next); }
    else if (c.kind === 'bond') {
      const opt = p.bondOptions();
      // Lo que se podía fusionar puede haber cambiado: sólo si sigue valiendo.
      const ms = c.options[i] || c.options[0];
      if (opt && ms && ms.every(m => opt.loose.includes(m)) && p.bonds > 0) p.fuse(ms, opt.group);
    }
    if (s.on && s.queue.length) send(s.uid, choiceMsg(s.queue[0], s));
  }
  /** Lo que se elige por quien no elige: la primera, salvo «Olvidar» (gastaría el nivel). */
  const autoPick = c => c.kind === 'level' ? Math.max(0, c.options.findIndex(o => !o.then)) : 0;
  // (Lo que iba a olvidar se queda: sin elegir, no se olvida nada.)
  function resolveAll(s) { while (s.queue.length) { if (s.queue[0].fixed) s.queue.shift(); else resolve(s, autoPick(s.queue[0])); } }

  function offerItem(s, id) {
    const p = s.pl;
    if (!G.Items.BY[id]) return;
    if (!p.item) { p.equip(G.Items.first(id)); return; }
    if (p.item === id) return;
    if (!s.on) return;                       // desconectado: sigue con el suyo
    enqueue(s, { kind: 'item', cur: p.item, next: id });
  }

  /** Fusiones pendientes: cada opción, los movimientos que se unen. */
  function offerBonds() {
    if (G.Rift.inArena) return;
    for (const s of active()) {
      const p = s.pl;
      if (!s.on || p.dead || p.bonds <= 0 || s.queue.some(c => c.kind === 'bond')) continue;
      const opt = p.bondOptions();
      if (!opt) continue;
      const options = [];
      if (opt.mode === 'add') for (const m of opt.loose) options.push([m]);
      else for (let a = 0; a < opt.loose.length; a++) for (let b = a + 1; b < opt.loose.length; b++) options.push([opt.loose[a], opt.loose[b]]);
      if (options.length) enqueue(s, { kind: 'bond', options });
    }
  }

  /** Cartas de nivel: una ronda cada vez, para cada jugador vivo. */
  function maybeLevelUp() {
    if (pendingLevels <= 0 || G.Judgment.cinematic || seats.some(s => s.queue.some(c => c.kind === 'level'))) return;
    const alive = active().filter(s => !s.pl.dead);
    if (!alive.length) return;
    pendingLevels--;
    // 2 s sin daño al volver a la partida (mientras se elige, la simulación está parada).
    for (const s of alive) s.pl.invuln = Math.max(s.pl.invuln, 2);
    for (const s of alive) enqueue(s, { kind: 'level', lv: team.level, options: G.LevelUp.offer(s.pl) });
  }

  /** ¿Alguien conectado está eligiendo? (la partida se para) */
  function waiting() { return active().filter(s => s.on && (s.queue.length || s.holdOn)); }

  /** Cuenta el tiempo de las elecciones en pausa; si se pasa, la primera. */
  function choiceClock(dt) {
    for (const s of active()) {
      if (!s.on) continue;
      if (s.queue.length && (s.queue[0].wait += dt) >= CHOICE_MAX) {
        // Sin elegir qué olvidar: no se olvida nada.
        if (s.queue[0].fixed) { s.queue.shift(); if (s.queue.length) send(s.uid, choiceMsg(s.queue[0], s)); }
        else resolve(s, autoPick(s.queue[0]));
      }
      if (s.holdOn && (s.holdT += dt) >= CHOICE_MAX) s.holdOn = false;
    }
  }

  function noteWaiting() {
    const names = waiting().map(s => s.name);
    const k = names.join('|');
    if (k !== lastWait) { lastWait = k; pushAll(['wait', names]); }
  }

  // ---------------- movimiento ----------------

  /**
   * Lleva al jugador desde (fx, fy) hacia (tx, ty) con su física (choca y
   * resbala por paredes y objetos), como mucho `budget` px. Se queda donde llegue.
   */
  function march(p, fx, fy, tx, ty, budget) {
    p.x = fx; p.y = fy;
    const step = Math.max(2, Math.min(8, p.r * 0.5));
    let left = budget;
    for (let i = 0; i < 400 && left > 1e-6; i++) {
      const dx = tx - p.x, dy = ty - p.y, d = Math.hypot(dx, dy);
      if (d < 0.01) break;
      const s = Math.min(d, left, step);
      const bx = p.x, by = p.y;
      p.x += dx / d * s; p.y += dy / d * s;
      G.World.collide(p);
      left -= s;
      if (Math.hypot(p.x - bx, p.y - by) < s * 0.1) break;    // atascado
    }
  }

  /** Mueve a cada jugador: física con su dirección y validación de la posición pedida. */
  function movePlayers(dt) {
    for (const s of active()) {
      const p = s.pl, m = s.in;
      const fresh = s.on && m && clock.t - s.inAt <= IN_STALE;
      const ax = fresh ? s.axis[0] : 0, ay = fresh ? s.axis[1] : 0;
      G.Input.axis = () => [ax, ay];
      p.update(dt);
      if (!m || !m.pending) continue;
      m.pending = false;
      s.ack = m.seq;
      if (p.dead || !s.on) { s.accX = p.x; s.accY = p.y; s.accT = clock.t; continue; }
      // Recién llegado de un viaje: lo que pide de lejos es de antes del viaje.
      if (clock.t - s.tpT < TP_GRACE && G.U.dist2(m.x, m.y, p.x, p.y) > TP_FAR * TP_FAR) { s.accX = p.x; s.accY = p.y; s.accT = clock.t; continue; }
      const el = Math.min(IN_STALE, Math.max(0, clock.t - s.accT));
      const budget = p.spd * el * SPEED_K + SLACK;
      march(p, s.accX, s.accY, m.x, m.y, budget);
      s.accX = p.x; s.accY = p.y; s.accT = clock.t;
    }
  }

  /** Tras el paso: los viajes del juego (grieta, Sentencia) mueven la posición aceptada. */
  function noteTeleports(before) {
    for (const s of active()) {
      const p = s.pl, b = before.get(s);
      if (b && G.U.dist2(b[0], b[1], p.x, p.y) > TELEPORT * TELEPORT) s.tpT = clock.t;
      if (b && (b[0] !== p.x || b[1] !== p.y)) { s.accX = p.x; s.accY = p.y; }
    }
  }

  /** Caído: un compañero vivo y conectado a su lado lo va levantando (game.js reviveTick). */
  function reviveTick(dt) {
    const act = active();
    for (const s of act) {
      const p = s.pl;
      if (!p.dead) continue;
      const helpers = act.filter(o => o !== s && o.on && !o.pl.dead && G.U.dist2(o.pl.x, o.pl.y, p.x, p.y) < REVIVE_R * REVIVE_R);
      p.reviveT = helpers.length ? (p.reviveT || 0) + dt : Math.max(0, (p.reviveT || 0) - dt * 0.5);
      if (p.reviveT >= G.Player.REVIVE_TIME) {
        p.revive(0.5);
        for (const o of helpers) o.pl.revives++;        // para el resumen: cuenta para todos los que ayudan
      }
    }
  }

  /** ¿Queda alguien conectado en la partida? */
  const anyoneOn = () => seats.some(s => s.on && !s.gone);

  /**
   * Los desconectados que no vuelven a tiempo salen de la partida: a los 20 s
   * si los demás siguen jugando; si no queda nadie (móvil bloqueado, recarga),
   * al minuto, como el lobby. Antes se acababa a los 20 s y quien volvía antes
   * del minuto se encontraba la partida perdida, sin `over` ni premios.
   */
  function awayClock(dt) {
    const max = anyoneOn() ? BACK_MAX : EMPTY_MAX;
    for (const s of seats) {
      if (s.on || s.gone) continue;
      if ((s.offT += dt) < max) continue;
      s.gone = true;
      G.Projectiles.clearOrbs(s.pl);
      G.Combat.clearFields(s.pl);
      if (!active().length) finish('empty');
    }
  }

  // ---------------- un paso ----------------

  function simStep() {
    clock.t += DT;
    const ps = players();
    if (G.Judgment.cinematic) {
      for (const s of active()) { if (s.in) { s.in.pending = false; s.ack = s.in.seq; } }
      const before = new Map(active().map(s => [s, [s.pl.x, s.pl.y]]));
      G.Judgment.cineTick(DT);
      for (const p of ps) p.anim.update(DT);
      G.World.update(DT, G.Camera);
      noteTeleports(before);
      return;
    }
    time += DT;
    const b = Math.floor(time / 240);
    if (b !== biome && !G.Rift.inArena && !G.Judgment.active) { biome = b; G.World.setBiome(b); pushAll(['bio', b]); }
    movePlayers(DT);
    reviveTick(DT);
    const cx = ps.reduce((a, p) => a + p.x, 0) / ps.length, cy = ps.reduce((a, p) => a + p.y, 0) / ps.length;
    G.Camera.follow(cx, cy, DT);
    const before = new Map(active().map(s => [s, [s.pl.x, s.pl.y]]));
    G.Step.team(DT, time, ps, collect);
    noteTeleports(before);
    syncLevel();
    maybeLevelUp();
    offerBonds();
    // Fin: todos caídos un rato (en la arena de la grieta caer sólo te echa).
    if (!G.Rift.inArena && ps.every(p => p.dead)) { downT += DT; if (downT > DOWN_END) finish('down'); }
    else downT = 0;
    if (time >= MAX_TIME) finish('time');
  }

  /** Un paso: simulación (o pausa si alguien elige) y, cada 2, los envíos. */
  function tick() {
    if (over || stopped) return;
    try {
      awayClock(DT);
      if (over) return;
      // Nadie conectado: todo quieto hasta que vuelva alguien (si no, los tumban sin estar).
      if (!anyoneOn()) return;
      if (waiting().length) choiceClock(DT);
      noteWaiting();
      if (!waiting().length) simStep();
      if (over) return;
      if (++steps % SNAP_EVERY === 0) flush();
    } catch (e) {
      logger.error('[room] fallo en la simulación:', e && e.stack || e);
      finish('error');
    }
  }

  // ---------------- envíos ----------------

  function enemyFlags(e) {
    return (e.burn > 0 ? 1 : 0) | (e.poison > 0 ? 2 : 0) | (e.shield > 0 ? 4 : 0) | (e.boss ? 8 : 0) |
           (e.shiny ? 16 : 0) | (e.golden ? 32 : 0) | (e.legend || e.judge ? 64 : 0);
  }

  /** La instantánea de un jugador (y lo que sabe pasa a ser lo enviado). */
  function snapFor(s, pmap, shotsAll) {
    const me = focusOf(s);
    const d2 = (x, y) => G.U.dist2(x, y, me.x, me.y);
    let size = 33 + seats.length * 19;
    const out = { ack: s.ack, t: time, lv: team.level, xp: team.xp, xpNext: team.xpNext, players: [],
                  enemies: { add: [], upd: [], gone: [] }, shots: [], pickups: { add: [], gone: [] } };
    for (const o of seats) {
      const p = o.pl, a = ANIMS.indexOf(p.anim.cur);
      out.players.push({ id: o.id, x: p.x, y: p.y, hp: p.hp, maxHp: p.maxHp, anim: a < 0 ? 0 : a, dead: p.dead || o.gone });
    }
    // Enemigos que ya no están (o se han alejado).
    const dies = [];
    for (const id of s.known.keys()) {
      const e = G.EnemyMgr.get(id);
      if (e && !e.dead && d2(e.x, e.y) <= NEAR_OUT * NEAR_OUT) continue;
      out.enemies.gone.push(id);
      if (died.has(id)) dies.push(id);
    }
    for (const id of out.enemies.gone) s.known.delete(id);
    size += out.enemies.gone.length * 4;
    // Objetos que ya no están.
    for (const id of s.pk) {
      const o = pmap.get(id);
      if (o && d2(o.x, o.y) <= NEAR_OUT * NEAR_OUT) continue;
      out.pickups.gone.push(id);
    }
    for (const id of out.pickups.gone) s.pk.delete(id);
    size += out.pickups.gone.length * 4;
    // Disparos enemigos cercanos.
    const sh = shotsAll.filter(p => d2(p.x, p.y) <= NEAR * NEAR);
    if (sh.length > SHOTS_MAX) sh.sort((a, b) => d2(a.x, a.y) - d2(b.x, b.y)).length = SHOTS_MAX;
    for (const p of sh) out.shots.push({ x: p.x, y: p.y, kind: 1 + Math.max(-1, TYPES.indexOf(p.mtype)) });
    size += out.shots.length * 9;
    // Enemigos: los más cercanos primero, hasta llenar (guardando sitio para algún objeto).
    const room = SNAP_BUDGET - PICKUP_RESERVE * 13;
    const near = [];
    for (const e of G.EnemyMgr.all()) {
      if (e.dead) continue;
      const dd = d2(e.x, e.y);
      if (dd <= NEAR * NEAR || (s.known.has(e.id) && dd <= NEAR_OUT * NEAR_OUT)) near.push([dd, e]);
    }
    near.sort((a, b) => a[0] - b[0]);
    for (const [, e] of near) {
      const k = s.known.get(e.id);
      const hp = Math.ceil(e.hp), fl = enemyFlags(e);
      if (k && Math.abs(k[0] - e.x) < 1 && Math.abs(k[1] - e.y) < 1 && k[2] === hp && k[3] === fl) continue;
      if (size + 23 > room) break;
      size += 23;
      (k ? out.enemies.upd : out.enemies.add).push({ id: e.id, dex: e.dex, x: e.x, y: e.y, hp: e.hp, maxHp: e.maxHp, flags: fl });
      s.known.set(e.id, [e.x, e.y, hp, fl]);
    }
    // Objetos nuevos cercanos, con lo que quede.
    const pAdd = [];
    for (const o of pmap.values()) if (!s.pk.has(o.id) && d2(o.x, o.y) <= NEAR * NEAR) pAdd.push(o);
    if (pAdd.length > 1) pAdd.sort((a, b) => d2(a.x, a.y) - d2(b.x, b.y));
    for (const o of pAdd) {
      if (out.pickups.add.length >= PICKUPS_ADD_MAX || size + 13 > SNAP_BUDGET) break;
      size += 13;
      out.pickups.add.push({ id: o.id, kind: Math.max(0, PICK_KINDS.indexOf(o.kind)), x: o.x, y: o.y });
      s.pk.add(o.id);
    }
    return { snap: out, dies };
  }

  /**
   * Lo que el navegador necesita de SU Pokémon y no va en el snap: huecos con
   * sus movimientos ([id, nivel, evolucionado]), hueco activo, objeto,
   * vínculos sin usar y [multiplicador de velocidad, radio del imán] (para
   * moverse a la misma velocidad que aquí y no ser corregido).
   */
  function kitOf(s) {
    const p = s.pl;
    return [p.slots.map(g => g.map(m => [m.id, m.lvl, m.evolved ? 1 : 0])), p.active, str(p.item), p.bonds | 0,
            [r2(p.spdMul), r1(p.magnet), r2(p.abilSpeed())]];
  }

  /** Manda a cada conectado sus eventos y su instantánea. */
  function flush() {
    const ja = G.Judgment.active && !G.Judgment.cinematic ? G.Judgment.netState() : null;
    if (ja) pushAll(['ja', ...ja]);
    const pmap = new Map(G.Pickups.all().map(o => [o.id, o]));
    const shotsAll = G.Projectiles.all().filter(p => !p.friendly);
    const shared = evAll.length ? { t: 'ev', list: evAll } : null;
    for (const s of active()) {
      if (!s.on) { s.ev = []; s.evCos = 0; continue; }
      const kit = kitOf(s), sig = JSON.stringify(kit);
      if (sig !== s.kitSig) { s.kitSig = sig; s.ev.push(['kit', ...kit]); }
      const { snap, dies } = snapFor(s, pmap, shotsAll);
      if (dies.length) s.ev.push(['die', dies]);
      if (s.ev.length) send(s.uid, { t: 'ev', list: evAll.concat(s.ev) });
      else if (shared) send(s.uid, shared);
      // send() === false: no ha salido (conexión saturada). Lo que se creía
      // enviado no ha llegado: el siguiente snap se lo manda todo de nuevo.
      if (send(s.uid, { t: 'snap', bin: proto.encSnap(snap) }) === false) { s.known.clear(); s.pk.clear(); }
      s.ev = []; s.evCos = 0;
    }
    evAll = []; cosmetic = 0; died = new Set();
  }

  // ---------------- fin ----------------

  function summaryOf(s, why) {
    const p = s.pl;
    return {
      uid: s.uid, why, t: time, lv: team.level, ki: p.kills, bo: p.bosses,
      kt: seats.reduce((a, o) => a + o.pl.kills, 0), co: team.coins, t1: team.t1, t10: team.t10,
      dead: p.dead, judge: G.Judgment.summary(), shinies: s.shinies.slice(), rescued: s.rescued.slice(),
      crew: crewSummary(), team: teamSums()
    };
  }

  /**
   * El resumen de ataques de cada uno (la pestaña por jugador del final, ver
   * Player.runSum): [{ uid, name, sum }]. (m.since sale del reloj de la sala: G.Game.st.time.)
   */
  function teamSums() {
    return seats.map(o => ({ uid: o.uid, name: o.name, sum: o.pl.runSum(team.level, time) }));
  }

  /**
   * Lo que hizo cada uno (el resumen del final compara al grupo):
   * [{ uid, name, dex, shiny, ki, dmg (hecho), hit (recibido), ch (cofres), rv (levantó) }].
   */
  function crewSummary() {
    return seats.map(o => ({
      uid: o.uid, name: o.name, dex: o.pl.dex, shiny: !!o.pl.shiny, ki: o.pl.kills | 0,
      dmg: r1(o.pl.dmgDealt || 0), hit: r1(o.pl.dmgTaken || 0), ch: o.pl.chests | 0, rv: o.pl.revives | 0
    }));
  }

  /** Se acabó: `over` a cada uno, onOver, la marca de grupo y parar. */
  function finish(why) {
    if (over) return;
    over = true;
    const results = seats.map(s => summaryOf(s, why));
    for (const s of seats) {
      if (!s.on || s.gone) continue;
      try { send(s.uid, { t: 'over', results: results[s.id] }); } catch (e) { logger.error('[room] over:', e && e.message); }
    }
    if (rank && ranked && why !== 'error' && time >= 120) {
      const kills = results.reduce((a, r) => a + r.ki, 0);
      const judge = G.Judgment.summary();          // daño a Arceus (su ranking, ver rank.js)
      try {
        Promise.resolve(rank.submitGroup({ t: Math.floor(time), members: members.map((m, i) => ({ uid: m.uid, name: m.name, dex: m.dex, shiny: !!m.shiny, b: seats[i].pl.buildCode() })), lv: team.level, kills, dmg: judge ? judge.dmg : 0 }))
          .catch(e => logger.error('[room] ranking de grupo:', e && e.message));
      } catch (e) { logger.error('[room] ranking de grupo:', e && e.message); }
    }
    stop();
    try { if (onOver) onOver(results); } catch (e) { logger.error('[room] onOver:', e && e.stack || e); }
  }

  // ---------------- lo que llama el lobby ----------------

  function stop() {
    stopped = true;
    if (timer) { clearInterval(timer); timer = null; }
  }

  return {
    /** Entrada de movimiento de uid ({seq,x,y,dx,dy,move}). */
    input(uid, m) {
      const s = byUid.get(uid);
      if (!s || s.gone || !m || over) return;
      const x = +m.x, y = +m.y, seq = m.seq >>> 0;
      if (!Number.isFinite(x) || !Number.isFinite(y) || Math.abs(x) > 1e7 || Math.abs(y) > 1e7) return;
      if (s.in && seq <= s.in.seq) return;                     // repetida o vieja
      let dx = Number.isFinite(+m.dx) ? Math.max(-1, Math.min(1, +m.dx)) : 0;
      let dy = Number.isFinite(+m.dy) ? Math.max(-1, Math.min(1, +m.dy)) : 0;
      const l = Math.hypot(dx, dy);
      if (l > 1) { dx /= l; dy /= l; }
      s.in = { seq, x, y, pending: true };
      s.inAt = clock.t;
      s.axis = [dx, dy];
      const mv = m.move | 0;
      if (mv !== s.lastMove) { s.lastMove = mv; if (mv >= 0 && mv < s.pl.slots.length) s.pl.setActive(mv); }
    },
    /** Elige la opción `choice` de lo que tiene delante. */
    pick(uid, choice) {
      const s = byUid.get(uid);
      if (!s || !s.queue.length || over) return;
      const i = Number(choice);
      if (!Number.isInteger(i) || i < 0) return;
      const c = s.queue[0];
      const n = c.kind === 'item' ? 2 : c.options.length;
      if (i >= n) return;
      resolve(s, i);
    },
    /** Cambia las cartas de nivel que tiene delante (si le quedan cambios): le llega otro `level`. */
    reroll(uid) {
      const s = byUid.get(uid);
      if (!s || !s.queue.length || over) return;
      const c = s.queue[0];
      if (c.kind !== 'level' || c.fixed || rerollsLeft(s) <= 0) return;
      s.rr++;
      c.options = G.LevelUp.offer(s.pl);
      send(s.uid, choiceMsg(c, s));
    },
    /** Pausa (o no) mientras elige algo por su cuenta. */
    hold(uid, on) {
      const s = byUid.get(uid);
      if (!s || !s.on || over) return;
      // El tope de 20 s cuenta desde que empieza: repetir hold:true no lo alarga.
      if (on && !s.holdOn) s.holdT = 0;
      s.holdOn = !!on;
    },
    /** Con qué naturaleza y hueco de habilidad juega uid ({ nat, ab }; ver heroOf), para `started`. */
    hero(uid) {
      const s = byUid.get(uid);
      return s ? Object.assign({}, s.hero) : {};
    },
    /** Caído: mira al compañero `target` (uid; '' = a sí mismo). Ver focusOf. */
    watch(uid, target) {
      const s = byUid.get(uid);
      if (!s || over) return;
      s.watch = typeof target === 'string' ? target.slice(0, 128) : '';
    },
    /** Se ha cortado: quieto, y no se le espera. */
    drop(uid) {
      const s = byUid.get(uid);
      if (!s || !s.on) return;
      s.on = false; s.offT = 0; s.holdOn = false; s.in = null;
      resolveAll(s);
    },
    /**
     * Ha vuelto: se le repite lo que tenga delante y se le manda todo de nuevo.
     * Si ya había salido de la partida (más de BACK_MAX fuera: «Reconectar» del
     * menú), entra otra vez con lo que tenía, junto a un compañero.
     */
    back(uid) {
      const s = byUid.get(uid);
      if (!s || s.on || over) return;
      if (s.gone) {
        const a = anchor();
        s.gone = false;
        s.pl.x = a.x; s.pl.y = a.y;
        s.tpT = clock.t;
      }
      s.on = true; s.offT = 0;
      s.known.clear(); s.pk.clear(); s.kitSig = '';
      s.accX = s.pl.x; s.accY = s.pl.y; s.accT = clock.t;
      if (s.queue.length) send(s.uid, choiceMsg(s.queue[0], s));
    },
    /** Bucle propio a ~30 Hz (recupera como mucho 5 pasos si se atrasa). */
    start() {
      if (timer || over || stopped) return;
      lastReal = Date.now(); acc = 0;
      timer = setInterval(() => {
        const now = Date.now();
        acc += now - lastReal; lastReal = now;
        let n = Math.floor(acc / STEP_MS);
        if (n > MAX_CATCHUP) { n = MAX_CATCHUP; acc = 0; } else acc -= n * STEP_MS;
        for (let i = 0; i < n && !over && !stopped; i++) tick();
      }, STEP_MS);
      if (timer.unref) timer.unref();
    },
    stop,
    /** Un paso a mano (pruebas). */
    tick,
    /** Para pruebas: la simulación y los jugadores. */
    debug: {
      sim, G,
      get time() { return time; }, get over() { return over; }, get paused() { return waiting().length > 0; },
      get team() { return team; },
      player: uid => (byUid.get(uid) || {}).pl,
      /** Coloca a uid (y su posición aceptada) en (x, y). */
      place(uid, x, y) { const s = byUid.get(uid); if (!s) return; s.pl.x = x; s.pl.y = y; s.accX = x; s.accY = y; s.accT = clock.t; },
      levelUp() { gainTeamXp((team.xpNext - team.xp + 1) / xpK()); }
    }
  };
}

module.exports = { createRoom, DT, STEP_MS };
