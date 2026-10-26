/* ============ coop.js — partida en grupo contra el servidor (hasta 10 jugadores) ============
 *
 * La partida la lleva el servidor (server/room.js): enemigos, golpes, vida,
 * experiencia, reloj, cartas de nivel y el final. Aquí, en cada navegador:
 *
 *   tu Pokémon   se mueve al momento con tu teclado/joystick; ~15 veces por
 *                segundo se manda la posición (`in`, binario). El servidor la
 *                valida: si te corrige (pared, velocidad, viaje a la grieta),
 *                se desplaza tu Pokémon lo que haya corregido.
 *   lo demás     llega en `snap` (~15/s): compañeros, enemigos cercanos,
 *                disparos enemigos y objetos del suelo; y en `ev` lo que pasa
 *                (ataques de todos, números grandes, grietas, Sentencia, clima…).
 *                Los ataques, también los tuyos, se repiten como "fantasma"
 *                (combat.js ghostCast): se ven pero no hacen daño aquí.
 *   tu vida      la del servidor (snap); aquí no te hace daño nada.
 *   cartas       `level` {kind: level|item|bond, options} → eliges → `pick`.
 *                Mientras alguien elige (ev `wait`), todo parado.
 *   tu kit       ev `kit`: tus movimientos, objeto, velocidad y esferas, tal como
 *                están en el servidor (para el HUD y para moverte a su misma velocidad).
 *   esferas      usarla → `orb {i}`; el servidor la gasta y la aplica. Llegan
 *                `og` (la has cogido) y `ou` (alguien la ha usado: quién recibe la mejora).
 *
 * El ranking de grupo lo escribe el servidor. Al acabar llega `over` con tu
 * resumen y cada uno guarda sus premios en su partida (game.js endRun).
 */
