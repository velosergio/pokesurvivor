/* Pruebas de las tablas del ranking (js/net/ranking.js):  node --test server/test/ranking-boards.test.js
 * Sin conexión: sólo los nombres de las tablas y lo que se conserva en el navegador. */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { createSim } = require('../sim.js');

function load() {
  const { G, ctx } = createSim();
  G.DB = { online: false };
  const f = 'js/net/ranking.js';
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', '..', f), 'utf8'), ctx, { filename: f });
  return G;
}
const plain = v => JSON.parse(JSON.stringify(v));
const DAY = new Date('2026-10-14T15:00:00Z');

test('soloBoards: las 5 tablas de siempre', () => {
  const G = load();
  assert.deepStrictEqual(plain(G.Ranking.soloBoards(25, DAY)),
    [['s_d20261014r', 'd'], ['s_w2026-42r', 'w'], ['s_m202610r', 'm'], ['s_all3', 'a'], ['s_all3_p25', 'p']]);
});

test('dailyBoards: una tabla por día', () => {
  const G = load();
  assert.deepStrictEqual(plain(G.Ranking.dailyBoards('20261018')), [['x_d20261018', 'x']]);
  assert.strictEqual(G.Ranking.board('x', '20261018'), 'x_d20261018');
  assert.strictEqual(G.Ranking.board('s', 'd'), 's_' + G.Ranking.periodIds().d + 'r');
});

test('se conservan las tablas de ahora y la del diario de ayer, no las viejas', () => {
  const G = load();
  const at = new Date('2026-10-18T15:00:00Z');
  const keep = b => G.Ranking.isCurrentBoard(b, at);
  assert.ok(keep('x_d20261018'));
  assert.ok(keep('x_d20261017'), 'la de ayer hace falta para cobrar el premio');
  assert.ok(!keep('x_d20261001'));
  assert.ok(keep('s_d20261018r'));
  assert.ok(keep('s_all3_p25'));
  assert.ok(!keep('s_d20261010r'));
  assert.ok(!keep('s_all2'), 'las de antes del reinicio del 18-10 ya no valen');
});
