/* Pruebas del intento del Desafío diario (js/net/daily-net.js) con un Firestore falso:
 *   node --test server/test/daily-net.test.js */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

/**
 * @param doc   lo que hay en daily/ana en el "servidor" (null = nada)
 * @param hang  la transacción no acaba nunca (sin red: Firestore espera)
 */
function load({ doc = null, hang = false } = {}) {
  const server = { doc, reads: 0, writes: [] };
  const ref = {
    get: async () => { server.reads++; return { exists: !!server.doc, data: () => server.doc }; },
    update: async v => { Object.assign(server.doc, v); }
  };
  const fsx = {
    collection: () => ({ doc: () => ref }),
    runTransaction: fn => hang ? new Promise(() => {}) : fn({
      get: async r => r.get(),
      set: (r, v) => { server.writes.push(v); server.doc = Object.assign({}, v); }
    })
  };
  const ctx = vm.createContext({
    console, setTimeout, clearTimeout, Promise,
    firebase: { firestore: { FieldValue: { serverTimestamp: () => 'ts' } } },
    G: { DB: { online: true, fb: { uid: 'ana', fs: fsx } } }
  });
  const f = 'js/net/daily-net.js';
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', '..', f), 'utf8'), ctx, { filename: f });
  return { N: ctx.G.DailyNet, server };
}

test('empezar escribe el intento y lo recuerda', async () => {
  const { N, server } = load({ doc: { d: '20261017', claimed: '20261016' } });
  await N.start('20261018');
  assert.deepStrictEqual({ ...server.writes[0] }, { d: '20261018', at: 'ts', claimed: '20261016' });
  assert.strictEqual((await N.state()).d, '20261018');
});

test('otro aparato ya jugó hoy: falla con "played" y el estado se corrige', async () => {
  const { N, server } = load({ doc: null });
  assert.strictEqual(await N.state(), null);                 // este aparato aún no lo sabe
  server.doc = { d: '20261018', claimed: '' };               // el otro empieza
  await assert.rejects(N.start('20261018'), e => e.code === 'played');
  assert.strictEqual(server.writes.length, 0);
  assert.strictEqual((await N.state()).d, '20261018');
});

test('sin red: falla pronto (no se queda esperando) y no gasta nada', async () => {
  const { N, server } = load({ doc: null, hang: true });
  N.timeout = 50;
  const t0 = Date.now();
  await assert.rejects(N.start('20261018'), e => e.code === 'unavailable');
  assert.ok(Date.now() - t0 < 2000);
  assert.strictEqual(server.writes.length, 0);
});

test('tras un fallo se vuelve a leer del servidor', async () => {
  const { N, server } = load({ doc: null, hang: true });
  N.timeout = 50;
  await N.state();
  const reads = server.reads;
  await assert.rejects(N.start('20261018'));
  await N.state();
  assert.strictEqual(server.reads, reads + 1);
});
