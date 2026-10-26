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

// Un instante fijo: miércoles 14-10-2026 a las 05:00 (hora de Colombia).
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
        // Máscara con rutas "a.b": sólo esas ramas de los mapas (como Firestore).
        if (body.mask) {
          fields = {};
          for (const k of body.mask.fieldPaths) {
            const [top, ...rest] = k.split('.');
            if (!(top in d)) continue;
            if (!rest.length) { fields[top] = d[top]; continue; }
            let src = d[top], dst = fields[top] = fields[top] || { mapValue: { fields: {} } };
            for (let i = 0; i < rest.length && src && src.mapValue; i++) {
              const f = (src.mapValue.fields || {})[rest[i]];
              if (!f) break;
              if (i === rest.length - 1) dst.mapValue.fields[rest[i]] = f;
              else { dst = dst.mapValue.fields[rest[i]] = dst.mapValue.fields[rest[i]] || { mapValue: { fields: {} } }; src = f; }
            }
          }
        }
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
const run = (o = {}) => Object.assign({ t: 700, members: [member('bb', 25), member('aa', 4)], lv: 12, kills: 340 }, o);
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
  const boards = ['g_' + IDS.d, 'g_' + IDS.w, 'g_' + IDS.m, 'g_all4', 'g_all4_p25', 'g_all4_p4'];
  assert.strictEqual(IDS.w, 'w2026-42a');
  assert.strictEqual(IDS.m, 'm202610a');
  for (const b of boards) {
    const e = fs.get('lb/' + b + '/e/aa_bb');
    assert.deepStrictEqual(e, { t: 700, uids: ['aa', 'bb'], names: ['Naa', 'Nbb'], dex: [4, 25], shiny: [false, false],
      lv: 12, kills: 340, dmg: 0, at: '2026-10-14T10:00:00Z' }, b);
    const s = fs.get('lbs/' + b);
    assert.deepStrictEqual(s, { top: { aa_bb: { t: 700, uids: ['aa', 'bb'], names: ['Naa', 'Nbb'], dex: [4, 25], lv: 12, kills: 340 } },
      me: 'aa_bb', ev: '' }, b);
  }
  assert.strictEqual(fs.commits(), 1);
});

test('con algún shiny, el resumen lleva shiny', async () => {
  const fs = fakeFirestore();
  await rankOf(fs).submitGroup(run({ members: [member('aa', 4, true), member('bb', 4)] }));
  assert.deepStrictEqual(fs.get('lbs/g_all4').top.aa_bb.shiny, [true, false]);
  assert.ok(fs.get('lbs/g_all4_p4'));
  assert.strictEqual(fs.get('lbs/g_all4_p25'), null);
});

test('la build de cada miembro va en la marca y en el resumen, en el orden de los uids', async () => {
  const fs = fakeFirestore();
  const long = 'x'.repeat(500);
  await rankOf(fs).submitGroup(run({ members: [Object.assign(member('bb', 25), { b: 'ember.3;;atk1' }), Object.assign(member('aa', 4), { b: long })] }));
  const want = ['x'.repeat(400), 'ember.3;;atk1'];
  assert.deepStrictEqual(fs.get('lb/g_all4/e/aa_bb').b, want);
  assert.deepStrictEqual(fs.get('lbs/g_all4').top.aa_bb.b, want);
});

test('sin builds (servidor viejo), ni la marca ni el resumen llevan b', async () => {
  const fs = fakeFirestore();
  await rankOf(fs).submitGroup(run({ members: [Object.assign(member('bb', 25), { b: 7 }), member('aa', 4)] }));
  assert.ok(!('b' in fs.get('lb/g_all4/e/aa_bb')));
  assert.ok(!('b' in fs.get('lbs/g_all4').top.aa_bb));
});

