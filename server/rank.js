/* ============ rank.js — ranking de grupo escrito por el servidor ============
 *
 * Al acabar una partida en cooperativo, el servidor (que mide el tiempo con su
 * propio reloj y conoce los uids reales) sube la marca del equipo con la cuenta
 * de servicio, que salta las reglas de Firestore. Escribe EXACTAMENTE lo mismo
 * que escribía el navegador (js/net/ranking.js, submitGroupNow y store):
 *
 *   lbs/{tabla}        { top:  { id: { t, uids, names, dex, shiny?, lv, kills, b? } },
 *                        dtop: { id: { d, uids, names, dex, shiny? } }, me, ev, dev }
 *   lb/{tabla}/e/{id}  { t, uids, names, dex, shiny, lv, kills, b?, dmg, at }
 *   (b = la build de cada miembro, Player.buildCode; dmg / dtop = daño a Arceus,
 *    del original desde el 23-10-2026: no en las tablas de cada Pokémon)
 *
 *   tabla = g_<periodo> (diario, semanal, mensual, histórico) y g_all4_p<dex>
 *   por cada Pokémon distinto del equipo (desde MIN_T_MON); id = uids ordenados unidos con "_".
 *
 * Antes mira saves/{uid}.sus de cada miembro: si alguno está marcado, no sube.
 * Habla con Firestore por REST (sin dependencias): un token OAuth sacado de un
 * JWT firmado con la clave de la cuenta de servicio, y una sola transacción con
 * todas las tablas (se reintenta una vez si choca con otra escritura).
 *
 * Los periodos se cuentan en la hora del juego (G.Config.tz de js/config.js),
 * como en el navegador (G.U.gameDate).
 */
'use strict';
const crypto = require('crypto');
const { readConfig } = require('./config');

const TZ = readConfig().tz;
const PERIODS = ['d', 'w', 'm', 'a'];
/** Periodos en los que sólo se guarda la marca si entra en el top (como en ranking.js). */
const TOP_ONLY = new Set(['d', 'w', 'm', 'p']);
const TOP = 50;
/** Las partidas de menos de 2 minutos no se suben. */
const MIN_T = 120;
const ALL = 'all4';
/** En el histórico de cada Pokémon, desde 10 min (como MIN_T_MON en ranking.js). */
const MIN_T_MON = 600;
/** Hasta 1 h (como validEntry en firestore.rules) y de 2 a 10 jugadores (como las salas). */
const MAX_T = 3600, MAX_TEAM = 10;
/** Largo máximo de la build de cada miembro (como Player.BUILD_MAX y firestore.rules). */
const BUILD_MAX = 400;
/** Tiempo máximo de cada petición a Google (ms). */
const TIMEOUT = 15000;

const SCOPE = 'https://www.googleapis.com/auth/datastore';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';

// ---------------- periodos (copia de G.U.gameDate y js/net/ranking.js) ----------------

function gameDate(date) {
  const p = {};
  for (const x of new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date)) p[x.type] = x.value;
  return { y: +p.year, m: +p.month, d: +p.day };
}

/** Semana ISO (lunes a domingo) de una fecha y-m-d. */
function isoWeek(y, m, d) {
  const t = new Date(Date.UTC(y, m - 1, d));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return { year: t.getUTCFullYear(), week: Math.ceil(((t - y0) / 86400000 + 1) / 7) };
}

function periodIds(date) {
  const { y, m, d } = gameDate(date);
  const w = isoWeek(y, m, d);
  const p2 = n => String(n).padStart(2, '0');
  return { d: 'd' + y + p2(m) + p2(d), w: 'w' + w.year + '-' + p2(w.week), m: 'm' + y + p2(m), y: 'y' + y, a: ALL };
}

/** Nombres de las tablas: con una "a" detrás (23-10-2026, todas desde cero con el daño a Arceus; ver ranking.js). */
const GEN = 'a';
function boardIds(date) {
  const p = periodIds(date);
  return Object.assign({}, p, { d: p.d + GEN, w: p.w + GEN, m: p.m + GEN, y: p.y + GEN });
}

// ---------------- valores de Firestore ----------------

