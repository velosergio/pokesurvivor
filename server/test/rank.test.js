/* Pruebas del ranking de grupo del servidor:  node --test server/test/rank.test.js
 *
 * Firestore y el endpoint del token se emulan en memoria con un fetch falso:
 * no se llama nunca a Google.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');
const { createRank, boardIds, toFs, fromFs } = require('../rank.js');

const PROJECT = 'demo-proj';
const ROOT = 'projects/' + PROJECT + '/databases/(default)/documents';
const API = 'https://firestore.googleapis.com/v1/' + ROOT;
const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const SA = { project_id: PROJECT, client_email: 'rank@demo-proj.iam.gserviceaccount.com', private_key_id: 'k1',
  private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }) };

// Un instante fijo: miércoles 14-10-2026 a mediodía (hora de Madrid).
const NOW = Date.UTC(2026, 9, 14, 10, 0, 0);
const IDS = boardIds(new Date(NOW));

/** Firestore falso: documentos por ruta (con `fields` tipados) y registro de llamadas. */
function fakeFirestore({ abortOnce = false } = {}) {
  const docs = new Map();
  const calls = [], begins = [];
  let txn = 0, aborted = false;
  const reply = (status, body) => ({ ok: status < 300, status, json: async () => body, text: async () => JSON.stringify(body) });
  async function fetch(url, opt) {
    calls.push(url);
    if (url === 'https://oauth2.googleapis.com/token') {
      const p = new URLSearchParams(opt.body);
      assert.strictEqual(p.get('grant_type'), 'urn:ietf:params:oauth:grant-type:jwt-bearer');
      const [h, b, s] = p.get('assertion').split('.');
      assert.ok(crypto.createVerify('RSA-SHA256').update(h + '.' + b).verify(publicKey, Buffer.from(s, 'base64url')), 'firma JWT');
      const head = JSON.parse(Buffer.from(h, 'base64url')), claims = JSON.parse(Buffer.from(b, 'base64url'));
      assert.strictEqual(head.alg, 'RS256');
      assert.strictEqual(claims.iss, SA.client_email);
      assert.strictEqual(claims.scope, 'https://www.googleapis.com/auth/datastore');
      assert.strictEqual(claims.aud, 'https://oauth2.googleapis.com/token');
      return reply(200, { access_token: 'tok', expires_in: 3600 });
    }
    assert.strictEqual(opt.headers.Authorization, 'Bearer tok');
    const verb = url.slice(API.length + 1);
    const body = JSON.parse(opt.body);
    if (verb === 'beginTransaction') { begins.push(body); return reply(200, { transaction: 'tx' + (++txn) }); }
    if (verb === 'rollback') return reply(200, {});
    if (verb === 'batchGet') {
      return reply(200, body.documents.map(n => {
        const d = docs.get(n.slice(ROOT.length + 1));
        if (!d) return { missing: n };
        let fields = d;
        if (body.mask) { fields = {}; for (const k of body.mask.fieldPaths) if (k in d) fields[k] = d[k]; }
        return { found: { name: n, fields } };
      }));
    }
    if (verb === 'commit') {
      if (abortOnce && !aborted) { aborted = true; return reply(409, { error: { code: 409, status: 'ABORTED', message: 'choque' } }); }
      for (const w of body.writes) {
        const fields = Object.assign({}, w.update.fields);
        for (const tr of w.updateTransforms || []) {
          assert.strictEqual(tr.setToServerValue, 'REQUEST_TIME');
          fields[tr.fieldPath] = { timestampValue: '2026-10-14T10:00:00Z' };
        }
        docs.set(w.update.name.slice(ROOT.length + 1), fields);
      }
      return reply(200, { commitTime: '2026-10-14T10:00:00Z' });
    }
    return reply(404, { error: { code: 404, status: 'NOT_FOUND', message: verb } });
  }
  const get = p => (docs.has(p) ? fromFs({ mapValue: { fields: docs.get(p) } }) : null);
  const set = (p, o) => docs.set(p, toFs(o).mapValue.fields);
  const commits = () => calls.filter(u => u.endsWith(':commit')).length;
  return { fetch, docs, calls, begins, get, set, commits };
}

const member = (uid, dex, shiny = false) => ({ uid, name: 'N' + uid, dex, shiny });
const run = (o = {}) => Object.assign({ t: 300, members: [member('bb', 25), member('aa', 4)], lv: 12, kills: 340 }, o);
const rankOf = fs => createRank({ serviceAccount: SA, fetch: fs.fetch, now: () => NOW });
/** Un top lleno con 50 marcas de t = base, base+1, ... */
function fullTop(base) {
  const top = {};
  for (let i = 0; i < 50; i++) top['x' + i + '_y' + i] = { t: base + i, uids: ['x' + i, 'y' + i], names: ['a', 'b'], dex: [1, 1], lv: 1, kills: 1 };
  return top;
}