test('no entra si el top está lleno y es peor', async () => {
  const fs = fakeFirestore();
  const top = fullTop(800);
  for (const b of ['g_' + IDS.d, 'g_' + IDS.w, 'g_' + IDS.m, 'g_all4', 'g_all4_p25', 'g_all4_p4']) fs.set('lbs/' + b, { top, me: 'x0_y0', ev: '' });
  const better = await rankOf(fs).submitGroup(run());
  // En diario, semanal, mensual y por Pokémon no se guarda nada; en el histórico sí la marca.
  assert.deepStrictEqual(better, ['a']);
  assert.strictEqual(fs.get('lb/g_' + IDS.d + '/e/aa_bb'), null);
  assert.strictEqual(fs.get('lb/g_all4_p25/e/aa_bb'), null);
  assert.strictEqual(fs.get('lb/g_all4/e/aa_bb').t, 700);
  assert.strictEqual(Object.keys(fs.get('lbs/g_all4').top).length, 50);
  assert.ok(!('aa_bb' in fs.get('lbs/g_all4').top));
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
  assert.strictEqual(s.top.aa_bb.t, 700);
});

test('no rebaja una marca mejor', async () => {
  const fs = fakeFirestore();
  const rk = rankOf(fs);
  await rk.submitGroup(run({ t: 900 }));
  const before = new Map(fs.docs);
  const better = await rk.submitGroup(run({ t: 700 }));
  assert.deepStrictEqual(better, []);
  assert.deepStrictEqual(fs.docs, before);
  assert.strictEqual(fs.commits(), 1);
  assert.deepStrictEqual(await rk.submitGroup(run({ t: 1000 })), ['d', 'w', 'm', 'a']);
  assert.strictEqual(fs.get('lbs/g_all4').top.aa_bb.t, 1000);
  // El token se pidió una sola vez (se guarda).
  assert.strictEqual(fs.calls.filter(u => u.includes('oauth2')).length, 1);
});

test('un miembro con sus == true bloquea la subida', async () => {
  const fs = fakeFirestore();
  fs.set('saves/bb', { sus: true, coins: 5 });
  fs.set('saves/aa', { sus: false });
  assert.deepStrictEqual(await rankOf(fs).submitGroup(run()), []);
  assert.strictEqual(fs.commits(), 0);
  assert.strictEqual(fs.get('lbs/g_all4'), null);
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
    run({ members: 'abcdefghijk'.split('').map(u => member(u, 1)) }),            // 11 jugadores
    run({ members: [member('aa', 4), null] }),
    run({ members: [member('a/x', 4), member('bb', 4)] }),
    run({ members: [member('aa', 4), member('bb', 2.5)] }),
    run({ t: 3601 }), run({ t: NaN }), run({ lv: 0 }), run({ lv: 1.5 }), run({ lv: 500 }),
    run({ kills: -1 }), run({ kills: NaN }), run({ kills: 100000 })
  ];
  for (const r of bad) assert.deepStrictEqual(await rk.submitGroup(r), [], JSON.stringify(r));
  assert.strictEqual(fs.calls.length, 0);
  // El tiempo con decimales del reloj del servidor se guarda en segundos enteros.
  await rk.submitGroup(run({ t: 700.87 }));
  assert.deepStrictEqual(fs.docs.get('lb/g_all4/e/aa_bb').t, { integerValue: '700' });
});

test('empate al expulsar: sale la última, y las demás filas no se tocan', async () => {
  const fs = fakeFirestore();
  const top = fullTop(200);
  // Dos filas empatadas con la peor marca: sale la última (como sorted().pop()).
  top['x0_y0'].t = 199; top['x1_y1'].t = 199;
  fs.set('lbs/g_all4', { top, me: '', ev: '' });
  // Una fila con un tipo que JS no conserva (marca de tiempo): debe quedar igual.
  fs.docs.get('lbs/g_all4').top.mapValue.fields['x5_y5'].mapValue.fields.when = { timestampValue: '2026-01-01T00:00:00Z' };
  const raw = JSON.stringify(fs.docs.get('lbs/g_all4').top.mapValue.fields['x5_y5']);
  await rankOf(fs).submitGroup(run());
  const s = fs.docs.get('lbs/g_all4').top.mapValue.fields;
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
  assert.strictEqual(fs.get('lbs/g_all4').top.aa_bb.t, 700);
});

