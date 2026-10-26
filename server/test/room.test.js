/* Pruebas de la partida en el servidor (room.js):  node --test server/test/room.test.js
 * Sin temporizadores: cada prueba avanza la sala a mano con tick(). */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { createRoom, DT } = require('../room.js');
const proto = require('../proto.js');
const DEX = [4, 7, 1, 25, 133, 39, 52, 54, 60, 63];
const quiet = { error() {}, warn() {}, log() {} };

/** Sala de n jugadores con un `send` falso que guarda todo. */
function makeRoom({ n = 4, seed = 7, rank, ranked, rules, logger = quiet } = {}) {
  const members = DEX.slice(0, n).map((dex, i) => ({ uid: 'u' + i, name: 'P' + i, dex, shiny: false }));
  const sent = [];
  const overs = [];
  const room = createRoom({ members, seed, rank, ranked, rules, logger, send: (uid, m) => sent.push({ uid, m }), onOver: r => overs.push(r) });
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
  for (let i = 0; i < Math.round(40 / DT) && !fight; i++) { step(); if (r.G.Judgment.active && !r.G.Judgment.cinematic) fight = true; }
  assert.ok(fight, 'no ha llegado a la pelea');
  steps(step, 8);
  assert.ok(!r.over, 'la partida ha terminado: ' + JSON.stringify(r.over));
  assert.ok(r.evs.has('jd'), 'no se ha avisado de la Sentencia');
  assert.ok(r.evs.has('ja'), 'no se manda dónde está Arceus');
  assert.ok(r.snaps > 4 * 100, 'pocos snaps: ' + r.snaps);
});

test('10 bots: cada uno con su color, más enemigos a la vez y snaps que caben', () => {
  const r = makeRoom({ n: 10, seed: 5 });
  const step = bots(r);
  steps(step, 90);
  assert.ok(!r.over, 'la partida ha terminado: ' + JSON.stringify(r.over));
  assert.strictEqual(new Set(r.G.Coop.COLORS).size, 10);
  assert.strictEqual(r.G.Spawner.cap(), 64 + 12 * 6);
  assert.ok(r.G.EnemyMgr.count > 64, 'no pasa del tope de 4: ' + r.G.EnemyMgr.count);
  assert.ok(r.maxSnap < 16000, 'snap demasiado grande: ' + r.maxSnap);
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
  for (let i = 0; i < Math.round(19 / DT); i++) r.room.tick();
  assert.strictEqual(r.room.debug.time, t0, 'no ha esperado');
  for (let i = 0; i < Math.round(2 / DT); i++) r.room.tick();
  assert.ok(r.room.debug.time > t0, 'sigue esperando pasados 20 s');
});

test('quien no elige no se lleva «Olvidar» aunque salga primera', () => {
  const r = makeRoom({ n: 2 });
  const G = r.G, a = r.pl('u0');
  calm(G);
  for (const id of G.Moves.poolFor(a.mon)) { if (a.slots.length >= a.maxMoves) break; if (G.Moves.BY_ID[id].kind !== 'buff') a.addMove(id); }
  const offer = G.LevelUp.offer;
  G.LevelUp.offer = (pl, n) => { const l = offer(pl, 99); const f = l.filter(c => c.type === 'forget'); return f.concat(l.filter(c => c.type !== 'forget')).slice(0, n || 3); };
  r.room.tick();
  r.room.debug.levelUp();
  r.room.tick();
  G.LevelUp.offer = offer;
  assert.strictEqual(of(r.sent, 'u0', 'level')[0].options[0].type, 'forget');
  r.room.pick('u1', 0);
  for (let i = 0; i < Math.round(21 / DT); i++) r.room.tick();
  assert.strictEqual(of(r.sent, 'u0', 'level').length, 1, 'no le llega la elección de qué olvidar');
  assert.strictEqual(a.slots.length, 4);
  assert.ok(!r.room.debug.paused, 'la partida sigue');
});

