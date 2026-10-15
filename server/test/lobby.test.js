/* Pruebas de las salas:  node --test server/test/lobby.test.js */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { createLobby, BACK_MS } = require('../lobby.js');

/** Partida falsa: apunta las llamadas. */
function fakeRooms() {
  const made = [];
  const createRoom = opts => {
    const calls = [];
    const g = { opts, calls };
    for (const k of ['input', 'pick', 'hold', 'drop', 'back', 'start', 'stop']) g[k] = (...a) => calls.push([k, ...a]);
    made.push(g);
    return g;
  };
  return { made, createRoom };
}

/** Temporizadores falsos: avanzar el reloj a mano. */
function fakeClock() {
  let now = 0, id = 0;
  const timers = new Map();
  return {
    setTimer: (fn, ms) => { timers.set(++id, { fn, at: now + ms }); return id; },
    clearTimer: i => timers.delete(i),
    tick(ms) {
      now += ms;
      for (const [i, t] of [...timers]) if (t.at <= now && timers.has(i)) { timers.delete(i); t.fn(); }
    },
    get pending() { return timers.size; },
  };
}

/** Conexión falsa. */
function conn(uid) {
  const c = { uid, name: 'N' + uid, dex: 25, shiny: false, kit: { up: { hp: 2 }, bind: [], ban: [] }, sent: [], closed: null };
  c.send = m => c.sent.push(m);
  c.close = r => { c.closed = r; };
  c.last = t => [...c.sent].reverse().find(m => !t || m.t === t);
  return c;
}

function setup(opts = {}) {
  const fr = fakeRooms(), clk = fakeClock();
  let n = 0;
  const lobby = createLobby({ createRoom: fr.createRoom, setTimer: clk.setTimer, clearTimer: clk.clearTimer,
    rand: () => ((n++ * 0.137) % 1), ...opts });
  const hi = uid => { const c = conn(uid); lobby.hello(c); return c; };
  return { lobby, fr, clk, hi };
}

/** Crea una sala con el líder a y los demás unidos. */
function room(s, ...uids) {
  const cs = uids.map(s.hi);
  s.lobby.message(cs[0], { t: 'create' });
  const code = cs[0].last('room').code;
  for (const c of cs.slice(1)) s.lobby.message(c, { t: 'join', code });
  return { cs, code };
}

test('crear: código de 6 sin ambiguos y room al creador', () => {
  const s = setup({ rand: undefined });
  const a = s.hi('a');
  s.lobby.message(a, { t: 'create' });
  const r = a.last('room');
  assert.match(r.code, /^[A-HJ-NP-Z2-9]{6}$/);
  assert.strictEqual(r.leader, 'a');
  assert.strictEqual(r.open, true);
  assert.deepStrictEqual(r.members, [{ uid: 'a', name: 'Na', dex: 25, shiny: false, on: true }]);
  assert.strictEqual(s.lobby.size, 1);
});

test('códigos únicos', () => {
  const s = setup({ rand: undefined });
  const codes = new Set();
  for (let i = 0; i < 30; i++) { const c = s.hi('u' + i); s.lobby.message(c, { t: 'create' }); codes.add(c.last('room').code); }
  assert.strictEqual(codes.size, 30);
});

test('unirse avisa a todos; llena, cerrada e inexistente dan err', () => {
  const s = setup();
  const { cs, code } = room(s, 'a', 'b', 'c', 'd', 'f', 'g', 'h', 'i', 'j', 'k');
  for (const c of cs) assert.strictEqual(c.last('room').members.length, 10);
  const e = s.hi('e');
  s.lobby.message(e, { t: 'join', code });
  assert.deepStrictEqual(e.last(), { t: 'err', reason: 'full' });
  s.lobby.message(e, { t: 'join', code: 'ZZZZZZ' });
  assert.deepStrictEqual(e.last(), { t: 'err', reason: 'nocode' });

  const s2 = setup();
  const { cs: [a], code: c2 } = room(s2, 'a');
  s2.lobby.message(a, { t: 'open', v: false });
  assert.strictEqual(a.last('room').open, false);
  const b = s2.hi('b');
  s2.lobby.message(b, { t: 'join', code: c2.toLowerCase() });
  assert.deepStrictEqual(b.last(), { t: 'err', reason: 'closed' });
  s2.lobby.message(a, { t: 'open', v: true });
  s2.lobby.message(b, { t: 'join', code: c2.toLowerCase() });
  assert.strictEqual(b.last('room').members.length, 2);
});