test('entra en tablas vacías con el mismo formato que el navegador', async () => {
  const fs = fakeFirestore();
  const better = await rankOf(fs).submitGroup(run());
  assert.deepStrictEqual(better, ['d', 'w', 'm', 'a']);
  const boards = ['g_' + IDS.d, 'g_' + IDS.w, 'g_' + IDS.m, 'g_all2', 'g_all2_p25', 'g_all2_p4'];
  assert.strictEqual(IDS.w, 'w2026-42j');
  assert.strictEqual(IDS.m, 'm202610j');
  for (const b of boards) {
    const e = fs.get('lb/' + b + '/e/aa_bb');
    assert.deepStrictEqual(e, { t: 300, uids: ['aa', 'bb'], names: ['Naa', 'Nbb'], dex: [4, 25], shiny: [false, false],
      lv: 12, kills: 340, at: '2026-10-14T10:00:00Z' }, b);
    const s = fs.get('lbs/' + b);
    assert.deepStrictEqual(s, { top: { aa_bb: { t: 300, uids: ['aa', 'bb'], names: ['Naa', 'Nbb'], dex: [4, 25], lv: 12, kills: 340 } },
      me: 'aa_bb', ev: '' }, b);
  }
  assert.strictEqual(fs.commits(), 1);
});

test('con algún shiny, el resumen lleva shiny', async () => {
  const fs = fakeFirestore();
  await rankOf(fs).submitGroup(run({ members: [member('aa', 4, true), member('bb', 4)] }));
  assert.deepStrictEqual(fs.get('lbs/g_all2').top.aa_bb.shiny, [true, false]);
  assert.ok(fs.get('lbs/g_all2_p4'));
  assert.strictEqual(fs.get('lbs/g_all2_p25'), null);
});

test('no entra si el top está lleno y es peor', async () => {
  const fs = fakeFirestore();
  const top = fullTop(400);
  for (const b of ['g_' + IDS.d, 'g_' + IDS.w, 'g_' + IDS.m, 'g_all2', 'g_all2_p25', 'g_all2_p4']) fs.set('lbs/' + b, { top, me: 'x0_y0', ev: '' });
  const better = await rankOf(fs).submitGroup(run());
  // En diario, semanal, mensual y por Pokémon no se guarda nada; en el histórico sí la marca.
  assert.deepStrictEqual(better, ['a']);
  assert.strictEqual(fs.get('lb/g_' + IDS.d + '/e/aa_bb'), null);
  assert.strictEqual(fs.get('lb/g_all2_p25/e/aa_bb'), null);
  assert.strictEqual(fs.get('lb/g_all2/e/aa_bb').t, 300);
  assert.strictEqual(Object.keys(fs.get('lbs/g_all2').top).length, 50);
  assert.ok(!('aa_bb' in fs.get('lbs/g_all2').top));
});

test('expulsa al último del top', async () => {
  const fs = fakeFirestore();
  fs.set('lbs/g_' + IDS.d, { top: fullTop(200), me: 'x0_y0', ev: '' });
  const better = await rankOf(fs).submitGroup(run());
  assert.deepStrictEqual(better, ['d', 'w', 'm', 'a']);
  const s = fs.get('lbs/g_' + IDS.d);
  assert.strictEqual(Object.keys(s.top).length, 50);
  assert.strictEqual(s.ev, 'x0_y0');
  assert.strictEqual(s.me, 'aa_bb');
  assert.ok(!('x0_y0' in s.top));
  assert.strictEqual(s.top.aa_bb.t, 300);
});

test('no rebaja una marca mejor', async () => {
  const fs = fakeFirestore();
  const rk = rankOf(fs);
  await rk.submitGroup(run({ t: 500 }));
  const before = new Map(fs.docs);
  const better = await rk.submitGroup(run({ t: 300 }));
  assert.deepStrictEqual(better, []);
  assert.deepStrictEqual(fs.docs, before);
  assert.strictEqual(fs.commits(), 1);
  assert.deepStrictEqual(await rk.submitGroup(run({ t: 600 })), ['d', 'w', 'm', 'a']);
  assert.strictEqual(fs.get('lbs/g_all2').top.aa_bb.t, 600);
  // El token se pidió una sola vez (se guarda).
  assert.strictEqual(fs.calls.filter(u => u.includes('oauth2')).length, 1);
});

