/* Pruebas de los modos de juego (js/modes/):  node --test server/test/modes.test.js
 *
 * Se cargan en una simulación con la base de datos, el ranking y la red del
 * diario falsos: aquí sólo se prueba lo que decide cada modo.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { createSim } = require('../sim.js');

const ROOT = path.join(__dirname, '..', '..');
const MODES = ['js/modes/modes.js', 'js/modes/daily-mode.js'];

/**
 * @param o.now     fecha que usa el reloj de los modos (se cambia con setNow)
 * @param o.net     G.DailyNet falso
 * @param o.guest / o.online
 */
function setup({ now = '2026-10-18T15:00:00Z', net = {}, guest = false, online = true, save = {} } = {}) {
  const sim = createSim();
  const { G, ctx } = sim;
  let clock = new Date(now);
  // Date sin argumentos = el reloj de la prueba (lo usan G.Daily y los modos).
  vm.runInContext(`(() => { const D = Date; Date = class extends D { constructor(...a) { if (a.length) super(...a); else super(__now()); } static now() { return __now(); } }; })();`,
    Object.assign(ctx, { __now: () => clock.getTime() }));
  const calls = { runStarted: 0, start: [], grants: [], claims: [] };
  G.DB = {
    save: Object.assign({ partner: 25, partnerShiny: true, shiny: { 25: 1 }, tickets: { t1: 0, t10: 0 } }, save),
    guest, online, ownsShiny: dex => dex === 25, upgradesOf: () => ({}), commit() {}
  };
  G.Ranking = {
    soloBoards: dex => [['s_hoy', 'd'], ['s_all2_p' + dex, 'p']],
    dailyBoards: day => [['x_d' + day, 'x']],
    runStarted: () => { calls.runStarted++; },
    myRank: async () => rank
  };
  let rank = null;
  G.Progress = { grant: r => { calls.grants.push({ ...r }); }, checkAch() { calls.ach = (calls.ach || 0) + 1; } };
  G.DailyNet = Object.assign({
    state: async () => null,
    start: async day => { calls.start.push(day); },
    claim: async day => { calls.claims.push(day); return true; }
  }, net);
  for (const f of MODES) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  return { G, calls, setNow: iso => { clock = new Date(iso); }, setRank: r => { rank = r; } };
}

test('clásico: el héroe es el compañero (con su shiny) y sube a las tablas de siempre', () => {
  const { G } = setup();
  const m = G.Modes.get('classic');
  const h = m.hero(G.DB.save);
  assert.strictEqual(h.mon.dex, 25);
  assert.strictEqual(h.shiny, true);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(m.boards(25))), [['s_hoy', 'd'], ['s_all2_p25', 'p']]);
  assert.deepStrictEqual({ ...m.finish({ t: 900 }) }, { t1: 0, t10: 0 });
});

test('clásico: empezar apunta la partida en el ranking', async () => {
  const { G, calls } = setup();
  await G.Modes.get('classic').begin();
  assert.strictEqual(calls.runStarted, 1);
  assert.deepStrictEqual({ ...await G.Modes.get('classic').availability() }, { ok: true });
});

test('diario: el héroe es el Pokémon del día, sin shiny', () => {
  const { G } = setup();
  const h = G.Modes.get('daily').hero(G.DB.save);
  assert.strictEqual(h.mon.dex, G.Daily.today().dex);
  assert.strictEqual(h.shiny, false);
});

test('diario: la semilla es la del día', async () => {
  const { G } = setup();
  const m = G.Modes.get('daily');
  await m.begin();
  assert.strictEqual(m.seed(), G.Daily.today().seed);
});

test('diario: sin red no empieza y no gasta nada', async () => {
  const { G, calls } = setup({ net: { start: async () => { throw new Error('sin conexión'); } } });
  await assert.rejects(G.Modes.get('daily').begin());
  assert.strictEqual(calls.runStarted, 0);
});

test('diario: invitado, sin conexión y ya jugado', async () => {
  assert.strictEqual((await setup({ guest: true, online: false }).G.Modes.get('daily').availability()).reason, 'guest');
  assert.strictEqual((await setup({ online: false }).G.Modes.get('daily').availability()).reason, 'offline');
  const failing = setup({ net: { state: async () => { throw new Error('red'); } } });
  assert.strictEqual((await failing.G.Modes.get('daily').availability()).reason, 'offline');
  const played = setup({ net: { state: async () => ({ d: '20261018', claimed: '' }) }, save: { daily: { lastT: 754 } } });
  const a = await played.G.Modes.get('daily').availability();
  assert.strictEqual(a.ok, false);
  assert.strictEqual(a.reason, 'played');
  assert.deepStrictEqual({ ...a.last }, { t: 754, day: '20261018' });
  const yesterday = setup({ net: { state: async () => ({ d: '20261017', claimed: '' }) } });
  assert.strictEqual((await yesterday.G.Modes.get('daily').availability()).ok, true);
});

test('diario: la marca va a la tabla del día en que empezó', async () => {
  const { G, calls, setNow } = setup({ now: '2026-10-19T04:59:00Z' });   // 23:59 del 18 en Colombia
  const m = G.Modes.get('daily');
  await m.begin();
  assert.deepStrictEqual(calls.start, ['20261018']);
  setNow('2026-10-19T05:20:00Z');                                        // 00:20 del 19
  assert.deepStrictEqual(JSON.parse(JSON.stringify(m.boards(25))), [['x_d20261018', 'x']]);
  assert.strictEqual(calls.runStarted, 1);
});