test('sólo el líder abre/cierra y empieza; si se va, pasa al siguiente', () => {
  const s = setup();
  const { cs: [a, b, c] } = room(s, 'a', 'b', 'c');
  s.lobby.message(b, { t: 'open', v: false });
  assert.deepStrictEqual(b.last(), { t: 'err', reason: 'leader' });
  s.lobby.message(b, { t: 'start' });
  assert.deepStrictEqual(b.last(), { t: 'err', reason: 'leader' });
  assert.strictEqual(s.fr.made.length, 0);
  s.lobby.message(a, { t: 'leave' });
  assert.strictEqual(b.last('room').leader, 'b');
  assert.deepStrictEqual(c.last('room').members.map(m => m.uid), ['b', 'c']);
  s.lobby.message(b, { t: 'start' });
  assert.strictEqual(s.fr.made.length, 1);
});

test('start crea la partida y manda started a todos', () => {
  const s = setup();
  const { cs: [a, b] } = room(s, 'a', 'b');
  s.lobby.message(a, { t: 'start' });
  const g = s.fr.made[0];
  assert.deepStrictEqual(g.opts.members.map(m => m.uid), ['a', 'b']);
  assert.ok(Number.isInteger(g.opts.seed));
  // La partida recibe el kit de cada uno (mejoras de la tienda); los demás no lo ven.
  assert.deepStrictEqual(g.opts.members.map(m => m.kit), [a.kit, b.kit]);
  const pub = g.opts.members.map(({ kit, ...m }) => m);
  for (const c of [a, b]) assert.deepStrictEqual(c.last(), { t: 'started', seed: g.opts.seed, members: pub });
  assert.deepStrictEqual(g.calls, [['start']]);
  s.lobby.message(a, { t: 'start' });
  assert.deepStrictEqual(a.last(), { t: 'err', reason: 'started' });
  const e = s.hi('e');
  s.lobby.message(e, { t: 'join', code: a.last('room').code });
  assert.deepStrictEqual(e.last(), { t: 'err', reason: 'started' });
  // send(uid) entrega al conn de ese uid
  g.opts.send('b', { t: 'level', options: [1] });
  assert.deepStrictEqual(b.last(), { t: 'level', options: [1] });
});

test('reenvía in/pick/hold a la partida', () => {
  const s = setup();
  const { cs: [a, b] } = room(s, 'a', 'b');
  s.lobby.message(a, { t: 'in', seq: 1, x: 2, y: 3, dx: 0, dy: 1, move: true }); // sin partida: nada
  s.lobby.message(a, { t: 'start' });
  const g = s.fr.made[0];
  const m = { t: 'in', seq: 5, x: 10, y: 20, dx: 1, dy: 0, move: false };
  s.lobby.message(b, m);
  s.lobby.message(a, { t: 'pick', choice: 2 });
  s.lobby.message(b, { t: 'hold', on: 1 });
  assert.deepStrictEqual(g.calls.slice(1), [['input', 'b', m], ['pick', 'a', 2], ['hold', 'b', true]]);
});

test('corte en partida: vuelve antes de 1 min y recupera su sitio', () => {
  const s = setup();
  const { cs: [a, b] } = room(s, 'a', 'b');
  s.lobby.message(a, { t: 'start' });
  const g = s.fr.made[0];
  s.lobby.close(b);
  assert.deepStrictEqual(g.calls.at(-1), ['drop', 'b']);
  assert.strictEqual(a.last('room').members.find(m => m.uid === 'b').on, false);
  g.opts.send('b', { t: 'x' }); // desconectado: no le llega
  assert.notDeepStrictEqual(b.last(), { t: 'x' });
  s.clk.tick(BACK_MS - 1000);
  const b2 = s.hi('b');
  assert.deepStrictEqual(g.calls.at(-1), ['back', 'b']);
  assert.strictEqual(b2.sent[0].t, 'room');
  assert.strictEqual(b2.sent[1].t, 'started');
  assert.strictEqual(b2.sent[1].seed, g.opts.seed);
  s.clk.tick(5000); // el temporizador viejo no lo saca
  assert.strictEqual(a.last('room').members.length, 2);
  assert.strictEqual(s.clk.pending, 0);
});

