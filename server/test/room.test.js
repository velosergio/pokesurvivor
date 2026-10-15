/* Pruebas de la partida en el servidor (room.js):  node --test server/test/room.test.js
 * Sin temporizadores: cada prueba avanza la sala a mano con tick(). */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { createRoom } = require('../room.js');
const proto = require('../proto.js');

const DT = 0.05;
const DEX = [4, 7, 1, 25];
const quiet = { error() {}, warn() {}, log() {} };

/** Sala de n jugadores con un `send` falso que guarda todo. */
function makeRoom({ n = 4, seed = 7, rank, ranked, logger = quiet } = {}) {
  const members = DEX.slice(0, n).map((dex, i) => ({ uid: 'u' + i, name: 'P' + i, dex, shiny: false }));
  const sent = [];
  const overs = [];
  const room = createRoom({ members, seed, rank, ranked, logger, send: (uid, m) => sent.push({ uid, m }), onOver: r => overs.push(r) });
  return { room, members, sent, overs, G: room.debug.G, pl: uid => room.debug.player(uid) };
}

/** Lo enviado a uid de un tipo (y lo vacía si `take`). */
const of = (sent, uid, t) => sent.filter(x => x.uid === uid && x.m.t === t).map(x => x.m);

/**
 * Bots que dan vueltas: cada paso mandan la posición a la que se moverían
 * (como un navegador), eligen la primera carta que les llegue y no caen (god).
 */
function bots(r, { god = true, seqs = {} } = {}) {
  let k = 0;
  return () => {
    k++;
    r.members.forEach((m, i) => {
      const p = r.pl(m.uid);
      const a = k * DT * 0.3 + i * 1.7, dx = Math.cos(a), dy = Math.sin(a);
      seqs[m.uid] = (seqs[m.uid] || 0) + 1;
      r.room.input(m.uid, { seq: seqs[m.uid], x: p.x + dx * p.spd * DT, y: p.y + dy * p.spd * DT, dx, dy, move: 0 });
      if (god) { if (p.dead) p.revive(1); p.hp = p.maxHp; }
    });
    r.room.tick();
    for (const x of r.sent.splice(0)) {
      if (x.m.t === 'level') r.room.pick(x.uid, 0);
      if (x.m.t === 'snap') { r.snaps = (r.snaps || 0) + 1; r.maxSnap = Math.max(r.maxSnap || 0, x.m.bin.length); proto.decode(x.m.bin); }
      if (x.m.t === 'ev') for (const ev of x.m.list) (r.evs = r.evs || new Set()).add(ev[0]);
      if (x.m.t === 'over') r.over = x.m;
    }
  };
}
const steps = (fn, secs) => { for (let i = Math.round(secs / DT); i > 0; i--) fn(); };

/** Último snap decodificado de uid. */
function lastSnap(sent, uid) {
  const s = of(sent, uid, 'snap');
  return s.length ? proto.decode(s[s.length - 1].bin) : null;
}

/** Sin enemigos ni disparos (para probar el movimiento sin que nadie empuje). */
function calm(G) { G.EnemyMgr.clear(); G.Projectiles.clear(); G.Hazards.clear(); }

test('4 bots llegan a la Sentencia de Arceus sin errores', () => {
  const r = makeRoom({ seed: 9 });
  const step = bots(r);
  steps(step, 6);
  r.G.Judgment.debugStart();
  let fight = false;
  for (let i = 0; i < 20 * 40 && !fight; i++) { step(); if (r.G.Judgment.active && !r.G.Judgment.cinematic) fight = true; }
  assert.ok(fight, 'no ha llegado a la pelea');
  steps(step, 8);
  assert.ok(!r.over, 'la partida ha terminado: ' + JSON.stringify(r.over));
  assert.ok(r.evs.has('jd'), 'no se ha avisado de la Sentencia');
  assert.ok(r.evs.has('ja'), 'no se manda dónde está Arceus');
  assert.ok(r.snaps > 4 * 100, 'pocos snaps: ' + r.snaps);
});

