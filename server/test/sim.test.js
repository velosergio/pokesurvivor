/* Pruebas de la simulación sin pantalla:  node --test server/test/sim.test.js */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { createSim } = require('../sim.js');
const { soloRun } = require('./solo.js');

const DT = 1 / 30;
const run = (r, secs, each) => { for (let i = Math.round(secs / DT); i > 0; i--) { r.step(DT); if (each) each(); } };

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
  const a = createSim({ seed: 7 }), b = createSim({ seed: 7 }), c = createSim({ seed: 8 });
  const ra = soloRun(a), rb = soloRun(b), rc = soloRun(c);
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
  sim.G.Rift.debugOpen();
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
  const { createRoom } = require('../room.js');
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
      const a = k * 0.05 * 0.3 + i * 1.7, dx = Math.cos(a), dy = Math.sin(a);
      room.input(m.uid, { seq: ++seq, x: p.x + dx * p.spd * 0.05, y: p.y + dy * p.spd * 0.05, dx, dy, move: 0 });
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
  for (; k < 20 * 6; k++) step(k);
  G.Judgment.debugStart();
  let fight = false;
  for (let i = 0; i < 20 * 40 && !fight; i++, k++) { step(k); fight = G.Judgment.active && !G.Judgment.cinematic; }
  assert.ok(fight, 'no ha llegado a la pelea');
  for (let i = 0; i < 20 * 5; i++, k++) step(k);
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
  sim.G.Rift.debugOpen();
  let inside = false, back = false;
  run(r, 240, () => { if (sim.G.Rift.inArena) inside = true; else if (inside) back = true; });
  assert.ok(inside && back, 'no ha ido y vuelto');
  assert.ok(curtains >= 2, 'curtain ' + curtains);
  assert.equal(flashes, 0);
});
