/* Pruebas de los cálculos del Desafío diario (js/systems/daily.js):  node --test server/test/daily.test.js */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { createSim } = require('../sim.js');

const { G } = createSim();
const D = G.Daily;
const at = iso => new Date(iso);

test('dayId en hora de Colombia', () => {
  assert.strictEqual(D.dayId(at('2026-10-19T04:59:00Z')), '20261018');
  assert.strictEqual(D.dayId(at('2026-10-19T05:00:00Z')), '20261019');
});

test('today: estable, jugable y variado', () => {
  const d = at('2026-10-18T15:00:00Z');
  const a = D.today(d), b = createSim().G.Daily.today(d);
  assert.deepStrictEqual({ ...a }, { ...b });
  assert.strictEqual(a.day, '20261018');
  assert.ok(G.DEX_BY[a.dex], 'Pokémon que existe');
  assert.ok(Number.isInteger(a.seed) && a.seed > 0);
  const seen = new Set(), seeds = new Set();
  for (let i = 0; i < 30; i++) {
    const t = D.today(new Date(Date.UTC(2026, 9, 1 + i, 15)));
    seen.add(t.dex); seeds.add(t.seed);
  }
  assert.ok(seen.size >= 20, 'sólo ' + seen.size + ' Pokémon distintos en 30 días');
  assert.strictEqual(seeds.size, 30);
});

test('prevDay cambia de mes y de año', () => {
  assert.strictEqual(D.prevDay('20261018'), '20261017');
  assert.strictEqual(D.prevDay('20261101'), '20261031');
  assert.strictEqual(D.prevDay('20270101'), '20261231');
  assert.strictEqual(D.prevDay('20240301'), '20240229');
});

test('playTickets por tiempo aguantado', () => {
  assert.strictEqual(G.Judgment.AT, 1800);
  const cases = [[0, 0], [299, 0], [300, 1], [599, 1], [600, 2], [1200, 3], [1799, 3], [1800, 5], [2000, 5]];
  for (const [t, n] of cases) assert.strictEqual(D.playTickets(t), n, 't = ' + t);
});

test('placePrize por puesto', () => {
  const cases = [[1, 0, 2], [2, 0, 1], [3, 0, 1], [4, 5, 0], [10, 5, 0], [11, 0, 0], [0, 0, 0]];
  for (const [rank, t1, t10] of cases) assert.deepStrictEqual({ ...D.placePrize(rank) }, { t1, t10 }, 'puesto ' + rank);
});

test('claimOpen desde la 01:30 hora de Colombia', () => {
  assert.strictEqual(D.claimOpen(at('2026-10-18T06:29:00Z')), false);
  assert.strictEqual(D.claimOpen(at('2026-10-18T06:30:00Z')), true);
  assert.strictEqual(D.claimOpen(at('2026-10-18T20:00:00Z')), true);
});

test('nextStreak', () => {
  assert.strictEqual(D.nextStreak({}, '20261018'), 1);
  assert.strictEqual(D.nextStreak({ last: '20261017', streak: 4 }, '20261018'), 5);
  assert.strictEqual(D.nextStreak({ last: '20261018', streak: 4 }, '20261018'), 4);
  assert.strictEqual(D.nextStreak({ last: '20261015', streak: 4 }, '20261018'), 1);
  assert.strictEqual(D.nextStreak({ last: '20261031', streak: 2 }, '20261101'), 3);
});

test('forDay: el reto de cualquier día (para ver la tabla de ayer)', () => {
  assert.deepStrictEqual({ ...D.forDay('20261018') }, { ...D.today(at('2026-10-18T15:00:00Z')) });
  assert.notStrictEqual(D.forDay('20261017').seed, D.forDay('20261018').seed);
});