test('corte en partida: pasado 1 min queda fuera', () => {
  const s = setup();
  const { cs: [a, b] } = room(s, 'a', 'b');
  s.lobby.message(a, { t: 'start' });
  const g = s.fr.made[0];
  s.lobby.close(a);
  s.clk.tick(BACK_MS);
  assert.deepStrictEqual(b.last('room').members.map(m => m.uid), ['b']);
  assert.strictEqual(b.last('room').leader, 'b');
  assert.strictEqual(g.calls.filter(c => c[0] === 'drop').length, 1);
  const a2 = s.hi('a');
  assert.strictEqual(a2.sent.length, 0);
  assert.ok(!g.calls.some(c => c[0] === 'back'));
});

test('corte en espera: sale al momento', () => {
  const s = setup();
  const { cs: [a, b] } = room(s, 'a', 'b');
  s.lobby.close(a);
  assert.deepStrictEqual(b.last('room').members.map(m => m.uid), ['b']);
  assert.strictEqual(b.last('room').leader, 'b');
  s.lobby.close(b);
  assert.strictEqual(s.lobby.size, 0);
});

test('sala sin nadie conectado: aguanta 1 min (para recargar) y luego se borra', () => {
  const s = setup();
  const { cs: [a, b] } = room(s, 'a', 'b');
  s.lobby.message(a, { t: 'start' });
  const g = s.fr.made[0];
  s.lobby.close(a);
  s.lobby.close(b);
  assert.ok(!g.calls.some(c => c[0] === 'stop'), 'la partida sigue mientras pueden volver');
  assert.strictEqual(s.lobby.size, 1);
  s.clk.tick(BACK_MS - 1000);
  const a2 = s.hi('a');
  assert.strictEqual(a2.sent[1].t, 'started');
  assert.strictEqual(s.lobby.size, 1);
  s.lobby.close(a2);
  s.clk.tick(BACK_MS);
  assert.deepStrictEqual(g.calls.at(-1), ['stop']);
  assert.strictEqual(s.lobby.size, 0);
  assert.strictEqual(s.clk.pending, 0);
  const a3 = s.hi('a');
  assert.strictEqual(a3.sent.length, 0);
});

test('un jugador solo puede recargar y volver a su partida', () => {
  const s = setup();
  const { cs: [a] } = room(s, 'a');
  s.lobby.message(a, { t: 'start' });
  const g = s.fr.made[0];
  s.lobby.close(a);
  assert.strictEqual(s.lobby.size, 1);
  assert.ok(!g.calls.some(c => c[0] === 'stop'));
  s.clk.tick(BACK_MS - 1000);
  const a2 = s.hi('a');
  assert.deepStrictEqual(g.calls.at(-1), ['back', 'a']);
  assert.strictEqual(a2.sent[0].t, 'room');
  assert.strictEqual(a2.sent[1].t, 'started');
  assert.strictEqual(s.lobby.size, 1);
});

test('si se corta el último, quien se cortó antes y aún está a tiempo puede volver', () => {
  const s = setup();
  const { cs: [a, b] } = room(s, 'a', 'b');
  s.lobby.message(a, { t: 'start' });
  s.lobby.close(a);
  s.clk.tick(BACK_MS - 10000);
  s.lobby.close(b);
  s.clk.tick(10000);
  assert.strictEqual(s.lobby.size, 1, 'al caducar A, B sigue a tiempo');
  const b2 = s.hi('b');
  assert.strictEqual(b2.sent[1].t, 'started');
  const a2 = s.hi('a');
  assert.strictEqual(a2.sent.length, 0);
});

test('al acabar la partida vuelve a la espera sin los desconectados', () => {
  const s = setup();
  const { cs: [a, b, c] } = room(s, 'a', 'b', 'c');
  s.lobby.message(a, { t: 'start' });
  const g = s.fr.made[0];
  s.lobby.close(a);
  g.opts.onOver([]);
  const r = b.last('room');
  assert.deepStrictEqual(r.members.map(m => m.uid), ['b', 'c']);
  assert.strictEqual(r.leader, 'b');
  assert.strictEqual(s.clk.pending, 0);
  s.lobby.message(b, { t: 'start' });
  assert.strictEqual(s.fr.made.length, 2);
  g.opts.onOver([]); // la partida vieja ya no cuenta
  assert.strictEqual(c.last().t, 'started');
});