test('un miembro con sus == true bloquea la subida', async () => {
  const fs = fakeFirestore();
  fs.set('saves/bb', { sus: true, coins: 5 });
  fs.set('saves/aa', { sus: false });
  assert.deepStrictEqual(await rankOf(fs).submitGroup(run()), []);
  assert.strictEqual(fs.commits(), 0);
  assert.strictEqual(fs.get('lbs/g_all2'), null);
});

test('menos de MIN_T o un solo miembro no sube', async () => {
  const fs = fakeFirestore();
  const rk = rankOf(fs);
  assert.deepStrictEqual(await rk.submitGroup(run({ t: 119.9 })), []);
  assert.deepStrictEqual(await rk.submitGroup(run({ members: [member('aa', 4)] })), []);
  assert.strictEqual(fs.calls.length, 0);
});

test('un miembro baneado también bloquea', async () => {
  const fs = fakeFirestore();
  fs.set('saves/aa', { ban: true });
  assert.deepStrictEqual(await rankOf(fs).submitGroup(run()), []);
  assert.strictEqual(fs.commits(), 0);
});

test('datos fuera de lo que admiten las reglas no suben', async () => {
  const fs = fakeFirestore();
  const rk = rankOf(fs);
  const bad = [
    run({ members: [member('aa', 4), member('aa', 25)] }),                       // la misma cuenta dos veces
    run({ members: ['a', 'b', 'c', 'd', 'e'].map(u => member(u, 1)) }),           // 5 jugadores
    run({ members: [member('aa', 4), null] }),
    run({ members: [member('a/x', 4), member('bb', 4)] }),
    run({ members: [member('aa', 4), member('bb', 2.5)] }),
    run({ t: 3601 }), run({ t: NaN }), run({ lv: 0 }), run({ lv: 1.5 }), run({ lv: 500 }),
    run({ kills: -1 }), run({ kills: NaN }), run({ kills: 100000 })
  ];
  for (const r of bad) assert.deepStrictEqual(await rk.submitGroup(r), [], JSON.stringify(r));
  assert.strictEqual(fs.calls.length, 0);
  // El tiempo con decimales del reloj del servidor se guarda en segundos enteros.
  await rk.submitGroup(run({ t: 300.87 }));
  assert.deepStrictEqual(fs.docs.get('lb/g_all2/e/aa_bb').t, { integerValue: '300' });
});

test('empate al expulsar: sale la última, y las demás filas no se tocan', async () => {
  const fs = fakeFirestore();
  const top = fullTop(200);
  // Dos filas empatadas con la peor marca: sale la última (como sorted().pop()).
  top['x0_y0'].t = 199; top['x1_y1'].t = 199;
  fs.set('lbs/g_all2', { top, me: '', ev: '' });
  // Una fila con un tipo que JS no conserva (marca de tiempo): debe quedar igual.
  fs.docs.get('lbs/g_all2').top.mapValue.fields['x5_y5'].mapValue.fields.when = { timestampValue: '2026-01-01T00:00:00Z' };
  const raw = JSON.stringify(fs.docs.get('lbs/g_all2').top.mapValue.fields['x5_y5']);
  await rankOf(fs).submitGroup(run());
  const s = fs.docs.get('lbs/g_all2').top.mapValue.fields;
  assert.ok(!('x1_y1' in s));
  assert.ok('x0_y0' in s);
  assert.strictEqual(JSON.stringify(s['x5_y5']), raw);
});

test('sin cuenta de servicio no llama a fetch', async () => {
  let n = 0;
  const rk = createRank({ serviceAccount: null, fetch: async () => { n++; throw new Error('no'); } });
  assert.deepStrictEqual(await rk.submitGroup(run()), []);
  assert.strictEqual(n, 0);
});

test('reintenta una vez si el commit da ABORTED', async () => {
  const fs = fakeFirestore({ abortOnce: true });
  assert.deepStrictEqual(await rankOf(fs).submitGroup(run()), ['d', 'w', 'm', 'a']);
  assert.strictEqual(fs.commits(), 2);
  assert.deepStrictEqual(fs.begins[1], { options: { readWrite: { retryTransaction: 'tx1' } } });
  assert.strictEqual(fs.get('lbs/g_all2').top.aa_bb.t, 300);
});

