/* Pruebas de la simulación sin pantalla:  node --test server/test/sim.test.js */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { createSim } = require('../sim.js');
const { soloRun } = require('./solo.js');

const DT = 1 / 30;
const run = (r, secs, each) => { for (let i = Math.round(secs / DT); i > 0; i--) { r.step(DT); if (each) each(); } };

/** Abre una grieta y lleva al bot hasta ella (antes se confiaba en que pasara por encima). */
function openRiftAndGo({ G }, r) {
  G.Rift.debugOpen();
  G.Input.axis = () => { const rf = G.Rift.rift; return rf ? G.U.norm(rf.x - r.pl.x, rf.y - r.pl.y) : [0, 0]; };
}

/** Huella del estado: si dos partidas la dan igual, han ido igual. */
function print({ G }, r) {
  const en = G.EnemyMgr.all().map(e => [e.dex, Math.round(e.x), Math.round(e.y), Math.round(e.hp)]);
  return JSON.stringify({ t: r.time.toFixed(2), x: Math.round(r.pl.x), y: Math.round(r.pl.y), hp: Math.round(r.pl.hp),
    lv: r.pl.level, xp: r.pl.xp, ki: r.pl.kills, co: r.pl.coins, en, pk: G.Pickups.all().length });
}

test('carga la lógica sin navegador', () => {
  const { G } = createSim();
  for (const k of ['World', 'Player', 'EnemyMgr', 'Combat', 'Spawner', 'Step', 'Rift', 'Judgment']) assert.ok(G[k], 'falta G.' + k);
});

test('dos minutos de partida en solitario', () => {
  const sim = createSim({ seed: 3 });
  const r = soloRun(sim);
  run(r, 120);
  assert.ok(r.pl.kills > 0, 'no ha derrotado a nadie');
  assert.ok(sim.G.EnemyMgr.all().length > 0, 'no han salido enemigos');
});

test('misma semilla, misma partida; otra semilla, otra', () => {
  // (La semilla de la partida es la del mundo, como en el juego: soloRun la pone en G.RNG.)
  const a = createSim({ seed: 7 }), b = createSim({ seed: 7 }), c = createSim({ seed: 8 });
  const ra = soloRun(a), rb = soloRun(b), rc = soloRun(c, { world: 1235 });
  run(ra, 90); run(rb, 90); run(rc, 90);
  assert.strictEqual(print(a, ra), print(b, rb));
  assert.notStrictEqual(print(a, ra), print(c, rc));
});

test('Olvidar: sólo con los huecos llenos; el hueco queda libre y el movimiento vuelve a las cartas', () => {
  const sim = createSim({ seed: 4 });
  const { G } = sim;
  const r = soloRun(sim);
  const pl = r.pl;
  const all = () => G.LevelUp.offer(pl, 99);
  assert.ok(!all().some(c => c.type === 'forget'), 'con huecos libres no sale');
  for (const id of G.Moves.poolFor(pl.mon)) { if (pl.slots.length >= pl.maxMoves) break; if (G.Moves.BY_ID[id].kind !== 'buff') pl.addMove(id); }
  assert.strictEqual(pl.slots.length, 4);
  const card = all().find(c => c.type === 'forget');
  assert.ok(card && card.then, 'con los 4 llenos sale');
  const list = card.then(pl);
  assert.strictEqual(list.length, 4);
  assert.ok(list.every(c => c.type === 'unlearn'));
  const gone = pl.slots[2][0].id;
  pl.active = 3;
  list.find(c => c.key === 'unlearn:' + gone).apply(pl);
  assert.strictEqual(pl.slots.length, 3);
  assert.ok(!pl.hasMove(gone));
  assert.strictEqual(pl.active, 2, 'sigue en el mismo movimiento');
  let back = false;
  for (let i = 0; i < 200 && !back; i++) back = all().some(c => c.key === 'new:' + gone);
  assert.ok(back, 'vuelve al pozo');
  assert.ok(!all().some(c => c.type === 'forget'), 'con un hueco libre ya no sale');
  // Los de un vínculo no se olvidan.
  pl.addMove(G.Moves.poolFor(pl.mon).find(id => !pl.hasMove(id) && G.Moves.BY_ID[id].kind !== 'buff'));
  pl.fuse([pl.slots[0][0], pl.slots[1][0]]);
  assert.ok(!all().some(c => c.type === 'forget'), 'con 3 huecos (uno de vínculo) hay hueco libre');
  assert.strictEqual(G.LevelUp.forgetCards(pl).length, 2, 'sólo los sueltos');
});

