/* node --test tools/grant.test.js */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { applyGrant } = require('../js/core/grant.js');

const base = () => ({ coins: 10, tickets: { t1: 1, t10: 2 }, grantedCoins: 0, grantedT10: 0 });

test('suma monedas una sola vez', () => {
  const s = base();
  assert.deepEqual(applyGrant(s, { coins: 100000, t10: 0 }), { dc: 100000, dt: 0 });
  assert.equal(s.coins, 100010);
  assert.equal(s.grantedCoins, 100000);
  assert.equal(s.tickets.t10, 2);
  assert.deepEqual(applyGrant(s, { coins: 100000, t10: 0 }), { dc: 0, dt: 0 });
  assert.equal(s.coins, 100010);
});

test('un gasto posterior se conserva y el segundo regalo solo suma el delta', () => {
  const s = base();
  applyGrant(s, { coins: 100000, t10: 0 });
  s.coins -= 500;
  assert.deepEqual(applyGrant(s, { coins: 200000, t10: 1000 }), { dc: 100000, dt: 1000 });
  assert.equal(s.coins, 100010 - 500 + 100000);
  assert.equal(s.tickets.t10, 1002);
  assert.equal(s.grantedCoins, 200000);
  assert.equal(s.grantedT10, 1000);
  assert.equal(s.tickets.t1, 1);
});

test('no baja granted ni regala si la copia local ya se pasó', () => {
  const s = base();
  s.grantedCoins = 150000;
  s.coins = 50;
  assert.deepEqual(applyGrant(s, { coins: 100000, t10: 0 }), { dc: 0, dt: 0 });
  assert.equal(s.coins, 50);
  assert.equal(s.grantedCoins, 150000);
});

test('libreta vacía o ausente no cambia nada', () => {
  const s = base();
  assert.deepEqual(applyGrant(s, null), { dc: 0, dt: 0 });
  assert.equal(s.coins, 10);
  assert.deepEqual(applyGrant(s, {}), { dc: 0, dt: 0 });
  assert.equal(s.coins, 10);
});

test('crea tickets si la partida no los trae', () => {
  const s = { coins: 0, grantedCoins: 0, grantedT10: 0 };
  applyGrant(s, { coins: 0, t10: 1000 });
  assert.equal(s.tickets.t10, 1000);
  assert.equal(s.tickets.t1, 0);
  assert.equal(s.grantedT10, 1000);
});

test('la partida nueva y la subida usan la libreta', () => {
  const db = require('fs').readFileSync(require('path').join(__dirname, '..', 'js', 'core', 'db.js'), 'utf8');
  const html = require('fs').readFileSync(require('path').join(__dirname, '..', 'dev.html'), 'utf8');
  assert.match(db, /grantedCoins: 0/);
  assert.match(db, /grantedT10: 0/);
  assert.match(db, /s\.grantedCoins = n\(s\.grantedCoins\)/);
  assert.match(db, /s\.grantedT10 = n\(s\.grantedT10\)/);
  const uses = db.split('G.Grant.applyGrant').length - 1;
  assert.equal(uses, 3);
  assert.ok(html.indexOf('js/core/grant.js') < html.indexOf('js/core/db.js'));
});