G.Coop = (() => {
  const ANIMS = ['Idle', 'Walk', 'Attack', 'Shoot', 'Charge', 'Hurt', 'Faint'];
  const COLORS = ['#ffcb3d', '#5fc8ff', '#7ee07a', '#ff8ad8', '#ff8a3d', '#b48cff', '#4de0d0', '#ff5a6e', '#d6f06a', '#f4f8ff'];
  const IN_EVERY = 1 / 15;              // s entre envíos de tu posición
  const FIX_MIN = 6;                    // px: por debajo, la corrección del servidor se ignora
  const SNAP_DT = 0.066;                // s entre snaps (2 pasos de 33 ms): los disparos dibujados duran ~3
  const FIX_FAR = 300;                  // px: más que esto es un viaje (grieta, Sentencia): sin suavizar
  const FIX_EASE = 12;                  // rapidez con que se ve la corrección (~100 ms)

  let active = false, me = null, mySeat = -1;
  let local = null;                     // tu Player
  let api = {};                         // ganchos de game.js
  let members = [];
  const mates = new Map();              // uid -> { uid, seat, name, color, pl, connected }
  const bySeat = [];                    // asiento -> Player
  let seq = 0, inT = 0;
  const sent = new Map();               // seq -> [x, y] posición mandada
  const dying = new Set();              // enemigos que el servidor dice que han caído
  let shots = [];                       // disparos enemigos del último snap
  let waitKey = '', lastSnapAt = 0;

  // ---------------- escalado de dificultad (lo usa también el servidor) ----------------

  // Hasta 4 jugadores, +75% de enemigos por cada uno de más; desde el 5.º, +40%.
  const scaleRate = n => 1 + 0.75 * Math.min(3, Math.max(0, n - 1)) + 0.4 * Math.max(0, n - 4);
  const scaleHp = n => 1 + 0.3 * Math.max(0, n - 1);

  // ---------------- arranque / fin ----------------

  /**
   * @param cfg  { seed, members: [{ uid, name, dex, shiny }] } (lo de `started`, en orden de asiento)
   * @param pl   tu Player (ya creado)
   * @param cb   ganchos de game.js: syncTeam, choice, waiting, over, lost, shiny, kit
   */
  function begin(cfg, pl, cb) {
    active = true;
    me = G.Social.uid;
    local = pl;
    api = cb;
    members = cfg.members;
    mates.clear(); bySeat.length = 0;
    seq = 0; inT = 0; sent.clear(); dying.clear(); shots = []; waitKey = ''; lastSnapAt = performance.now();
    mySeat = members.findIndex(m => m.uid === me);
    members.forEach((m, i) => {
      const x = (i - (members.length - 1) / 2) * 34, y = 0;
      if (m.uid === me) {
        pl.x = x; pl.y = y; pl.uid = me; pl.tagColor = COLORS[i]; pl.netHp = true;
        bySeat[i] = pl;
        return;
      }
      const mon = G.DEX_BY[m.dex] || G.DEX_BY[25];
      const p = new G.Player(mon, {}, !!m.shiny);
      p.remote = true; p.uid = m.uid; p.tag = m.name; p.tagColor = COLORS[i]; p.revLabel = 'Quédate a su lado';
      p.x = x; p.y = y;
      p.net = { x, y, ang: Math.PI / 2, walk: 0, hp: p.maxHp, maxHp: p.maxHp, dead: 0, mv: G.baseStartOf(mon.dex), ml: 1, mag: 78, aim: Math.PI / 2 };
      G.Sprites.preload([mon.dex], 8000, p.shiny);
      bySeat[i] = p;
      mates.set(m.uid, { uid: m.uid, seat: i, name: m.name, color: COLORS[i], pl: p, connected: true });
    });
  }

  function end() {
    active = false; local = null; wasRetry = false; clearTimeout(backT);
    mates.clear(); bySeat.length = 0; sent.clear(); dying.clear(); shots = [];
  }

  /** Te vas de la partida (los demás siguen). En el servidor eso es salir también de la sala. */
  function leave() {
    if (!active) return;
    end();
    G.Social.leaveRoom();
  }

  // ---------------- lista de jugadores ----------------

  function players() {
    const out = [local];
    for (const m of mates.values()) if (m.connected) out.push(m.pl);
    return out;
  }
  function puppets() { const out = []; for (const m of mates.values()) if (m.connected) out.push(m.pl); return out; }

  // ---------------- cada fotograma ----------------

  /** Manda tu posición (~15/s) mientras la partida corre. */
  function tick(dt) {
    if (!active || !local) return;
    // La corrección del servidor se ve poco a poco (ver mine).
    if (local.netOffX || local.netOffY) {
      const k = Math.exp(-FIX_EASE * dt);
      local.netOffX *= k; local.netOffY *= k;
      if (Math.abs(local.netOffX) + Math.abs(local.netOffY) < 0.3) local.netOffX = local.netOffY = 0;
    }
    inT -= dt;
    if (inT > 0) return;
    inT = IN_EVERY;
    seq++;
    const [ax, ay] = local.frozen || local.dead ? [0, 0] : G.Input.axis();
    sent.set(seq, [local.x, local.y]);
    if (sent.size > 90) sent.delete(sent.keys().next().value);
    G.Net.sendIn({ seq, x: local.x, y: local.y, dx: ax, dy: ay, move: Math.max(0, local.active | 0) });
  }

  // ---------------- lo que llega del servidor ----------------

  /*
   * Tras un corte, al reconectar el servidor manda `hi` y, si la partida sigue,
   * `room` y `started` justo detrás (o `away` si llevas más de un minuto fuera:
   * se pide volver con `back`). Si no llega `started`, la partida acabó
   * mientras no estabas y se cierra aquí: antes se quedaba congelada para
   * siempre, sin `over`.
   */
  let wasRetry = false, backT = 0;
  function gone() {
    clearTimeout(backT);
    if (!active) return;
    const cb = api.lost;
    leave();
    if (cb) cb('La partida en grupo terminó mientras estabas desconectado.');
  }

  G.Net.on(m => {
    if (m.type === 'hi' && active && wasRetry) { wasRetry = false; clearTimeout(backT); backT = setTimeout(gone, 3000); return; }
    if (m.type === 'away' && active) { clearTimeout(backT); G.Net.send('back'); backT = setTimeout(gone, 3000); return; }
    if (m.type === 'started') {
      // Tras reconectar llega otra vez: lo que se tenía se tira y llega de nuevo.
      if (active) { clearTimeout(backT); G.EnemyMgr.clearRemote(); G.Pickups.clear(); return; }
      if (G.Flow.startCoop) G.Flow.startCoop(m);
      return;
    }
    if (!active) return;
    switch (m.type) {
      case 'snap': onSnap(m); break;
      case 'ev': for (const ev of m.list || []) onEvent(ev); break;
      case 'level': if (api.choice) api.choice(m); break;
      case 'room': onRoom(m); break;
      case 'over': { const cb = api.over; const r = m.results || {}; end(); if (cb) cb(r); break; }
      case 'down': { const cb = api.lost; end(); if (cb) cb('Se ha perdido la conexión con el servidor.'); break; }
    }
  });

  G.Net.onState(s => {
    if (!active || !api.away) return;
    if (s === 'retry') wasRetry = true;
    api.away(s === 'retry' ? 'Reconectando…' : null);
  });

  /**
   * La sala dice quién sigue conectado (llega cada vez que alguien se corta o
   * vuelve). Los que no están dejan de verse, en la lista de arriba y en las
   * flechas, y no cuentan para "Habéis caído todos". Antes seguían ahí, quietos.
   */
  function onRoom(m) {
    const on = new Map((m.members || []).map(x => [x.uid, x.on !== false]));
    for (const mt of mates.values()) mt.connected = !!on.get(mt.uid);
  }

  function onSnap(s) {
    const now = performance.now();
    const dts = Math.max(0.03, Math.min(0.5, (now - lastSnapAt) / 1000));
    lastSnapAt = now;
    if (api.syncTeam) api.syncTeam({ time: s.t, level: s.lv, xp: s.xp, xpNext: s.xpNext });

    for (const p of s.players) {
      const pl = bySeat[p.id];
      if (!pl) continue;
      if (pl === local) { mine(p, s.ack); continue; }
      const n = pl.net, vx = (p.x - n.x) / dts, vy = (p.y - n.y) / dts;
      const walk = Math.abs(vx) + Math.abs(vy) > 12;
      Object.assign(n, { x: p.x, y: p.y, hp: p.hp, maxHp: p.maxHp, dead: p.dead ? 1 : 0, walk: walk ? 1 : 0 });
      if (walk) n.ang = Math.atan2(vy, vx);
      if (!walk && !(n.castAt > now - 600)) n.aim = n.ang;
    }

    // Enemigos: nuevos, cambiados e idos (los que han caído, con su animación).
    for (const e of s.enemies.add) addEnemy(e, dts);
    for (const e of s.enemies.upd) addEnemy(e, dts);
    for (const id of s.enemies.gone) { G.EnemyMgr.removeRemote(id, dying.has(id)); dying.delete(id); }

    for (const o of s.pickups.add) {
      const { kind, sub } = G.Proto.pickKind(o.kind);
      const value = kind === 'item' ? null : kind === 'sphere' ? (G.Orbs.LIST[sub] || G.Orbs.LIST[0]).id : 0;
      G.Pickups.addRemote(o.id, kind, o.x, o.y, value);
    }
    for (const id of s.pickups.gone) G.Pickups.removeId(id);

    netShots(s.shots, dts);
  }

  /** Tu Pokémon: vida del servidor y corrección de la posición si no coincide con lo mandado. */
  function mine(p, ack) {
    const pl = local;
    if (p.hp < pl.hp - 0.5 && !p.dead) {
      const d = Math.round(pl.hp - p.hp);
      pl.flash = 0.14;
      G.Audio.sfx('hurt');
      G.Camera.kick(0.28);
      G.FX.dmgText(pl.x, pl.y - pl.bodyH - 4, '-' + d, '#ff6b7a');
    }
    pl.hp = p.hp; pl.maxHp = p.maxHp;
    if (p.dead && !pl.dead) {
      pl.dead = true; pl.hp = 0;
      pl.anim.play('Faint', { hold: true });
      G.Projectiles.clearOrbs(pl);
    } else if (!p.dead && pl.dead) pl.revive(p.hp / (p.maxHp || 1));

    const at = sent.get(ack);
    if (!at) return;
    for (const k of [...sent.keys()]) if (k < ack) sent.delete(k);
    const dx = p.x - at[0], dy = p.y - at[1];
    if (dx * dx + dy * dy < FIX_MIN * FIX_MIN) return;
    // El servidor te tiene en otro sitio: se mueve lo corregido (también lo mandado
    // después). Tu posición salta, pero se DIBUJA desde donde estabas y llega en
    // ~100 ms (netOff, game.js): así una pared o una trampa no dan tirones de cámara.
    pl.x += dx; pl.y += dy;
    for (const v of sent.values()) { v[0] += dx; v[1] += dy; }
    if (dx * dx + dy * dy < FIX_FAR * FIX_FAR) { pl.netOffX = (pl.netOffX || 0) - dx; pl.netOffY = (pl.netOffY || 0) - dy; }
    else pl.netOffX = pl.netOffY = 0;
  }

  /**
   * Te has movido por algo que también ha hecho el servidor (tu embestida, combat.js):
   * lo ya mandado se cuenta desde la posición nueva, para que no te corrija otra vez.
   */
  function selfMoved(dx, dy) {
    if (!active) return;
    for (const v of sent.values()) { v[0] += dx; v[1] += dy; }
  }

  function addEnemy(o, dts) {
    let e = G.EnemyMgr.get(o.id);
    if (!e) {
      e = G.EnemyMgr.addRemote({ id: o.id, dex: o.dex, x: o.x, y: o.y, boss: !!(o.flags & 8), shiny: !!(o.flags & 16), hp: o.maxHp, dmg: 0 });
      if (o.flags & 32) e.golden = true;
    }
    if (!e.remote || e.dead) return;
    const n = e.net;
    const vx = (o.x - n.x) / dts, vy = (o.y - n.y) / dts;
    n.vx = G.U.clamp(vx, -600, 600); n.vy = G.U.clamp(vy, -600, 600);
    if (Math.abs(vx) + Math.abs(vy) > 8) n.dir = G.Sprites.dirFromAngle(Math.atan2(vy, vx));
    n.x = o.x; n.y = o.y; n.age = 0;
    // st: 1 quemado · 2 envenenado · 4 escudo · 16 dormido (enemy.js draw).
    n.st = (o.flags & 1 ? 1 : 0) | (o.flags & 2 ? 2 : 0) | (o.flags & 4 ? 4 : 0) | (o.flags & 128 ? 16 : 0);
    e.maxHp = o.maxHp;
    e.hp = Math.min(o.maxHp, o.hp);
  }

  /**
   * Disparos enemigos: el snap sólo trae dónde están. Se dibujan como
   * proyectiles sin daño que avanzan con la velocidad estimada (el más
   * cercano del snap anterior) hasta el siguiente snap.
   */
  function netShots(list, dts) {
    const TYPES = Object.keys(G.U.TYPE_COLOR);
    const prev = shots;
    for (const p of prev) G.Projectiles.remove(p);
    shots = [];
    for (const o of list) {
      let best = null, bd = 60 * 60;
      for (const q of prev) { const d = G.U.dist2(q.x0, q.y0, o.x, o.y); if (d < bd) { bd = d; best = q; } }
      const vx = best ? (o.x - best.x0) / dts : 0, vy = best ? (o.y - best.y0) / dts : 0;
      const type = TYPES[o.kind - 1] || null;
      const p = G.Projectiles.spawn({ x: o.x, y: o.y, vx, vy, dmg: 0, r: 6, life: SNAP_DT * 3, friendly: false,
                                      color: '#ff7a9e', vis: G.VFX.forType(type), mtype: type, net: true });
      p.x0 = o.x; p.y0 = o.y;
      shots.push(p);
    }
  }

  function onEvent(ev) {
    switch (ev[0]) {
      case 'c': {
        const pl = bySeat[ev[1]];
        if (!pl) break;
        if (pl.remote) { pl.net.mv = ev[2]; pl.net.ml = ev[3]; pl.net.aim = ev[4]; pl.net.castAt = performance.now(); }
        G.Combat.ghostCast(pl, ev[2], ev[3], ev[4], ev[5]);
        break;
      }
      case 'hn': { const e = G.EnemyMgr.get(ev[1]); if (e && !e.dead) e.showHurt(ev[2], ev[3]); break; }
      case 'die': for (const id of ev[1] || []) dying.add(id); break;
      case 'sh': G.onShinyCaught && G.onShinyCaught({ dex: ev[1], name: (G.DEX_BY[ev[1]] || {}).name || '' }); break;
      case 'heal': {
        const pl = bySeat[ev[1]];
        if (pl) G.FX.ring(pl.x, pl.y, 6, 60, '#5fe08a', 0.4, 3);
        if (pl === local) G.Audio.sfx('heal');
        break;
      }
      case 'mag': G.Pickups.pullAll(); G.FX.ring(local.x, local.y, 10, 420, '#ff9ed8', 0.6, 4); break;
      case 'bomb':
        G.FX.ring(ev[1], ev[2], 20, G.Camera.outerRadius(), '#ff7b3d', 0.5, 6);
        if (G.U.dist2(ev[1], ev[2], local.x, local.y) < 500 * 500) G.Camera.kick(0.8);
        G.Audio.sfx('break');
        break;
      case 'ja': G.Judgment.netApply(ev.slice(1)); break;
      case 'wait': {
        const names = ev[1] || [];
        const k = names.join('|');
        if (k !== waitKey) { waitKey = k; if (api.waiting) api.waiting(names); }
        break;
      }
      case 'kit': if (api.kit) api.kit(ev); break;
      case 'og': G.Orbs.announce(local, ev[1], ev[2]); break;
      case 'ou': {
        const by = bySeat[ev[1]];
        if (by) G.Orbs.shown(by, ev[2], (ev[3] || []).map(i => bySeat[i]).filter(Boolean));
        break;
      }
      case 'pb': G.World.breakAt(ev[1], ev[2]); break;
      case 'alt': G.Interact.netAltar(ev[1], ev[2], ev[3], ev[4], me, local); break;
      case 'chs': G.Interact.netChest(ev[1], ev[2], ev[3]); break;
      case 'say': G.Spawner.say(ev[1], ev[2]); break;
      case 'tx': { const p = bySeat[ev[1]]; if (p) G.FX.dmgText(p.x + (p.netOffX || 0), p.y + (p.netOffY || 0) - p.bodyH - (ev[5] | 0), ev[2], ev[3], !!ev[4]); break; }
      case 'rift': case 'riftx': case 'arena': case 'aw': case 'al': G.Rift.onEvent(ev); break;
      case 'jd': case 'jk': G.Judgment.onEvent(ev); break;
      case 'wx': G.Weather.onEvent(ev); break;
      case 'ev': G.Events.onNet(ev); break;
      case 'hz': G.Hazards.add(ev[1], true); break;
      case 'fxr': G.FX.ring(ev[1], ev[2], 8, ev[3], ev[4], 0.5, 3); break;
      // bio (el bioma lo cambia el reloj, como en solitario), bd y rw (ya van en die y en ev): nada.
    }
  }

  /** Eliges la opción i de lo que tienes delante (carta, objeto o fusión). */
  function pick(i) { G.Net.send('pick', { choice: i | 0 }); }
  /** Pides otras cartas de nivel (el servidor decide si te quedan cambios). */
  function reroll() { G.Net.send('reroll'); }
  /** Caído: los enemigos que te lleguen serán los de cerca de este compañero ('' = de ti). */
  function watch(uid) { if (active) G.Net.send('watch', { uid: uid || '' }); }
  /** Usas la esfera del hueco i: la gasta y la aplica el servidor (orbs.js cast). */
  function orbUse(i) { if (active) G.Net.send('orb', { i: i | 0 }); }

  const noop = () => {};
  return {
    ANIMS, COLORS, begin, end, leave, tick, players, puppets, scaleRate, scaleHp, pick, reroll, watch, orbUse, selfMoved,
    // En el navegador ya no se reparte nada: lo hace el servidor.
    xpFactor: () => 1,
    cast: noop, hit: noop, status: noop, hurtShown: noop, enemyAdded: noop, enemyGone: noop, enemyShot: noop,
    pickupAdded: noop, pickupGone: noop, say: noop, propBroken: noop, collected: noop, shinyCaught: noop,
    broadcast: noop, toHost: noop, orbUsed: noop,
    /** Resumen de daño por jugador al acabar (el del original iba por P2P): aquí no llega el de los demás. */
    sums: () => ({}),
    mate(u) { return mates.get(u); },
    get mates() { return [...mates.values()]; },
    get members() { return members; },
    get active() { return active; },
    get isHost() { return false; },
    get local() { return local; }
  };
})();