test('conversión de tipos ida y vuelta', () => {
  const o = { i: 3, f: 2.5, neg: -7, s: 'hola', b: true, n: null, a: [1, 'x', false, [2]], e: [], m: { k: { z: 0 } }, em: {} };
  const v = toFs(o);
  assert.deepStrictEqual(v.mapValue.fields.i, { integerValue: '3' });
  assert.deepStrictEqual(v.mapValue.fields.f, { doubleValue: 2.5 });
  assert.deepStrictEqual(v.mapValue.fields.n, { nullValue: null });
  assert.deepStrictEqual(v.mapValue.fields.e, { arrayValue: {} });
  assert.deepStrictEqual(fromFs(v), o);
  assert.deepStrictEqual(fromFs(JSON.parse(JSON.stringify(v))), o);
});

// ---- fechas: lo mismo que el navegador (copia literal de js/net/ranking.js) ----
const Browser = (() => {
  const TZ = 'Europe/Madrid';
  function madridDate(date) {
    const p = {};
    for (const x of new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date)) p[x.type] = x.value;
    return { y: +p.year, m: +p.month, d: +p.day };
  }
  function isoWeek(y, m, d) {
    const t = new Date(Date.UTC(y, m - 1, d));
    const day = t.getUTCDay() || 7;
    t.setUTCDate(t.getUTCDate() + 4 - day);
    const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
    return { year: t.getUTCFullYear(), week: Math.ceil(((t - y0) / 86400000 + 1) / 7) };
  }
  const ALL = 'all2';
  function periodIds(date = new Date()) {
    const { y, m, d } = madridDate(date);
    const w = isoWeek(y, m, d);
    const p2 = n => String(n).padStart(2, '0');
    return { d: 'd' + y + p2(m) + p2(d), w: 'w' + w.year + '-' + p2(w.week), m: 'm' + y + p2(m), y: 'y' + y, a: ALL };
  }
  function boardIds(date) {
    const p = periodIds(date);
    return Object.assign({}, p, { w: p.w + 'j', m: p.m + 'j' });
  }
  return { boardIds };
})();

test('periodos en hora de Madrid, iguales que en el navegador', () => {
  const cases = [
    ['2026-10-08T12:00:00Z', 'd20261008', 'w2026-41j', 'm202610j'],
    // Cambio de semana ISO: domingo 23:30 / lunes 00:30 en Madrid (verano, UTC+2).
    ['2026-10-11T21:30:00Z', 'd20261011', 'w2026-41j', 'm202610j'],
    ['2026-10-11T22:30:00Z', 'd20261012', 'w2026-42j', 'm202610j'],
    // Fin de año: en UTC aún es 2025, en Madrid ya 2026 (jueves: semana 1 de 2026).
    ['2025-12-31T23:30:00Z', 'd20260101', 'w2026-01j', 'm202601j'],
    ['2025-12-31T22:30:00Z', 'd20251231', 'w2026-01j', 'm202512j'],
    // 2026 tiene 53 semanas: el viernes 1-1-2027 cae en la 53 de 2026.
    ['2027-01-01T12:00:00Z', 'd20270101', 'w2026-53j', 'm202701j'],
    ['2027-01-04T00:30:00Z', 'd20270104', 'w2027-01j', 'm202701j'],
    // Cambio de hora de octubre (25-10-2026, 01:00 UTC): antes UTC+2, después UTC+1.
    ['2026-10-24T22:30:00Z', 'd20261025', 'w2026-43j', 'm202610j'],
    ['2026-10-25T22:30:00Z', 'd20261025', 'w2026-43j', 'm202610j'],
    ['2026-10-25T23:30:00Z', 'd20261026', 'w2026-44j', 'm202610j'],
    // Cambio de hora de marzo (29-03-2026, 01:00 UTC).
    ['2026-03-28T23:30:00Z', 'd20260329', 'w2026-13j', 'm202603j'],
    ['2026-03-31T22:30:00Z', 'd20260401', 'w2026-14j', 'm202604j']
  ];
  for (const [iso, d, w, m] of cases) {
    const got = boardIds(new Date(iso));
    assert.deepStrictEqual({ d: got.d, w: got.w, m: got.m, a: got.a }, { d, w, m, a: 'all2' }, iso);
    assert.deepStrictEqual(got, Browser.boardIds(new Date(iso)), iso);
  }
  // Y cada 3 horas de un año entero.
  for (let t = Date.UTC(2026, 0, 1); t < Date.UTC(2027, 0, 8); t += 3 * 3600 * 1000) {
    assert.deepStrictEqual(boardIds(new Date(t)), Browser.boardIds(new Date(t)));
  }
});