test('maxRooms: create con el máximo cierra con full', () => {
  const s = setup({ maxRooms: 2 });
  room(s, 'a'); room(s, 'b');
  const c = s.hi('c');
  s.lobby.message(c, { t: 'create' });
  assert.strictEqual(c.closed, 'full');
  assert.strictEqual(s.lobby.size, 2);
});

test('drain: create/join cierran con restart, las partidas siguen', () => {
  const s = setup();
  const { cs: [a, b] } = room(s, 'a', 'b');
  const { cs: [w], code: wcode } = room(s, 'w');
  s.lobby.message(a, { t: 'start' });
  const g = s.fr.made[0];
  s.lobby.drain();
  assert.strictEqual(s.lobby.draining, true);
  assert.strictEqual(w.closed, 'restart'); // la sala en espera se cierra
  assert.strictEqual(s.lobby.size, 1);
  const x = s.hi('x');
  s.lobby.message(x, { t: 'create' });
  assert.strictEqual(x.closed, 'restart');
  const y = s.hi('y');
  s.lobby.message(y, { t: 'join', code: wcode });
  assert.strictEqual(y.closed, 'restart');
  s.lobby.message(b, { t: 'pick', choice: 1 });
  assert.deepStrictEqual(g.calls.at(-1), ['pick', 'b', 1]);
  assert.strictEqual(a.closed, null);
  g.opts.onOver([]);
  assert.strictEqual(s.lobby.size, 0);
  assert.strictEqual(a.closed, 'restart');
});

test('un uid sólo en una sala', () => {
  const s = setup();
  const { cs: [a], code: ca } = room(s, 'a');
  const { cs: [b], code: cb } = room(s, 'b');
  s.lobby.message(a, { t: 'join', code: cb }); // deja la suya (se borra) y entra en la de b
  assert.strictEqual(s.lobby.size, 1);
  assert.deepStrictEqual(b.last('room').members.map(m => m.uid), ['b', 'a']);
  const c = s.hi('c');
  s.lobby.message(c, { t: 'join', code: ca });
  assert.deepStrictEqual(c.last(), { t: 'err', reason: 'nocode' });
  s.lobby.message(a, { t: 'create' }); // sale de la de b y crea otra
  assert.deepStrictEqual(b.last('room').members.map(m => m.uid), ['b']);
  assert.strictEqual(s.lobby.size, 2);
  // en partida no puede irse a otra
  const s2 = setup();
  const { cs: [p] } = room(s2, 'p');
  const { code: cq } = room(s2, 'q');
  s2.lobby.message(p, { t: 'start' });
  s2.lobby.message(p, { t: 'join', code: cq });
  assert.deepStrictEqual(p.last(), { t: 'err', reason: 'ingame' });
  s2.lobby.message(p, { t: 'create' });
  assert.deepStrictEqual(p.last(), { t: 'err', reason: 'ingame' });
  assert.strictEqual(s2.lobby.size, 2);
});

test('segunda conexión del mismo uid sustituye a la primera', () => {
  const s = setup();
  const { cs: [a, b] } = room(s, 'a', 'b');
  const a2 = s.hi('a');
  assert.strictEqual(a.closed, 'replaced');
  assert.strictEqual(a2.last().t, 'room');
  s.lobby.close(a); // el cierre de la vieja no saca a nadie
  assert.strictEqual(b.last('room').members.length, 2);
  s.lobby.message(a, { t: 'leave' }); // ni sus mensajes cuentan
  assert.strictEqual(b.last('room').members.length, 2);
});

test('maxRooms: quien está solo en su sala puede crear otra (deja hueco); quien no, se queda donde estaba', () => {
  const s = setup({ maxRooms: 2 });
  const { cs: [a, b] } = room(s, 'a', 'b');
  const { cs: [c] } = room(s, 'c');
  s.lobby.message(c, { t: 'create' });
  assert.strictEqual(c.closed, null);
  assert.strictEqual(s.lobby.size, 2);
  s.lobby.message(b, { t: 'create' });
  assert.strictEqual(b.closed, 'full');
  assert.deepStrictEqual(a.last('room').members.map(m => m.uid), ['a', 'b']); // no la ha sacado antes de cerrar
});

test('el liderato pasa a un miembro conectado', () => {
  const s = setup();
  const { cs: [a, b, c] } = room(s, 'a', 'b', 'c');
  s.lobby.message(a, { t: 'start' });
  s.lobby.close(b);
  s.lobby.message(a, { t: 'leave' });
  assert.strictEqual(c.last('room').leader, 'c');
  assert.deepStrictEqual(s.fr.made[0].calls.filter(x => x[0] === 'drop'), [['drop', 'b'], ['drop', 'a']]);
});

