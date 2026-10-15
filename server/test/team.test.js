/* Pruebas del paso de equipo (G.Step.team):  node --test server/test/team.test.js */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { createSim } = require('../sim.js');
const { teamRun } = require('./team.js');

const DT = 1 / 30;
const run = (r, secs) => { for (let i = Math.round(secs / DT); i > 0; i--) r.step(DT); };

/** Huella del estado de una partida de equipo. */
function print({ G }, r) {
  const en = G.EnemyMgr.all().map(e => [e.dex, Math.round(e.x), Math.round(e.y), Math.round(e.hp)]);
  const pl = r.players.map(p => [Math.round(p.x), Math.round(p.y), Math.round(p.hp), p.level, p.xp, p.kills, Math.round(p.dmgDealt)]);
  return JSON.stringify({ t: r.time.toFixed(2), pl, en, pk: G.Pickups.all().length });
}

/** Un enemigo quieto de prueba en (x, y). */
function dummy(G, x, y, o = {}) {
  const e = new G.Enemy(Object.assign({ dex: 19, name: 'Rattata', hp: 100000, spd: 0, dmg: 10, xp: 1, behavior: 'chase' }, o),
                        x, y, { hp: 1, spd: 1, dmg: 1 });
  G.EnemyMgr.add(e);
  G.EnemyMgr.rebuildGrid();
  return e;
}

/** Equipo de 4 sin enemigos, listo para probar choques sueltos. */
function quiet(seed = 1) {
  const sim = createSim({ seed });
  const r = teamRun(sim, { gap: 400 });
  sim.G.EnemyMgr.clear(); sim.G.Projectiles.clear();
  for (const p of r.players) { p.dmgDealt = 0; p.invuln = 0; }
  return { sim, G: sim.G, r, players: r.players };
}

test('cuatro jugadores, un minuto con G.Step.team', () => {
  const sim = createSim({ seed: 3 });
  const r = teamRun(sim);
  run(r, 60);
  assert.ok(r.players.length === 4);
  assert.ok(sim.G.EnemyMgr.all().length > 0, 'no han salido enemigos');
  // Todos atacan: cada uno ha hecho daño por su cuenta.
  for (const p of r.players) assert.ok(p.dmgDealt > 0, 'el jugador ' + p.dex + ' no ha hecho daño');
});

test('un disparo de B cuenta para B y no para A', () => {
  const { G, players: [A, B] } = quiet();
  const e = dummy(G, B.x + 60, B.y);
  const hp0 = e.hp;
  G.Projectiles.spawn({ x: B.x + 60, y: B.y, vx: 0, vy: 0, dmg: 50, r: 6, life: 1, hits: new Set(), owner: B });
  G.Combat.resolve(DT, A, 1, [A, B]);
  assert.ok(e.hp < hp0, 'el enemigo no ha recibido el golpe');
  assert.ok(B.dmgDealt > 0, 'B no suma el daño');
  assert.strictEqual(A.dmgDealt, 0, 'A suma un daño que no es suyo');
});

test('un disparo enemigo encima de C daña a C (y sólo a C)', () => {
  const { G, players } = quiet();
  const C = players[2];
  const hp = players.map(p => p.hp);
  G.Projectiles.spawn({ x: C.x, y: C.y, vx: 0, vy: 0, dmg: 20, r: 7, life: 2, friendly: false, color: '#f00' });
  G.Combat.resolve(DT, players[0], 1, players);
  assert.ok(C.hp < hp[2], 'C no ha recibido el disparo');
  players.forEach((p, i) => { if (p !== C) assert.strictEqual(p.hp, hp[i], 'el disparo ha dado a otro'); });
  assert.strictEqual(G.Projectiles.all().length, 0, 'el disparo sigue vivo');
});

test('el contacto enemigo daña al que toca', () => {
  const { G, players } = quiet();
  const D = players[3];
  const hp = players.map(p => p.hp);
  dummy(G, D.x + 2, D.y);
  G.Combat.resolve(DT, players[0], 1, players);
  assert.ok(D.hp < hp[3], 'D no ha recibido el golpe');
  players.forEach((p, i) => { if (p !== D) assert.strictEqual(p.hp, hp[i], 'el contacto ha dado a otro'); });
});

test('el paso de equipo mueve los disparos de todos aunque la cámara no los vea', () => {
  const { G, players } = quiet();
  const far = players[3];
  G.Camera.x = players[0].x; G.Camera.y = players[0].y;
  const p = G.Projectiles.spawn({ x: far.x + 2000, y: far.y, vx: 0, vy: 0, dmg: 1, life: 5, hits: new Set(), owner: far });
  far.x += 2000;
  G.Projectiles.update(DT, players[0], [], players);
  assert.ok(G.Projectiles.all().includes(p), 'se ha descartado un disparo junto a un jugador');
});

test('misma semilla, misma partida de equipo', () => {
  const a = createSim({ seed: 7 }), b = createSim({ seed: 7 });
  const ra = teamRun(a), rb = teamRun(b);
  run(ra, 45); run(rb, 45);
  assert.strictEqual(print(a, ra), print(b, rb));
});

test('grieta en equipo: entra el grupo si la toca uno cualquiera, y vuelven todos en pie', () => {
  const sim = createSim({ seed: 5 });
  const { G } = sim;
  const r = teamRun(sim, { god: false });
  run(r, 2);
  G.Rift.debugOpen();
  const rf = G.Rift.rift;
  assert.ok(rf, 'no se ha abierto la grieta');
  // La toca el tercero (no el primero, que es G.Game.player).
  const C = r.players[2];
  C.x = rf.x; C.y = rf.y - 10;
  r.step(DT);
  assert.ok(G.Rift.inArena, 'no ha entrado el grupo');
  // Dentro, dos caen; al acabar la arena todos vuelven en pie.
  r.players[1].hp = 0; r.players[1].dead = true;
  r.players[3].hp = 0; r.players[3].dead = true;
  for (let i = 0; i < 200 * 30 && G.Rift.inArena; i++) r.step(DT);
  assert.ok(!G.Rift.inArena, 'no han vuelto de la grieta');
  assert.ok(r.players.every(p => !p.dead), 'alguien vuelve caído');
});

test('grieta en equipo: cada uno vuelve a donde estaba al entrar, no todos juntos', () => {
  const sim = createSim({ seed: 5 });
  const { G } = sim;
  const r = teamRun(sim, { god: true, gap: 300 });
  run(r, 2);
  // Dónde estaba cada uno justo al entrar (antes de que la arena los ponga en fila).
  let before = null;
  const setArena = G.World.setArena;
  G.World.setArena = (a) => { before = before || r.players.map(p => [p.x, p.y]); return setArena(a); };
  G.Rift.debugArena();
  assert.ok(G.Rift.inArena, 'no ha entrado el grupo');
  assert.ok(before, 'no se ha visto la entrada');
  for (let i = 0; i < 200 * 30 && G.Rift.inArena; i++) r.step(DT);
  assert.ok(!G.Rift.inArena, 'no han vuelto de la grieta');
  // Tras la vuelta un paso puede moverlos un poco (choques, tierra).
  r.players.forEach((p, i) => {
    const d = Math.hypot(p.x - before[i][0], p.y - before[i][1]);
    assert.ok(d < 40, 'el ' + i + ' vuelve a ' + Math.round(d) + ' px de donde estaba');
  });
  assert.ok(Math.hypot(r.players[0].x - r.players[3].x, r.players[0].y - r.players[3].y) > 300, 'vuelven juntos');
});
