/* Pruebas del arranque (index.js) con auth, lobby y proto falsos. */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const http = require('http');
const WebSocket = require('ws');
const { start, cleanName, cleanDex, parseOrigins, envInt } = require('../index');

const fakeProto = {
  VERSION: 7,
  decode(data) {
    if (typeof data !== 'string') return { type: 'in', bytes: data.length };
    const o = JSON.parse(data);
    if (!o || typeof o.t !== 'string') return null;
    const { t, ...rest } = o;
    return { type: t, ...rest };
  },
  encJson: (t, o) => JSON.stringify({ t, ...o }),
  encSnap: () => new Uint8Array(0)
};
const fakeAuth = {
  verify: async tok => {
    if (typeof tok === 'string' && tok.startsWith('ok:')) return tok.slice(3);
    if (typeof tok === 'string' && tok.startsWith('slow:')) { await new Promise(r => setTimeout(r, 150)); return tok.slice(5); }
    throw new Error('malo');
  }
};

function fakeLobby() {
  const l = { calls: [], size: 0, draining: false };
  l.hello = conn => l.calls.push(['hello', conn]);
  l.message = (conn, msg) => l.calls.push(['message', conn, msg]);
  l.close = conn => l.calls.push(['close', conn]);
  l.drain = () => { l.draining = true; l.calls.push(['drain']); };
  l.of = k => l.calls.filter(c => c[0] === k);
  return l;
}

const quiet = { log() {}, warn() {}, error() {} };

/** Servidores abiertos: se cierran tras cada prueba aunque falle. */
const apps = [];
test.afterEach(async () => { await Promise.all(apps.splice(0).map(a => a.close())); });

/** Arranca un servidor de pruebas en un puerto libre. */
async function boot(o = {}) {
  const lobby = o.lobby || fakeLobby();
  const app = start({ port: 0, deps: { auth: fakeAuth, lobby, proto: fakeProto }, logger: quiet, closeGrace: 200, ...o });
  apps.push(app);
  const port = await app.ready;
  return { app, lobby, port, url: `ws://127.0.0.1:${port}/ws` };
}

/** Cliente: guarda los mensajes y avisa al cerrarse. */
function client(url, opts) {
  const ws = new WebSocket(url, opts);
  const msgs = [];
  ws.on('message', d => { try { msgs.push(JSON.parse(d.toString())); } catch (e) { msgs.push(d); } });
  ws.on('error', () => {});
  const opened = new Promise((res, rej) => { ws.once('open', res); ws.once('unexpected-response', (q, r) => rej(Object.assign(new Error('rechazado'), { status: r.statusCode }))); ws.once('error', rej); });
  const closed = new Promise(res => ws.once('close', (code, reason) => res({ code, reason: reason.toString() })));
  return { ws, msgs, opened, closed, send: o => ws.send(typeof o === 'string' ? o : JSON.stringify(o)) };
}

const hello = (uid = 'a', extra = {}) => ({ t: 'hello', token: 'ok:' + uid, proto: 7, name: 'Ash', dex: 25, shiny: false, ...extra });
const until = async (fn, ms = 2000) => { const t0 = Date.now(); while (!fn()) { if (Date.now() - t0 > ms) throw new Error('tiempo agotado'); await new Promise(r => setImmediate(r)); } };
const get = (port, path) => new Promise((res, rej) => http.get({ host: '127.0.0.1', port, path }, r => { let b = ''; r.on('data', c => { b += c; }); r.on('end', () => res({ status: r.statusCode, body: b, headers: r.headers })); }).on('error', rej));

test('limpia nombre, dex y orígenes', () => {
  assert.strictEqual(cleanName('  Ashhhhhhhhhhhhhhhhhhhhhhh '), 'Ashhhhhhhhhhhhhh');
  assert.strictEqual(cleanName('a\u0000b\nc'), 'abc');
  assert.strictEqual(cleanName(null), '');
  assert.strictEqual(cleanDex(25), 25);
  assert.strictEqual(cleanDex('25'), 1);
  assert.strictEqual(cleanDex(-3), 1);
  assert.strictEqual(cleanDex(2.5), 1);
  assert.deepStrictEqual(parseOrigins(' https://a.com/, http://localhost:8080 ,,'), ['https://a.com', 'http://localhost:8080']);
  assert.deepStrictEqual(parseOrigins(''), []);
  assert.strictEqual(cleanName('\u202Eabc\u200B'), 'abc');
  const warns = [];
  assert.strictEqual(envInt('X', undefined, 30, 1), 30);
  assert.strictEqual(envInt('X', ' 12 ', 30, 1), 12);
  assert.strictEqual(envInt('X', 'abc', 30, 1, w => warns.push(w)), 30);
  assert.strictEqual(envInt('X', '0', 30, 1, w => warns.push(w)), 30);
  assert.strictEqual(warns.length, 2);
});

test('/health responde ok con salas; el resto 404', async () => {
  const { app, lobby, port } = await boot();
  lobby.size = 3;
  const r = await get(port, '/health');
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body, 'ok');
  assert.strictEqual(r.headers['x-rooms'], '3');
  assert.strictEqual(r.headers['x-draining'], '0');
  assert.strictEqual((await get(port, '/')).status, 404);
  assert.strictEqual((await get(port, '/health/x')).status, 404);
  await app.close();
});

