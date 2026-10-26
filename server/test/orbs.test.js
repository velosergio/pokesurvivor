/* Pruebas de las esferas en el navegador (js/systems/orbs.js), sin pantalla:  node --test server/test/orbs.test.js
 * Lo del servidor (coger, usar, recarga y mejora a compañeros) está en room.test.js. */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { createSim } = require('../sim.js');

/** Una simulación con un jugador; group: navegador en grupo (la partida la lleva el servidor). */
function setup({ group = false } = {}) {
  const { G } = createSim();
  const pl = new G.Player(G.DEX_BY[25], G.Upgrades.perks({}), false);
  const asked = [];
  G.Game = { state: 'playing', player: pl };
  G.Coop = { active: group, isHost: false, players: () => [pl], orbUse: i => asked.push(i), orbUsed() {} };
  G.Orbs.reset();
  return { G, pl, asked };
}

test('en solitario: usarla la gasta, la aplica y recarga 1 s', () => {
  const { G, pl, asked } = setup();
  G.Orbs.add(pl, 'quick'); G.Orbs.add(pl, 'quick');
  const spd = pl.spdMul;
  G.Orbs.use(pl, 0);
  assert.ok(Math.abs(pl.spdMul - spd * 1.4) < 1e-9);
  assert.strictEqual(pl.orbs[0].n, 1);
  assert.strictEqual(asked.length, 0);
  G.Orbs.use(pl, 0);
  assert.strictEqual(pl.orbs[0].n, 1, 'se ha usado durante la recarga');
  G.Orbs.update(1.01, pl);
  G.Orbs.use(pl, 0);
  assert.strictEqual(pl.orbs[0], null);
});

test('en grupo: usarla sólo se pide al servidor (sin gastarla ni aplicarla aquí) y no se pide dos veces en la recarga', () => {
  const { G, pl, asked } = setup({ group: true });
  G.Orbs.fromNet(pl, [0, ['quick', 2], 0, 0]);
  const spd = pl.spdMul;
  G.Orbs.use(pl, 1);
  G.Orbs.use(pl, 1);
  assert.deepStrictEqual(asked, [1]);
  assert.strictEqual(pl.orbs[1].n, 2, 'la bolsa la dice el servidor (kit)');
  assert.strictEqual(pl.spdMul, spd);
});

test('en grupo: ou enseña la mejora sin tocar la velocidad (llega en kit) y la Luminosfera aleja la cámara de quien la recibe', () => {
  const { G, pl } = setup({ group: true });
  const mate = new G.Player(G.DEX_BY[4], {}, false);
  const spd = pl.spdMul;
  G.Orbs.shown(mate, 'quick', [pl, mate]);
  assert.strictEqual(pl.spdMul, spd);
  assert.ok(pl.orbBuff.quick > 0, 'el HUD no enseña la mejora');
  G.Orbs.shown(mate, 'luminous', [mate]);
  assert.strictEqual(G.Camera.zoomTo, 1, 'la cámara se aleja por la mejora de otro');
  G.Orbs.shown(mate, 'luminous', [pl, mate]);
  assert.strictEqual(G.Camera.zoomTo, 1.35);
  G.Orbs.update(15.01, pl);
  assert.strictEqual(G.Camera.zoomTo, 1);
});

test('kit: la bolsa va y vuelve igual; lo que no se entiende, hueco vacío', () => {
  const { G, pl } = setup({ group: true });
  G.Orbs.add(pl, 'focus'); G.Orbs.add(pl, 'slow'); G.Orbs.add(pl, 'slow');
  const net = G.Orbs.toNet(pl);
  const other = new G.Player(G.DEX_BY[4], {}, false);
  G.Orbs.fromNet(other, net);
  assert.strictEqual(JSON.stringify(G.Orbs.toNet(other)), JSON.stringify(net));
  G.Orbs.fromNet(other, [['nada', 1], 'x', ['slow', 99]]);
  assert.strictEqual(JSON.stringify(G.Orbs.toNet(other)), JSON.stringify([0, 0, ['slow', 3], 0]));
});

test('og: la casilla brilla y la primera vez se explica qué hace', () => {
  const { G, pl } = setup({ group: true });
  const said = [];
  G.Spawner.say = t => said.push(t);
  G.Orbs.fromNet(pl, [0, ['focus', 1], 0, 0]);
  G.Orbs.announce(pl, 'focus', 1);
  G.Orbs.announce(pl, 'focus', 1);
  assert.strictEqual(pl.orbNew.i, 1);
  assert.strictEqual(said.length, 1);
});
