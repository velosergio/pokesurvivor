/* Pruebas del protocolo del cooperativo:  node --test server/test/proto.test.js */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), path = require('path'), vm = require('vm');
const P = require('../proto.js');

/** Casi igual (float32, direcciones ×127). */
const near = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} != ${b}`);

/** Instantánea típica: 4 jugadores, 80 enemigos cambiados, 20 disparos, 30 objetos. */
function typicalSnap() {
  const players = [0, 1, 2, 3].map(i => ({ id: i, x: 1200.5 + i * 37.25, y: -830.75 - i, hp: 87.5 - i, maxHp: 120, anim: i, dead: i === 3 }));
  const enemy = i => ({ id: 100000 + i, dex: (i * 7) % 1025 + 1, x: 15000.25 - i * 13.5, y: -42000.5 + i * 9.75,
    hp: 350 - i * 2.5, maxHp: 350, flags: i % 4 });
  const add = [], upd = [];
  for (let i = 0; i < 80; i++) (i < 20 ? add : upd).push(enemy(i));
  const shots = Array.from({ length: 20 }, (_, i) => ({ x: 500 + i * 3.5, y: 700 - i * 1.25, kind: i % 5 }));
  const pAdd = Array.from({ length: 30 }, (_, i) => ({ id: 9000 + i, kind: i % 6, x: -3000.5 + i * 11, y: 2500.25 - i * 7 }));
  return { ack: 123456, t: 1834.5, lv: 47, xp: 1234.5, xpNext: 2400, players,
    enemies: { add, upd, gone: [1, 2, 3, 4, 5] }, shots, pickups: { add: pAdd, gone: [10, 11, 12] } };
}

/** Compara dos instantáneas (todos los números con tolerancia de float32). */
function sameSnap(got, want) {
  assert.strictEqual(got.type, 'snap');
  for (const k of ['ack', 'lv']) assert.strictEqual(got[k], want[k], k);
  for (const k of ['t', 'xp', 'xpNext']) near(got[k], want[k], 0.01, k);
  const cmp = (ga, wa, what) => {
    assert.strictEqual(ga.length, wa.length, what + ': cantidad');
    ga.forEach((g, i) => {
      const w = wa[i];
      assert.deepStrictEqual(Object.keys(g).sort(), Object.keys(w).sort(), what + ': campos');
      for (const k of Object.keys(w)) {
        if (typeof w[k] === 'number' && !Number.isInteger(w[k])) near(g[k], w[k], 0.01, `${what}[${i}].${k}`);
        else assert.strictEqual(g[k], w[k], `${what}[${i}].${k}`);
      }
    });
  };
  cmp(got.players, want.players, 'players');
  cmp(got.enemies.add, want.enemies.add, 'enemies.add');
  cmp(got.enemies.upd, want.enemies.upd, 'enemies.upd');
  assert.deepStrictEqual(got.enemies.gone, want.enemies.gone);
  cmp(got.shots, want.shots, 'shots');
  cmp(got.pickups.add, want.pickups.add, 'pickups.add');
  assert.deepStrictEqual(got.pickups.gone, want.pickups.gone);
}

test('versión del protocolo', () => {
  assert.ok(Number.isInteger(P.VERSION) && P.VERSION >= 1);
});

test('mensajes de texto: ida y vuelta', () => {
  const msgs = [
    ['hello', { token: 'abc.def.ghi', proto: P.VERSION, name: 'Ash', dex: 25, shiny: true }],
    ['create', {}], ['join', { code: 'K7Q2ZP' }], ['leave', {}], ['open', { v: false }], ['start', {}],
    ['pick', { choice: 2 }], ['hold', { on: true }], ['watch', { uid: 'uid2' }],
    ['room', { code: 'K7Q2ZP', leader: 'uid1', members: [{ uid: 'uid1', name: 'Ash', dex: 25 }], open: true }],
    ['started', { seed: 987654, members: ['uid1', 'uid2'] }],
    ['level', { options: [{ id: 'ember' }, { id: 'hp' }] }],
    ['over', { results: { time: 600, kills: 1200 } }], ['bye', { reason: 'update' }],
  ];
  for (const [type, obj] of msgs) {
    const txt = P.encJson(type, obj);
    assert.strictEqual(typeof txt, 'string');
    assert.strictEqual(JSON.parse(txt).t, type);
    assert.deepStrictEqual(P.decode(txt), Object.assign({ type }, obj), type);
    // ws de Node entrega el texto como Buffer.
    assert.deepStrictEqual(P.decode(Buffer.from(txt)), Object.assign({ type }, obj), type + ' (Buffer)');
  }
  assert.deepStrictEqual(P.decode(P.encJson('create')), { type: 'create' });
  const ev = [{ k: 'dmg', v: 12 }, { k: 'shiny', id: 7 }];
  assert.deepStrictEqual(P.decode(P.encJson('ev', ev)), { type: 'ev', list: ev });
});

test('in: ida y vuelta', () => {
  const m = { seq: 4000000000, x: 12345.6, y: -9876.5, dx: 0.7071, dy: -0.7071, move: 3 };
  const buf = P.encIn(m);
  assert.ok(buf instanceof Uint8Array);
  assert.strictEqual(buf.length, 16);
  for (const got of [P.decIn(buf), P.decode(buf), P.decode(Buffer.from(buf)), P.decode(buf.slice().buffer)]) {
    assert.strictEqual(got.type, 'in');
    assert.strictEqual(got.seq, m.seq);
    assert.strictEqual(got.move, m.move);
    near(got.x, m.x, 0.01, 'x'); near(got.y, m.y, 0.01, 'y');
    near(got.dx, m.dx, 1 / 127, 'dx'); near(got.dy, m.dy, 1 / 127, 'dy');
  }
  const still = P.decIn(P.encIn({ seq: 0, x: 0, y: 0, dx: 0, dy: 0, move: 0 }));
  assert.strictEqual(still.dx, 0); assert.strictEqual(still.dy, 0);
});

test('snap: ida y vuelta y tamaño típico ≤ 3 KB', () => {
  const s = typicalSnap();
  const buf = P.encSnap(s);
  assert.ok(buf.length <= 3072, 'snap típico de ' + buf.length + ' bytes');
  sameSnap(P.decSnap(buf), s);
  sameSnap(P.decode(buf), s);
  // Buffer de Node con desplazamiento (los Buffer pequeños comparten memoria).
  const big = Buffer.alloc(buf.length + 7); big.set(buf, 7);
  sameSnap(P.decode(big.subarray(7)), s);
});

test('snap vacío: listas que faltan van vacías', () => {
  const got = P.decode(P.encSnap({ ack: 1, t: 0.5, lv: 1, xp: 0, xpNext: 10 }));
  assert.deepStrictEqual(got.players, []);
  assert.deepStrictEqual(got.enemies, { add: [], upd: [], gone: [] });
  assert.deepStrictEqual(got.shots, []);
  assert.deepStrictEqual(got.pickups, { add: [], gone: [] });
});

test('entrada basura lanza', () => {
  const bad = ['', 'no es json', '[1,2]', 'null', '{"t":"nada"}', '{"x":1}', new Uint8Array(0),
    new Uint8Array([9, 1, 2]), new Uint8Array([1, 2, 3]), new Uint8Array([2, 0, 0]), 42, null, undefined, {}];
  for (const b of bad) assert.throws(() => P.decode(b), Error, 'no lanza: ' + String(b));
  // Recortado o con bytes de más.
  const snap = P.encSnap(typicalSnap());
  assert.throws(() => P.decode(snap.subarray(0, snap.length - 1)), Error);
  const longer = new Uint8Array(snap.length + 1); longer.set(snap);
  assert.throws(() => P.decode(longer), Error);
  // __proto__ en el JSON no cuela campos por el prototipo.
  const sneaky = P.decode('{"t":"join","__proto__":{"code":"X"}}');
  assert.strictEqual(sneaky.code, undefined);
  assert.strictEqual(Object.getPrototypeOf(sneaky), Object.prototype);
  // Tipos desconocidos o valores que no caben.
  assert.throws(() => P.encJson('nada', {}), Error);
  assert.throws(() => P.encJson('join', { t: 1 }), Error);
  assert.throws(() => P.encSnap({ players: [{ id: 300 }] }), Error);
  assert.throws(() => P.encSnap({ enemies: { add: [{ id: -1 }] } }), Error);
});

test('carga en el navegador (sin module) y define G.Proto', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'net', 'proto.js'), 'utf8');
  const ctx = vm.createContext({ G: {} });
  vm.runInContext(src, ctx);
  const BP = ctx.G.Proto;
  assert.ok(BP, 'no define G.Proto');
  assert.strictEqual(BP.VERSION, P.VERSION);
  // Lo que codifica el navegador lo entiende el servidor, y al revés.
  const s = typicalSnap();
  sameSnap(P.decode(BP.encSnap(s)), s);
  assert.strictEqual(BP.decode(P.encIn({ seq: 5, x: 1, y: 2, dx: 1, dy: 0, move: 1 })).seq, 5);
  assert.strictEqual(BP.decode(P.encJson('bye', { reason: 'full' })).reason, 'full');
});

test('objetos del suelo: cada esfera tiene su código y vuelve igual', () => {
  for (const [i, k] of P.PICK_KINDS.entries()) if (k !== 'sphere') assert.deepStrictEqual(P.pickKind(P.pickCode(k)), { kind: k, sub: 0 });
  for (let sub = 0; sub < 6; sub++) assert.deepStrictEqual(P.pickKind(P.pickCode('sphere', sub)), { kind: 'sphere', sub });
  assert.strictEqual(P.pickCode('nada'), 0);
  assert.ok(P.pickCode('sphere', 5) <= 0xFF, 'cabe en el u8 del snap');
  assert.ok(P.JSON_TYPES.includes('orb'));
});
