/* ============ rng.js — azar con semilla, en flujos con nombre ============
 * La partida saca su azar de aquí y no de Math.random: con la misma semilla
 * (G.RNG.reseed al empezar) sale lo mismo. Así funciona el Desafío diario
 * (la misma semilla para todos) y el cooperativo repite su partida.
 *
 * Cada sistema tiene su flujo (stream('spawn'), stream('loot')...): gastar
 * números en uno no cambia los de otro. fork(nombre, ...claves) da un flujo
 * nuevo que sólo depende de la semilla y de las claves (las cartas del nivel 5
 * salen iguales aunque hasta ahí cada uno haya jugado distinto).
 *
 * Lo visual (partículas, sonido, cámara) sigue con Math.random: no debe gastar
 * números de la partida.
 */
window.G = window.G || {};

G.RNG = (() => {
  /** mulberry32 (el mismo que server/sim.js): [0, 1) con semilla. */
  function mulberry(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /** FNV-1a de 32 bits de la semilla y las claves. */
  function hash(seed, parts) {
    let h = (2166136261 ^ seed) >>> 0;
    const s = parts.join('\u0001');
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    return h >>> 0;
  }

  /** Los ayudantes de siempre sobre cualquier fuente de [0, 1). */
  function wrap(next) {
    return {
      next,
      rand(a, b) { return a + next() * (b - a); },
      randInt(a, b) { return Math.floor(a + next() * (b - a + 1)); },
      pick(arr) { return arr[Math.floor(next() * arr.length)]; },
      /** n elementos distintos al azar. */
      pickN(arr, n) {
        const c = arr.slice();
        const out = [];
        while (out.length < n && c.length) out.push(c.splice(Math.floor(next() * c.length), 1)[0]);
        return out;
      },
      chance(p) { return next() < p; }
    };
  }

  let seed = 0;
  const streams = new Map();

  function reseed(s) { seed = s >>> 0; streams.clear(); }
  function stream(name) {
    let r = streams.get(name);
    if (!r) streams.set(name, r = wrap(mulberry(hash(seed, [name]))));
    return r;
  }
  function fork(name, ...keys) { return wrap(mulberry(hash(seed, [name, ...keys]))); }

  // Cada partida pone la suya al empezar. Aquí no se gasta Math.random: en el
  // servidor lleva semilla y cambiaría todo lo que viene detrás.

  return { reseed, stream, fork, wrap, get seed() { return seed; } };
})();
