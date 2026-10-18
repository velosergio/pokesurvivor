/* Pruebas del azar con semilla (js/core/rng.js):  node --test server/test/rng.test.js */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { createSim } = require('../sim.js');

const take = (r, n) => Array.from({ length: n }, () => r.next());

test('misma semilla, mismos números', () => {
  const a = createSim({ seed: 1 }).G, b = createSim({ seed: 2 }).G;
  a.RNG.reseed(42); b.RNG.reseed(42);
  assert.deepStrictEqual(take(a.RNG.stream('a'), 20), take(b.RNG.stream('a'), 20));
  assert.strictEqual(a.RNG.seed, 42);
});

test('flujos independientes', () => {
  const a = createSim().G, b = createSim().G;
  a.RNG.reseed(42); b.RNG.reseed(42);
  take(a.RNG.stream('b'), 100);
  assert.deepStrictEqual(take(a.RNG.stream('a'), 20), take(b.RNG.stream('a'), 20));
});

test('fork determinista y distinto según las claves', () => {
  const a = createSim().G, b = createSim().G;
  a.RNG.reseed(42); b.RNG.reseed(42);
  const x = a.RNG.fork('levelup', 5, 1).next();
  assert.strictEqual(x, b.RNG.fork('levelup', 5, 1).next());
  assert.notStrictEqual(x, a.RNG.fork('levelup', 5, 2).next());
  assert.strictEqual(x, a.RNG.fork('levelup', 5, 1).next(), 'cada fork empieza de cero');
});

test('reseed reinicia los flujos', () => {
  const { G } = createSim();
  G.RNG.reseed(42);
  const first = take(G.RNG.stream('a'), 10);
  G.RNG.reseed(42);
  assert.deepStrictEqual(take(G.RNG.stream('a'), 10), first);
  G.RNG.reseed(43);
  assert.notDeepStrictEqual(take(G.RNG.stream('a'), 10), first);
});

test('los ayudantes de un flujo y los de G.U', () => {
  const { G } = createSim();
  G.RNG.reseed(7);
  const r = G.RNG.stream('x');
  for (let i = 0; i < 200; i++) {
    const v = r.rand(2, 5); assert.ok(v >= 2 && v < 5);
    const n = r.randInt(1, 3); assert.ok([1, 2, 3].includes(n));
    assert.ok(['a', 'b'].includes(r.pick(['a', 'b'])));
  }
  assert.strictEqual(r.chance(1), true);
  assert.strictEqual(r.chance(0), false);
  const two = G.U.pickN([1, 2, 3, 4], 2);
  assert.strictEqual(two.length, 2);
  assert.notStrictEqual(two[0], two[1]);
  assert.ok(two.every(v => [1, 2, 3, 4].includes(v)));
});