test('misma semilla y mismas órdenes, mismos snaps (byte a byte)', () => {
  const run = () => {
    const r = makeRoom({ seed: 21 });
    const out = [];
    const step = bots(r);
    const orig = r.sent;
    // Se guardan los bytes antes de que bots() los vacíe.
    r.sent = { splice: () => { const a = orig.splice(0); for (const x of a) out.push(x.m.t === 'snap' ? x.uid + ':' + Buffer.from(x.m.bin).toString('base64') : x.uid + ':' + JSON.stringify(x.m)); return a; } };
    steps(step, 25);
    return out;
  };
  const a = run(), b = run();
  assert.ok(a.length > 400);
  assert.deepStrictEqual(a, b);
});

test('un salto imposible se corrige', () => {
  const r = makeRoom({ n: 2 });
  calm(r.G);
  r.room.tick();
  const p = r.pl('u0');
  const x0 = p.x, y0 = p.y;
  r.room.debug.place('u0', x0, y0);
  r.room.input('u0', { seq: 1, x: x0 + 600, y: y0, dx: 1, dy: 0, move: 0 });
  r.room.tick(); r.room.tick();
  const s = lastSnap(r.sent, 'u0');
  const me = s.players.find(q => q.id === 0);
  assert.strictEqual(s.ack, 1, 'el snap no confirma la entrada');
  assert.ok(Math.abs(me.x - (x0 + 600)) > 100, 'ha aceptado el salto: ' + me.x);
  const moved = Math.hypot(me.x - x0, me.y - y0);
  const max = p.spd * DT * 2 * 1.25 + 8 + 2;
  assert.ok(moved <= max, 'se ha movido de más: ' + moved + ' > ' + max);
});

test('un movimiento normal se acepta tal cual', () => {
  const r = makeRoom({ n: 2 });
  calm(r.G);
  r.room.tick();
  const p = r.pl('u0');
  r.room.debug.place('u0', p.x, p.y);
  let x = p.x;
  const y = p.y;
  for (let i = 1; i <= 10; i++) {
    // Libre a ambos lados para que no choque con nada.
    x += p.spd * DT * 0.9;
    r.room.input('u0', { seq: i, x, y, dx: 1, dy: 0, move: 0 });
    calm(r.G);
    r.room.tick();
  }
  if (!r.G.World.isFree(x, y, p.r)) return;          // (mapa raro: no se puede comprobar aquí)
  assert.ok(Math.hypot(p.x - x, p.y - y) < 1.5, 'ha corregido un movimiento posible: ' + [p.x, p.y, x, y]);
});

/** Busca en el mapa dos puntos libres con pared entre medias (en horizontal). */
function wallBetween(G, r) {
  const TS = G.World.TS, wall = (tx, y) => G.World.isWall(tx * TS + TS / 2, y);
  for (let ty = -80; ty <= 80; ty++) {
    const y = ty * TS + TS / 2;
    for (let tx = -80; tx <= 80; tx++) {
      if (wall(tx, y) || !wall(tx + 1, y)) continue;
      let e = tx + 1;
      while (e < tx + 5 && wall(e + 1, y)) e++;
      if (wall(e + 1, y)) continue;                          // más de 4 de grosor
      const ax = (tx + 1) * TS - r - 3, bx = (e + 1) * TS + r + 3;
      if (G.World.isFree(ax, y, r) && G.World.isFree(bx, y, r)) return { ax, bx, y, wallX: (tx + 1) * TS };
    }
  }
  return null;
}

