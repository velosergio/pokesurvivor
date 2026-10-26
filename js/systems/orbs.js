/* ============ orbs.js — esferas de Mundo Misterioso (de un solo uso, en la partida) ============
 * Se encuentran durante la partida (cofres, jefes, a veces al derrotar a un Pokémon)
 * y se pierden al acabarla: no se guardan ni tocan la nube.
 *
 *   4 huecos, hasta 3 de cada esfera. Si no te cabe, se queda en el suelo.
 *   Se usan con 5-8, tocando su casilla del HUD o con X (usar) / Y (cambiar) en el mando.
 *   1 s de recarga entre una y otra (cada jugador la suya: pl.orbCd; la elegida con mando, pl.orbSel).
 *
 * Dos clases:
 *   foe   a los enemigos que ve quien la usa (dormir, frenar, empujar).
 *   buff  a ti y a los compañeros a menos de media pantalla.
 * A los jefes y legendarios les afectan menos.
 *
 * Quién decide: la simulación (en solitario, el navegador; en grupo, el servidor,
 * server/room.js) mira la bolsa y la recarga y aplica el efecto (cast). En grupo
 * el navegador sólo pide usarla (G.Coop.orbUse → `orb {i}`), recibe su bolsa en
 * `kit` (toNet / fromNet) y enseña lo que cuenta el servidor: `og` la has cogido
 * (announce) y `ou` alguien la ha usado (shown). Lo de la pantalla (textos,
 * anillos, la cámara de la Luminosfera) no corre en el servidor (screen = false).
 */
