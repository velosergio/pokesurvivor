/* Pruebas de la mezcla de partidas de dos aparatos (G.DB.merge, js/core/db.js):
 *   node --test server/test/db-merge.test.js */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { createSim } = require('../sim.js');

function load() {
  const { G, ctx } = createSim();
  const f = 'js/core/db.js';
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', '..', f), 'utf8'), ctx, { filename: f });
  return G;
}

test('Desafío diario: contadores al mayor y el día y la racha del que jugó más tarde', () => {
  const G = load();
  const mk = (daily, updated) => ({ name: 'Ana', coins: 0, tickets: { t1: 0, t10: 0 }, owned: { 25: { at: 1 } }, shiny: {}, partner: 25,
    upgrades: {}, pupg: {}, legends: {}, arenas: {}, itemsFound: {}, evoMoves: {}, ach: {}, missions: {}, stats: {}, daily, updated });
  const phone = mk({ played: 5, streak: 3, last: '20261018', prev: '20261017', lastT: 400, best: 4, wins: 0, top10: 1 }, 1);
  const pc = mk({ played: 7, streak: 1, last: '20261010', prev: '', lastT: 900, best: 1, wins: 1, top10: 2 }, 2);   // guardó después
  const r = G.DB.merge(pc, phone);
  assert.deepStrictEqual({ ...r.daily }, { played: 7, streak: 3, last: '20261018', prev: '20261017', lastT: 400, best: 1, wins: 1, top10: 2 });
  assert.deepStrictEqual({ ...G.DB.merge(phone, pc).daily }, { ...r.daily });
});
