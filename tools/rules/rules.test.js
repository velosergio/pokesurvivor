/* Pruebas de firestore.rules con el emulador de Firestore (ranking).
 *
 *   cd tools/rules && npm install     (una vez)
 *   npm test --prefix tools/rules     (desde la raíz; arranca y para el emulador)
 *
 * Lo que se comprueba (spec del cooperativo, §3.6):
 *   - un navegador sigue pudiendo subir su marca de solitario (s_...) y su fila del top;
 *   - no puede escribir en las tablas de grupo (g_...): ni la marca ni el resumen;
 *   - su fila del top tiene que ser su marca campo a campo (también nivel,
 *     derrotados y shiny);
 *   - al borrar la cuenta puede seguir quitando sus filas de grupo del top.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
const firebase = require('firebase/compat/app');
require('firebase/compat/firestore');

const RULES = fs.readFileSync(process.env.RULES_FILE || path.join(__dirname, '..', '..', 'firestore.rules'), 'utf8');
const ts = () => firebase.firestore.FieldValue.serverTimestamp();
const S = 's_d20261014', GB = 'g_d20261014';

let env;
test.before(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-pokesurvivor', firestore: { rules: RULES } });
});
test.after(async () => { if (env) await env.cleanup(); });
test.beforeEach(async () => {
  await env.clearFirestore();
  // Partidas guardadas (las reglas miran saves/{uid}.ban) y la hora de empezar (runs/{uid}).
  await env.withSecurityRulesDisabled(async ctx => {
    const db = ctx.firestore();
    const hourAgo = firebase.firestore.Timestamp.fromMillis(Date.now() - 3600 * 1000);
    for (const u of ['ana', 'bea']) {
      await db.doc('saves/' + u).set({ coins: 0 });
      await db.doc('runs/' + u).set({ startedAt: hourAgo, mode: 's' });
    }
  });
});

const entry = (o = {}) => Object.assign({ t: 300, uids: ['ana'], names: ['Ana'], dex: [25], shiny: [false], lv: 10, kills: 100, at: ts() }, o);
const row = (o = {}) => Object.assign({ t: 300, uids: ['ana'], names: ['Ana'], dex: [25], lv: 10, kills: 100 }, o);

/** Marca + resumen en el mismo lote (como la transacción de js/net/ranking.js). */
function submit(db, board, id, e, r) {
  const b = db.batch();
  b.set(db.doc(`lb/${board}/e/${id}`), e);
  b.set(db.doc('lbs/' + board), { top: { [id]: r }, me: id, ev: '' });
  return b.commit();
}

test('solitario: la marca y su fila del top se pueden subir', async () => {
  const db = env.authenticatedContext('ana').firestore();
  await assertSucceeds(submit(db, S, 'ana', entry(), row()));
});

test('solitario: con shiny, la fila lo lleva igual que la marca', async () => {
  const db = env.authenticatedContext('ana').firestore();
  await assertFails(submit(db, S, 'ana', entry({ shiny: [true] }), row()));
  await assertSucceeds(submit(db, S, 'ana', entry({ shiny: [true] }), row({ shiny: [true] })));
});

test('solitario: el daño a Arceus va en la marca y en dtop, igual que la marca', async () => {
  const db = env.authenticatedContext('ana').firestore();
  const drow = (o = {}) => Object.assign({ d: 5000, uids: ['ana'], names: ['Ana'], dex: [25] }, o);
  const both = (e, r, d) => {
    const b = db.batch();
    b.set(db.doc(`lb/${S}/e/ana`), e);
    b.set(db.doc('lbs/' + S), { top: { ana: r }, dtop: { ana: d }, me: 'ana', ev: '', dev: '' });
    return b.commit();
  };
  await assertFails(both(entry({ dmg: 5000 }), row(), drow({ d: 9000 })));
  await assertFails(both(entry({ dmg: 5.5 }), row(), drow({ d: 5.5 })));
  await assertSucceeds(both(entry({ dmg: 5000 }), row(), drow()));
  // Más daño con el mismo tiempo: mejora (el tiempo no baja).
  await assertSucceeds(both(entry({ dmg: 7000 }), row(), drow({ d: 7000 })));
  // Ni menos tiempo ni menos daño.
  await assertFails(both(entry({ t: 200, lv: 5, dmg: 9000 }), row({ t: 200, lv: 5 }), drow({ d: 9000 })));
});