test('daño a Arceus: va en la marca y en dtop de las tablas de periodo, no en las de cada Pokémon', async () => {
  const fs = fakeFirestore();
  const rk = rankOf(fs);
  await rk.submitGroup(run({ dmg: 5000.7 }));
  const s = fs.get('lbs/g_all4');
  assert.deepStrictEqual(s.dtop, { aa_bb: { d: 5000, uids: ['aa', 'bb'], names: ['Naa', 'Nbb'], dex: [4, 25] } });
  assert.strictEqual(s.dev, '');
  assert.strictEqual(fs.get('lb/g_all4/e/aa_bb').dmg, 5000);
  assert.ok(!('dtop' in fs.get('lbs/g_all4_p4')));
  assert.strictEqual(fs.get('lb/g_all4_p4/e/aa_bb').dmg, 0);
  // Más daño con menos tiempo: sube el daño y se queda el mejor tiempo.
  assert.deepStrictEqual(await rk.submitGroup(run({ t: 650, lv: 9, dmg: 9000 })), ['d', 'w', 'm', 'a']);
  const e = fs.get('lb/g_all4/e/aa_bb');
  assert.strictEqual(e.t, 700); assert.strictEqual(e.lv, 12); assert.strictEqual(e.dmg, 9000);
  assert.strictEqual(fs.get('lbs/g_all4').dtop.aa_bb.d, 9000);
  assert.strictEqual(fs.get('lbs/g_all4').top.aa_bb.t, 700);
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

// ---- fechas: lo mismo que el navegador (copia literal de G.U.gameDate y js/net/ranking.js) ----
const Browser = (() => {
  const G = { Config: require('../config').readConfig() };
  function gameDate(date = new Date()) {
    const p = {};
    for (const x of new Intl.DateTimeFormat('en-CA', { timeZone: G.Config.tz, hourCycle: 'h23', year: 'numeric', month: '2-digit',
      day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(date)) p[x.type] = x.value;
    const y = +p.year, m = +p.month, d = +p.day;
    return { y, m, d, h: +p.hour, mi: +p.minute, s: +p.second, wd: new Date(Date.UTC(y, m - 1, d)).getUTCDay() || 7 };
  }
  function isoWeek(y, m, d) {
    const t = new Date(Date.UTC(y, m - 1, d));
    const day = t.getUTCDay() || 7;
    t.setUTCDate(t.getUTCDate() + 4 - day);
    const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
    return { year: t.getUTCFullYear(), week: Math.ceil(((t - y0) / 86400000 + 1) / 7) };
  }
  const ALL = 'all4';
  function periodIds(date = new Date()) {
    const { y, m, d } = gameDate(date);
    const w = isoWeek(y, m, d);
    const p2 = n => String(n).padStart(2, '0');
    return { d: 'd' + y + p2(m) + p2(d), w: 'w' + w.year + '-' + p2(w.week), m: 'm' + y + p2(m), y: 'y' + y, a: ALL };
  }
  function boardIds(date) {
    const p = periodIds(date);
    return Object.assign({}, p, { d: p.d + 'a', w: p.w + 'a', m: p.m + 'a', y: p.y + 'a' });
  }
  return { boardIds };
})();

test('periodos en hora de Colombia, iguales que en el navegador', () => {
  assert.strictEqual(require('../config').readConfig().tz, 'America/Bogota');
  const cases = [
    ['2026-10-08T12:00:00Z', 'd20261008a', 'w2026-41a', 'm202610a'],
    // Cambio de semana ISO: domingo 23:30 / lunes 00:30 en Colombia (UTC-5).
    ['2026-10-12T04:30:00Z', 'd20261011a', 'w2026-41a', 'm202610a'],
    ['2026-10-12T05:30:00Z', 'd20261012a', 'w2026-42a', 'm202610a'],
    // Fin de año: en UTC ya es 2026, en Colombia aún 2025 (miércoles: semana 1 de 2026).
    ['2026-01-01T04:30:00Z', 'd20251231a', 'w2026-01a', 'm202512a'],
    ['2026-01-01T05:30:00Z', 'd20260101a', 'w2026-01a', 'm202601a'],
    // 2026 tiene 53 semanas: el viernes 1-1-2027 cae en la 53 de 2026.
    ['2027-01-01T12:00:00Z', 'd20270101a', 'w2026-53a', 'm202701a'],
    ['2027-01-04T05:30:00Z', 'd20270104a', 'w2027-01a', 'm202701a'],
    // Colombia no cambia de hora: el 25-10 (cuando cambia Europa) sigue en UTC-5.
    ['2026-10-25T04:30:00Z', 'd20261024a', 'w2026-43a', 'm202610a'],
    ['2026-10-25T05:30:00Z', 'd20261025a', 'w2026-43a', 'm202610a'],
    ['2026-03-29T04:59:00Z', 'd20260328a', 'w2026-13a', 'm202603a'],
    ['2026-04-01T05:00:00Z', 'd20260401a', 'w2026-14a', 'm202604a']
  ];
  for (const [iso, d, w, m] of cases) {
    const got = boardIds(new Date(iso));
    assert.deepStrictEqual({ d: got.d, w: got.w, m: got.m, a: got.a }, { d, w, m, a: 'all4' }, iso);
    assert.deepStrictEqual(got, Browser.boardIds(new Date(iso)), iso);
  }
  // Y cada 3 horas de un año entero.
  for (let t = Date.UTC(2026, 0, 1); t < Date.UTC(2027, 0, 8); t += 3 * 3600 * 1000) {
    assert.deepStrictEqual(boardIds(new Date(t)), Browser.boardIds(new Date(t)));
  }
});

test('checkKits: mejoras = lo menos entre navegador y partida guardada; ok si el Pokémon y el shiny son suyos', async () => {
  const fs = fakeFirestore();
  fs.set('saves/aa', { save: { pupg: { 25: { hp: 3, spd: 1 } }, owned: { 25: { at: 1 } }, shiny: {}, coins: 99, name: 'Ana' } });
  fs.set('saves/bb', { save: { pupg: {}, owned: { 4: { at: 1 } }, shiny: { 4: { at: 1 } } } });
  fs.set('saves/cc', { save: { pupg: { 7: { atk: 5 } }, owned: { 7: { at: 1 } } }, ban: true });
  const res = await rankOf(fs).checkKits([
    { uid: 'aa', dex: 25, shiny: false, up: { hp: 10, spd: 1, atk: 4 } },
    { uid: 'bb', dex: 4, shiny: true, up: { hp: 2 } },
    { uid: 'cc', dex: 7, shiny: false, up: { atk: 5 } },
    { uid: 'dd', dex: 1, shiny: false, up: { hp: 1 } },
    { uid: 'aa2', dex: 25, shiny: true, up: {} }
  ]);
  assert.deepStrictEqual(res.get('aa'), { up: { hp: 3, spd: 1 }, ok: true });
  assert.deepStrictEqual(res.get('bb'), { up: {}, ok: true });
  assert.deepStrictEqual(res.get('cc'), { up: { atk: 5 }, ok: false }, 'baneada');
  assert.deepStrictEqual(res.get('dd'), { up: {}, ok: false }, 'sin partida guardada');
  assert.strictEqual(res.get('aa2').ok, false);
  // Sólo se piden esas ramas (no la partida entera).
  const body = fs.calls.filter(u => u.endsWith(':batchGet')).length;
  assert.strictEqual(body, 1);
});

test('sin cuenta de servicio no hay checkKits', () => {
  assert.strictEqual(createRank({ serviceAccount: null }).checkKits, null);
});
