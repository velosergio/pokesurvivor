/* Prueba de punta a punta: el servidor de verdad (index + lobby + room + sim) con bots. */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const WebSocket = require('ws');
const { start } = require('../index');
const proto = require('../proto');
const { runBots } = require('../tools/bots');

const quiet = { log() {}, warn() {}, error: (...a) => console.error(...a) };

/** Servidor real en un puerto libre, con tokens dev:<uid>. */
async function boot() {
  const app = start({ port: 0, devAuth: true, allowedOrigins: [], logger: quiet, closeGrace: 300 });
  const port = await app.ready;
  return { app, url: `ws://127.0.0.1:${port}/ws` };
}

test('una sala de 2 bots juega 15 s: started, snaps legibles y sin errores', { timeout: 40000 }, async () => {
  const { app, url } = await boot();
  try {
    const s = await runBots({ url, rooms: 1, size: 2, secs: 15 });
    assert.deepStrictEqual(s.errors, []);
    assert.deepStrictEqual(s.noStarted, [], 'todos reciben started');
    assert.deepStrictEqual(s.noSnap, [], 'todos reciben snaps');
    assert.strictEqual(s.players, 2);
    assert.ok(s.snaps > 2 * 15 * 7, `snaps a ~15/s por jugador (llegaron ${s.snaps})`);
    assert.ok(s.maxSnap <= 3500, `snap dentro del presupuesto (máximo ${s.maxSnap} B)`);
    assert.strictEqual(s.picks <= s.levels, true);
    assert.deepStrictEqual(s.byes, {});
  } finally {
    await app.close();
  }
});

test('hello con un protocolo viejo → bye update', { timeout: 10000 }, async () => {
  const { app, url } = await boot();
  try {
    const ws = new WebSocket(url);
    ws.on('error', () => {});
    const got = new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('sin respuesta')), 5000);
      ws.on('message', d => {
        const m = proto.decode(d.toString('utf8'));
        if (m.type === 'bye') { clearTimeout(t); resolve(m); }
      });
    });
    const closed = new Promise(resolve => ws.once('close', resolve));
    await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
    ws.send(proto.encJson('hello', { token: 'dev:viejo', proto: proto.VERSION - 1, name: 'Viejo', dex: 25, shiny: false }));
    const bye = await got;
    assert.strictEqual(bye.reason, 'update');
    await closed;
  } finally {
    await app.close();
  }
});