test('un movimiento que atraviesa una pared se corrige', () => {
  const r = makeRoom({ n: 2 });
  const p = r.pl('u0');
  const w = wallBetween(r.G, p.r);
  assert.ok(w, 'no hay ninguna pared fina en el mapa de prueba');
  calm(r.G);
  r.room.debug.place('u0', w.ax, w.y);
  let seq = 0;
  // Pasos pequeños (cada uno posible por velocidad) que cruzan la pared.
  for (let x = w.ax; x <= w.bx; x += 3) {
    r.room.input('u0', { seq: ++seq, x, y: w.y, dx: 1, dy: 0, move: 0 });
    calm(r.G);
    p.hp = p.maxHp;
    r.room.tick();
  }
  r.room.input('u0', { seq: ++seq, x: w.bx, y: w.y, dx: 1, dy: 0, move: 0 });
  r.room.tick(); r.room.tick();
  const me = lastSnap(r.sent, 'u0').players.find(q => q.id === 0);
  assert.ok(me.x < w.wallX, 'ha atravesado la pared: ' + me.x + ' (pared en ' + w.wallX + ')');
});

test('level llega a todos, la partida se para y pick la reanuda', () => {
  const r = makeRoom({ n: 3 });
  r.room.tick();
  r.room.debug.levelUp();
  r.room.tick();
  for (const m of r.members) {
    const l = of(r.sent, m.uid, 'level');
    assert.strictEqual(l.length, 1, m.uid + ' no ha recibido level');
    assert.strictEqual(l[0].kind, 'level');
    assert.ok(l[0].options.length > 0 && l[0].options[0].id && l[0].options[0].name, 'cartas sin datos');
    assert.ok(!('apply' in l[0].options[0]), 'se manda la función de la carta');
  }
  const t0 = r.room.debug.time;
  for (let i = 0; i < 10; i++) r.room.tick();
  assert.strictEqual(r.room.debug.time, t0, 'el reloj sigue con las cartas abiertas');
  const moves0 = r.pl('u0').moves.length + r.pl('u0').moves.reduce((a, m) => a + m.lvl, 0);
  r.room.pick('u0', 0); r.room.pick('u1', 0);
  r.room.tick();
  assert.strictEqual(r.room.debug.time, t0, 'ha seguido sin que elija el tercero');
  r.room.pick('u2', 1);
  r.room.tick();
  assert.ok(r.room.debug.time > t0, 'no se ha reanudado');
  const s = r.pl('u0');
  const moves1 = s.moves.length + s.moves.reduce((a, m) => a + m.lvl, 0);
  assert.ok(moves1 > moves0 || Object.keys(s.statsTaken).length > 0, 'la carta no se ha aplicado');
});

test('un jugador desconectado no bloquea la elección', () => {
  const r = makeRoom({ n: 3 });
  r.room.tick();
  r.room.drop('u2');
  r.room.debug.levelUp();
  r.room.tick();
  assert.strictEqual(of(r.sent, 'u2', 'level').length, 0, 'se le manda level a un desconectado');
  const t0 = r.room.debug.time;
  r.room.pick('u0', 0); r.room.pick('u1', 0);
  r.room.tick();
  assert.ok(r.room.debug.time > t0, 'espera al desconectado');
  // Y si se corta a media elección, tampoco.
  r.room.debug.levelUp();
  r.room.tick();
  r.room.pick('u0', 0);
  r.room.drop('u1');
  const t1 = r.room.debug.time;
  r.room.tick();
  assert.ok(r.room.debug.time > t1, 'espera a quien se ha cortado eligiendo');
});

test('quien no elige en 20 s se queda con la primera', () => {
  const r = makeRoom({ n: 2 });
  r.room.tick();
  r.room.debug.levelUp();
  r.room.tick();
  r.room.pick('u0', 0);
  const t0 = r.room.debug.time;
  for (let i = 0; i < 19 * 20; i++) r.room.tick();
  assert.strictEqual(r.room.debug.time, t0, 'no ha esperado');
  for (let i = 0; i < 2 * 20; i++) r.room.tick();
  assert.ok(r.room.debug.time > t0, 'sigue esperando pasados 20 s');
});

test('hold para la partida mientras dura', () => {
  const r = makeRoom({ n: 2 });
  r.room.tick();
  r.room.hold('u1', true);
  const t0 = r.room.debug.time;
  for (let i = 0; i < 20; i++) r.room.tick();
  assert.strictEqual(r.room.debug.time, t0);
  r.room.hold('u1', false);
  r.room.tick();
  assert.ok(r.room.debug.time > t0);
});