test('Olvidar: tras la carta llega qué movimiento (sin cambio de cartas), y al elegir se olvida', () => {
  const r = makeRoom({ n: 2 });
  const G = r.G, a = r.pl('u0');
  calm(G);
  for (const id of G.Moves.poolFor(a.mon)) { if (a.slots.length >= a.maxMoves) break; if (G.Moves.BY_ID[id].kind !== 'buff') a.addMove(id); }
  assert.strictEqual(a.slots.length, 4);
  const offer = G.LevelUp.offer;
  G.LevelUp.offer = pl => offer(pl, 99).filter(c => c.type === 'forget' || pl !== a);
  r.room.tick();
  r.room.debug.levelUp();
  r.room.tick();
  G.LevelUp.offer = offer;
  const lv = () => of(r.sent, 'u0', 'level');
  assert.strictEqual(lv()[0].options[0].type, 'forget');
  r.room.pick('u0', 0); r.room.pick('u1', 0);
  const second = lv()[1];
  assert.ok(second && second.options.length === 4 && second.options.every(o => o.type === 'unlearn'));
  assert.strictEqual(second.rr, 0);
  r.room.reroll('u0');
  assert.strictEqual(lv().length, 2, 'no se cambia');
  assert.ok(r.room.debug.paused, 'sigue eligiendo');
  const gone = second.options[1].id.split(':')[1];
  r.room.pick('u0', 1);
  assert.ok(!a.hasMove(gone));
  assert.strictEqual(a.slots.length, 3);
  r.room.tick(); r.room.tick();
  assert.ok(!r.room.debug.paused);
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
  for (let i = 0; i < Math.round(2 / DT); i++) r.room.tick();
  for (const m of r.members) {
    const o = of(r.sent, m.uid, 'over');
    assert.strictEqual(o.length, 1, m.uid + ' no ha recibido over');
    assert.strictEqual(o[0].results.why, 'down');
    for (const k of ['t', 'lv', 'ki', 'co', 'shinies', 'rescued', 'crew']) assert.ok(k in o[0].results, 'falta ' + k);
    // El resumen del grupo: uno por jugador, con lo que se compara al final.
    const crew = o[0].results.crew;
    assert.strictEqual(crew.length, 2);
    for (const c of crew) for (const k of ['uid', 'name', 'dex', 'ki', 'dmg', 'hit', 'ch', 'rv']) assert.ok(k in c, 'crew sin ' + k);
    assert.ok(crew.every(c => c.hit > 0), 'el daño recibido no se cuenta');
    // Y el resumen de ataques de cada uno (una pestaña por jugador al final).
    const team = o[0].results.team;
    assert.deepStrictEqual(team.map(x => x.uid), r.members.map(x => x.uid));
    for (const x of team) {
      for (const k of ['dex', 'sh', 'lv', 't', 'it', 'mv']) assert.ok(k in x.sum, 'team sin ' + k);
      assert.ok(x.sum.mv.length >= 1 && x.sum.mv.every(m => typeof m[0] === 'string' && Number.isInteger(m[2])), 'ataques raros');
    }
  }
  assert.strictEqual(ranked, 0);
});

test('levantar a un compañero cuenta para el que ayuda', () => {
  const r = makeRoom({ n: 2 });
  r.room.tick();
  const [a, b] = r.members.map(m => r.pl(m.uid));
  b.x = a.x + 10; b.y = a.y;
  a.invuln = 0; a.hurt(1e9);
  assert.ok(a.dead);
  for (let i = 0; i < Math.round(4 / DT) && a.dead; i++) { b.invuln = 9; b.hp = b.maxHp; b.x = a.x + 10; b.y = a.y; r.room.tick(); }
  assert.ok(!a.dead, 'no se ha levantado');
  assert.strictEqual(b.revives, 1);
  assert.strictEqual(a.revives, 0);
});

test('la marca de grupo se sube al acabar si el tiempo cuenta (sin esperar a que termine)', () => {
  let got = null;
  const r = makeRoom({ n: 2, rank: { submitGroup: r_ => { got = r_; return new Promise(() => {}); } } });
  const step = bots(r);
  steps(step, 121);
  for (const m of r.members) { const p = r.pl(m.uid); p.invuln = 0; p.hurt(1e9); }
  for (let i = 0; i < Math.round(2 / DT); i++) r.room.tick();
  assert.ok(of(r.sent, 'u0', 'over').length || r.over, 'no ha llegado over');
  assert.ok(got, 'no se ha subido la marca');
  assert.ok(got.t >= 120 && got.members.length === 2 && got.lv >= 1 && got.kills >= 0);
  // La build de cada uno (Player.buildCode): al menos el movimiento con el que empieza.
  for (const m of got.members) assert.match(m.b, /^[a-z-]+\.\d+/, m.b);
});