test('solitario: la build (opcional) va igual en la marca y en su fila, y es corta', async () => {
  const db = env.authenticatedContext('ana').firestore();
  const b = ['ember.7*+bite.3|growl.2;lifeorb;atk4,cd2'];
  await assertSucceeds(submit(db, S, 'ana', entry({ t: 310, b }), row({ t: 310, b })));
  await assertFails(submit(db, S, 'ana', entry({ t: 320, b }), row({ t: 320 })));
  await assertFails(submit(db, S, 'ana', entry({ t: 320 }), row({ t: 320, b })));
  await assertFails(submit(db, S, 'ana', entry({ t: 320, b }), row({ t: 320, b: ['ember.9;;'] })));
  await assertFails(submit(db, S, 'ana', entry({ t: 320, b: ['x'.repeat(401)] }), row({ t: 320, b: ['x'.repeat(401)] })));
  await assertFails(submit(db, S, 'ana', entry({ t: 320, b: ['a', 'b'] }), row({ t: 320, b: ['a', 'b'] })));
  await assertFails(submit(db, S, 'ana', entry({ t: 320, b: [7] }), row({ t: 320, b: [7] })));
});

test('solitario: la fila del top no puede inflar nivel ni derrotados', async () => {
  const db = env.authenticatedContext('ana').firestore();
  await assertFails(submit(db, S, 'ana', entry(), row({ lv: 50 })));
  await assertFails(submit(db, S, 'ana', entry(), row({ kills: 9999 })));
  await assertFails(submit(db, S, 'ana', entry(), row({ extra: 1 })));
});

test('grupo: un navegador no puede escribir la marca de grupo', async () => {
  const db = env.authenticatedContext('ana').firestore();
  const e = entry({ uids: ['ana', 'bea'], names: ['Ana', 'Bea'], dex: [25, 4], shiny: [false, false] });
  await assertFails(db.doc(`lb/${GB}/e/ana_bea`).set(e));
  await assertFails(submit(db, GB, 'ana_bea', e, row({ uids: ['ana', 'bea'], names: ['Ana', 'Bea'], dex: [25, 4] })));
});

test('grupo: tampoco el resumen del top aunque la marca la haya puesto el servidor', async () => {
  const e = { t: 400, uids: ['ana', 'bea'], names: ['Ana', 'Bea'], dex: [25, 4], shiny: [false, false], lv: 12, kills: 200 };
  await env.withSecurityRulesDisabled(ctx => ctx.firestore().doc(`lb/${GB}/e/ana_bea`).set(e));
  const db = env.authenticatedContext('ana').firestore();
  const { shiny, ...r } = e;
  await assertFails(db.doc('lbs/' + GB).set({ top: { ana_bea: r }, me: 'ana_bea', ev: '' }));
});

test('grupo: al borrar la cuenta quitas tu fila del top y tu marca', async () => {
  const e = { t: 400, uids: ['ana', 'bea'], names: ['Ana', 'Bea'], dex: [25, 4], shiny: [false, false], lv: 12, kills: 200 };
  const { shiny, ...r } = e;
  await env.withSecurityRulesDisabled(async ctx => {
    const db = ctx.firestore();
    await db.doc(`lb/${GB}/e/ana_bea`).set(e);
    await db.doc('lbs/' + GB).set({ top: { ana_bea: r }, me: 'ana_bea', ev: '' });
  });
  const db = env.authenticatedContext('ana').firestore();
  await assertSucceeds(db.doc('lbs/' + GB).set({ top: {}, me: '', ev: 'ana_bea' }));
  await assertSucceeds(db.doc(`lb/${GB}/e/ana_bea`).delete());
});

test('el ranking se puede leer con sesión', async () => {
  const db = env.authenticatedContext('bea').firestore();
  await assertSucceeds(db.doc('lbs/' + GB).get());
  await assertFails(env.unauthenticatedContext().firestore().doc('lbs/' + GB).get());
});

// ---------- libreta de regalos (js/ui/debug-ui.js) ----------
const ADMIN = 'MufTp04DgIR02OExhPau6TopYzo2';
const gift = (o = {}) => Object.assign({ coins: 0, t10: 0, at: ts() }, o);

test('libreta: el moderador da un Pokémon y luego otro, de uno en uno', async () => {
  const db = env.authenticatedContext(ADMIN).firestore();
  await assertSucceeds(db.doc('grants/ana').set(gift({ mons: { 25: true }, shinies: {} })));
  await assertSucceeds(db.doc('grants/ana').set(gift({ mons: { 25: true }, shinies: { 150: true } })));
  await assertFails(db.doc('grants/ana').set(gift({ mons: { 25: true, 1: true, 4: true }, shinies: { 150: true } })));
  // Las monedas conservan los Pokémon; quitarlos no se puede.
  await assertSucceeds(db.doc('grants/ana').set(gift({ coins: 100000, mons: { 25: true }, shinies: { 150: true } })));
  await assertFails(db.doc('grants/ana').set(gift({ coins: 200000 })));
});

test('libreta: un jugador no se regala Pokémon', async () => {
  const db = env.authenticatedContext('ana').firestore();
  await assertFails(db.doc('grants/ana').set(gift({ mons: { 25: true } })));
});