/** Valor JS → valor tipado de Firestore REST. */
function toFs(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'string') return { stringValue: v };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (Array.isArray(v)) return { arrayValue: v.length ? { values: v.map(toFs) } : {} };
  if (typeof v === 'object') return { mapValue: { fields: fieldsOf(v) } };
  throw new Error('rank: tipo no soportado ' + typeof v);
}
/** Objeto JS → `fields` de un documento. */
function fieldsOf(o) {
  const f = {};
  for (const [k, x] of Object.entries(o)) if (x !== undefined) f[k] = toFs(x);
  return f;
}
/** Valor tipado de Firestore → valor JS (las marcas de tiempo, como texto ISO). */
function fromFs(v) {
  if (!v || 'nullValue' in v) return null;
  if ('booleanValue' in v) return v.booleanValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return Number(v.doubleValue);
  if ('stringValue' in v) return v.stringValue;
  if ('timestampValue' in v) return v.timestampValue;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(fromFs);
  if ('mapValue' in v) return objOf(v.mapValue.fields);
  return null;
}
/** `fields` de un documento → objeto JS. */
function objOf(fields) {
  const o = {};
  for (const [k, x] of Object.entries(fields || {})) o[k] = fromFs(x);
  return o;
}

// ---------------- ranking ----------------

/**
 * @param {object} o
 * @param {object|null} o.serviceAccount  JSON de la cuenta de servicio (null → no hace nada)
 * @param {Function} [o.fetch]            por defecto el fetch global
 * @param {Function} [o.now]              → milisegundos (por defecto Date.now)
 */