test('hello correcto llega a lobby.hello y luego los mensajes a lobby.message', async () => {
  const { app, lobby, url } = await boot();
  const c = client(url);
  await c.opened;
  c.send(hello('u1', { name: '  Pikachu del Bosque Verde  ', dex: 25, shiny: 1 }));
  c.send({ t: 'create' });           // llega antes de terminar la comprobación: se guarda
  await until(() => lobby.of('message').length === 1);
  const conn = lobby.of('hello')[0][1];
  assert.strictEqual(conn.uid, 'u1');
  assert.strictEqual(conn.name, 'Pikachu del Bosq');
  assert.strictEqual(conn.dex, 25);
  assert.strictEqual(conn.shiny, true);
  assert.deepStrictEqual(lobby.of('message')[0][2], { type: 'create', t: 'create' });
  c.ws.send(Buffer.from([1, 2, 3]));  // binario → in
  c.send('esto no es json');           // malformado: se ignora
  c.send({ t: 'join', code: 'ABC123' });
  await until(() => lobby.of('message').length === 3);
  assert.deepStrictEqual(lobby.of('message')[1][2], { type: 'in', bytes: 3, t: 'in' });
  assert.deepStrictEqual(lobby.of('message')[2][2], { type: 'join', code: 'ABC123', t: 'join' });
  // El lobby envía: JSON y snap binario.
  conn.send({ t: 'room', code: 'ABC123', members: [] });
  conn.send({ t: 'snap', bin: new Uint8Array([9, 8]) });
  await until(() => c.msgs.length === 2);
  assert.deepStrictEqual(c.msgs[0], { t: 'room', code: 'ABC123', members: [] });
  assert.deepStrictEqual([...c.msgs[1]], [9, 8]);
  // conn.close → bye y cierre; el lobby se entera.
  conn.close('kick');
  const cl = await c.closed;
  assert.deepStrictEqual(c.msgs[2], { t: 'bye', reason: 'kick' });
  assert.strictEqual(cl.code, 1000);
  await until(() => lobby.of('close').length === 1);
  assert.strictEqual(lobby.of('close')[0][1], conn);
  await app.close();
});

test('protocolo distinto → bye update', async () => {
  const { app, lobby, url } = await boot();
  const c = client(url);
  await c.opened;
  c.send(hello('a', { proto: 6 }));
  await c.closed;
  assert.deepStrictEqual(c.msgs, [{ t: 'bye', reason: 'update' }]);
  assert.strictEqual(lobby.of('hello').length, 0);
  await app.close();
});

test('token malo → bye auth', async () => {
  const { app, lobby, url } = await boot();
  const c = client(url);
  await c.opened;
  c.send(hello('a', { token: 'nada' }));
  await c.closed;
  assert.deepStrictEqual(c.msgs, [{ t: 'bye', reason: 'auth' }]);
  assert.strictEqual(lobby.of('hello').length, 0);
  assert.strictEqual(lobby.of('close').length, 0);
  await app.close();
});

test('origen no permitido → rechazado; permitido → entra', async () => {
  const { app, url } = await boot({ allowedOrigins: ['https://poke.example.com'] });
  const bad = client(url, { origin: 'https://malo.example.com' });
  await assert.rejects(bad.opened, e => e.status === 403);
  const none = client(url);
  await assert.rejects(none.opened, e => e.status === 403);
  const ok = client(url, { origin: 'https://poke.example.com' });
  await ok.opened;
  ok.ws.close();
  await ok.closed;
  const wrongPath = client(url.replace('/ws', '/otra'));
  await assert.rejects(wrongPath.opened, e => e.status === 404);
  await app.close();
});

test('mensaje de más de 4 KB corta la conexión', async () => {
  const { app, lobby, url } = await boot();
  const c = client(url);
  await c.opened;
  c.send(hello('a'));
  await until(() => lobby.of('hello').length === 1);
  c.send({ t: 'chat', x: 'x'.repeat(5000) });
  const cl = await c.closed;
  assert.strictEqual(cl.code, 1009);
  await until(() => lobby.of('close').length === 1);
  assert.strictEqual(lobby.of('message').length, 0);
  await app.close();
});

test('más de 40 mensajes en un segundo corta la conexión', async () => {
  const { app, lobby, url } = await boot();
  const c = client(url);
  await c.opened;
  c.send(hello('a'));
  await until(() => lobby.of('hello').length === 1);
  for (let i = 0; i < 45; i++) c.send({ t: 'pick', choice: i });
  await c.closed;
  assert.deepStrictEqual(c.msgs[c.msgs.length - 1], { t: 'bye', reason: 'flood' });
  assert.ok(lobby.of('message').length <= 39);
  await until(() => lobby.of('close').length === 1);
  await app.close();
});

