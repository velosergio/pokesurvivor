/* Pruebas de la simulación sin pantalla:  node --test server/test/sim.test.js */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { createSim } = require('../sim.js');
const { soloRun } = require('./solo.js');

const DT = 1 / 30;
const run = (r, secs, each) => { for (let i = Math.round(secs / DT); i > 0; i--) { r.step(DT); if (each) each(); } };

/** Huella del estado: si dos partidas la dan igual, han ido igual. */
function print({ G }, r) {
  const en = G.EnemyMgr.all().map(e => [e.dex, Math.round(e.x), Math.round(e.y), Math.round(e.hp)]);
  return JSON.stringify({ t: r.time.toFixed(2), x: Math.round(r.pl.x), y: Math.round(r.pl.y), hp: Math.round(r.pl.hp),
    lv: r.pl.level, xp: r.pl.xp, ki: r.pl.kills, co: r.pl.coins, en, pk: G.Pickups.all().length });
}

test('carga la lógica sin navegador', () => {
  const { G } = createSim();
  for (const k of ['World', 'Player', 'EnemyMgr', 'Combat', 'Spawner', 'Step', 'Rift', 'Judgment']) assert.ok(G[k], 'falta G.' + k);
});

test('dos minutos de partida en solitario', () => {
  const sim = createSim({ seed: 3 });
  const r = soloRun(sim);
  run(r, 120);
  assert.ok(r.pl.kills > 0, 'no ha derrotado a nadie');
  assert.ok(sim.G.EnemyMgr.all().length > 0, 'no han salido enemigos');
});

test('misma semilla, misma partida; otra semilla, otra', () => {
  const a = createSim({ seed: 7 }), b = createSim({ seed: 7 }), c = createSim({ seed: 8 });
  const ra = soloRun(a), rb = soloRun(b), rc = soloRun(c);
  run(ra, 90); run(rb, 90); run(rc, 90);
  assert.strictEqual(print(a, ra), print(b, rb));
  assert.notStrictEqual(print(a, ra), print(c, rc));
});

test('una grieta: entra en la arena y vuelve', () => {
  const sim = createSim({ seed: 5 });
  const r = soloRun(sim, { god: true });
  run(r, 20);
  sim.G.Rift.debugOpen();
  let inside = false, back = false;
  run(r, 240, () => { if (sim.G.Rift.inArena) inside = true; else if (inside) back = true; });
  assert.ok(inside, 'no ha entrado en la grieta');
  assert.ok(back, 'no ha vuelto de la grieta');
});

test('la Sentencia de Arceus, de la animación a la pelea', () => {
  const sim = createSim({ seed: 9 });
  const r = soloRun(sim, { god: true });
  run(r, 20);
  sim.G.Judgment.debugStart();
  let fight = false;
  run(r, 150, () => { if (sim.G.Judgment.active && !sim.G.Judgment.cinematic) fight = true; });
  assert.ok(fight, 'no ha llegado a la pelea');
});
