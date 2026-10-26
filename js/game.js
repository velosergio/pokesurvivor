/* ============ game.js — flujo del juego y bucle principal ============
 *
 *   login ──> test de personalidad ──> menú ──> run ──> resumen ──> menú
 *                (sólo la 1ª vez)          │
 *                                          ├─ Pokémon (colección)
 *                                          ├─ Mejoras
 *                                          └─ Gacha
 *
 * Estados del bucle: 'ui' (menús, con el mundo de fondo), 'playing',
 * 'levelup', 'paused', 'over'.
 *
 * Cooperativo (G.Coop.active): la partida la lleva el servidor (enemigos,
 * golpes, vida, experiencia, cartas, fin); aquí sólo mueves tu Pokémon y se
 * dibuja lo que llega. La pausa no para el juego, las cartas de nivel esperan
 * a que elijan todos y un compañero caído se levanta si otro se queda a su
 * lado. Ver net/coop.js.
 */
G.Game = (() => {
  let cv, ctx, dpr = 1, w = 0, h = 0;
  let state = 'ui';
  let time = 0, last = 0, pendingLevels = 0;
  let pl = null;
  let caught = [];          // shinies conseguidos en esta run
  let mode = null;          // el modo de esta run (G.Modes); null en cooperativo
  let biome = -1;

  const st = { get time() { return time; }, get mode() { return mode ? mode.id : null; } };

  // ---------------- arranque ----------------

  function init() {
    cv = document.getElementById('game');
    ctx = cv.getContext('2d');
    resize();
    addEventListener('resize', resizeSoon);
    // iPhone: al girarlo o al abrirlo desde la pantalla de inicio avisa del
    // cambio ANTES de recolocar la página, y con esas medidas viejas el juego
    // se quedaba estirado. Se vuelve a medir cuando el lienzo cambia de verdad
    // (ResizeObserver) y, por si acaso, un poco después de cada aviso.
    addEventListener('orientationchange', resizeSoon);
    if (window.visualViewport) visualViewport.addEventListener('resize', resizeSoon);
    if (window.ResizeObserver) new ResizeObserver(() => resize()).observe(cv);
    G.Touch.init(cv);
    // En móvil: al cambiar de app o girarlo en vertical, la partida se pausa.
    document.addEventListener('visibilitychange', () => { if (document.hidden) autoPause(); });
    // En el móvil, bajar la cortina de avisos o abrir otra app por encima a veces
    // sólo quita el foco a la página (sin ocultarla): también se pausa.
    addEventListener('blur', () => { if (G.Touch.active) autoPause(); });
    G.RunUI.wirePause(() => { state = 'playing'; G.UI.hideAll(); }, quitRun);
    Backdrop.init();
    // Halloween empieza o acaba con el juego abierto (o llega la hora de la web, al
    // abrir): en los menús, el mundo de fondo y la música cambian al momento. (Una
    // partida sigue como empezó: systems/halloween.js, runStart.)
    G.Halloween.onChange(() => {
      if (state !== 'ui') return;
      Backdrop.restore();
      const t = G.Audio.track;
      if (t) { G.Audio.music(null); G.Audio.music(t); }
      if (G.UI.isOpen('scr-menu')) G.MenuUI.open();
    });
    last = performance.now();
    requestAnimationFrame(loop);
  }

  function resize() {
    // Resolución interna como mucho ×1,5: en pantallas ×2 dibujar el doble de
    // píxeles era de lo que más costaba, y con el pixel art no se nota.
    const d = Math.min(1.5, window.devicePixelRatio || 1);
    const cw = cv.clientWidth, ch = cv.clientHeight;
    if (!cw || !ch) return;
    G.Touch.resetSafe();
    if (cw === w && ch === h && d === dpr && cv.width === Math.round(cw * d) && cv.height === Math.round(ch * d)) { checkOrientation(); return; }
    dpr = d; w = cw; h = ch;
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(h * dpr);
    G.Camera.resize(w, h, dpr);
    checkOrientation();
  }
  let resizeTs = [];
  function resizeSoon() {
    resize();
    resizeTs.forEach(clearTimeout);
    resizeTs = [100, 350, 800].map(ms => setTimeout(resize, ms));
  }

  /*
   * Botón «atrás» del móvil (o el gesto de volver, también en el iPhone). Antes
   * te sacaba de la web: en plena partida se perdían sus monedas y no contaba
   * para el ranking. Mientras juegas o estás en una pantalla del menú hay una
   * entrada de más en el historial (needsTrap); «atrás» la gasta y aquí se
   * decide: en partida, pausa; en una pantalla del menú, vuelve al menú (o
   * cierra la ventana de encima). En el menú principal no hay entrada de más:
   * «atrás» sale de la web, como siempre.
   */
  const BACK_SCREENS = ['scr-dex', 'scr-upgrades', 'scr-shop', 'scr-bag', 'scr-gacha', 'scr-friends', 'scr-rank', 'scr-goals', 'scr-lobby', 'scr-mod', 'scr-debug'];
  const shown = id => { const el = document.getElementById(id); return !!el && !el.classList.contains('hidden'); };
  let trapped = false;
  function needsTrap() {
    if (state !== 'ui') return true;
    return BACK_SCREENS.some(shown) || ['scr-settings', 'scr-news', 'scr-support', 'scr-profile', 'pull-fx'].some(shown);
  }
  function ensureTrap() {
    if (trapped || !needsTrap() || !window.history || !history.pushState) return;
    try { history.pushState({ ps: 1 }, ''); trapped = true; } catch (e) { /* nada */ }
  }
  addEventListener('popstate', () => {
    trapped = false;                          // (en cuanto haga falta, el bucle vuelve a poner otra)
    if (state !== 'ui') {
      // En partida: pausa (en grupo abre la pausa sin parar a los demás). Con las
      // cartas, la pausa o el resumen abiertos, no pasa nada: te quedas donde estás.
      if (state === 'playing' && !G.Judgment.cinematic && !G.UI.isOpen('scr-pause')) togglePause();
      return;
    }
    if (shown('pull-fx')) return;                                  // la tirada del gacha
    if (shown('scr-profile')) { document.getElementById('scr-profile').classList.add('hidden'); return; }
    if (G.SettingsUI.isOpen) { G.SettingsUI.close(); return; }
    if (shown('scr-news')) { G.NewsUI.close(); return; }
    if (shown('scr-support')) { G.SupportUI.close(); return; }
    if (BACK_SCREENS.some(shown) && G.DB.save && G.DB.save.partner) G.MenuUI.open();
  });

  /** Móvil en vertical: aviso de girarlo (y pausa). */
  function checkOrientation() {
    const portrait = G.Touch.active && innerHeight > innerWidth;
    const el = document.getElementById('rotate');
    if (!el) return;
    if (portrait && !document.getElementById('rotate-ico').innerHTML) document.getElementById('rotate-ico').innerHTML = G.Icons.html('phone', 48);
    el.classList.toggle('hidden', !portrait);
    if (portrait) autoPause();
  }

  /** Pausa sola (sólo en solitario: en grupo los demás siguen). */
  function autoPause() {
    G.Touch.reset();
    if (state === 'playing' && !G.Coop.active) { state = 'paused'; G.RunUI.showPause(); }
  }

  let waitBy = [];                   // grupo: quién está eligiendo (todo parado)

  /** Pausa/continúa (tecla Esc o P, o el botón de pausa del móvil). */
  function togglePause() {
    // En grupo la pausa no para el juego (los demás siguen jugando).
    if (G.Coop.active) {
      if (state !== 'playing') return;
      if (G.UI.isOpen('scr-pause')) G.UI.hide('scr-pause');
      else { G.RunUI.showPause(true); G.Audio.sfx('pause'); }
      return;
    }
    if (state === 'playing') { state = 'paused'; G.RunUI.showPause(); G.Audio.sfx('pause'); }
    else if (state === 'paused') { state = 'playing'; G.UI.hideAll(); }
  }

  // ---------------- run ----------------

  /**
   * @param coop  { seed, members } para una partida en grupo (lo de `started`)
   * @param solo  en solitario, el modo ya empezado con begin() (G.Flow.play):
   *              decide el Pokémon y la semilla. En grupo, tu compañero y la sala.
   */
  function startRun(coop = null, solo = G.Modes.get('classic')) {
    waitBy = []; awayBy = null; crew = null; teamSum = null;
    // Halloween (systems/halloween.js): lo que sea al empezar vale toda la partida.
    // En grupo lo decide el servidor con su reloj (hw en `started`): su mapa y sus
    // enemigos tienen que ser los mismos que los tuyos.
    G.Halloween.runStart(coop ? !!coop.hw : undefined);
    const save = G.DB.save;
    mode = coop ? null : solo;
    const hero = coop ? coopHero(save, coop) : mode.hero(save);
    const mon = hero.mon;
    const perks = G.Upgrades.perks(G.DB.upgradesOf(mon.dex));

    // La semilla de la run: el mapa y todo el azar de la partida (G.RNG) salen de ella.
    const seed = coop ? coop.seed : mode.seed();
    G.RNG.reseed(seed);

    G.UI.hideAll();
    G.UI.chrome(false);
    G.FX.clear();
    G.Projectiles.clear();
    G.Combat.clearFields();
    G.EnemyMgr.clear();
    G.Pickups.clear();
    G.Spawner.reset();
    G.Rift.reset();
    G.Judgment.reset();
    G.Events.reset();
    G.Weather.reset();
    G.Path.clear();
    G.Hazards.clear();
    G.World.reset(seed);
    G.World.setBiome(G.Tiles.runBiome(0), true);
    biome = 0;
    time = 0; pendingLevels = 0;
    runReal = performance.now(); tampered = false;

    pl = new G.Player(mon, perks, hero.shiny);
    G.Orbs.reset();
    if (hero.ability) pl.setAbility(hero.ability);
    pl.anim.skin = G.Skins.worn(save, mon.dex) || null;      // su disfraz (core/skins.js)
    pl.candy = 0;
    banked = { t1: 0, t10: 0, cn: 0 };
    caught = [];
    // Atajos: movimientos con hueco fijo (save.pbind[dex] = [id del 1, id del 2, ...]),
    // antes de aprender nada: addMove ya los coloca.
    (save.pbind && save.pbind[mon.dex] || []).forEach((id, i) => { if (id) pl.bind[id] = i; });
    // Mejora "Veto": movimientos que no quieres que te salgan.
    pl.banned = new Set((save.pban && save.pban[mon.dex] || []).slice(0, perks.bans));
    // El movimiento inicial y, con "Repertorio", un segundo de ataque: el elegido
    // con "Segundo movimiento inicial" o, si no, al azar. (En grupo los manda el servidor: kit.)
    const [first, second] = G.savedStartPicks(mon.dex);
    pl.learnStart(first, second, perks.startMoves, l => G.RNG.stream('run').pick(l));

    if (coop) {
      G.Coop.begin(coop, pl, coopApi);
      G.Social.setPlaying(true);
    }
    G.Camera.x = pl.x; G.Camera.y = pl.y; G.Camera.shake = 0;
    // Hojas de sprites locales: el compañero y los primeros enemigos.
    G.Sprites.preload([mon.dex], 8000, pl.shiny, pl.anim.skin || '');
    G.Audio.music(G.BIOME_MUSIC[0]);
    // (Lo que el ranking apunta al empezar lo hace el modo en begin(); el de
    //  grupo, el servidor del cooperativo con su propio reloj.)
    deathT = 0;

    state = 'playing';
  }

  /**
   * Tu Pokémon en grupo: con la naturaleza y la habilidad con las que te deja
   * jugar el servidor (las de tu partida guardada en la nube: `started`, ver
   * server/room.js heroOf). Si no llegan, tal cual.
   */
  function coopHero(save, coop) {
    const me = (coop.members || []).find(m => m.uid === G.Social.uid) || {};
    const dex = save.partner, shiny = !!save.partnerShiny && G.DB.ownsShiny(dex);
    if (typeof me.nat !== 'string') return { mon: G.DEX_BY[dex], shiny, ability: '' };
    const { mon, ability } = G.Mons.loadout(dex, G.Mons.saveOf(dex, me));
    return { mon, shiny, ability };
  }

  function quitRun() {
    if (G.Coop.active) G.Coop.leave();
    endRun(false);
  }

  /** Todos los jugadores de la partida (tú primero). */
  function everyone() { return G.Coop.active ? G.Coop.players() : [pl]; }

  /** Experiencia que hace falta para el siguiente nivel (cofres con candado). */
  function levelXp() {
    if (!pl) return 20;
    const k = (G.Coop.active ? G.Coop.xpFactor() : 1) * (pl.xpMul || 1);
    return Math.ceil((pl.xpNext - pl.xp + 1) / k);
  }

  // Destello de pantalla completa (la Sentencia de Arceus).
  let flashT = 0, flashDur = 1, flashCol = '#fff';
  function flash(col, dur) { flashCol = col; flashDur = dur; flashT = dur; }
  // Telón del viaje a la grieta (ver core/curtain.js).
  const veil = G.Curtain.create();
  function curtain(col) { veil.start(col); }

  /** Tu resumen para el final de la partida: ataques con su daño, objeto... */
  function mySum() {
    if (!pl) return null;
    return pl.runSum(pl.level, time);
  }

  /**
   * Los tickets recogidos se guardan en cuanto los coges (como los shinies):
   * antes sólo al acabar, y si la pestaña se cerraba de golpe se perdían.
   * `banked` = los de esta partida que ya están en la partida guardada
   * (también los caramelos de Halloween, cn).
   */
  let banked = { t1: 0, t10: 0, cn: 0 };
  function bankTickets(save_ = true) {
    const sv = G.DB.save;
    if (!sv || !pl) return;
    sv.tickets = sv.tickets || { t1: 0, t10: 0 };
    const d1 = Math.max(0, pl.t1 - banked.t1), d10 = Math.max(0, pl.t10 - banked.t10), dc = Math.max(0, (pl.candy || 0) - banked.cn);
    if (!d1 && !d10 && !dc) return;
    sv.tickets.t1 += d1; sv.tickets.t10 += d10;
    // Caramelos de Halloween: a la Mochila (bag.candy), como los tickets, en cuanto se cogen.
    if (dc) { sv.bag = sv.bag || {}; sv.bag.candy = (sv.bag.candy || 0) + dc; }
    banked = { t1: pl.t1, t10: pl.t10, cn: pl.candy || 0 };
    if (save_) G.DB.commit('run');
  }

  /** Lo que el cooperativo (net/coop.js) necesita del juego. */
  const coopApi = {
    /** El servidor manda el reloj y la experiencia del equipo. */
    syncTeam(t) {
      if (Math.abs(t.time - time) > 0.4) time = t.time;
      pl.level = t.level; pl.xp = t.xp; pl.xpNext = t.xpNext;
    },
    /** El servidor te pone delante una elección: cartas de nivel, objeto o fusión. */
    choice(m) {
      const opts = m.options || [];
      G.UI.hide('scr-pause');
      // (Cartas nuevas tras cambiarlas: sin el sonido de subir de nivel.)
      if (!(m.kind === 'level' && G.UI.isOpen('scr-levelup'))) G.Audio.sfx('levelup');
      state = 'levelup';
      // El parpadeo de los 2 s sin daño (el daño de verdad lo quita el servidor).
      if (m.kind === 'level') pl.invuln = Math.max(pl.invuln, 2);
      if (m.kind === 'item' && opts.length === 2 && G.Items.BY[opts[0].id] && G.Items.BY[opts[1].id]) {
        G.RunUI.showItemChoice(opts[0].id, opts[1].id, got => G.Coop.pick(got === opts[1].id ? 1 : 0));
      } else if (m.kind === 'bond') {
        G.RunUI.showBondList(opts, i => { G.Audio.sfx('legend'); G.Coop.pick(i); });
      } else {
        const cards = opts.map(o => ({ key: o.id, type: o.type, title: o.name, tag: o.tag, desc: o.desc, icon: o.icon, color: o.color }));
        // Cambios de cartas que te quedan según el servidor (rr): el botón los cuenta con rerollBonus.
        pl.rerolls = 0; pl.rerollBonus = (m.rr | 0) - 1;
        G.RunUI.showLevelUp(m.lv || pl.level, cards, card => { G.Audio.sfx('confirm'); G.Coop.pick(cards.indexOf(card)); }, true,
          () => G.Coop.reroll());
      }
      // Tiempo para elegir (cartas y fusión): el servidor elige por ti al acabar.
      if (m.kind !== 'item') G.RunUI.startTimer(m.left);
      G.RunUI.setWaiting(waitBy);
    },
    /** Quién está eligiendo (la partida se para para todos). Vacía: sigue. */
    waiting(names) {
      waitBy = names || [];
      G.RunUI.setWaiting(waitBy);
      if (!waitBy.length) {
        G.RunUI.closeLevelUp(); G.UI.hide('scr-item'); G.UI.hide('scr-bond');
        if (state === 'levelup' || state === 'held') state = awayBy ? 'held' : 'playing';
        G.Spawner.say(awayBy || '', awayBy ? 999 : 0, true);
        return;
      }
      if (state === 'playing') state = 'held';
      const others = waitBy.filter(n => n !== (G.Social.me && G.Social.me.name));
      if (state === 'held' && others.length) G.Spawner.say('Pausa: ' + others.join(', ') + ' ' + (others.length > 1 ? 'están eligiendo…' : 'está eligiendo…'), 999, true);
    },
    /** Tu Pokémon según el servidor: movimientos, objeto, vínculos, velocidad (la de su habilidad incluida) y esferas. */
    kit(ev) {
      const [, slots, act, item, bonds, st, orbs] = ev;
      const had = pl.slots.length;
      const old = new Map(pl.moves.map(m => [m.id, m]));
      pl.moves = [];
      pl.slots = (slots || []).map(g => g.map(([id, lvl, evo]) => {
        let m = old.get(id);
        if (!m || m.lvl !== lvl || !!m.evolved !== !!evo) {
          m = G.Moves.instance(id, lvl);
          if (evo) G.Moves.evolve(m);
        }
        pl.moves.push(m);
        return m;
      }));
      // El hueco activo lo eliges tú; el del servidor sólo si cambian los huecos.
      if (pl.slots.length !== had || pl.active >= pl.slots.length) pl.active = Math.max(0, Math.min(act | 0, pl.slots.length - 1));
      pl.item = item || null;
      pl.bonds = bonds | 0;
      if (st) { pl.spdMul = st[0] || pl.spdMul; pl.magnet = st[1] || pl.magnet; pl.netAbSpd = st[2] || 0; }
      G.Orbs.fromNet(pl, orbs);
    },
    /** Fin (te llega tu resumen del servidor). */
    over(r) {
      Object.assign(pl, { kills: r.ki | 0, bosses: r.bo | 0, coins: r.co | 0, level: Math.max(pl.level, r.lv | 0), t1: r.t1 | 0, t10: r.t10 | 0,
                          candy: Math.max(pl.candy || 0, r.cn | 0) });        // caramelos de Halloween del equipo
      if (r.t) time = r.t;
      crew = Array.isArray(r.crew) ? r.crew.map(c => Object.assign({}, c, { me: c.uid === r.uid })) : null;
      // Resumen de ataques de cada uno, del servidor (tú primero).
      teamSum = Array.isArray(r.team) ? r.team.filter(m => m && m.sum).map(m => ({ name: m.name, me: m.uid === r.uid, sum: m.sum }))
        .sort((a, b) => b.me - a.me) : null;
      if (r.why === 'error') G.UI.toast('La partida ha fallado en el servidor: se guarda lo conseguido', 3600);
      endRun(r.why === 'down');
    },
    lost(msg) { G.UI.toast(msg, 3600); endRun(false); },
    /** Conexión cortada: todo quieto mientras se reconecta (null: vuelve). */
    away(text) {
      awayBy = text || null;
      if (awayBy) {
        if (state === 'playing') state = 'held';
        G.Spawner.say(awayBy, 999, true);
      } else if (!waitBy.length) {
        if (state === 'held') state = 'playing';
        G.Spawner.say('', 0, true);
      }
    }
  };
  let awayBy = null;
  /** Grupo: lo que hizo cada uno según el servidor (`over`), para el resumen. */
  let crew = null, teamSum = null;   // en grupo: la tabla y el resumen de ataques de cada uno (del servidor)

  /** Has llevado a casa a un Pokémon perdido y se une a ti (events.js). */
  G.onRescue = (dex, name) => {
    if (!G.DB.save || !pl) return;
    const isNew = !G.DB.owns(dex);
    if (isNew) { G.DB.grant(dex, 'rescue'); G.DB.commit(true); }
    else pl.coins += 150;
    G.Spawner.say(isNew ? '¡' + name + ' se une a tu equipo!' : '¡' + name + ' te da las gracias! (+150 monedas, ya lo tenías)', 4);
    G.Audio.sfx('shinyGet');
    if (isNew) irisSay(dex);
  };

  /** Si `dex` (recién conseguido) era el último que faltaba de su generación: su Amuleto Iris. */
  function irisSay(dex) {
    const gen = G.DEX_BY[dex].gen;
    if (!G.Gacha.hasIris(G.DB.save, gen)) return;
    setTimeout(() => G.Spawner.say(G.I18n.f('¡Amuleto Iris de {x}! Shiny al 2 % en su banner', G.T(G.Gacha.BANNERS[gen - 1].name)), 5), 4000);
  }

  /** Un shiny salvaje cae: te lo quedas (y la versión normal si no la tenías). */
  G.onShinyCaught = e => {
    if (!G.DB.save || !pl) return;
    const wasOwned = G.DB.owns(e.dex);
    const isNew = G.DB.grantShiny(e.dex, 'wild');
    G.DB.save.stats.shinies++;
    G.DB.commit(true);
    caught.push({ dex: e.dex, isNew });
    G.Spawner.say(isNew ? '¡Has conseguido a ' + e.name + ' shiny!' : '¡Otro ' + e.name + ' shiny! (+300 monedas)', 4);
    if (!isNew) pl.coins += 300;
    G.Audio.sfx('shinyGet');
    if (!wasOwned) irisSay(e.dex);
  };

  function endRun(dead = true) {
    if (state === 'over' || !pl) return;
    const coop = !!pl.uid;                    // sólo las partidas en grupo le ponen uid
    if (G.Coop.active) G.Coop.end();
    if (coop) G.Social.setPlaying(false);
    G.RunUI.stopTimer();
    state = 'over';
    G.Orbs.reset();
    G.Audio.music(null);
    G.Audio.sfx(dead ? 'gameover' : 'back');
    const save = G.DB.save;
    const mul = pl.coinMul;
    const parts = {
      tiempo: Math.floor(time / 5),
      derrotados: Math.floor(pl.kills * 0.25),
      jefes: pl.bosses * 80,
      recogidas: pl.coins
    };
    const coins = Math.round((parts.tiempo + parts.derrotados + parts.jefes + parts.recogidas) * mul);
    const record = time > save.stats.bestTime;

    save.coins += coins;
    bankTickets(false);
    // Premios propios del modo (el Desafío diario da tickets por aguantar).
    const bonus = mode ? mode.finish({ t: Math.floor(time) }) : null;
    if (bonus) G.Progress.grant(bonus);
    G.Halloween.runEnd();
    save.stats.runs++;
    save.pused = save.pused || {};
    save.pused[pl.dex] = (+save.pused[pl.dex] || 0) + 1;     // para "más usados" en la colección
    save.stats.totalKills += pl.kills;
    save.stats.bestTime = Math.max(save.stats.bestTime, Math.floor(time));
    if (coop) save.stats.bestGroupTime = Math.max(save.stats.bestGroupTime || 0, Math.floor(time));
    save.stats.bestLevel = Math.max(save.stats.bestLevel, pl.level);
    save.stats.coinsEarned += coins;
    const judge = G.Judgment.summary();
    if (judge) G.Progress.event('judgeEnd', judge);
    G.Judgment.reset();
    G.Progress.event('runEnd', { time, level: pl.level, coins: pl.coins, types: pl.mon.types, group: coop });
    G.Progress.checkAch();
    // A la nube al acabar la partida (como mucho cada hora); si la marca entra
    // en un top (hoy, semana o mes), enseguida (abajo, tras subirla al ranking).
    G.DB.commit('run');
    if (G.Social.me) G.Social.publishProfile();

    // Ranking: en solitario lo sube cada uno; el de grupo, el servidor del cooperativo.
    const mark = { t: Math.floor(time), lv: pl.level, kills: pl.kills, dmg: judge ? judge.dmg : 0 };   // dmg: a Arceus
    // Si la partida se ha tocado (ver clean()), no sube al ranking (sin avisar); lo demás, sí.
    const sent = mode && clean() ? G.Ranking.submitSolo(Object.assign(mark, { dex: pl.dex, shiny: pl.shiny, build: pl.buildCode() }), mode.boards(pl.dex)) : null;
    if (sent) sent.then(b => { if (b && b.some(p => p !== 'a')) G.DB.commit(true); }).catch(() => {});

    G.RunUI.showOver({
      dead, time, level: pl.level, kills: pl.kills, bosses: pl.bosses, coins, record, t1: pl.t1, t10: pl.t10, candy: pl.candy || 0, judge, bonus,
      mode: mode ? mode.id : 'group',
      // Resumen de los ataques con su daño: en grupo, el de cada uno (del servidor); solo, el tuyo.
      team: coop ? teamSum || [] : [{ name: '', me: true, sum: mySum() }],
      moves: pl.moves, caught,
      // Resumen por personaje: en grupo, el del servidor; solo, el tuyo.
      crew: crew || [{ me: true, name: (G.Social.me && G.Social.me.name) || '', dex: pl.dex, shiny: pl.shiny, ki: pl.kills,
                       dmg: Math.round(pl.dmgDealt), hit: Math.round(pl.dmgTaken), ch: pl.chests, rv: pl.revives }],
      breakdown: Object.entries(parts).filter(([, v]) => v).map(([k, v]) => `${k} ${v}`).join(' · ') +
                 (mul > 1 ? ` · ×${mul.toFixed(2)} Fortuna` : '')
    }, () => { pl = null; G.Flow.afterRun(); });
  }

  /*
   * ¿Partida limpia? Sólo cosas que ningún jugador legal puede hacer, con
   * márgenes enormes (el sistema del 10-10 daba falsos positivos):
   *   - el reloj de la partida va más deprisa que el real (trucos de velocidad)
   *   - funciones de tu Pokémon sustituidas (así se hace uno invencible)
   *   - vida, ataque, velocidad o recarga muy por encima de lo posible
   *   - se han usado las funciones de pruebas (saltar el reloj...)
   * Si algo salta, esa partida no sube al ranking (sin avisar) y nada más.
   */
  let runReal = 0, tampered = false;
  function clean() {
    if (tampered) return false;
    if (time > (performance.now() - runReal) / 1000 + 10) return false;
    for (const k of ['hurt', 'update', 'heal', 'gainXp']) if (Object.prototype.hasOwnProperty.call(pl, k)) return false;
    if (!isFinite(pl.hp) || !isFinite(pl.maxHp) || pl.hp > pl.maxHp + 1 || pl.maxHp > 50000) return false;
    if (pl.atkMul > 2000 || pl.spdMul > 25 || pl.cdMul < 0.03 || pl.level > 20 + time / 3) return false;
    return true;
  }

  // ---------------- subida de nivel ----------------

  function maybeLevelUp() {
    // (En grupo las cartas las reparte el servidor: ver coopApi.choice.)
    if (pendingLevels <= 0 || state !== 'playing' || G.Coop.active) return;
    // Nunca abras cartas con el Pokémon caído (morir y recoger XP en el mismo frame).
    if (pl.dead) return;
    pendingLevels--;
    state = 'levelup';
    // 2 s sin daño al volver a la partida (el reloj no corre mientras eliges).
    pl.invuln = Math.max(pl.invuln, 2);
    G.Audio.sfx('levelup');
    const take = card => {
      G.Audio.sfx('confirm');
      card.apply(pl);
      // «Olvidar» abre una segunda elección: qué movimiento.
      if (card.then) G.RunUI.showLevelUp(pl.level, card.then(pl), take);
      else state = 'playing';
    };
    G.RunUI.showLevelUp(pl.level, G.LevelUp.offer(pl), take);
  }

  // ---------------- vínculos ----------------

  /**
   * Vínculo de un legendario: eliges qué movimientos se fusionan.
   * Si ahora no se puede (no hay dos sueltos), se guarda hasta que aprendas
   * otro movimiento. Se mira en cada fotograma: si otra pantalla la tapa
   * (pausa), vuelve a salir al cerrarla. (En grupo lo ofrece el servidor.)
   * @param quiet  no avisar si todavía no se puede
   */
  function offerBond(quiet = false) {
    if (!pl || pl.bonds <= 0 || pl.dead || state !== 'playing' || G.Rift.inArena || G.Coop.active) return;
    if (['scr-bond', 'scr-pause', 'scr-item', 'scr-levelup'].some(G.UI.isOpen)) return;
    const opt = pl.bondOptions();
    if (!opt) {
      if (!quiet) G.Spawner.say('Guardas el vínculo: aprende otro movimiento para usarlo', 3, true);
      return;
    }
    // Se para el juego hasta que eliges.
    state = 'choice';
    G.Audio.sfx('levelup');
    G.RunUI.showBond(opt, picked => {
      const group = pl.fuse(picked, opt.group);
      G.Audio.sfx('legend');
      G.FX.ring(pl.x, pl.y, 8, 130, '#ff8ad8', 0.8, 6);
      G.FX.burst(pl.x, pl.y - pl.bodyH * 0.5, '#ffb3e6', 40, 240);
      G.Spawner.say('¡Vínculo! ' + group.length + ' movimientos a la vez', 2.6, true);
      if (state === 'choice') state = 'playing';
    });
  }

  // ---------------- recogida ----------------

  const PICK_SFX = { xp: 'xp', xpBig: 'xp', coin: 'coin', heal: 'heal', bomb: 'break', magnet: 'confirm', ticket: 'shiny', ticket10: 'legend', item: 'legend', sphere: 'confirm' };

  /*
   * La elección de objeto y las cartas de nivel no pueden taparse. Si llega un
   * objeto con las cartas abiertas, espera a que elijas carta; y si las cartas
   * llegan con la elección de objeto abierta, ésta vuelve a salir al terminar.
   * (En grupo los objetos los ofrece el servidor: ver coopApi.choice.)
   */
  let openItem = null;           // { cur, next, take } elección de objeto sin terminar
  const laterItems = [];         // objetos recogidos con las cartas de nivel abiertas
  function afterLevelUp() {
    if (state !== 'playing' && state !== 'held') return;
    if (openItem && !G.UI.isOpen('scr-item')) {
      const o = openItem;
      if (o.mine) state = 'choice';
      G.RunUI.showItemChoice(o.cur, o.next, o.take);
      return;
    }
    if (laterItems.length) offerItem(laterItems.shift());
  }

  /** Has cogido un objeto: si no llevas ninguno te lo pones; si no, eliges. */
  function offerItem(id) {
    if (!pl || !G.Items.BY[id]) return;
    if (state === 'levelup' || G.UI.isOpen('scr-levelup')) { laterItems.push(id); return; }
    let mine = false;            // esta elección es la que ha parado el juego
    const take = got => {
      openItem = null;
      if (got !== pl.item) {
        pl.equip(got);
        G.Spawner.say('¡Llevas ' + G.Items.BY[got].name + '!', 2.6, true);
        G.Progress.event('item', { id: got });
      }
      if (!mine) { afterLevelUp(); return; }
      if (state === 'choice') state = 'playing';
      afterLevelUp();
    };
    if (!pl.item) { take(G.Items.first(id)); return; }
    if (pl.item === id) { G.Spawner.say('Ya llevas ' + G.Items.BY[id].name, 2, true); return; }
    // Se para el juego mientras eliges.
    if (state === 'playing') {
      mine = true;
      state = 'choice';
    }
    openItem = { cur: pl.item, next: id, take, get mine() { return mine; } };
    G.RunUI.showItemChoice(pl.item, id, take);
  }

  /** @param who  quien lo ha cogido (en cooperativo puede ser un compañero) */
  function onCollect(p, who = pl) {
    const mine = who === pl;
    if (G.Coop.active) {
      // Copia de un objeto del servidor: el efecto lo decide él.
      if (mine) G.Audio.sfx(PICK_SFX[p.kind]);
      return;
    }
    if (mine || p.kind === 'bomb') G.Audio.sfx(PICK_SFX[p.kind]);
    if (p.kind === 'xp' || p.kind === 'xpBig') {
      pendingLevels += pl.gainXp(p.value * (G.Coop.active ? G.Coop.xpFactor() : 1));
      return;
    }
    if (p.kind === 'coin') {
      pl.coins += p.value;
      G.FX.dmgText(who.x, who.y - who.bodyH - 6, '+' + p.value, '#ffd23f');
      return;
    }
    if (p.kind === 'item') {
      if (mine) offerItem(p.value);
      return;
    }
    if (p.kind === 'sphere') {
      // (En grupo la mete en la bolsa el servidor: llega en kit y og.)
      G.Orbs.got(pl, p.value);
      return;
    }
    if (p.kind === 'candy') {
      pl.candy = (pl.candy || 0) + (p.value || 1);
      bankTickets();
      G.FX.dmgText(who.x, who.y - who.bodyH - 8, '+' + (p.value || 1) + (p.value > 1 ? ' caramelos' : ' caramelo'), '#ff9a3d', true);
      G.FX.ring(who.x, who.y, 6, 44, '#ff8a2a', 0.4, 3);
      return;
    }
    if (p.kind === 'ticket' || p.kind === 'ticket10') {
      if (p.kind === 'ticket') pl.t1++; else pl.t10++;
      bankTickets();
      G.FX.dmgText(who.x, who.y - who.bodyH - 8, p.kind === 'ticket' ? '+1 ticket' : '¡Ticket ×10!', p.kind === 'ticket' ? '#ffd23f' : '#d9a6ff', true);
      G.FX.ring(who.x, who.y, 6, 50, p.kind === 'ticket' ? '#ffd23f' : '#c47bff', 0.4, 3);
      return;
    }
    if (p.kind === 'heal') {
      if (mine) pl.heal(pl.maxHp * 0.3);
      G.FX.ring(who.x, who.y, 6, 60, '#5fe08a', 0.4, 3);
      return;
    }
    if (p.kind === 'magnet') {
      G.Pickups.pullAll();
      G.FX.ring(who.x, who.y, 10, 420, '#ff9ed8', 0.6, 4);
      return;
    }
    if (p.kind === 'bomb') {
      if (G.U.dist2(who.x, who.y, pl.x, pl.y) < 500 * 500) G.Camera.kick(0.8);
      const R = G.Camera.outerRadius();
      G.FX.ring(who.x, who.y, 20, R, '#ff7b3d', 0.5, 6);
      for (const e of G.EnemyMgr.all()) {
        if (mine ? !G.Camera.sees(e.x, e.y, 0) : G.U.dist2(e.x, e.y, who.x, who.y) > R * R) continue;
        e.hurt(60 + pl.level * 14, '#ff7b3d', e.x - who.x, e.y - who.y, 160);
      }
    }
  }

  // ---------------- teclado ----------------

  function handleKeys() {
    if (G.SettingsUI.isOpen) { if (G.Input.tap('escape')) G.SettingsUI.close(); return; }
    // La Sentencia de Arceus: Espacio, Intro o Esc saltan la animación (si se puede).
    if (G.Judgment.cinematic && state === 'playing') {
      if (['space', 'enter', 'escape'].some(k => G.Input.tap(k))) G.Judgment.skip();
      return;
    }
    // El vínculo y el objeto van antes que las cartas: en grupo también abren
    // con state 'levelup' y, si no, los números se iban a las cartas de nivel.
    if (G.UI.isOpen('scr-bond')) {
      for (let i = 0; i < 9; i++) {
        if (G.Input.tap('digit' + (i + 1)) || G.Input.tap('numpad' + (i + 1))) { G.RunUI.pickBond(i); break; }
      }
      return;
    }
    if (G.UI.isOpen('scr-item')) {
      for (let i = 0; i < 2; i++) {
        if (G.Input.tap('digit' + (i + 1)) || G.Input.tap('numpad' + (i + 1))) { document.querySelectorAll('#item-cards .card')[i].click(); break; }
      }
      return;
    }
    if (state === 'levelup') {
      for (let i = 0; i < 4; i++) {           // (4: las cartas de «Olvidar», una por movimiento)
        if (G.Input.tap('digit' + (i + 1)) || G.Input.tap('numpad' + (i + 1))) { G.RunUI.pick(i); break; }
      }
      if (G.Input.tap('keyr')) G.RunUI.reroll();
      return;
    }
    if (state === 'ui') {
      // Esc en una subpantalla del menú vuelve al menú.
      if (G.Input.tap('escape') && !G.UI.isOpen('scr-profile') && ['scr-dex', 'scr-upgrades', 'scr-shop', 'scr-bag', 'scr-gacha', 'scr-friends', 'scr-rank', 'scr-goals'].some(G.UI.isOpen)
          && document.getElementById('pull-fx').classList.contains('hidden')) G.MenuUI.open();
      return;
    }
    if (G.Input.tap('escape') || G.Input.tap('keyp')) { togglePause(); return; }
    if (state !== 'playing' || !pl) return;
    for (let i = 0; i < 4; i++) {
      if (G.Input.tap('digit' + (i + 1)) || G.Input.tap('numpad' + (i + 1))) pl.setActive(i);
    }
    // Caído en grupo: Q / E cambian a quién miras.
    if (pl.dead) { if (G.Input.tap('keyq')) cycleWatch(-1); if (G.Input.tap('keye') || G.Input.tap('tab')) cycleWatch(1); return; }
    if (G.Input.tap('keyq')) pl.cycle(-1);
    if (G.Input.tap('keye') || G.Input.tap('tab')) pl.cycle(1);
    // Esferas: 5-8 (o el teclado numérico); en el mando, X la usa e Y cambia de esfera.
    for (let i = 0; i < 4; i++) {
      if (G.Input.tap('digit' + (i + 5)) || G.Input.tap('numpad' + (i + 5))) G.Orbs.use(pl, i);
    }
    if (G.Input.tap('padx')) G.Orbs.useSelected(pl);
    if (G.Input.tap('pady')) G.Orbs.next(pl);
  }

  // ---------------- bucle ----------------

  let deathT = 0;

  // Caído en grupo: se puede mirar a un compañero vivo. El servidor manda
  // entonces los enemigos de cerca de él (mensaje `watch`, server/room.js focusOf).
  let watch = null;
  /** El compañero al que miras, o null si miras tu cuerpo. */
  function watched() {
    if (!pl || !pl.dead || !G.Coop.active) return setWatch(null);
    if (watch && (watch.dead || !G.Coop.puppets().includes(watch))) setWatch(G.Coop.puppets().find(p => !p.dead) || null);
    return watch;
  }
  /** Cambia a quién miras y, si es otro, se lo dice al servidor. */
  function setWatch(p) {
    if (p !== watch && G.Coop.active) G.Coop.watch(p ? p.uid : '');
    return (watch = p);
  }
  /** Cambia a quién miras: tú → cada compañero vivo → tú. */
  function cycleWatch(dir) {
    const list = [null, ...G.Coop.puppets().filter(p => !p.dead)];
    if (list.length < 2) return;
    setWatch(list[(list.indexOf(watched()) + dir + list.length) % list.length]);
    G.Audio.sfx('click');
  }

  let frameDt = 0, speedK = 1, trapT = 0;
  let fpsShown = 60, fpsAcc = 0, fpsN = 0;
  // El siguiente fotograma se pide ANTES de nada: si algo falla a mitad, el
  // juego sigue (antes se quedaba congelado para siempre y había que recargar;
  // así se perdió una partida enorme al abrirse una grieta).
  // Si falla fotograma tras fotograma (el juego ya no avanza ni se ve), la
  // partida se da por terminada a los ~3 s y se guarda: tiempo, derrotados,
  // récords y ranking. Mejor eso que una pantalla negra y perderlo todo.
  let loopErrs = 0, errRun = 0;
  function loop(ts) {
    requestAnimationFrame(loop);
    try { frame(ts); errRun = 0; }
    catch (e) {
      if (loopErrs++ < 5) console.error('[Game] fallo en un fotograma:', e);
      G.Input.endFrame();
      if (++errRun === 180 && pl && state !== 'ui' && state !== 'over') {
        try {
          G.UI.hideAll();
          quitRun();
          G.UI.toast('El juego ha fallado: tu partida se ha guardado hasta aquí', 5000);
        } catch (e2) { console.error('[Game] no se pudo cerrar la partida:', e2); }
      }
    }
  }

  function frame(ts) {
    const real = (ts - last) / 1000 || 0;
    const dt = Math.min(1 / 30, real) * speedK;
    last = ts;
    if (state === 'playing') G.Settings.sample(real);
    fpsAcc += real; fpsN++;
    if (fpsAcc >= 0.5) { fpsShown = Math.round(fpsN / fpsAcc); fpsAcc = 0; fpsN = 0; }
    frameDt = state === 'playing' ? dt : 0;

    G.Pad.poll(real);
    handleKeys();
    if ((trapT -= real) <= 0) { trapT = 0.5; ensureTrap(); }

    // El telón de la grieta se abre aunque el juego esté parado: al volver se
    // abre el vínculo o las cartas en el mismo fotograma y, si sólo avanzaba
    // jugando, la pantalla se quedaba morada y quieta hasta elegir.
    veil.tick(dt);
    if (state === 'playing') update(dt);
    else if (pl && state !== 'ui') { G.FX.update(dt * 0.25); pl.anim.update(dt * 0.25); }
    // Tu posición al servidor siempre (también con las cartas abiertas: quieto).
    if (G.Coop.active && pl && state !== 'ui' && state !== 'over') {
      if (state !== 'playing') pl.frozen = true;
      G.Coop.tick(dt);
    }

    if (pl && state !== 'ui') render(); else Backdrop.render(ctx, w, h, dpr, dt);
    G.UI.tick(dt);

    G.Input.endFrame();
  }

  function update(dt) {
    const coop = G.Coop.active;
    if (flashT > 0) flashT -= dt;
    // La Sentencia de Arceus: mientras dura la animación, todo lo demás se para.
    if (G.Judgment.cinematic) {
      G.Judgment.cineTick(dt);
      pl.anim.update(dt);
      if (coop) for (const p of G.Coop.puppets()) p.netUpdate(dt);
      G.World.update(dt, G.Camera);
      G.FX.update(dt);
      G.Audio.music(G.Judgment.music);
      return;
    }
    // Tras caer, deja que se vea la animación de Faint antes del resumen.
    // (En la arena de la grieta no: allí caer sólo te echa de vuelta.)
    if (pl.dead && !coop && !G.Rift.inArena) {
      deathT += dt;
      pl.update(dt);
      G.EnemyMgr.update(dt * 0.3, pl);
      G.FX.update(dt);
      G.Camera.follow(pl.x, pl.y, dt);
      veil.lock(G.Camera, pl);
      if (deathT > 1.3) { deathT = 0; endRun(true); }
      return;
    }
    time += dt;

    const b = Math.floor(time / 240);
    if (b !== biome && !G.Rift.inArena && !G.Judgment.active) {
      biome = b;
      G.World.setBiome(G.Tiles.runBiome(b));
      G.Audio.sfx('biome');
      G.Spawner.say('— ' + G.World.biomeName() + ' —', 3);
      G.FX.ring(pl.x, pl.y, 10, G.Camera.outerRadius(), '#ffffff', 0.7, 6);
    }

    pl.frozen = coop && G.UI.isOpen('scr-pause');
    pl.update(dt);
    G.Orbs.update(dt, pl);
    if (coop) {
      // Los ataques (también los tuyos) llegan del servidor; las órbitas se dibujan aquí.
      for (const p of [pl, ...G.Coop.puppets()]) { if (p !== pl) p.netUpdate(dt); G.Combat.ghostOrbit(p, dt, time); }
      reviveTick(dt);
    }
    // (En grupo, la cámara sigue a tu Pokémon donde se dibuja: ver netOff en net/coop.js;
    // caído, al compañero que miras.)
    const view = watched();
    if (view) G.Camera.follow(view.x, view.y, dt);
    else G.Camera.follow(pl.x + (pl.netOffX || 0), pl.y + (pl.netOffY || 0), dt);
    veil.lock(G.Camera, view || pl);
    G.Step.world(dt, time, everyone(), pl, !coop, onCollect);
    G.FX.update(dt);

    G.Audio.music(G.Judgment.active ? G.Judgment.music : G.Rift.inArena ? 'rift' : G.EnemyMgr.bossAlive() ? 'boss' : G.BIOME_MUSIC[biome % G.BIOME_MUSIC.length]);
    if (!coop) maybeLevelUp();
    if (pl.bonds > 0) offerBond(true);
  }

  /**
   * Caídos en grupo (tú y tus compañeros): uno vivo al lado los va levantando. Aquí
   * sólo la barra (la misma cuenta que server/room.js): quien levanta es el servidor.
   */
  function reviveTick(dt) {
    const all = everyone();
    for (const p of all) {
      if (!p.dead) { p.reviveT = 0; continue; }
      const helper = all.some(o => o !== p && !o.dead && G.U.dist2(o.x, o.y, p.x, p.y) < 56 * 56);
      p.reviveT = Math.min(G.Player.REVIVE_TIME, helper ? (p.reviveT || 0) + dt : Math.max(0, (p.reviveT || 0) - dt * 0.5));
    }
  }

  // ---------------- dibujo ----------------

  function drawScene(cam, extra) {
    const t = performance.now() / 1000;
    G.World.drawGround(ctx, cam);
    G.World.drawLiquid(ctx, cam, t);
    G.Hazards.draw(ctx);
    G.Combat.drawGroundFields(ctx);
    G.Pickups.draw(ctx);

    // Todo lo que tiene "pies" se ordena por Y: objetos, enemigos, jugador.
    const items = [];
    // Los planos (manantiales, trampas) siempre debajo de todo lo demás.
    for (const p of G.World.visibleProps(cam)) items.push({ y: p.flat ? p.y - 4000 : p.y, prop: p });
    for (const e of G.EnemyMgr.drawables(cam)) items.push({ y: e.y, ent: e });
    for (const e of extra) items.push({ y: e.y, ent: e });
    const rift = G.Rift.drawable();
    if (rift) items.push({ y: rift.y, ent: rift });
    const arceus = pl && state !== 'ui' ? G.Judgment.drawable() : null;
    if (arceus) items.push({ y: arceus.y, ent: arceus });
    if (pl && state !== 'ui') for (const d of G.Events.drawables()) items.push({ y: d.y, ent: d });
    items.sort((a, b) => a.y - b.y);
    for (const it of items) {
      if (it.prop) G.World.drawProp(ctx, it.prop, t);
      else it.ent.draw(ctx);
    }
  }

  /*
   * Apuntar a mano: una mira donde está el ratón (y el cursor en cruz), o
   * delante de tu Pokémon si apuntas con el stick derecho.
   */
  function drawAimMark() {
    const on = state === 'playing' && pl && pl.manualAim && !G.Judgment.cinematic;
    const cur = on && !G.Pad.aim() ? 'crosshair' : '';
    if (cv.style.cursor !== cur) cv.style.cursor = cur;
    if (!on) return;
    let x, y;
    if (G.Pad.aim()) {
      const k = G.Camera.scale;
      x = (pl.x - G.Camera.left() + Math.cos(pl.aim) * 90) * k;
      y = (pl.y - G.LIFT * 0.5 - G.Camera.top() + Math.sin(pl.aim) * 90) * k;
    } else ({ x, y } = G.Input.mouse());
    ctx.save();
    ctx.lineCap = 'round';
    for (const [col, lw] of [['rgba(0,0,0,.65)', 4], ['#ffe9a8', 1.6]]) {
      ctx.strokeStyle = col; ctx.lineWidth = lw;
      ctx.beginPath(); ctx.arc(x, y, 9, 0, 6.2832); ctx.stroke();
      ctx.beginPath();
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { ctx.moveTo(x + dx * 5, y + dy * 5); ctx.lineTo(x + dx * 14, y + dy * 14); }
      ctx.stroke();
    }
    ctx.restore();
  }

  function render() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.imageSmoothingEnabled = false;

    ctx.save();
    ctx.scale(G.Camera.scale, G.Camera.scale);
    G.Camera.apply(ctx);
    // Grupo: tras una corrección del servidor, tu Pokémon se dibuja desde donde
    // estaba y llega en ~100 ms (sólo al dibujar; la posición de verdad es pl.x).
    const ox = pl.netOffX || 0, oy = pl.netOffY || 0;
    pl.x += ox; pl.y += oy;
    try {
      drawScene(G.Camera, G.Coop.active ? [pl, ...G.Coop.puppets()] : [pl]);
      G.Projectiles.draw(ctx);
      G.Combat.drawAirFields(ctx);
      G.FX.draw(ctx);
      G.Judgment.drawAir(ctx);
    } finally { pl.x -= ox; pl.y -= oy; }
    ctx.restore();

    G.Weather.draw(ctx, w, h, frameDt);
    G.World.drawVignette(ctx, w, h);
    // Niebla: la viñeta se cierra un poco (sin tapar el centro).
    const fog = G.Weather.vignette;
    if (fog > 0) {
      const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.32, w / 2, h / 2, Math.max(w, h) * 0.62);
      g.addColorStop(0, 'rgba(200,205,220,0)');
      g.addColorStop(1, `rgba(200,205,220,${0.45 * fog})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }
    if (!G.Judgment.cinematic) G.HUD.draw(ctx, w, h, pl, st);
    G.Judgment.drawOverlay(ctx, w, h, frameDt);
    G.Touch.draw(ctx);
    drawAimMark();
    if (G.Settings.get('fps')) {
      ctx.save();
      ctx.font = '700 11px Pixelify, monospace';
      ctx.textAlign = 'right';
      ctx.fillStyle = fpsShown >= 50 ? '#5fe08a' : fpsShown >= 30 ? '#ffd23f' : '#ff5f6d';
      ctx.fillText(fpsShown + ' FPS', w - 10, h - 8);
      ctx.restore();
    }
    if (flashT > 0) {
      ctx.save();
      // "Menos destellos": el fogonazo de pantalla se queda en un tercio.
      ctx.globalAlpha = Math.min(1, flashT / flashDur * 1.4) * (G.Settings.get('calm') ? 0.3 : 1);
      ctx.fillStyle = flashCol;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }
    if (veil.on) {
      ctx.save();
      ctx.globalAlpha = veil.alpha;
      ctx.fillStyle = veil.color;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }
  }

  // ---------------- fondo de los menús ----------------

  /**
   * El mundo de verdad, con Pokémon salvajes paseando y la cámara a la deriva.
   * Así el menú enseña desde el primer segundo cómo se ve el juego.
   */
  const Backdrop = (() => {
    let wanderers = [], t = 0, ready = false, biomeT = 0, bi = 0;
    const CAST = [1, 4, 7, 25, 133, 52, 39, 35, 16, 43, 60, 69, 74, 92, 129, 147, 113, 143, 54, 79];
    // Halloween: paseando por la noche, sobre todo Fantasma.
    const CAST_HW = [92, 93, 94, 200, 355, 353, 425, 429, 442, 479, 562, 592, 607, 708, 710, 778, 25, 197, 302, 351];
    const cast = () => (G.Halloween.on ? CAST_HW : CAST).filter(d => G.SPRITE_META[d]);

    function init() {
      G.World.reset(G.World.MENU_SEED);
      G.World.setBiome(G.Tiles.runBiome(0), true);
      G.Camera.x = 0; G.Camera.y = 0;
      wanderers = cast().map(dex => spawn(dex, true));
      ready = true;
    }

    function spawn(dex, anywhere) {
      const a = new G.Sprites.Animator(dex, 1);
      const r = G.Sprites.bodyRadius(dex);
      let x = 0, y = 0;
      for (let i = 0; i < 20; i++) {
        x = G.Camera.x + G.U.rand(-1, 1) * (anywhere ? G.Camera.w * 0.6 : G.Camera.w * 0.7);
        y = G.Camera.y + G.U.rand(-1, 1) * (anywhere ? G.Camera.h * 0.6 : G.Camera.h * 0.7);
        if (G.World.isFree(x, y, r)) break;
      }
      return { dex, anim: a, x, y, r, vx: 0, vy: 0, t: 0, draw(ctx) {
        G.Sprites.drawShadow(ctx, this.dex, this.x, this.y);
        this.anim.draw(ctx, this.x, this.y);
      } };
    }

    function step(dt) {
      t += dt;
      G.World.update(dt, G.Camera);
      // Deriva lenta de la cámara.
      G.Camera.x += Math.cos(t * 0.05) * 14 * dt;
      G.Camera.y += Math.sin(t * 0.037) * 10 * dt;
      G.Camera.follow(G.Camera.x, G.Camera.y, dt);

      biomeT += dt;
      if (biomeT > 30) { biomeT = 0; bi = (bi + 1) % 3; G.World.setBiome(G.Tiles.runBiome(bi)); }

      for (const wd of wanderers) {
        wd.t -= dt;
        if (wd.t <= 0) {
          // Pasea, se para o "ataca" al aire de vez en cuando.
          wd.t = G.U.rand(1, 3.5);
          const r = Math.random();
          if (r < 0.55) {
            const a = Math.random() * 6.2832, s = G.U.rand(25, 55);
            wd.vx = Math.cos(a) * s; wd.vy = Math.sin(a) * s;
          } else {
            wd.vx = wd.vy = 0;
            if (r > 0.85) wd.anim.play(G.U.pick(['Attack', 'Shoot', 'Charge']));
          }
        }
        wd.x += wd.vx * dt; wd.y += wd.vy * dt;
        G.World.collide(wd);
        const moving = Math.abs(wd.vx) + Math.abs(wd.vy) > 1;
        if (moving) wd.anim.dir = G.Sprites.dirFromAngle(Math.atan2(wd.vy, wd.vx));
        wd.anim.loop(moving ? 'Walk' : 'Idle');
        wd.anim.update(dt);
        // Si se queda fuera de cámara, reaparece dentro.
        if (!G.Camera.sees(wd.x, wd.y, 120)) Object.assign(wd, spawn(wd.dex, false));
      }
    }

    function render(ctx, w, h, dpr, dt) {
      if (!ready) return;
      step(dt);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.imageSmoothingEnabled = false;
      ctx.save();
      ctx.scale(G.Camera.scale, G.Camera.scale);
      G.Camera.apply(ctx);
      drawScene(G.Camera, wanderers);
      ctx.restore();
      if (G.Halloween.on) G.World.drawNight(ctx, w, h, G.Camera, t);
      G.World.drawVignette(ctx, w, h);
    }

    /** Al volver de una run, recupera el mundo del menú. */
    function restore() {
      G.World.reset(G.World.MENU_SEED);
      G.World.setBiome(G.Tiles.runBiome(bi), true);
      G.FX.clear(); G.Projectiles.clear(); G.Combat.clearFields(); G.EnemyMgr.clear(); G.Pickups.clear();
      wanderers = cast().map(dex => spawn(dex, true));
    }

    return { init, render, restore };
  })();

  return {
    init, startRun, everyone, levelXp, flash, curtain, offerBond,
    /** Para pruebas: salta el reloj de la run. */
    debugTime(t) { tampered = true; time = t; },
    /** Halloween: caramelos de golpe (al llegar al gran Gengar; en grupo, los da el anfitrión a todos). */
    addCandy(n) {
      if (!pl || !(n > 0)) return;
      pl.candy = (pl.candy || 0) + n;
      bankTickets();
      G.FX.dmgText(pl.x, pl.y - pl.bodyH - 14, '+' + n + ' caramelos', '#ff9a3d', true);
    },
    /** Para grabar vídeos: cámara lenta (0,5 = mitad de velocidad). */
    debugSpeed(k) { if (k > 1) tampered = true; speedK = k; },
    togglePause, cycleWatch,
    /** El compañero al que miras estando caído (o null). */
    get watching() { return watched(); },
    /** Abandona la partida en curso (p. ej. al cerrar sesión desde Ajustes). */
    quit() { if (state !== 'ui' && state !== 'over') quitRun(); },
    /** Para grabar vídeos: abre las cartas de subir de nivel. */
    debugLevelUp() { tampered = true; pl.level++; pendingLevels++; },
    toUI() { state = 'ui'; if (cv) cv.style.cursor = ''; Backdrop.restore(); },
    get state() { return state; }, get player() { return pl; }, st
  };
})();

/* ============ Flow — transiciones entre pantallas ============ */
G.Flow = {
  boot() {
    G.UI.initChrome();
    G.LoginUI.init(); G.TestUI.init(); G.MenuUI.init(); G.GachaUI.init();
    G.SocialUI.init(); G.RankingUI.init(); G.ModUI.init(); G.DebugUI.init(); G.GoalsUI.init(); G.ProfileUI.init(); G.SettingsUI.init(); G.SupportUI.init(); G.NewsUI.init(); G.LiveUI.init(); G.Updater.init();
    // Tu nombre arriba a la derecha abre tu perfil.
    document.getElementById('user-pill').onclick = () => G.GoalsUI.open('profile');
    G.Audio.music('village');     // suena tras el primer clic (lo exige el navegador)
    G.Game.init();
    // La base de datos (nube o local) recupera la sesión anterior.
    G.DB.ready().then(restored => {
      const bootEl = document.getElementById('boot');
      const go = () => {
        bootEl.classList.add('hidden');
        // En otra tarea: crear el sonido para comprobarlo cuesta ~60 ms y no debe bloquear la carga.
        setTimeout(() => this.tapToStart(() => { if (restored) this.afterLogin(); else this.toLogin(); }), 0);
      };
      // Recarga en mitad de una partida en grupo: se entra sola, sin esperar al clic.
      if (restored && G.Social.peekRun()) {
        const ld = bootEl.querySelector('.boot-ld');
        if (ld) ld.textContent = 'Volviendo a la partida…';
        G.Social.resumeRun().then(back => { if (!back) go(); else bootEl.classList.add('hidden'); });
        return;
      }
      go();
    });
  },
  /**
   * "Pulsa para empezar": los navegadores no dejan que una web suene hasta
   * que se toca algo. Con esta pantalla la música empieza en cuanto entras.
   * (Si el navegador ya deja sonar, no sale.)
   */
  tapToStart(then) {
    G.Audio.unlock();
    if (G.Audio.canPlay()) { then(); return; }
    const el = document.getElementById('tap-start');
    el.classList.remove('hidden');
    const go = e => {
      if (e.type === 'keydown' && ['Shift', 'Control', 'Alt', 'Meta', 'Tab'].includes(e.key)) return;
      e.preventDefault(); e.stopPropagation();
      G.Audio.unlock();
      el.classList.add('hidden');
      el.removeEventListener('click', go); removeEventListener('keydown', go, true);
      then();
    };
    el.addEventListener('click', go);
    addEventListener('keydown', go, true);
  },
  toLogin() { G.Audio.music('village'); G.LoginUI.open(); },
  afterLogin() {
    G.Audio.music('village');
    // Entró con la cuenta después de recargar: la partida en grupo sigue un minuto.
    if (G.DB.online && G.Social.peekRun() && !G.Coop.active) {
      const bootEl = document.getElementById('boot');
      bootEl.classList.remove('hidden');
      const ld = bootEl.querySelector('.boot-ld');
      if (ld) ld.textContent = 'Volviendo a la partida…';
      G.Social.resumeRun().then(back => {
        bootEl.classList.add('hidden');
        if (back) return;
        if (!G.DB.save.partner) G.TestUI.start();
        else this.goMenu();
      });
      return;
    }
    if (!G.DB.save.partner) G.TestUI.start();
    else this.goMenu();
  },
  goMenu() {
    if (G.Game.state !== 'ui') G.Game.toUI();
    G.Audio.music('village');
    G.MenuUI.open();
    if (!G.LoginUI.updateNotices()) G.LoginUI.offerRecovery();
    this.claimDaily();
  },
  /** El premio del Desafío de ayer (una vez por sesión y cuenta, con conexión). */
  claimDaily() {
    const uid = G.DB.online && G.DB.fb && G.DB.fb.uid;
    if (!uid || this.dailyAsked === uid) return;
    this.dailyAsked = uid;
    G.Modes.get('daily').claimYesterday().then(r => {
      if (!r) return;
      const p = r.prize, what = p.t10 ? p.t10 + (p.t10 > 1 ? ' tickets ×10' : ' ticket ×10') : p.t1 + ' tickets';
      G.UI.toast('Desafío de ayer: puesto #' + r.rank + '. Premio: ' + what, 5000);
    }).catch(e => { this.dailyAsked = null; console.warn('[Diario] premio:', e && (e.code || e.message)); });
  },
  /** Al cerrar el resumen: a la sala si sigues en una, si no al menú. */
  afterRun() {
    if (G.Social.room) {
      if (G.Game.state !== 'ui') G.Game.toUI();
      G.Audio.music('village');
      if (G.Social.room.isHost) G.Social.setOpen(true);
      G.LobbyUI.open();
    } else this.goMenu();
  },
  /**
   * Empieza una partida en solitario del modo elegido (si el modo lo deja).
   * Mientras begin() espera al servidor no se puede pedir otra, y si al
   * acabar ya no estás en el menú (empezó otra cosa), no se empieza.
   */
  async play() {
    if (this.starting || G.Game.state !== 'ui') return;
    const mode = G.Modes.current;
    this.starting = true;
    try { await mode.begin(); } catch (e) {
      console.warn('[Modo] ' + mode.id + ':', e && (e.code || e.message));
      G.UI.toast(e && e.code === 'played' ? 'Ya has jugado el desafío de hoy.'
                                          : 'No se ha podido empezar: revisa la conexión y vuelve a intentarlo.', 3500);
      if (G.UI.isOpen('scr-menu')) G.MenuUI.open();
      return;
    } finally { this.starting = false; }
    if (G.Game.state !== 'ui' || G.Social.room) return;
    G.Game.startRun(null, mode);
  },
  /** Empieza la partida en grupo (`started` del servidor: { seed, members }). */
  startCoop(cfg) {
    if (G.Game.state !== 'ui' || !G.Social.room) return;
    const boot = document.getElementById('boot');
    if (boot) boot.classList.add('hidden');
    const tap = document.getElementById('tap-start');
    if (tap) tap.classList.add('hidden');
    G.LobbyUI.close();
    G.Game.startRun(cfg);
  }
};