test('un error en el paso cierra la sala con over', () => {
  const r = makeRoom({ n: 2 });
  for (let i = 0; i < 10; i++) r.room.tick();
  r.G.Step.team = () => { throw new Error('fallo de prueba'); };
  r.room.tick();
  for (const m of r.members) {
    const o = of(r.sent, m.uid, 'over');
    assert.strictEqual(o.length, 1, m.uid + ' no ha recibido over');
    assert.strictEqual(o[0].results.why, 'error');
    assert.strictEqual(o[0].results.uid, m.uid);
  }
  assert.strictEqual(r.overs.length, 1, 'no se ha llamado a onOver');
  const n = r.sent.length;
  r.room.tick();
  assert.strictEqual(r.sent.length, n, 'la sala sigue mandando después del error');
});

test('caídos todos: fin, over para cada uno y sin ranking antes de 2 min', () => {
  let ranked = 0;
  const r = makeRoom({ n: 2, rank: { submitGroup: async () => { ranked++; return []; } } });
  r.room.tick();
  for (const m of r.members) { const p = r.pl(m.uid); p.invuln = 0; p.hurt(1e9); }
  for (let i = 0; i < 40; i++) r.room.tick();
  for (const m of r.members) {
    const o = of(r.sent, m.uid, 'over');
    assert.strictEqual(o.length, 1, m.uid + ' no ha recibido over');
    assert.strictEqual(o[0].results.why, 'down');
    for (const k of ['t', 'lv', 'ki', 'co', 'shinies', 'rescued']) assert.ok(k in o[0].results, 'falta ' + k);
  }
  assert.strictEqual(ranked, 0);
});

test('la marca de grupo se sube al acabar si el tiempo cuenta (sin esperar a que termine)', () => {
  let got = null;
  const r = makeRoom({ n: 2, rank: { submitGroup: r_ => { got = r_; return new Promise(() => {}); } } });
  const step = bots(r);
  steps(step, 121);
  for (const m of r.members) { const p = r.pl(m.uid); p.invuln = 0; p.hurt(1e9); }
  for (let i = 0; i < 40; i++) r.room.tick();
  assert.ok(of(r.sent, 'u0', 'over').length || r.over, 'no ha llegado over');
  assert.ok(got, 'no se ha subido la marca');
  assert.ok(got.t >= 120 && got.members.length === 2 && got.lv >= 1 && got.kills >= 0);
});

test('un snap no pasa de 3 KB con muchos enemigos, y acaban llegando todos', () => {
  const r = makeRoom({ n: 4 });
  r.room.tick();
  const { G } = r;
  const p = r.pl('u0');
  calm(G);
  const ids = new Set();
  for (let i = 0; i < 400; i++) {
    const a = i * 2.39996, d = 40 + (i % 40) * 22;
    const e = new G.Enemy({ dex: 19, name: 'Rattata', hp: 1e6, spd: 0, dmg: 0, xp: 1, behavior: 'chase' },
                          p.x + Math.cos(a) * d, p.y + Math.sin(a) * d, { hp: 1, spd: 1, dmg: 1 });
    G.EnemyMgr.add(e);
    ids.add(e.id);
  }
  G.Spawner.update = () => {};
  const seen = new Set();
  for (let i = 0; i < 40; i++) {
    for (const m of r.members) { const q = r.pl(m.uid); q.hp = q.maxHp; }
    r.room.tick();
    for (const x of r.sent.splice(0)) {
      if (x.m.t !== 'snap') continue;
      assert.ok(x.m.bin.length <= 3072, 'snap de ' + x.m.bin.length + ' B');
      if (x.uid === 'u0') for (const e of proto.decode(x.m.bin).enemies.add) seen.add(e.id);
    }
  }
  const near = G.EnemyMgr.all().filter(e => ids.has(e.id) && G.U.dist(e.x, e.y, p.x, p.y) <= 950).length;
  assert.ok(near > 200, 'la prueba no tiene bastantes enemigos cerca: ' + near);
  const missing = G.EnemyMgr.all().filter(e => ids.has(e.id) && G.U.dist(e.x, e.y, p.x, p.y) <= 900 && !seen.has(e.id));
  assert.strictEqual(missing.length, 0, 'enemigos cercanos que no han llegado nunca: ' + missing.length);
});

