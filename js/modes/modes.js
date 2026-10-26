/* ============ modes.js — modos de juego (Clásico, Desafío diario) ============
 * Lo que cambia de un modo a otro lo decide el modo, no game.js: con qué
 * Pokémon se juega, con qué semilla, si se puede empezar, qué pasa al empezar,
 * a qué tablas sube la marca y qué premios extra da. Un modo nuevo es otro
 * objeto con esta forma (G.Modes.add), sin tocar el bucle del juego.
 *
 *   id                 'classic' | 'daily' | ...
 *   hero(save)         → { mon, shiny, ability? }
 *   seed()             → la semilla de la run (G.RNG y el mapa)
 *   availability()     → Promise<{ ok, reason?: 'guest' | 'offline' | 'played', last? }>
 *   begin()            → Promise (si falla, la partida no empieza)
 *   boards(dex)        → [[tabla, periodo], ...] a las que sube la marca
 *   finish({ t })      → { t1, t10 } tickets extra al acabar
 *
 * El cooperativo no pasa por aquí: juega con tu compañero y la semilla de la sala.
 */
G.Modes = (() => {
  const KEY = 'ps.mode';
  const list = new Map();
  let cur = 'classic';
  try { cur = localStorage.getItem(KEY) || cur; } catch (e) { /* sin almacenamiento */ }

  function add(mode) { list.set(mode.id, mode); }
  function get(id) { return list.get(id); }
  function select(id) {
    cur = list.has(id) ? id : 'classic';
    try { localStorage.setItem(KEY, cur); } catch (e) { /* sin almacenamiento */ }
  }

  /** El de siempre: tu compañero, semilla al azar y el ranking normal.
   *  Con su naturaleza, su habilidad y sus MT (systems/mons.js). */
  add({
    id: 'classic',
    hero(save) {
      const { mon, ability } = G.Mons.loadout(save.partner, save);
      return { mon, shiny: !!save.partnerShiny && G.DB.ownsShiny(save.partner), ability };
    },
    seed() { return Math.floor(Math.random() * 1e6); },
    async availability() { return { ok: true }; },
    async begin() { G.Ranking.runStarted('s'); },
    boards(dex) { return G.Ranking.soloBoards(dex); },
    finish() { return { t1: 0, t10: 0 }; }
  });

  return {
    add, get, select,
    get current() { return list.get(cur) || list.get('classic'); },
    get all() { return [...list.values()]; }
  };
})();