test('caído, mira a un compañero vivo y le llegan los enemigos de allí; al levantarse, los suyos', () => {
  const r = makeRoom({ n: 2 });
  r.room.tick();
  const { G } = r;
  calm(G);
  G.Spawner.update = () => {};
  const [a, b] = r.members.map(m => r.pl(m.uid));
  b.x = a.x + 3000; b.y = a.y;
  // Jefes: los demás, lejos de todo vivo, vuelven a salir junto a uno (enemy.js update).
  const foe = (x, y) => {
    const e = new G.Enemy({ dex: 19, name: 'Rattata', hp: 1e6, spd: 0, dmg: 0, xp: 1, behavior: 'chase' }, x, y, { hp: 1, spd: 1, dmg: 1 });
    e.boss = true;
    G.EnemyMgr.add(e);
    return e.id;
  };
  const nearA = foe(a.x + 200, a.y), nearB = foe(b.x + 200, b.y);
  /** Lo que le ha llegado a u0 en los últimos pasos: enemigos nuevos e idos. */
  const got = () => {
    const out = { add: new Set(), gone: new Set() };
    for (const m of of(r.sent, 'u0', 'snap')) {
      const s = proto.decode(m.bin);
      for (const e of s.enemies.add) out.add.add(e.id);
      for (const id of s.enemies.gone) out.gone.add(id);
    }
    return out;
  };
  const run = () => { r.sent.length = 0; for (let i = 0; i < 4; i++) { b.hp = b.maxHp; b.invuln = 9; r.room.tick(); } };
  run();
  assert.ok(got().add.has(nearA) && !got().add.has(nearB), 'vivo, sólo le llegan los suyos');
  a.invuln = 0; a.hurt(1e9);
  assert.ok(a.dead);
  r.room.watch('u0', 'u1');
  run();
  assert.ok(got().add.has(nearB), 'no le llegan los enemigos de su compañero');
  assert.ok(got().gone.has(nearA), 'los de su cuerpo no se quitan');
  // El compañero cae: vuelve a su cuerpo.
  r.sent.length = 0;
  b.invuln = 0; b.hurt(1e9);
  r.room.tick(); r.room.tick();
  assert.ok(got().add.has(nearA), 'si el elegido cae no vuelve a sí mismo');
  b.revive(1);
  // Al levantarse, aunque pida mirar a otro, lo suyo.
  r.room.watch('u0', 'u1');
  a.revive(1);
  run();
  assert.ok(!got().add.has(nearB), 'vivo, le siguen llegando los del otro');
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

test('quien sale de la partida (más de 20 s fuera) puede volver con «Reconectar», junto a un compañero', () => {
  const r = makeRoom({ n: 2 });
  const step = bots(r);
  steps(step, 10);
  r.room.drop('u1');
  for (let i = 0; i < Math.round(20 / DT) + 5; i++) { r.pl('u0').invuln = 99; r.room.tick(); }
  assert.ok(!r.room.debug.over, 'sigue con el otro');
  assert.strictEqual(lastSnap(r.sent, 'u0').players.find(p => p.id === 1).dead, true, 'ha salido del campo');
  const lv = r.pl('u1').level;
  r.room.debug.place('u0', 900, 700);
  r.sent.length = 0;
  r.room.back('u1');
  assert.strictEqual(r.pl('u1').x, r.pl('u0').x);
  assert.strictEqual(r.pl('u1').y, r.pl('u0').y);
  assert.ok(r.pl('u1').level >= lv, 'conserva lo que tenía');
  r.room.tick(); r.room.tick();
  const s = lastSnap(r.sent, 'u1');
  assert.ok(s, 'no le llega snap');
  assert.strictEqual(!!s.players.find(p => p.id === 1).dead, !!r.pl('u1').dead, 'vuelve a estar en el campo');
});

test('sin nadie conectado, la partida espera parada (el minuto del lobby) y quien vuelve sigue', () => {
  const r = makeRoom({ n: 2 });
  const step = bots(r);
  steps(step, 10);
  const t0 = r.room.debug.time;
  r.room.drop('u0'); r.room.drop('u1');
  for (let i = 0; i < Math.round(40 / DT); i++) r.room.tick();
  assert.ok(!r.room.debug.over, 'se ha acabado sin esperar el minuto');
  assert.strictEqual(r.room.debug.time, t0, 'el reloj ha corrido sin nadie');
  assert.ok(!r.pl('u0').dead && !r.pl('u1').dead, 'les han tumbado sin estar');
  r.sent.length = 0;
  r.room.back('u0');
  r.room.tick(); r.room.tick();
  assert.ok(r.room.debug.time > t0, 'no sigue al volver');
  assert.ok(lastSnap(r.sent, 'u0'), 'no le llega snap');
});

test('sin nadie conectado más de un minuto: se acaba (empty)', () => {
  const r = makeRoom({ n: 2 });
  const step = bots(r);
  steps(step, 10);
  r.room.drop('u0'); r.room.drop('u1');
  for (let i = 0; i < Math.round(61 / DT); i++) r.room.tick();
  assert.ok(r.room.debug.over, 'no se ha acabado');
  assert.strictEqual(r.overs.length, 1);
  assert.strictEqual(r.overs[0][0].why, 'empty');
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

/** Sala de 2 con el kit de 'a' (Pikachu) y 'b' (Charmander, sin kit). */
function kitRoom(kit, dex = 25) {
  const members = [{ uid: 'a', name: 'A', dex, shiny: false, kit }, { uid: 'b', name: 'B', dex: 4, shiny: false }];
  const sent = [];
  const room = createRoom({ members, seed: 3, logger: quiet, send: (uid, m) => sent.push({ uid, m }) });
  return { room, sent, G: room.debug.G, a: room.debug.player('a') };
}
/** Una MT de ese Pokémon que no sea ya de sus tipos (G.Mons.learnable sin partida guardada). */
const tmOf = (G, dex) => G.TM_OF(dex).find(id => G.Moves.BY_ID[id] && !G.Mons.natural(dex, id) && G.Moves.BY_ID[id].kind !== 'buff');

test('naturaleza, habilidad (también la oculta), MT y segundo movimiento del kit; `started` los cuenta con hero()', () => {
  const probe = kitRoom({});
  const tm = tmOf(probe.G, 25);
  assert.ok(tm, 'Pikachu no tiene MT que probar');
  const r = kitRoom({ nat: 'timid', ab: 2, tms: [tm], start2: tm, up: { moves: 1, start2: 1 } });
  const { G, a } = r;
  assert.strictEqual(a.mon.nature, 'timid');
  assert.ok(Math.abs(a.baseSpd - G.DEX_BY[25].spd * 1.1) < 1e-9, 'Miedosa: +10 % de velocidad');
  assert.strictEqual(a.abilId, G.Mons.slots(25)[2], 'la oculta');
  assert.ok(G.Moves.poolFor(a.mon).includes(tm), 'la MT sale en sus cartas');
  assert.ok(!G.Moves.poolFor(probe.a.mon).includes(tm), 'y no en las de otro sin ella');
  assert.deepStrictEqual(Array.from(a.slots, g => g[0].id), [G.baseStartOf(25), tm], 'segundo movimiento elegido (una MT)');
  assert.deepStrictEqual(r.room.hero('a'), { nat: 'timid', ab: 2 });
  assert.deepStrictEqual(Object.keys(r.room.hero('b')).sort(), ['ab', 'nat']);
  assert.deepStrictEqual(r.room.hero('zz'), {});
});

test('kit: lo que no puede tener ese Pokémon no vale (naturaleza rara, MT ajena, hueco vacío, segundo sin Repertorio)', () => {
  const probe = kitRoom({});
  const foreign = Object.keys(probe.G.TM_MOVES).find(id => !probe.G.TM_OF(25).includes(id) && probe.G.Moves.BY_ID[id]);
  const slots = probe.G.Mons.slots(25);
  const empty = [0, 1, 2].find(i => !slots[i]);
  const r = kitRoom({ nat: 'zzz', ab: empty === undefined ? 0 : empty, tms: [foreign], start2: 'thunderbolt', up: { start2: 1 } });
  const { G, a } = r;
  assert.ok(G.NATURE_BY[a.mon.nature], 'una naturaleza de verdad');
  assert.ok(G.Mons.slots(25).includes(a.abilId), 'una habilidad suya');
  assert.strictEqual(a.mon.tms.length, 0);
  assert.ok(!G.Moves.poolFor(a.mon).includes(foreign));
  assert.strictEqual(a.slots.length, 1, 'sin Repertorio no hay segundo');
});

test('kit.saved (la partida guardada, de checkKits) manda sobre lo que pide el navegador', () => {
  const probe = kitRoom({});
  const tm = tmOf(probe.G, 25);
  const r = kitRoom({ nat: 'timid', ab: 2, tms: [tm], saved: { created: 5, pnat: { 25: ['brave', 1] }, pabil: { 25: [0, 1] }, ptm: {} } });
  const { G, a } = r;
  assert.strictEqual(a.mon.nature, 'brave');
  assert.strictEqual(a.abilId, G.Mons.slots(25)[0]);
  assert.ok(!G.Moves.poolFor(a.mon).includes(tm), 'la MT que no tiene guardada no sale');
  assert.deepStrictEqual(r.room.hero('a'), { nat: 'brave', ab: 0 });
});

test('kit lleva el × de velocidad de la habilidad; los avisos sobre un jugador llegan como `tx`', () => {
  const probe = kitRoom({});
  const dex = Object.keys(probe.G.DEX_ABIL).map(Number).find(d => probe.G.SPRITE_META[d] && probe.G.Mons.slots(d)[0] === 'run-away');
  assert.ok(dex, 'nadie con Fuga');
  const r = kitRoom({ ab: 0 }, dex);
  calm(r.G);
  r.room.tick(); r.room.tick();
  const kits = of(r.sent, 'a', 'ev').flatMap(m => m.list).filter(ev => ev[0] === 'kit');
  assert.strictEqual(kits[0][5][2], 1.08);
  assert.ok(Math.abs(r.a.spd - r.a.baseSpd * r.a.spdMul * 1.08) < 1e-6 || r.a.inLiquid, 'Fuga: +8 %');
  r.sent.length = 0;
  r.a.notice('¡Esquiva!', '#bfe8ff');
  r.room.tick(); r.room.tick();
  const tx = of(r.sent, 'b', 'ev').flatMap(m => m.list).filter(ev => ev[0] === 'tx');
  assert.deepStrictEqual(tx[0], ['tx', 0, '¡Esquiva!', '#bfe8ff', 0, 4]);
});

test('ranked: false (algo no cuadra con la partida guardada): no sube la marca aunque el tiempo cuente', () => {
  let got = null;
  const r = makeRoom({ n: 2, ranked: false, rank: { submitGroup: r_ => { got = r_; return Promise.resolve([]); } } });
  const step = bots(r);
  steps(step, 121);
  for (const m of r.members) { const p = r.pl(m.uid); p.invuln = 0; p.hurt(1e9); }
  for (let i = 0; i < Math.round(2 / DT); i++) r.room.tick();
  assert.ok(r.over || of(r.sent, 'u0', 'over').length, 'no ha llegado over');
  assert.strictEqual(got, null);
});

test('level trae el tiempo que queda para elegir (left) y cambiar de cartas no lo reinicia', () => {
  const r = makeRoom({ n: 2 });
  r.room.tick();
  r.room.debug.levelUp();
  r.room.tick();
  const first = of(r.sent, 'u0', 'level')[0];
  assert.ok(first.left > 19 && first.left <= 20, 'left al empezar: ' + first.left);
  for (let i = 0; i < Math.round(5 / DT); i++) r.room.tick();
  r.sent.length = 0;
  r.room.reroll('u0');
  const again = of(r.sent, 'u0', 'level')[0];
  assert.ok(again, 'no llegan las cartas nuevas');
  assert.ok(again.left > 14 && again.left < 16, 'left tras 5 s: ' + again.left);
});

test('reroll: cambia las cartas de nivel tantas veces como 1 + Cambio de cartas, y no más', () => {
  const members = [{ uid: 'a', name: 'A', dex: 25, shiny: false, kit: { up: { reroll: 1 } } }, { uid: 'b', name: 'B', dex: 4, shiny: false }];
  const sent = [];
  const room = createRoom({ members, seed: 5, logger: quiet, send: (uid, m) => sent.push({ uid, m }) });
  calm(room.debug.G);
  room.tick();
  room.debug.levelUp();
  room.tick();
  const lv = uid => of(sent, uid, 'level');
  assert.strictEqual(lv('a').length, 1);
  assert.strictEqual(lv('a')[0].rr, 2, '1 gratis + 1 comprado');
  assert.strictEqual(lv('b')[0].rr, 1);
  room.reroll('a'); room.reroll('a'); room.reroll('a');
  assert.strictEqual(lv('a').length, 3, 'dos cambios y el tercero no');
  assert.deepStrictEqual(lv('a').map(m => m.rr), [2, 1, 0]);
  room.reroll('b');
  assert.strictEqual(lv('b').length, 2);
  // Con un objeto delante no se cambia nada; y elegir sigue funcionando.
  room.pick('a', 0); room.pick('b', 0);
  room.tick(); room.tick();
  assert.ok(!room.debug.paused);
});

/** Un objeto especial de ese tipo cerca del origen (los pone world.js con la semilla). */
function findSpecial(G, type) {
  for (let r = 0; r < 40; r++) {
    for (let i = -r; i <= r; i++) for (const [x, y] of [[i, -r], [i, r], [-r, i], [r, i]]) {
      const p = G.World.specialsNear(x * 1200, y * 1200, 720).find(q => q.type === type && !q.used);
      if (p) return p;
    }
  }
  return null;
}

test('altar: el servidor dice quién se lleva el poder (alt con su uid)', () => {
  const r = makeRoom({ n: 2 });
  const { G } = r;
  r.room.tick();
  const p = findSpecial(G, 'altar');
  assert.ok(p, 'no hay altar cerca');
  calm(G);
  r.room.debug.place('u1', p.x, p.y + 4);
  for (let i = 0; i < 4; i++) r.room.tick();
  const alt = of(r.sent, 'u0', 'ev').flatMap(m => m.list).filter(ev => ev[0] === 'alt');
  assert.strictEqual(alt.length, 1);
  assert.deepStrictEqual([...alt[0].slice(1, 4)], [p.tx, p.ty, 'u1']);
  assert.ok(r.pl('u1').power, 'u1 tiene el poder');
  assert.ok(!r.pl('u0').power);
});

test('cofre con candado: avance en décimas (chs) y, al abrirse, pb', () => {
  const r = makeRoom({ n: 1 });
  const { G } = r;
  r.room.tick();
  const p = findSpecial(G, 'bigchest');
  assert.ok(p, 'no hay cofre cerca');
  calm(G);
  r.room.debug.place('u0', p.x, p.y + 30);
  for (let i = 0; i < Math.round(5 / DT); i++) { r.room.debug.player('u0').hp = 1e6; r.room.debug.place('u0', p.x, p.y + 30); r.room.tick(); }
  const evs = of(r.sent, 'u0', 'ev').flatMap(m => m.list);
  const chs = evs.filter(ev => ev[0] === 'chs').map(ev => ev[3]);
  assert.ok(chs.length >= 5, 'pocos avances: ' + chs.length);
  assert.ok(chs.some(q => q >= 9));
  assert.ok(evs.some(ev => ev[0] === 'pb' && ev[1] === p.tx && ev[2] === p.ty), 'no se ha abierto');
});

test('condiciones a medida: monedas y tickets que se sueltan, y tope de enemigos', () => {
  const r = makeRoom({ n: 2, rules: { coin: 0, ticket: 3, rift: 0, spawn: 2 } });
  const { G } = r;
  r.room.tick();
  const n0 = G.Pickups.count;
  G.Pickups.drop('coin', 0, 0, 5);
  assert.strictEqual(G.Pickups.count, n0, 'con ×0 no salen monedas');
  G.Pickups.drop('ticket', 0, 0, 1);
  assert.strictEqual(G.Pickups.all().filter(p => p.kind === 'ticket').length, 3, 'con ×3 salen 3 tickets');
  assert.strictEqual(G.Spawner.cap(), G.Spawner.CAP * 2, 'con ×2 enemigos el tope se dobla');

  const n = makeRoom({ n: 2 });
  n.room.tick();
  n.G.Pickups.drop('coin', 0, 0, 5);
  assert.strictEqual(n.G.Pickups.all().filter(p => p.kind === 'coin')[0].value, 5, 'normales: igual que siempre');
});

test('condiciones a medida: la marca no sube al ranking de grupo', () => {
  let ranked = 0;
  const r = makeRoom({ n: 2, rules: { spawn: 0.5 }, rank: { submitGroup: async () => { ranked++; return []; } } });
  const step = bots(r);
  for (let i = 0; i < Math.round(125 / DT); i++) step();
  for (const m of r.members) { const p = r.pl(m.uid); p.invuln = 0; p.hurt(1e9); }
  for (let i = 0; i < Math.round(2 / DT); i++) r.room.tick();
  assert.ok(r.room.debug.over, 'no ha terminado');
  assert.strictEqual(ranked, 0);
});

// ---------------- esferas (js/systems/orbs.js) ----------------

/** La bolsa de p tal como va en kit (fuera del vm de la simulación, para compararla). */
const bagOf = (G, p) => JSON.parse(JSON.stringify(G.Orbs.toNet(p)));

/** Sala tranquila (sin enemigos que lleguen) con los jugadores en (x, 0) y sin caer. */
function orbRoom(xs) {
  const r = makeRoom({ n: xs.length });
  r.room.tick();
  calm(r.G);
  r.G.Spawner.update = () => {};
  r.members.forEach((m, i) => r.room.debug.place(m.uid, xs[i], 0));
  r.run = n => { for (let i = 0; i < n; i++) { for (const m of r.members) { const p = r.pl(m.uid); p.hp = p.maxHp; p.invuln = 9; } r.room.tick(); } };
  r.evs = (uid, t) => JSON.parse(JSON.stringify(of(r.sent, uid, 'ev').flatMap(m => m.list).filter(ev => ev[0] === t)));
  return r;
}

test('esferas: el snap dice cuál es, al cogerla va a la bolsa de quien la coge (kit) y sólo a él le llega og', () => {
  const r = orbRoom([0, 600]);
  const { G } = r;
  r.sent.length = 0;
  G.Pickups.drop('sphere', 400, 0, 'focus');
  r.run(2);
  const code = proto.pickCode('sphere', G.Orbs.LIST.findIndex(o => o.id === 'focus'));
  assert.ok(lastSnap(r.sent, 'u0').pickups.add.some(o => o.kind === code), 'el snap no dice qué esfera es');
  r.sent.length = 0;
  G.Pickups.drop('sphere', 600, 0, 'focus');
  r.run(10);
  assert.deepStrictEqual(bagOf(G, r.pl('u1')), [['focus', 1], 0, 0, 0]);
  assert.deepStrictEqual(bagOf(G, r.pl('u0')), [0, 0, 0, 0]);
  assert.deepStrictEqual(r.evs('u1', 'og'), [['og', 'focus', 0]]);
  assert.strictEqual(r.evs('u0', 'og').length, 0, 'og a quien no la ha cogido');
  const kit = r.evs('u1', 'kit').pop();
  assert.deepStrictEqual(kit[6], [['focus', 1], 0, 0, 0], 'la bolsa no va en kit');
});

test('esferas: usarla la gasta y la aplica; con recarga de 1 s por jugador', () => {
  const r = orbRoom([0, 3000]);
  const { G } = r;
  const a = r.pl('u0'), b = r.pl('u1');
  G.Orbs.add(a, 'quick'); G.Orbs.add(a, 'quick'); G.Orbs.add(b, 'quick');
  const spd = a.spdMul;
  r.sent.length = 0;
  r.room.orb('u0', 0);
  assert.ok(Math.abs(a.spdMul - spd * 1.4) < 1e-9, 'la Rapidosfera no acelera');
  assert.deepStrictEqual(bagOf(G, a), [['quick', 1], 0, 0, 0]);
  r.room.orb('u0', 0);
  assert.deepStrictEqual(bagOf(G, a), [['quick', 1], 0, 0, 0], 'se ha usado durante la recarga');
  r.room.orb('u1', 0);
  assert.deepStrictEqual(bagOf(G, b), [0, 0, 0, 0], 'cada uno tiene su recarga');
  r.room.orb('u0', 3);
  assert.deepStrictEqual(bagOf(G, a), [['quick', 1], 0, 0, 0], 'hueco vacío');
  r.run(2);
  assert.deepStrictEqual(r.evs('u1', 'ou')[0], ['ou', 0, 'quick', [0]]);
  assert.ok(Math.abs(r.evs('u0', 'kit').pop()[5][0] - Math.round(spd * 1.4 * 100) / 100) < 1e-9, 'la velocidad nueva no viaja en kit');
  r.run(Math.ceil(1 / DT));
  r.room.orb('u0', 0);
  assert.deepStrictEqual(bagOf(G, a), [0, 0, 0, 0], 'pasado 1 s no se puede usar');
  r.run(Math.ceil(10 / DT));
  assert.ok(Math.abs(a.spdMul - spd) < 1e-9, 'a los 10 s no vuelve a su velocidad');
});

test('esferas: la mejora llega a los compañeros vivos a menos de media pantalla, no a los lejanos', () => {
  const r = orbRoom([0, 200, 2000, 100]);
  const { G } = r;
  const [a, b, c, d] = r.members.map(m => r.pl(m.uid));
  d.invuln = 0; d.hurt(1e9);
  assert.ok(d.dead);
  const crit = [a, b, c].map(p => p.critChance);
  G.Orbs.add(a, 'focus');
  r.sent.length = 0;
  r.room.orb('u0', 0);
  r.room.tick(); r.room.tick();
  assert.deepStrictEqual(r.evs('u2', 'ou')[0], ['ou', 0, 'focus', [0, 1]]);
  assert.deepStrictEqual([a, b, c].map((p, i) => Math.round((p.critChance - crit[i]) * 100)), [25, 25, 0]);
  assert.ok(!(d.orbBuff && d.orbBuff.focus > 0), 'a un caído');
  r.run(Math.ceil(15 / DT) + 1);
  assert.deepStrictEqual([a, b, c].map((p, i) => Math.round((p.critChance - crit[i]) * 100)), [0, 0, 0], 'no se quita a los 15 s');
});

test('esferas: con la Luminosfera llega lo que se ve más lejos, y las de enemigos alcanzan lo que ve quien la usa', () => {
  const r = orbRoom([0]);
  const { G } = r;
  const a = r.pl('u0');
  const foe = (x, y) => {
    const e = new G.Enemy({ dex: 19, name: 'Rattata', hp: 1e6, spd: 0, dmg: 0, xp: 1, behavior: 'chase' }, x, y, { hp: 1, spd: 1, dmg: 1 });
    G.EnemyMgr.add(e);
    return e;
  };
  const far = foe(1150, 0), side = foe(520, 0);
  r.sent.length = 0;
  r.run(2);
  const seen = () => of(r.sent, 'u0', 'snap').some(m => proto.decode(m.bin).enemies.add.some(e => e.id === far.id));
  assert.ok(!seen(), 'sin Luminosfera, a 1150 px no se manda');
  G.Orbs.add(a, 'luminous'); G.Orbs.add(a, 'slumber');
  r.room.orb('u0', 0);
  assert.strictEqual(G.Orbs.zoomOf(a), 1.35);
  r.sent.length = 0;
  r.run(2);
  assert.ok(seen(), 'con la Luminosfera no le llega lo que ve');
  r.run(Math.ceil(1 / DT));
  r.room.orb('u0', 1);
  assert.ok(side.sleepT > 0, 'la Soporesfera no alcanza lo que ve con la cámara alejada');
  r.sent.length = 0;
  r.run(2);
  const flags = of(r.sent, 'u0', 'snap').flatMap(m => { const s = proto.decode(m.bin); return s.enemies.add.concat(s.enemies.upd); }).filter(e => e.id === side.id).map(e => e.flags);
  assert.ok(flags.length && flags.every(f => f & 128), 'el snap no dice que está dormido');
});

test('esferas: no se usan mientras la partida está parada', () => {
  const r = orbRoom([0, 0]);
  const { G } = r;
  const a = r.pl('u0');
  G.Orbs.add(a, 'focus');
  r.room.hold('u1', true);
  r.room.orb('u0', 0);
  assert.deepStrictEqual(bagOf(G, a), [['focus', 1], 0, 0, 0]);
});