test('al volver tras un corte se le manda todo de nuevo', () => {
  const r = makeRoom({ n: 2 });
  const step = bots(r);
  steps(step, 10);
  r.room.drop('u1');
  r.room.tick(); r.room.tick();
  r.sent.length = 0;
  r.room.back('u1');
  r.room.tick(); r.room.tick();
  const s = lastSnap(r.sent, 'u1');
  assert.ok(s, 'no le llega snap');
  const alive = r.G.EnemyMgr.all().filter(e => !e.dead && r.G.U.dist(e.x, e.y, r.pl('u1').x, r.pl('u1').y) <= 900).length;
  assert.ok(s.enemies.add.length >= Math.min(alive, 100), 'no se le vuelven a mandar los enemigos');
});

test('mejoras de la tienda, Repertorio y veto del kit; `kit` a cada uno al empezar y al cambiar', () => {
  const kit = { up: { hp: 3, spd: 2, moves: 1, ban: 1, xx: 9 }, bind: [], ban: ['tackle', 'growl'] };
  const members = [{ uid: 'a', name: 'A', dex: 25, shiny: false, kit }, { uid: 'b', name: 'B', dex: 4, shiny: false }];
  const sent = [];
  const room = createRoom({ members, seed: 3, logger: quiet, send: (uid, m) => sent.push({ uid, m }) });
  const G = room.debug.G, a = room.debug.player('a'), b = room.debug.player('b');
  const perks = G.Upgrades.perks({ hp: 3, spd: 2, moves: 1, ban: 1 });
  assert.ok(perks.hp > 0);
  assert.strictEqual(a.maxHp, G.DEX_BY[25].hp + perks.hp);
  assert.ok(Math.abs(a.spdMul - perks.spdMul) < 1e-9 && a.spdMul > 1);
  assert.strictEqual(b.spdMul, 1);
  assert.strictEqual(a.slots.length, 2, 'Repertorio: dos movimientos');
  assert.strictEqual(b.slots.length, 1);
  assert.deepStrictEqual([...a.banned], ['tackle'], 'sólo tantos vetos como la mejora');
  calm(G);
  room.tick(); room.tick();
  const kitOf = uid => of(sent, uid, 'ev').flatMap(m => m.list).filter(ev => ev[0] === 'kit');
  const ka = kitOf('a');
  assert.strictEqual(ka.length, 1);
  assert.deepStrictEqual(ka[0][1].map(g => g[0][0]), a.slots.map(g => g[0].id));
  assert.strictEqual(ka[0][2], a.active);
  assert.ok(Math.abs(ka[0][5][0] - a.spdMul) < 0.01);
  // Sin cambios no se repite; con una carta elegida, sí.
  sent.length = 0;
  room.tick(); room.tick();
  assert.strictEqual(kitOf('a').length, 0);
  room.debug.levelUp();
  room.tick();
  room.pick('a', 0); room.pick('b', 0);
  room.tick(); room.tick();
  assert.ok(kitOf('a').length >= 1 || kitOf('b').length >= 1, 'tras la carta llega el kit nuevo');
});

test('ranked: false (algo no cuadra con la partida guardada): no sube la marca aunque el tiempo cuente', () => {
  let got = null;
  const r = makeRoom({ n: 2, ranked: false, rank: { submitGroup: r_ => { got = r_; return Promise.resolve([]); } } });
  const step = bots(r);
  steps(step, 121);
  for (const m of r.members) { const p = r.pl(m.uid); p.invuln = 0; p.hurt(1e9); }
  for (let i = 0; i < 40; i++) r.room.tick();
  assert.ok(r.over || of(r.sent, 'u0', 'over').length, 'no ha llegado over');
  assert.strictEqual(got, null);
});