test('orden real de index.js (close de la vieja y luego hello): en espera se pierde el sitio, en partida no', () => {
  const s = setup();
  const { cs: [a, b] } = room(s, 'a', 'b');
  s.lobby.close(b);
  const b2 = s.hi('b');
  assert.strictEqual(b2.sent.length, 0);
  assert.deepStrictEqual(a.last('room').members.map(m => m.uid), ['a']);
  s.lobby.message(b2, { t: 'join', code: a.last('room').code });
  s.lobby.message(a, { t: 'start' });
  s.lobby.close(b2);
  const b3 = s.hi('b');
  assert.deepStrictEqual(b3.sent.map(m => m.t), ['room', 'started']);
});

test('en la espera, un hello nuevo del mismo uid cambia su Pokémon y su kit (y lo ven todos)', () => {
  const s = setup();
  const { cs: [a, b] } = room(s, 'a', 'b');
  const a2 = conn('a');
  a2.dex = 6; a2.shiny = true; a2.kit = { up: { atk: 4 }, bind: [], ban: [] };
  s.lobby.hello(a2);
  const info = b.last('room');
  assert.deepStrictEqual(info.members.find(m => m.uid === 'a'), { uid: 'a', name: 'Na', dex: 6, shiny: true, on: true });
  assert.strictEqual(a.closed, 'replaced');
  s.lobby.message(a2, { t: 'start' });
  assert.deepStrictEqual(s.fr.made[0].opts.members[0].kit, a2.kit);
});

test('con checkKits: espera a la partida guardada, usa sus mejoras y ranked según ok', async () => {
  const asked = [];
  const s = setup({ checkKits: async ps => { asked.push(ps); return new Map([['a', { up: { hp: 1 }, ok: true }], ['b', { up: {}, ok: true }]]); } });
  const { cs: [a] } = room(s, 'a', 'b');
  s.lobby.message(a, { t: 'start' });
  assert.strictEqual(s.fr.made.length, 0, 'todavía leyendo');
  s.lobby.message(a, { t: 'start' });
  assert.deepStrictEqual(a.last(), { t: 'err', reason: 'started' });
  await new Promise(r => setImmediate(r));
  assert.deepStrictEqual(asked[0].map(p => [p.uid, p.dex, p.up]), [['a', 25, { hp: 2 }], ['b', 25, { hp: 2 }]]);
  const g = s.fr.made[0];
  assert.ok(g, 'no se ha creado la partida');
  assert.deepStrictEqual(g.opts.members.map(m => m.kit.up), [{ hp: 1 }, {}]);
  assert.strictEqual(g.opts.ranked, true);
  assert.strictEqual(a.last().t, 'started');
  assert.strictEqual(s.clk.pending, 0);
});

test('con checkKits: si algo no cuadra o falla la lectura, se juega sin ranking', async () => {
  const s = setup({ checkKits: async () => new Map([['a', { up: {}, ok: true }], ['b', { up: {}, ok: false }]]) });
  const { cs: [a] } = room(s, 'a', 'b');
  s.lobby.message(a, { t: 'start' });
  await new Promise(r => setImmediate(r));
  assert.strictEqual(s.fr.made[0].opts.ranked, false);

  const s2 = setup({ checkKits: async () => { throw new Error('sin red'); } });
  const { cs: [a2] } = room(s2, 'a', 'b');
  s2.lobby.message(a2, { t: 'start' });
  await new Promise(r => setImmediate(r));
  const g = s2.fr.made[0];
  assert.strictEqual(g.opts.ranked, false);
  assert.deepStrictEqual(g.opts.members.map(m => m.kit.up), [{ hp: 2 }, { hp: 2 }], 'sin lectura, las del navegador (perks las recorta)');
});

test('con checkKits: si tarda más de 5 s, empieza sin ranking', () => {
  const s = setup({ checkKits: () => new Promise(() => {}) });
  const { cs: [a] } = room(s, 'a', 'b');
  s.lobby.message(a, { t: 'start' });
  s.clk.tick(4999);
  assert.strictEqual(s.fr.made.length, 0);
  s.clk.tick(1);
  assert.strictEqual(s.fr.made[0].opts.ranked, false);
});