// ---------- Desafío diario (js/net/daily-net.js) ----------
/** 'AAAAMMDD' de una fecha en hora de Colombia (UTC-5, sin cambio de hora). */
const colDay = (ms = Date.now()) => new Date(ms - 5 * 3600 * 1000).toISOString().slice(0, 10).replace(/-/g, '');
const TODAY = colDay(), YDAY = colDay(Date.now() - 86400000);
const start = (d, claimed = '') => ({ d, at: ts(), claimed });

test('diario: el intento se crea y no se repite el mismo día', async () => {
  const db = env.authenticatedContext('ana').firestore();
  await assertSucceeds(db.doc('daily/ana').set(start(TODAY)));
  await assertFails(db.doc('daily/ana').set(start(TODAY)));
});

test('diario: no se vuelve a un día anterior ni se inventa uno lejano', async () => {
  const db = env.authenticatedContext('ana').firestore();
  await assertFails(db.doc('daily/ana').set(start('20200101')));
  await assertFails(db.doc('daily/ana').set(start(colDay(Date.now() + 3 * 86400000))));
  await env.withSecurityRulesDisabled(ctx => ctx.firestore().doc('daily/ana').set({ d: TODAY, at: ts(), claimed: '' }));
  await assertFails(db.doc('daily/ana').set(start(YDAY)));
});

test('diario: al empezar no se toca lo cobrado ni otros campos', async () => {
  const db = env.authenticatedContext('ana').firestore();
  await env.withSecurityRulesDisabled(ctx => ctx.firestore().doc('daily/ana').set({ d: YDAY, at: ts(), claimed: '' }));
  await assertFails(db.doc('daily/ana').set(start(TODAY, YDAY)));
  await assertFails(db.doc('daily/ana').set(Object.assign(start(TODAY), { extra: 1 })));
  await assertSucceeds(db.doc('daily/ana').set(start(TODAY)));
});

test('diario: nadie escribe ni lee el intento de otro', async () => {
  const db = env.authenticatedContext('bea').firestore();
  await assertFails(db.doc('daily/ana').set(start(TODAY)));
  await assertFails(db.doc('daily/ana').get());
});

test('diario: la marca x_ sólo con el intento de ese día', async () => {
  const db = env.authenticatedContext('ana').firestore();
  await assertFails(submit(db, 'x_d' + TODAY, 'ana', entry(), row()));
  await env.withSecurityRulesDisabled(ctx => ctx.firestore().doc('daily/ana').set({ d: TODAY, at: ts(), claimed: '' }));
  await assertSucceeds(submit(db, 'x_d' + TODAY, 'ana', entry(), row()));
  await assertFails(submit(db, 'x_d' + YDAY, 'ana', entry(), row()));
  await assertFails(submit(db, 'x_dhola', 'ana', entry(), row()));
});

test('diario: el premio se cobra una vez, de un día jugado y ya cerrado', async () => {
  const db = env.authenticatedContext('ana').firestore();
  const old = '20260101';
  await env.withSecurityRulesDisabled(ctx => ctx.firestore().doc('daily/ana').set({ d: old, at: ts(), claimed: '' }));
  await assertFails(db.doc('daily/ana').update({ claimed: '20260102' }), 'un día que no jugó');
  await assertSucceeds(db.doc('daily/ana').update({ claimed: old }));
  await assertFails(db.doc('daily/ana').update({ claimed: old }), 'dos veces');
  await assertFails(db.doc('daily/ana').update({ claimed: '20251231' }), 'hacia atrás');
  // Hoy aún no ha cerrado (hasta mañana a la 01:30).
  await env.withSecurityRulesDisabled(ctx => ctx.firestore().doc('daily/bea').set({ d: TODAY, at: ts(), claimed: '' }));
  const dbB = env.authenticatedContext('bea').firestore();
  await assertFails(dbB.doc('daily/bea').update({ claimed: TODAY }));
});

test('diario: una sola marca por día en la tabla (no se puede mejorar)', async () => {
  const db = env.authenticatedContext('ana').firestore();
  await env.withSecurityRulesDisabled(ctx => ctx.firestore().doc('daily/ana').set({ d: TODAY, at: ts(), claimed: '' }));
  await assertSucceeds(submit(db, 'x_d' + TODAY, 'ana', entry(), row()));
  await assertFails(submit(db, 'x_d' + TODAY, 'ana', entry({ t: 600 }), row({ t: 600 })));
  // En solitario se sigue pudiendo mejorar.
  await assertSucceeds(submit(db, S, 'ana', entry(), row()));
  await assertSucceeds(submit(db, S, 'ana', entry({ t: 600 }), row({ t: 600 })));
});