test('diario: tickets por jugar', () => {
  const { G } = setup();
  assert.deepStrictEqual({ ...G.Modes.get('daily').finish({ t: 650 }) }, { t1: 2, t10: 0 });
});

test('elegir modo: clásico por defecto y se recuerda la elección', () => {
  const { G } = setup();
  assert.strictEqual(G.Modes.current.id, 'classic');
  G.Modes.select('daily');
  assert.strictEqual(G.Modes.current.id, 'daily');
  G.Modes.select('raro');
  assert.strictEqual(G.Modes.current.id, 'classic');
});

// ---- racha, premios y logros (Tarea 7) ----

test('diario: empezar suma la partida y la racha y mira los logros', async () => {
  const { G, calls } = setup({ save: { daily: { last: '20261017', streak: 4, played: 9 } } });
  await G.Modes.get('daily').begin();
  const d = G.DB.save.daily;
  assert.deepStrictEqual([d.played, d.streak, d.last], [10, 5, '20261018']);
  assert.ok(calls.ach >= 1);
});

test('diario: sin red, ni la racha ni el contador cambian', async () => {
  const { G } = setup({ save: { daily: { last: '20261017', streak: 4, played: 9 } }, net: { start: async () => { throw new Error('x'); } } });
  await assert.rejects(G.Modes.get('daily').begin());
  assert.deepStrictEqual([G.DB.save.daily.played, G.DB.save.daily.streak], [9, 4]);
});

test('diario: al acabar se recuerda el tiempo de hoy', () => {
  const { G } = setup({ save: { daily: {} } });
  G.Modes.get('daily').finish({ t: 754 });
  assert.strictEqual(G.DB.save.daily.lastT, 754);
});

const claimSetup = (st, o = {}) => setup(Object.assign({ now: '2026-10-18T15:00:00Z', save: { daily: { played: 3, wins: 0, top10: 0, best: 0 } },
  net: { state: async () => st } }, o));

test('premio de ayer: se cobra una vez, con su logro', async () => {
  const s = claimSetup({ d: '20261017', claimed: '' });
  s.setRank({ pos: 1, t: 900 });
  const got = await s.G.Modes.get('daily').claimYesterday();
  assert.strictEqual(got.rank, 1);
  assert.deepStrictEqual(s.calls.claims, ['20261017']);
  assert.deepStrictEqual(s.calls.grants, [{ t1: 0, t10: 2 }]);
  const d = s.G.DB.save.daily;
  assert.deepStrictEqual([d.wins, d.top10, d.best], [1, 1, 1]);
  const again = claimSetup({ d: '20261017', claimed: '20261017' });
  again.setRank({ pos: 1, t: 900 });
  assert.strictEqual(await again.G.Modes.get('daily').claimYesterday(), null);
  assert.deepStrictEqual(again.calls.grants, []);
});

test('premio de ayer: puesto 2 y fuera del top 10', async () => {
  const s = claimSetup({ d: '20261017', claimed: '' });
  s.setRank({ pos: 2, t: 800 });
  await s.G.Modes.get('daily').claimYesterday();
  assert.deepStrictEqual(s.calls.grants, [{ t1: 0, t10: 1 }]);
  assert.deepStrictEqual([s.G.DB.save.daily.wins, s.G.DB.save.daily.top10, s.G.DB.save.daily.best], [0, 1, 2]);
  const out = claimSetup({ d: '20261017', claimed: '' });
  out.setRank({ out: true });
  const r = await out.G.Modes.get('daily').claimYesterday();
  assert.strictEqual(r, null);
  assert.deepStrictEqual(out.calls.claims, ['20261017'], 'se apunta para no volver a mirar');
  assert.deepStrictEqual(out.calls.grants, []);
});

test('premio de ayer: antes de la 01:30 no se cobra', async () => {
  const s = claimSetup({ d: '20261017', claimed: '' }, { now: '2026-10-18T06:00:00Z' });   // 01:00 en Colombia
  s.setRank({ pos: 1, t: 900 });
  assert.strictEqual(await s.G.Modes.get('daily').claimYesterday(), null);
  assert.deepStrictEqual(s.calls.claims, []);
});

test('premio de ayer: si no jugaste ayer no hay nada que cobrar', async () => {
  const s = claimSetup({ d: '20261015', claimed: '' });
  s.setRank({ pos: 1, t: 900 });
  assert.strictEqual(await s.G.Modes.get('daily').claimYesterday(), null);
  assert.deepStrictEqual(s.calls.claims, []);
});

test('premio de ayer: si ya empezaste hoy, el de ayer se sigue pudiendo cobrar', async () => {
  const s = claimSetup({ d: '20261018', claimed: '' }, { save: { daily: { last: '20261018', prev: '20261017' } } });
  s.setRank({ pos: 3, t: 700 });
  const r = await s.G.Modes.get('daily').claimYesterday();
  assert.strictEqual(r && r.rank, 3);
});

test('premio de ayer: si las reglas no dejan apuntarlo, no se da nada', async () => {
  const s = claimSetup({ d: '20261017', claimed: '' }, { net: { state: async () => ({ d: '20261017', claimed: '' }), claim: async () => false } });
  s.setRank({ pos: 1, t: 900 });
  assert.strictEqual(await s.G.Modes.get('daily').claimYesterday(), null);
  assert.deepStrictEqual(s.calls.grants, []);
});