test('una grieta: entra en la arena y vuelve', () => {
  const sim = createSim({ seed: 5 });
  const r = soloRun(sim, { god: true });
  run(r, 20);
  openRiftAndGo(sim, r);
  let inside = false, back = false;
  run(r, 240, () => { if (sim.G.Rift.inArena) inside = true; else if (inside) back = true; });
  assert.ok(inside, 'no ha entrado en la grieta');
  assert.ok(back, 'no ha vuelto de la grieta');
});

test('la Sentencia de Arceus, de la animación a la pelea', () => {
  const sim = createSim({ seed: 9 });
  const r = soloRun(sim, { god: true });
  run(r, 20);
  sim.G.Judgment.debugStart();
  let fight = false;
  run(r, 150, () => { if (sim.G.Judgment.active && !sim.G.Judgment.cinematic) fight = true; });
  assert.ok(fight, 'no ha llegado a la pelea');
});

test('sala de 4 bots hasta la Sentencia sin errores (createRoom)', () => {
  const { createRoom, DT: ROOM_DT } = require('../room.js');
  const proto = require('../proto.js');
  const members = [4, 7, 1, 25].map((dex, i) => ({ uid: 'b' + i, name: 'Bot' + i, dex, shiny: false }));
  const sent = [];
  let over = null, snaps = 0;
  const errors = [];
  const room = createRoom({ members, seed: 9, send: (uid, m) => sent.push([uid, m]), onOver: r => { over = r; },
    logger: { error: (...a) => errors.push(a.join(' ')), warn() {}, log() {} } });
  const { G } = room.debug;
  let seq = 0;
  /** Un paso: cada bot da vueltas (manda adónde se mueve), no cae y elige la primera carta. */
  const step = k => {
    members.forEach((m, i) => {
      const p = room.debug.player(m.uid);
      const a = k * ROOM_DT * 0.3 + i * 1.7, dx = Math.cos(a), dy = Math.sin(a);
      room.input(m.uid, { seq: ++seq, x: p.x + dx * p.spd * ROOM_DT, y: p.y + dy * p.spd * ROOM_DT, dx, dy, move: 0 });
      if (p.dead) p.revive(1);
      p.hp = p.maxHp;
    });
    room.tick();
    for (const [uid, m] of sent.splice(0)) {
      if (m.t === 'level') room.pick(uid, 0);
      if (m.t === 'snap') { proto.decode(m.bin); snaps++; }
    }
  };
  let k = 0;
  for (; k < Math.round(6 / ROOM_DT); k++) step(k);
  G.Judgment.debugStart();
  let fight = false;
  for (let i = 0; i < Math.round(40 / ROOM_DT) && !fight; i++, k++) { step(k); fight = G.Judgment.active && !G.Judgment.cinematic; }
  assert.ok(fight, 'no ha llegado a la pelea');
  for (let i = 0; i < Math.round(5 / ROOM_DT); i++, k++) step(k);
  assert.deepStrictEqual(errors, [], 'errores en la sala');
  assert.strictEqual(over, null, 'la partida ha terminado antes de tiempo');
  assert.ok(snaps > 0, 'no ha mandado instantáneas');
  room.stop();
});

test('la grieta avisa con curtain y no con flash', () => {
  const sim = createSim({ seed: 5 });
  const r = soloRun(sim, { god: true });
  let curtains = 0, flashes = 0;
  sim.G.Game.curtain = () => { curtains++; };
  sim.G.Game.flash = () => { flashes++; };
  run(r, 20);
  openRiftAndGo(sim, r);
  let inside = false, back = false;
  run(r, 240, () => { if (sim.G.Rift.inArena) inside = true; else if (inside) back = true; });
  assert.ok(inside && back, 'no ha ido y vuelto');
  assert.ok(curtains >= 2, 'curtain ' + curtains);
  assert.equal(flashes, 0);
});

test('la Vidasfera nunca es el primer objeto', () => {
  const sim = createSim({ seed: 3 });
  const r = soloRun(sim);
  const { G } = sim;
  assert.equal(r.pl.item, null);
  for (let i = 0; i < 400; i++) assert.notEqual(G.Items.roll(), 'lifeorb');
  for (let i = 0; i < 50; i++) assert.notEqual(G.Items.first('lifeorb'), 'lifeorb');
  assert.equal(G.Items.first('leftovers'), 'leftovers');
  r.pl.equip('leftovers');
  let seen = false;
  for (let i = 0; i < 400 && !seen; i++) seen = G.Items.roll() === 'lifeorb';
  assert.ok(seen, 'llevando objeto también debe poder salir');
});

