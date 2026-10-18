/* ============ auth.js — quién es cada jugador (Node) ============
 *
 * Verifica el ID token de Firebase que manda el juego en `hello` y devuelve el
 * uid. Es un JWT RS256 firmado con las claves públicas de Google (certificados
 * X.509 que se descargan y se guardan mientras diga su Cache-Control). Sólo
 * usa `crypto` de Node: sin dependencias.
 *
 * Comprueba: alg RS256, kid conocido, firma, aud = proyecto, iss del proyecto,
 * que no haya caducado y que no venga del futuro (con 5 min de margen de reloj).
 *
 * devAuth (sólo en local, DEV_AUTH=1): acepta además `dev:<uid>` para probar
 * con bots sin cuentas de verdad. En el servidor publicado va apagado.
 */
'use strict';
const crypto = require('crypto');
const { readConfig } = require('./config');

/** Certificados públicos con los que Firebase firma los ID tokens. */
const KEYS_URL = 'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';
/** Margen para relojes desfasados (s). */
const SKEW = 300;
/** Con un kid desconocido se vuelve a pedir las claves como mucho una vez cada esto (s). */
const REFRESH_MIN = 60;
/** Si la respuesta no trae max-age, las claves valen esto (s). */
const DEFAULT_MAX_AGE = 300;
/** Plazo de la descarga de claves (ms). */
const FETCH_TIMEOUT = 10000;

/** Error de autenticación: lo que index.js convierte en `bye { reason: 'auth' }`. */
function authError(msg) {
  const e = new Error('auth: ' + msg);
  e.code = 'auth';
  return e;
}

/** Descarga las claves de Google con el fetch global. → { keys: {kid: pem}, maxAge } */
async function defaultFetchKeys() {
  // Con plazo: una descarga colgada dejaría esperando a todas las conexiones.
  const res = await fetch(KEYS_URL, { signal: AbortSignal.timeout(FETCH_TIMEOUT) });
  if (!res.ok) throw new Error('claves de Firebase: HTTP ' + res.status);
  const keys = await res.json();
  const m = /(?:^|[,\s])max-age=(\d+)/i.exec(res.headers.get('cache-control') || '');
  return { keys, maxAge: m ? Number(m[1]) : DEFAULT_MAX_AGE };
}

/** Trozo base64url de un JWT → Buffer (estricto: nada de caracteres de más). */
function b64url(s) {
  if (typeof s !== 'string' || !/^[A-Za-z0-9_-]*$/.test(s)) throw authError('token mal formado');
  return Buffer.from(s, 'base64url');
}

/** Trozo base64url → objeto JSON. */
function jsonPart(s) {
  let v;
  try { v = JSON.parse(b64url(s).toString('utf8')); } catch (e) { throw authError('token mal formado'); }
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw authError('token mal formado');
  return v;
}

/**
 * Crea el verificador.
 * @param {{projectId: string, fetchKeys?: () => Promise<{keys: Object<string,string>, maxAge: number}>,
 *          now?: () => number, devAuth?: boolean}} opts  now() en segundos.
 * @returns {{verify: (token: string) => Promise<string>}} verify da el uid o rechaza con code 'auth'.
 */
function createAuth({ projectId, fetchKeys = defaultFetchKeys, now = () => Date.now() / 1000, devAuth = false } = {}) {
  if (!projectId || typeof projectId !== 'string') throw new Error('createAuth: falta projectId');
  const ISS = 'https://securetoken.google.com/' + projectId;

  let keys = null;        // Map kid → KeyObject
  let expires = 0;        // hasta cuándo valen (s)
  let fetchedAt = -Infinity;
  let pending = null;     // descarga en curso (las peticiones a la vez esperan la misma)

  /** Pide las claves de nuevo (una sola descarga aunque la pidan varios). */
  function refresh() {
    if (pending) return pending;
    pending = (async () => {
      fetchedAt = now();
      try {
        const r = await fetchKeys();
        const map = new Map();
        for (const [kid, pem] of Object.entries((r && r.keys) || {})) {
          try {
            const k = crypto.createPublicKey(pem);
            if (k.asymmetricKeyType === 'rsa') map.set(kid, k);
          } catch (e) { /* certificado que no se entiende: se ignora */ }
        }
        if (!map.size) throw new Error('sin claves válidas');
        keys = map;
        const maxAge = Number(r.maxAge);
        expires = fetchedAt + (Number.isFinite(maxAge) && maxAge >= 0 ? maxAge : DEFAULT_MAX_AGE);
      } catch (e) {
        // Si ya había claves se siguen usando (y no se reintenta hasta dentro de un
        // minuto, para no pedirlas en cada conexión); si no, no se puede verificar nada.
        expires = fetchedAt + REFRESH_MIN;
        if (!keys) throw authError('no se pudieron obtener las claves (' + e.message + ')');
      } finally {
        pending = null;
      }
    })();
    return pending;
  }

  /** La clave de ese kid, refrescando si han caducado o si es nueva (como mucho 1/min). */
  async function keyFor(kid) {
    if (now() >= expires) await refresh();
    // Sin claves y con la última descarga fallida hace menos de un minuto: no se reintenta aún.
    if (!keys) throw authError('no se pudieron obtener las claves');
    let k = keys.get(kid);
    if (!k && now() - fetchedAt >= REFRESH_MIN) {
      await refresh();
      k = keys.get(kid);
    }
    if (!k) throw authError('kid desconocido');
    return k;
  }

  async function verify(token) {
    if (typeof token !== 'string' || !token || token.length > 8192) throw authError('sin token');

    if (token.startsWith('dev:')) {
      const m = /^dev:([A-Za-z0-9]{1,40})$/.exec(token);
      if (!devAuth || !m) throw authError('token de pruebas no admitido');
      return m[1];
    }

    const parts = token.split('.');
    if (parts.length !== 3) throw authError('token mal formado');
    const header = jsonPart(parts[0]), claims = jsonPart(parts[1]), sig = b64url(parts[2]);
    if (header.alg !== 'RS256') throw authError('alg no admitido');
    if (typeof header.kid !== 'string' || !header.kid) throw authError('falta kid');

    // Primero lo barato (nada se da por bueno hasta comprobar la firma, al final):
    // un token caducado o de otro proyecto no cuesta descargas ni RSA.
    const t = now();
    if (claims.aud !== projectId) throw authError('aud no válido');
    if (claims.iss !== ISS) throw authError('iss no válido');
    if (typeof claims.exp !== 'number' || !(claims.exp > t)) throw authError('caducado');
    if (typeof claims.iat !== 'number' || claims.iat > t + SKEW) throw authError('iat en el futuro');
    if (claims.auth_time !== undefined && (typeof claims.auth_time !== 'number' || claims.auth_time > t + SKEW)) {
      throw authError('auth_time en el futuro');
    }
    if (typeof claims.sub !== 'string' || !claims.sub || claims.sub.length > 128) throw authError('sub no válido');

    const key = await keyFor(header.kid);
    const ok = crypto.verify('RSA-SHA256', Buffer.from(parts[0] + '.' + parts[1]), key, sig);
    if (!ok) throw authError('firma no válida');
    return claims.sub;
  }

  return { verify };
}

/** projectId de Firebase leído de js/config.js (para no repetirlo: CLAUDE.md). */
function projectIdFromConfig() {
  const cfg = readConfig();
  const id = cfg.firebase && cfg.firebase.projectId;
  if (!id) throw new Error('js/config.js no tiene G.Config.firebase.projectId');
  return id;
}

module.exports = { createAuth, projectIdFromConfig };
