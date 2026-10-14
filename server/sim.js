/* ============ sim.js — el juego sin pantalla (Node) ============
 *
 * Carga la lógica de js/ (los mismos archivos y en el mismo orden que
 * dev.html) en un contexto vm con su propio G. Lo que es pantalla, sonido,
 * teclado, red, interfaz o partida guardada no se carga: se sustituye por
 * objetos que no hacen nada.
 *
 * En el contexto NO hay document, Image, window.addEventListener ni canvas:
 * si la lógica los toca, falla (así lo cazan las pruebas). Lo mismo con
 * setTimeout y setInterval: lanzan un Error (no se dispararían nunca).
 * Math.random lleva semilla y performance.now() es el reloj de la simulación,
 * así dos simulaciones con la misma semilla y las mismas órdenes dan lo mismo.
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');

const ROOT = path.join(__dirname, '..');
/** Lo que no se carga: pantalla, sonido, entrada, red, interfaz y guardado. */
const SKIP = /^js\/(ui|net)\/|^js\/(game|main)\.js$|^js\/core\/(settings|db|audio|input|touch|updater)\.js$|^js\/entities\/fx\.js$/;

/** Scripts de dev.html que forman la simulación, en su orden (la misma lista que tools/build.js). */
function scripts() {
  const html = fs.readFileSync(path.join(ROOT, 'dev.html'), 'utf8');
  const BEGIN = '<!-- scripts:begin -->', END = '<!-- scripts:end -->';
  const i = html.indexOf(BEGIN), j = html.indexOf(END);
  if (i < 0 || j < 0) throw new Error('dev.html no tiene las marcas ' + BEGIN + ' / ' + END);
  const block = html.slice(i, j + END.length);
  return [...block.matchAll(/<script[^>]*src="(js\/[^"]+\.js)"/g)].map(m => m[1]).filter(f => !SKIP.test(f));
}

/** mulberry32: aleatorio con semilla, en [0, 1). */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Los scripts ya compilados (vm.Script), una sola vez por proceso: leer y
 * compilar js/ en cada sala bloqueaba el servidor. Un vm.Script se puede
 * ejecutar en contextos distintos, y cada sala sigue teniendo su propio G.
 */
let compiled = null;
function compiledScripts() {
  if (!compiled) compiled = scripts().map(f => new vm.Script(fs.readFileSync(path.join(ROOT, f), 'utf8'), { filename: f }));
  return compiled;
}

const noop = () => {};
/** Un temporizador de la lógica no se dispararía nunca aquí: mejor que falle. */
const sinTimer = nombre => () => { throw new Error(nombre + ' en la simulación: la lógica no puede usar temporizadores'); };
/** Objeto en el que cualquier método existe y no hace nada (salvo los de `own`). */
const mute = (own = {}) => new Proxy(own, { get: (o, k) => (k in o ? o[k] : noop) });

/**
 * Una simulación nueva, con su G.
 * @returns {{ G: object, clock: { t: number } }}  clock.t = segundos de simulación
 *          (lo avanza quien la usa; es lo que devuelve performance.now()/1000)
 */
function createSim({ seed = 1 } = {}) {
  const clock = { t: 0 };
  // Con DONT_CONTEXTIFY (Node 22.8+) el global del contexto es uno normal de
  // V8: leer G, Math... cuesta lo mismo que fuera. Con un objeto
  // "contextificado" cada lectura de una global pasa por Node (~150 ns) y la
  // simulación entera iba varias veces más lenta.
  const sb = vm.constants && vm.constants.DONT_CONTEXTIFY
    ? vm.runInContext('globalThis', vm.createContext(vm.constants.DONT_CONTEXTIFY))
    : vm.createContext({});
  Object.assign(sb, {
    console,
    performance: { now: () => clock.t * 1000 },
    localStorage: { getItem: () => null, setItem: noop, removeItem: noop },
    setTimeout: sinTimer('setTimeout'), clearTimeout: noop, setInterval: sinTimer('setInterval'), clearInterval: noop,
    __rng: rng(seed)
  });
  sb.window = sb;
  vm.runInContext('Math.random = __rng; delete window.__rng;', sb);
  for (const s of compiledScripts()) s.runInContext(sb);

  const G = sb.G;
  for (const k of ['Audio', 'FX', 'Touch', 'UI', 'HUD', 'RunUI', 'Social', 'Ranking', 'Progress', 'Icons']) G[k] = mute();
  G.Settings = mute({ fx: 1, get: () => false });
  G.Input = mute({ axis: () => [0, 0] });
  G.DB = mute({ save: { legends: {} } });
  G.Coop = mute({ active: false, isHost: false, scaleRate: () => 1, scaleHp: () => 1, xpFactor: () => 1, players: () => [], puppets: () => [] });
  // Sin imágenes: las hojas de sprites no se descargan (los tamaños salen de G.SPRITE_META).
  G.Sprites.preload = () => Promise.resolve();
  G.Camera.resize(1280, 720, 1);
  return { G, clock };
}

module.exports = { createSim, scripts, rng, warm: compiledScripts };