test('lo que cae dentro de una pared o en la lava sale a un sitio alcanzable; en el agua se queda', () => {
  const sim = createSim({ seed: 3 });
  soloRun(sim);
  const { G } = sim, W = G.World, TS = W.TS;
  const reach = (x, y) => W.isFree(x, y, 6, true) && W.walkable(Math.floor(x / TS), Math.floor(y / TS));
  const find = pred => {
    for (let ty = -150; ty < 150; ty++) for (let tx = -150; tx < 150; tx++) {
      const x = tx * TS + TS / 2, y = ty * TS + TS / 2;
      if (pred(x, y)) return [x, y];
    }
    assert.fail('no hay sitio para probar');
  };
  const around = (x, y, f) => [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].every(([a, b]) => f(x + a * TS, y + b * TS));
  const dropAt = ([x, y]) => { G.Pickups.clear(); G.Pickups.drop('coin', x, y, 1); return G.Pickups.all()[0]; };
  // Pared gruesa: antes la moneda se quedaba dentro, lejos del imán.
  const wall = find((x, y) => around(x, y, (a, b) => around(a, b, W.isWall)));
  let o = dropAt(wall);
  assert.ok(reach(o.x, o.y), 'sigue dentro de la pared');
  // El agua se pisa: no se mueve.
  const water = find((x, y) => around(x, y, W.isLiquid));
  o = dropAt(water);
  assert.deepEqual([o.x, o.y], water);
  // La lava quema: sale.
  W.setBiome(G.Tiles.BIOMES.findIndex(b => b.liquid === 'lava'), true);
  o = dropAt(find((x, y) => around(x, y, W.isLiquid)));
  assert.ok(reach(o.x, o.y), 'sigue en la lava');
});

test('G.Mons con otra partida guardada: picksOf → saveOf → loadout da lo mismo (lo del cooperativo)', () => {
  const { G } = createSim();
  const tm = G.TM_OF(25).find(id => G.Moves.BY_ID[id] && !G.Mons.natural(25, id));
  const sv = { created: 1234567, pnat: { 25: ['jolly', 9] }, pabil: { 25: [2, 9] }, ptm: { 25: [tm, tm, 'no-existe'] } };
  const picks = G.Mons.picksOf(25, sv);
  assert.strictEqual(picks.nat, 'jolly');
  assert.strictEqual(picks.ab, 2);
  assert.strictEqual(JSON.stringify(picks.tms), JSON.stringify([tm]), 'sin repetidas ni inventadas');
  const a = G.Mons.loadout(25, sv), b = G.Mons.loadout(25, G.Mons.saveOf(25, picks));
  assert.strictEqual(JSON.stringify(a), JSON.stringify(b));
  assert.strictEqual(a.ability, G.Mons.slots(25)[2]);
  assert.ok(G.Moves.poolFor(a.mon).includes(tm) && !G.Moves.poolFor(a.mon, true).includes(tm));
  // Lo que le tocó depende de su partida (created), no de la del navegador.
  const n = new Set([1, 2, 3, 4, 5, 6, 7, 8].map(c => G.Mons.natureOf(25, { created: c }).id));
  assert.ok(n.size > 1, 'la naturaleza que toca cambia con la cuenta');
});

test('G.startPicks: los elegidos sólo con su mejora, el segundo distinto del primero y con Repertorio', () => {
  const { G } = createSim();
  const base = G.baseStartOf(25), other = G.startChoices(25).find(id => id !== base);
  assert.deepStrictEqual(Array.from(G.startPicks(25, { start: other, start2: base })), [base, null]);
  assert.deepStrictEqual(Array.from(G.startPicks(25, { start: other, up: { start: 1 } })), [other, null]);
  assert.deepStrictEqual(Array.from(G.startPicks(25, { start2: other, up: { start2: 1 } })), [base, null], 'sin Repertorio');
  assert.deepStrictEqual(Array.from(G.startPicks(25, { start2: other, up: { start2: 1, moves: 1 } })), [base, other]);
  assert.deepStrictEqual(Array.from(G.startPicks(25, { start: other, start2: other, up: { start: 1, start2: 1, moves: 1 } })), [other, null]);
  assert.deepStrictEqual(Array.from(G.startPicks(25, { start: 'hydro-pump', up: { start: 1 } })), [base, null], 'no es de los suyos');
});