test('mensaje antes del hello corta', async () => {
  const { app, lobby, url } = await boot();
  const c = client(url);
  await c.opened;
  c.send({ t: 'create' });
  await c.closed;
  assert.deepStrictEqual(c.msgs, [{ t: 'bye', reason: 'hello' }]);
  assert.strictEqual(lobby.calls.length, 0);
  await app.close();
});

test('sin hello en el plazo corta', async () => {
  const { app, lobby, url } = await boot({ helloTimeout: 50 });
  const c = client(url);
  await c.opened;
  await c.closed;
  assert.deepStrictEqual(c.msgs, [{ t: 'bye', reason: 'timeout' }]);
  assert.strictEqual(lobby.calls.length, 0);
  await app.close();
});

test('el mismo uid en otra conexión cierra la vieja con bye dup', async () => {
  const { app, lobby, url } = await boot();
  const a = client(url);
  await a.opened;
  a.send(hello('u1'));
  await until(() => lobby.of('hello').length === 1);
  const b = client(url);
  await b.opened;
  b.send(hello('u1'));
  await a.closed;
  assert.deepStrictEqual(a.msgs, [{ t: 'bye', reason: 'dup' }]);
  await until(() => lobby.of('hello').length === 2);
  // La nueva entra en el lobby antes de que la vieja salga (hereda su sitio).
  await until(() => lobby.of('close').length === 1);
  assert.deepStrictEqual(lobby.calls.map(c => c[0]), ['hello', 'hello', 'close']);
  assert.strictEqual(lobby.calls[2][1], lobby.calls[0][1]);
  assert.notStrictEqual(lobby.calls[1][1], lobby.calls[0][1]);
  assert.strictEqual(b.ws.readyState, WebSocket.OPEN);
  b.ws.close();
  await b.closed;
  await until(() => lobby.of('close').length === 2);
  assert.strictEqual(lobby.of('close')[1][1], lobby.calls[1][1]);
  await app.close();
});

test('apagado: drain, /health sigue (draining) y termina al quedarse sin salas', async () => {
  const { app, lobby, port, url } = await boot({ drainPoll: 20 });
  lobby.size = 1;
  const c = client(url);
  await c.opened;
  let done = false;
  const p = app.shutdown().then(() => { done = true; });
  assert.strictEqual(app.shutdown(), app.shutdown()); // una sola vez
  assert.strictEqual(lobby.of('drain').length, 1);
  assert.strictEqual(lobby.draining, true);
  const r = await get(port, '/health');
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.headers['x-draining'], '1');
  assert.strictEqual(r.headers['x-rooms'], '1');
  await new Promise(r2 => setTimeout(r2, 80));
  assert.strictEqual(done, false);
  assert.strictEqual(c.ws.readyState, WebSocket.OPEN); // las partidas siguen
  lobby.size = 0;
  await p;
  const cl = await c.closed;
  assert.deepStrictEqual([cl.code, cl.reason], [1001, 'restart']);
  assert.strictEqual(app.server.listening, false);
});

test('uid duplicado: gana la conexión más nueva aunque su comprobación acabe antes', async () => {
  const { app, lobby, url } = await boot();
  const a = client(url);
  await a.opened;
  a.send(hello('u1', { token: 'slow:u1' }));   // la vieja: comprobación lenta
  const b = client(url);
  await b.opened;
  b.send(hello('u1'));                          // la nueva: entra primero
  await a.closed;
  assert.deepStrictEqual(a.msgs, [{ t: 'bye', reason: 'dup' }]);
  assert.strictEqual(lobby.of('hello').length, 1);
  assert.strictEqual(lobby.of('close').length, 0);
  assert.strictEqual(b.ws.readyState, WebSocket.OPEN);
  await app.close();
});

test('el envío a varios codifica el mensaje una vez', async () => {
  let n = 0;
  const proto = { ...fakeProto, encJson: (t, o) => { n++; return fakeProto.encJson(t, o); } };
  const lobby = fakeLobby();
  const { app, url } = await boot({ deps: { auth: fakeAuth, lobby, proto } });
  const a = client(url), b = client(url);
  await Promise.all([a.opened, b.opened]);
  a.send(hello('a')); b.send(hello('b'));
  await until(() => lobby.of('hello').length === 2);
  const msg = { t: 'room', code: 'X' };
  for (const [, conn] of lobby.of('hello')) conn.send(msg);
  await until(() => a.msgs.length === 1 && b.msgs.length === 1);
  assert.strictEqual(n, 1);
  assert.deepStrictEqual(b.msgs[0], { t: 'room', code: 'X' });
  await app.close();
});

test('apagado: a drainMax sale aunque queden salas', async () => {
  const { app, lobby } = await boot({ drainPoll: 10, drainMax: 50 });
  lobby.size = 2;
  await app.shutdown();
  assert.strictEqual(app.server.listening, false);
});

test('un ping sin respuesta cierra la conexión', async () => {
  const { app, lobby, url } = await boot({ pingInterval: 30 });
  const c = client(url, { autoPong: false });
  await c.opened;
  c.send(hello('a'));
  await until(() => lobby.of('hello').length === 1);
  const cl = await c.closed;
  assert.strictEqual(cl.code, 1006);
  await until(() => lobby.of('close').length === 1);
  await app.close();
});