G.Orbs = (() => {
  const SLOTS = 4, STACK = 3, CD = 1;
  const NEAR = 384;                 // "media pantalla" (G.Camera.VIEW_W / 2)
  const PUSH = 1700, PUSH_R = 240;  // la Rafagaesfera los lleva a ~1/3 de pantalla
  const LUM_ZOOM = 1.35;            // cuánto se aleja la cámara con la Luminosfera

  const LIST = [
    { id: 'slumber', name: 'Soporesfera', kind: 'foe', col: '#b39bff',
      desc: 'Duerme a los enemigos de la pantalla 4 s (a los jefes, 1 s).' },
    { id: 'slow', name: 'Ralentosfera', kind: 'foe', col: '#5fd0ff',
      desc: 'Los enemigos de la pantalla van un 50 % más lentos durante 8 s (los jefes, un 20 %).' },
    { id: 'blowback', name: 'Rafagaesfera', kind: 'foe', col: '#9ff0c0',
      desc: 'Lanza lejos a los enemigos que tienes cerca (a los jefes, la mitad).' },
    { id: 'focus', name: 'Focosfera', kind: 'buff', dur: 15, col: '#ff6f7d',
      desc: '+25 % de crítico durante 15 s, para ti y los compañeros cercanos.' },
    { id: 'luminous', name: 'Luminosfera', kind: 'buff', dur: 15, col: '#ffe680',
      desc: 'Ves más campo (la cámara se aleja) durante 15 s, tú y los compañeros cercanos.' },
    { id: 'quick', name: 'Rapidosfera', kind: 'buff', dur: 10, col: '#ffb24d',
      desc: '+40 % de velocidad durante 10 s, para ti y los compañeros cercanos.' }
  ];
  const BY = {};
  for (const o of LIST) BY[o.id] = o;

  const seen = new Set();           // las que ya te han explicado en esta partida

  /** ¿Navegador en grupo? Entonces la partida (y las esferas) las lleva el servidor. */
  const remote = () => G.Coop.active && !G.Coop.isHost;

  function roll() { return G.RNG.stream('loot').pick(LIST).id; }

  // ---------------- la bolsa de cada jugador (pl.orbs = 4 huecos: { id, n } o null) ----------------
  // Cada esfera se queda en su hueco (y en su tecla) aunque gastes las de al lado.

  const bag = p => p.orbs || (p.orbs = new Array(SLOTS).fill(null));
  /** Hueco en que la lleva (-1 si no la tiene). */
  const slotOf = (p, id) => bag(p).findIndex(o => o && o.id === id);

  function canTake(p, id) {
    const inv = bag(p), s = inv.find(o => o && o.id === id);
    return s ? s.n < STACK : inv.includes(null);
  }

  function add(p, id) {
    if (!BY[id] || !canTake(p, id)) return false;
    const inv = bag(p), s = inv.find(o => o && o.id === id);
    if (s) s.n++; else inv[inv.indexOf(null)] = { id, n: 1 };
    return true;
  }

  /** Quita una del hueco que la tenga. → true si la tenía. */
  function take(p, id) {
    const inv = bag(p), i = slotOf(p, id);
    if (i < 0) return false;
    if (--inv[i].n <= 0) inv[i] = null;
    return true;
  }

  /** La bolsa para `kit`: [id, n] o 0 por hueco. */
  const toNet = p => bag(p).map(o => (o ? [o.id, o.n] : 0));
  /** La bolsa que dice el servidor (lo que no se entiende, hueco vacío). */
  function fromNet(p, a) {
    p.orbs = new Array(SLOTS).fill(null).map((_, i) => {
      const o = Array.isArray(a) ? a[i] : null;
      return Array.isArray(o) && BY[o[0]] ? { id: o[0], n: Math.max(1, Math.min(STACK, o[1] | 0)) } : null;
    });
  }

  /** La has cogido tú (en solitario): a la bolsa y se ve. */
  function got(pl, id) {
    if (add(pl, id)) announce(pl, id, slotOf(pl, id));
  }

  /** La has cogido (hueco i): su casilla brilla y, la primera vez en la partida, te explica qué hace. */
  function announce(pl, id, i) {
    const o = BY[id];
    if (!o || !(i >= 0 && i < SLOTS)) return;
    // Su casilla brilla y enseña el nombre unos segundos (hud.js).
    pl.orbNew = { i, at: performance.now() };
    G.FX.dmgText(pl.x, pl.y - pl.bodyH - 8, G.T(o.name), o.col, true);
    G.FX.ring(pl.x, pl.y, 6, 50, o.col, 0.4, 3);
    if (seen.has(id)) return;
    seen.add(id);
    const how = G.Pad.name ? G.T('X para usarla') : G.Touch.active ? G.T('tócala encima de tus ataques') : G.I18n.f('tecla {x}', i + 5);
    G.Spawner.say(G.T(o.name) + ' (' + how + '): ' + G.T(o.desc), 5);
  }

  // ---------------- usar ----------------

  const cdOf = pl => Math.max(0, pl.orbCd || 0);
  const selOf = pl => pl.orbSel | 0;

  /** Usa la esfera del hueco i (0-3). En grupo, se la pide al servidor. */
  function use(pl, i) {
    const s = pl.orbs && pl.orbs[i];
    if (!s || pl.dead || G.Game.state !== 'playing') return;
    if (cdOf(pl) > 0) { G.Audio.sfx('error'); return; }
    G.Audio.sfx('confirm');
    if (!remote()) { cast(pl, i); return; }
    pl.orbCd = CD;                  // la que cuenta es la del servidor; ésta, para no pedirla de más
    G.Coop.orbUse(i);
  }

  /**
   * La simulación: usa la esfera del hueco i de pl si la tiene y no está
   * recargando. A los enemigos que ve pl, o mejora para él y los compañeros cercanos.
   * @returns {boolean} si se ha usado
   */
  function cast(pl, i) {
    const s = pl.orbs && pl.orbs[i];
    if (!s || pl.dead || cdOf(pl) > 0) return false;
    pl.orbCd = CD;
    const id = s.id;
    take(pl, id);
    let mates = [];
    if (BY[id].kind === 'foe') foe(id, pl.x, pl.y, zoomOf(pl));
    else mates = nearBuff(pl);
    shown(pl, id, mates);
    G.Coop.orbUsed(pl, id, mates);
    return true;
  }

  /** Mando: Y pasa a la siguiente esfera que tengas, X usa la elegida. */
  function next(pl) {
    const inv = bag(pl), sel = selOf(pl);
    for (let k = 1; k <= SLOTS; k++) if (inv[(sel + k) % SLOTS]) { pl.orbSel = (sel + k) % SLOTS; G.Audio.sfx('click'); return; }
  }
  function useSelected(pl) {
    const inv = bag(pl);
    if (!inv[selOf(pl)]) next(pl);
    if (inv[selOf(pl)]) use(pl, selOf(pl));
  }

  /** Lo que se ve al usarla: el anillo de quien la usa y, en quien la recibe, la mejora. */
  function shown(by, id, mates) {
    if (!BY[id]) return;
    if (G.Orbs.screen) G.FX.ring(by.x, by.y, 10, BY[id].kind === 'buff' ? NEAR : 260, BY[id].col, 0.6, 5);
    for (const p of mates) buff(p, id);
  }

  /** Zoom con que ve la partida pl (con la Luminosfera, más campo). */
  const zoomOf = pl => (pl.orbBuff && pl.orbBuff.luminous > 0 ? LUM_ZOOM : 1);

  /** A los enemigos que ve quien la usa (x, y con su zoom z). */
  function foe(id, x, y, z = 1) {
    const hw = G.Camera.VIEW_W / 2 * z + 60, hh = G.Camera.MIN_VIEW_H * 0.75 * z + 60;
    for (const e of G.EnemyMgr.all()) {
      if (e.dead || e.remote) continue;
      const dx = e.x - x, dy = e.y - y, big = e.boss || e.legend || e.judge;
      if (id === 'blowback') {
        if (dx * dx + dy * dy > PUSH_R * PUSH_R) continue;
        const [nx, ny] = G.U.norm(dx || 1, dy);
        e.kx += nx * PUSH * (big ? 0.5 : 1); e.ky += ny * PUSH * (big ? 0.5 : 1);
        continue;
      }
      if (Math.abs(dx) > hw || Math.abs(dy) > hh) continue;
      if (id === 'slumber') e.applySleep(big ? 1 : 4);
      else if (id === 'slow') e.applySlow(big ? 0.2 : 0.5, 8);
    }
  }

  /** Quien la usa y los compañeros vivos a menos de media pantalla: a ésos, la mejora. */
  function nearBuff(by) {
    const all = G.Coop.active ? G.Coop.players() : [by];
    return all.filter(p => p === by || (p && !p.dead && G.U.dist2(p.x, p.y, by.x, by.y) < NEAR * NEAR));
  }

  // ---------------- mejoras con tiempo (pl.orbBuff = { id: segundos }) ----------------
  // El efecto en el Pokémon (crítico, velocidad) lo pone la simulación; en grupo
  // al navegador le llega la velocidad en `kit`. La cámara, sólo en la pantalla de ese jugador.

  function buff(pl, id) {
    const o = BY[id];
    pl.orbBuff = pl.orbBuff || {};
    if (!(pl.orbBuff[id] > 0)) on(pl, id);
    pl.orbBuff[id] = o.dur;
    if (G.Orbs.screen) G.FX.dmgText(pl.x, pl.y - pl.bodyH - 8, G.T(o.name), o.col, true);
  }
  /** ¿Es el jugador de esta pantalla? */
  const mine = pl => G.Orbs.screen && pl === G.Game.player;
  function on(pl, id) {
    if (id === 'luminous') { if (mine(pl)) G.Camera.zoomTo = LUM_ZOOM; return; }
    if (remote()) return;
    if (id === 'focus') pl.critChance += 0.25;
    else if (id === 'quick') pl.spdMul *= 1.4;
  }
  function off(pl, id) {
    if (id === 'luminous') { if (mine(pl)) G.Camera.zoomTo = 1; return; }
    if (remote()) return;
    if (id === 'focus') pl.critChance -= 0.25;
    else if (id === 'quick') pl.spdMul /= 1.4;
  }

  /** Cada fotograma (o paso del servidor), con cada jugador que lleve la simulación. */
  function update(dt, pl) {
    if (pl.orbCd > 0) pl.orbCd -= dt;
    const b = pl.orbBuff;
    if (b) for (const id in b) if (b[id] > 0 && (b[id] -= dt) <= 0) off(pl, id);
  }

  /** Al empezar o acabar una partida: fuera la cámara alejada y lo explicado. */
  function reset() {
    seen.clear();
    if (G.Orbs.screen) G.Camera.zoomTo = 1;
  }

  return { LIST, BY, SLOTS, STACK, CD, screen: true, roll, canTake, add, take, slotOf, toNet, fromNet, got, announce,
           use, cast, next, useSelected, shown, update, reset, foe, zoomOf, cdOf, selOf };
})();