function createRank({ serviceAccount, fetch: fetchFn = globalThis.fetch, now = Date.now } = {}) {
  if (!serviceAccount) return { submitGroup: async () => [], checkKits: null };
  const sa = serviceAccount;
  const ROOT = 'projects/' + sa.project_id + '/databases/(default)/documents';
  const API = 'https://firestore.googleapis.com/v1/' + ROOT;
  const name = path => ROOT + '/' + path;

  // ---- token OAuth (se guarda hasta 1 min antes de caducar) ----
  let tok = null, tokUntil = 0, tokP = null;
  const b64u = x => Buffer.from(x).toString('base64url');
  function token() {
    if (tok && now() < tokUntil) return Promise.resolve(tok);
    // Varias partidas que acaban a la vez comparten la misma petición.
    if (!tokP) tokP = newToken().finally(() => { tokP = null; });
    return tokP;
  }
  async function newToken() {
    const iat = Math.floor(now() / 1000);
    const head = b64u(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: sa.private_key_id }));
    const body = b64u(JSON.stringify({ iss: sa.client_email, scope: SCOPE, aud: TOKEN_URL, iat, exp: iat + 3600 }));
    const sig = crypto.createSign('RSA-SHA256').update(head + '.' + body).sign(sa.private_key).toString('base64url');
    const r = await fetchFn(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: head + '.' + body + '.' + sig }).toString(),
      signal: AbortSignal.timeout(TIMEOUT)
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.access_token) throw new Error('rank: token ' + r.status + ' ' + (j.error || ''));
    tok = j.access_token;
    tokUntil = now() + ((j.expires_in || 3600) - 60) * 1000;
    return tok;
  }

  /** POST a la API de documentos. → JSON (lanza con .status = 'ABORTED' etc. si falla) */
  async function call(verb, body) {
    const r = await fetchFn(API + ':' + verb, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + await token() },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT)
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      const e = new Error('rank: ' + verb + ' ' + r.status + ' ' + ((j.error && j.error.message) || ''));
      e.code = r.status; e.status = j.error && j.error.status;
      throw e;
    }
    return j;
  }

  /** Lee varios documentos. → Map(ruta → `fields` tal cual | null) */
  async function getAll(paths, extra) {
    const res = await call('batchGet', Object.assign({ documents: paths.map(name) }, extra));
    const out = new Map(paths.map(p => [p, null]));
    for (const x of res) if (x.found) out.set(x.found.name.slice(ROOT.length + 1), x.found.fields || {});
    return out;
  }

  /** Escritura de un documento entero (`fields` ya tipados; `at` = hora del servidor si se pide). */
  const put = (path, fields, stamp) => Object.assign({ update: { name: name(path), fields } },
    stamp ? { updateTransforms: [{ fieldPath: 'at', setToServerValue: 'REQUEST_TIME' }] } : {});

  /**
   * Una pasada: lee, decide y escribe en una transacción. → periodos mejorados
   * La lógica es la de store() en ranking.js. Las filas de los demás equipos
   * del resumen se reescriben tal cual se leyeron (sin pasar por JS).
   */
  async function attempt(boards, id, entry, retry) {
    const { transaction } = await call('beginTransaction', { options: { readWrite: retry ? { retryTransaction: retry } : {} } });
    let open = true;
    try {
      // El resumen y la marca del equipo de cada tabla (como el navegador en la transacción de store()).
      const paths = [];
      for (const [b] of boards) paths.push('lbs/' + b, 'lb/' + b + '/e/' + id);
      const docs = await getAll(paths, { transaction });
      const writes = [], better = [];
      const fOf = (v, k) => +fromFs(v && v.mapValue && v.mapValue.fields && v.mapValue.fields[k]) || 0;
      // La peor fila de un top (en empate, la última, como sorted().pop()).
      const lowOf = (rows, k) => { let low = null; for (const [x, v] of Object.entries(rows)) if (!low || fOf(v, k) <= low.v) low = { id: x, v: fOf(v, k) }; return low; };
      for (const [b, period] of boards) {
        const topOnly = TOP_ONLY.has(period);
        const ePath = 'lb/' + b + '/e/' + id, sPath = 'lbs/' + b;
        // Daño a Arceus: sólo en las tablas de periodo (no en las de cada Pokémon).
        const dmg = period === 'p' ? 0 : entry.dmg || 0;
        const old = docs.get(ePath);
        const ot = old ? +fromFs(old.t) || 0 : 0, od = old ? +fromFs(old.dmg) || 0 : 0;
        const bt = entry.t > ot, bd = dmg > od;
        // ¿Ya había algo igual o mejor? Nada que escribir.
        if (!bt && !bd) continue;
        // La marca: lo mejor de cada cosa (nivel, derrotados y build, los del mejor tiempo).
        const e = Object.assign({}, entry, { dmg: Math.max(dmg, od) },
          bt ? {} : { t: ot, lv: +fromFs(old.lv) || 1, kills: +fromFs(old.kills) || 0, b: old.b ? fromFs(old.b) : undefined });
        if (!e.b) delete e.b;
        const s = docs.get(sPath);
        const top = Object.assign({}, s && s.top && s.top.mapValue && s.top.mapValue.fields);
        const dtop = Object.assign({}, s && s.dtop && s.dtop.mapValue && s.dtop.mapValue.fields);
        let ev = '', dev = '', inT = false, inD = false;
        if (bt) {
          if (id in top || Object.keys(top).length < TOP) inT = true;
          else { const low = lowOf(top, 't'); if (low.v < e.t) { ev = low.id; delete top[ev]; inT = true; } }
          if (inT) {
            // (Sin "shiny" si no hay ninguno: el resumen pesa menos.)
            const row = { t: e.t, uids: e.uids, names: e.names, dex: e.dex, lv: e.lv, kills: e.kills };
            if (e.shiny.some(Boolean)) row.shiny = e.shiny;
            if (e.b) row.b = e.b;
            top[id] = toFs(row);
          }
        }
        if (bd) {
          if (id in dtop || Object.keys(dtop).length < TOP) inD = true;
          else { const low = lowOf(dtop, 'd'); if (low.v < e.dmg) { dev = low.id; delete dtop[dev]; inD = true; } }
          if (inD) {
            const row = { d: e.dmg, uids: e.uids, names: e.names, dex: e.dex };
            if (e.shiny.some(Boolean)) row.shiny = e.shiny;
            dtop[id] = toFs(row);
          }
        }
        if (!inT && !inD) {
          // No entra en ningún top: en el histórico se guarda la marca (su puesto); en los demás, nada.
          if (!topOnly && bt) { writes.push(put(ePath, fieldsOf(e), true)); if (period !== 'p') better.push(period); }
          continue;
        }
        const sum = { top: { mapValue: { fields: top } }, me: toFs(id), ev: toFs(ev) };
        if (Object.keys(dtop).length) Object.assign(sum, { dtop: { mapValue: { fields: dtop } }, dev: toFs(dev) });
        writes.push(put(ePath, fieldsOf(e), true), put(sPath, sum));
        if (period !== 'p') better.push(period);
      }
      if (!writes.length) return [];
      open = false;                                     // si el commit falla, la transacción ya no vale
      await call('commit', { writes, transaction });
      return better;
    } catch (e) {
      e.transaction = transaction;
      throw e;
    } finally {
      if (open) await call('rollback', { transaction }).catch(() => {});
    }
  }

  /** ¿Algún miembro está marcado (saves/{uid}.sus) o baneado (.ban)? */
  async function flagged(uids) {
    const saves = await getAll(uids.map(u => 'saves/' + u), { mask: { fieldPaths: ['sus', 'ban'] } });
    return [...saves.values()].some(s => s && (fromFs(s.sus) === true || fromFs(s.ban) === true));
  }

  /**
   * Sube la marca de un equipo. Comprueba lo mismo que firestore.rules
   * (validEntry), que la cuenta de servicio se salta.
   * @param {{ t: number, members: {uid,name,dex,shiny,b?}[], lv: number, kills: number, dmg?: number }} r
   * @returns {Promise<string[]>} periodos mejorados ('d', 'w', 'm', 'a')
   */
  async function submitGroup(r) {
    if (!r || !Array.isArray(r.members) || r.members.some(m => !m || typeof m.uid !== 'string' || !m.uid || m.uid.includes('/'))) return [];
    const t = Math.floor(r.t);
    if (!(t >= MIN_T && t <= MAX_T)) return [];
    const ms = r.members.slice().sort((a, b) => (a.uid < b.uid ? -1 : 1));
    if (ms.length < 2 || ms.length > MAX_TEAM) return [];
    if (ms.some((m, i) => (i && m.uid === ms[i - 1].uid) || !Number.isInteger(m.dex) || m.dex < 1)) return [];
    const lv = r.lv, kills = r.kills;
    if (!Number.isInteger(lv) || lv < 1 || lv > 10 + t / 4) return [];
    if (!Number.isInteger(kills) || kills < 0 || kills > 100 + t * 12) return [];
    const id = ms.map(m => m.uid).join('_');
    const entry = { t, uids: ms.map(m => m.uid), names: ms.map(m => String(m.name || '')), dex: ms.map(m => m.dex),
                    shiny: ms.map(m => !!m.shiny), lv, kills, dmg: Number.isFinite(r.dmg) && r.dmg > 0 ? Math.floor(Math.min(r.dmg, 1e15)) : 0 };
    if (ms.some(m => typeof m.b === 'string' && m.b)) entry.b = ms.map(m => (typeof m.b === 'string' ? m.b.slice(0, BUILD_MAX) : ''));
    const ids = boardIds(new Date(now()));
    const boards = PERIODS.map(p => ['g_' + ids[p], p]);
    if (t >= MIN_T_MON) for (const d of new Set(entry.dex)) boards.push(['g_' + ALL + '_p' + d, 'p']);
    try {
      if (await flagged(entry.uids)) return [];
      try { return await attempt(boards, id, entry); } catch (e) {
        if (e.status !== 'ABORTED' && e.code !== 409) throw e;
        return await attempt(boards, id, entry, e.transaction);   // otra escritura a la vez: una vez más
      }
    } catch (e) {
      console.warn('[rank] no se pudo subir la marca de', id, e.message);
      return [];
    }
  }

  /**
   * Lo que cada jugador tiene de verdad en su partida guardada (saves/{uid}.save),
   * para no creerse lo que cuenta su navegador al empezar una partida en grupo:
   *   up    de cada mejora, lo MENOS entre lo que dice el navegador y lo guardado
   *         (si la nube va atrasada, como mucho juegas sin la última compra)
   *   ok    el Pokémon (y el shiny, si lo lleva) es suyo y la cuenta no está
   *         baneada ni marcada; si no, la partida no sube al ranking de grupo
   *   saved lo que decide su naturaleza, su habilidad y sus MT en ese Pokémon
   *         ({ created, pnat, pabil, ptm }, la forma de la partida guardada que
   *         lee G.Mons): room.js juega con eso y no con lo que diga el navegador.
   *         null si no tiene partida guardada.
   * Si no se puede leer, lanza (lobby.js: la partida se juega, sin ranking).
   * @param {{uid:string, dex:number, shiny:boolean, up:object}[]} players
   * @returns {Promise<Map<string, {up:object, ok:boolean, saved:object|null}>>}
   */
  async function checkKits(players) {
    const ps = players.filter(p => p && typeof p.uid === 'string' && p.uid && !p.uid.includes('/'));
    const saves = await getAll(ps.map(p => 'saves/' + p.uid),
      { mask: { fieldPaths: ['save.pupg', 'save.owned', 'save.shiny', 'save.created', 'save.pnat', 'save.pabil', 'save.ptm', 'ban', 'sus'] } });
    const out = new Map();
    for (const p of ps) {
      const f = saves.get('saves/' + p.uid);
      const sv = f && f.save ? fromFs(f.save) || {} : {};
      const has = (o, k) => !!(o && typeof o === 'object' && o[k]);
      const bought = (sv.pupg && sv.pupg[p.dex]) || {};
      const up = {};
      for (const [k, n] of Object.entries(p.up || {})) {
        const lim = Number.isInteger(bought[k]) ? bought[k] : 0;
        const v = Math.min(n | 0, lim);
        if (v > 0) up[k] = v;
      }
      const ok = !!f && has(sv.owned, p.dex) && (!p.shiny || has(sv.shiny, p.dex))
        && fromFs(f.ban) !== true && fromFs(f.sus) !== true;
      // Sólo lo de su Pokémon.
      const only = o => (o && typeof o === 'object' && p.dex in o ? { [p.dex]: o[p.dex] } : {});
      const saved = f ? { created: Number(sv.created) || 0, pnat: only(sv.pnat), pabil: only(sv.pabil), ptm: only(sv.ptm) } : null;
      out.set(p.uid, { up, ok, saved });
    }
    return out;
  }

  return { submitGroup, checkKits };
}

module.exports = { createRank, boardIds, toFs, fromFs };
