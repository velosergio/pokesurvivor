/* ============ auth.test.js — verificación de tokens sin red ============
 * Se genera un par RSA, se firman tokens a mano y las claves se inyectan con
 * fetchKeys (sin descargar nada de Google). El reloj también se inyecta.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');
const { createAuth, projectIdFromConfig } = require('../auth.js');

const PROJECT = 'pokesurvivor-662eb';
const ISS = 'https://securetoken.google.com/' + PROJECT;
const T0 = 1_800_000_000;

const pair = () => crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const A = pair(), B = pair();
const pem = k => k.publicKey.export({ type: 'spki', format: 'pem' });

/** Certificado X.509 autofirmado (sólo para pruebas), como los que da Google, y su clave. */
const CERT = [
  '-----BEGIN CERTIFICATE-----',
  'MIICzzCCAbegAwIBAgIUBX0z1KysC072jWiJgreaq26DT5QwDQYJKoZIhvcNAQEL',
  'BQAwDzENMAsGA1UEAwwEdGVzdDAgFw0yNjEwMTQxNTM5MzJaGA8yMTI2MDkyMDE1',
  'MzkzMlowDzENMAsGA1UEAwwEdGVzdDCCASIwDQYJKoZIhvcNAQEBBQADggEPADCC',
  'AQoCggEBAKifXrlNZIFIFEYUKjMcwfyY9AumyqeXvbRl3bEgeExJt7jNBhBQcU8H',
  'CHV6HP+NIzYRPDknKCnO3u69d1UhcuMf8K1VGjM/63E9UyAvqq2+fUvI16EAkwSI',
  'tA6iwa2psds4qSE7nQRY1vIXWPaNKXM4c8rQtncSXHSdEWjUAyqxsgyzmXFX4wrK',
  'D/cS41rWHEJtDS4jyuChwtBC8l28v00wlojTV21frzLrMidogq+xwB4Cnex3ycGV',
  'J5mNPSuD9cO3vI2wrtEhjPWvXsgyaQA9HY6ZQBDiAmkp+WyYvKMWx8X1QoQlde+w',
  'f4GlUqnRHMNoxJLdcmOefUY8aKMZZ1ECAwEAAaMhMB8wHQYDVR0OBBYEFCs6hok3',
  'Suxs29AA5SHSn1Dwmq4/MA0GCSqGSIb3DQEBCwUAA4IBAQCjF04LssOvJHFWXrK+',
  'e2cWB67+Epwjio1e2aPUX0LHijSpon0C5YNFAqTtgFBBTnBH8PnNJH4XKsH+63qP',
  'SVoVKOP5m6yiac+CU+UaGNtYII0PYe2/ypG7V9qu5xi+W9nTkuYD4XAJC8BwF8oK',
  'rpGzcezQbjsHSohwOLgnD6d3nPzo9s3bda3rUSAgozEuf6CSFn9HiGyUpy0khRBO',
  'WVryyOOuGuHh3UyH8IzB8mvmtiX0bfvGYOtH8we55nUjOrUDAMqK3jLUp4qs98or',
  'fq5ri8EnkJs0+StjCvsaGj0gnbnkZFLy/fBWEJ9gY3ZeBLEIoXYkJkTmN86xeY+x',
  'PUNO',
  '-----END CERTIFICATE-----'
].join('\n');
const CERT_KEY = [
  '-----BEGIN PRIVATE KEY-----',
  'MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQCon165TWSBSBRG',
  'FCozHMH8mPQLpsqnl720Zd2xIHhMSbe4zQYQUHFPBwh1ehz/jSM2ETw5Jygpzt7u',
  'vXdVIXLjH/CtVRozP+txPVMgL6qtvn1LyNehAJMEiLQOosGtqbHbOKkhO50EWNby',
  'F1j2jSlzOHPK0LZ3Elx0nRFo1AMqsbIMs5lxV+MKyg/3EuNa1hxCbQ0uI8rgocLQ',
  'QvJdvL9NMJaI01dtX68y6zInaIKvscAeAp3sd8nBlSeZjT0rg/XDt7yNsK7RIYz1',
  'r17IMmkAPR2OmUAQ4gJpKflsmLyjFsfF9UKEJXXvsH+BpVKp0RzDaMSS3XJjnn1G',
  'PGijGWdRAgMBAAECggEABjzeB9ASfJtWX6jJjlo9HVtppMAy7Tv2aTTe/HlRZe4Q',
  'sTIJbENTi7s8f38I0VXO5IZC8nDNwi0sT0vcPR6Xhcol0L2uElEGJEpi17UXtOVv',
  '9GSdwG+ZYLCva36vGD3nrc7E5+0w/+sK6Yn+USGT89aV5v3tUA6Sc8BnN1fndZXt',
  'ecHXxKa18E37rn7LdEoOZujXuRYFmYsVV0ez5sYTkLB7iZZmTcwa+9sUrRe1qCTd',
  'TSv9iN7GCuqk8iOiafQ/GErSNX1YKQ5HZLBldqhQlBBa7ZWuuvT5sgD8mSMwomSg',
  '7sfk5LIZL772kX7MVYVM1lCtz4bW9i77CWULkr2tGQKBgQDsxf0LFxEycPVOUrwW',
  '8kVl1WqNf0f8snGvs2P5xiuOnT98WGr+qQEjwUOJp4uP4hqT4Y8ABbXbe5fq/fpF',
  '+5zxnnniuYbnUo3Zv3qidfdd0yi1brpAyZZ32RYPdmPl67XfkIFf7NLGgZOY2ARD',
  'h2z1yhh70//LW0zggHg8M/gzSQKBgQC2UKvcqiJNms2JsUbfTQsuhDbzr5JpNla7',
  '/67JqGzKVqFk8UF1vr4oMIJ481epheBofKzGNqjqBC8rwwtuBimdVQuI/W6EutaL',
  '676jhvw0ESuV5Iq2gmSXMltdMQgT4t5pNwPpE17k0w7xTjz8rKp3c25/Sie3AEy7',
  'V46Pvd0LyQKBgHRKGaokvjGEATdiszah7yvA0gCFDxoxmlytQuEeT65P1SqBUquY',
  '3hJtjXpCa+1TI7KWCeH87ADMhyTHcPCGT+Lr7vlIHdXnWfwka1r3jXLrjwbtR1Ui',
  'rWBXotodT5tRVZZkJuayLiOI6LEdB5sTHJTrmXLYAL4kLXHmJyeKbtDhAoGAHgtN',
  'RyACZyeLl5VPSJ05qoC/TYkxZ4U85d5Mv46x3uZH0oqvbufwDk9wMN5pI9acFJv3',
  'HPMFAwuNeni5+Xeqg/Lv47Nf8x+XG5fN4sTr6uipdhojgdAbI4943vKlkiFg5ZXb',
  'Xx2CFdNyMvHhuwH5VZYAL5nY0Z+LBZR4OdfgBYECgYEAnUHIyj40Nt8ghW4xo93N',
  'dgGCSohisn5GVKCT7PhX+AKtacyefsPqwfuRGG9ZgW4VJTq9sWtvOM/32Uv+wSpx',
  'quF7XOMHLA1zgcpVltH3SsskLq5J8SwtS5LcaIKO1WBLZy0fch1mL4QCmQIHx48u',
  'LhkziHy9DoszwP6FhcrNQlo=',
  '-----END PRIVATE KEY-----'
].join('\n');

const enc = o => Buffer.from(JSON.stringify(o)).toString('base64url');

/** Firma un token con la clave privada de `kp`. */
function sign(claims, { kid = 'a', kp = A, header } = {}) {
  const h = enc(header || { alg: 'RS256', kid, typ: 'JWT' });
  const p = enc(claims);
  const s = crypto.sign('RSA-SHA256', Buffer.from(h + '.' + p), kp.privateKey).toString('base64url');
  return h + '.' + p + '.' + s;
}

const good = (over = {}) => ({
  aud: PROJECT, iss: ISS, sub: 'uid123', iat: T0 - 10, exp: T0 + 3600, auth_time: T0 - 100, ...over
});

/** Verificador con reloj controlable y fetchKeys que cuenta las llamadas. */
function setup({ keys = { a: pem(A) }, maxAge = 3600, devAuth = false } = {}) {
  const clock = { t: T0 };
  const calls = { n: 0 };
  const state = { keys };
  const auth = createAuth({
    projectId: PROJECT,
    now: () => clock.t,
    devAuth,
    fetchKeys: async () => { calls.n++; return { keys: state.keys, maxAge }; }
  });
  return { auth, clock, calls, state };
}

async function rejects(p, msg) {
  await assert.rejects(p, e => e.code === 'auth' && (!msg || e.message.includes(msg)));
}

test('token válido → uid', async () => {
  const { auth } = setup();
  assert.strictEqual(await auth.verify(sign(good())), 'uid123');
});

test('caducado', async () => {
  const { auth } = setup();
  await rejects(auth.verify(sign(good({ exp: T0 }))), 'caducado');
  await rejects(auth.verify(sign(good({ exp: undefined }))), 'caducado');
});

test('aud e iss malos', async () => {
  const { auth } = setup();
  await rejects(auth.verify(sign(good({ aud: 'otro' }))), 'aud');
  await rejects(auth.verify(sign(good({ iss: 'https://securetoken.google.com/otro' }))), 'iss');
});

test('iat, auth_time y sub', async () => {
  const { auth } = setup();
  assert.strictEqual(await auth.verify(sign(good({ iat: T0 + 299 }))), 'uid123');   // margen de reloj
  await rejects(auth.verify(sign(good({ iat: T0 + 301 }))), 'iat');
  await rejects(auth.verify(sign(good({ auth_time: T0 + 301 }))), 'auth_time');
  assert.strictEqual(await auth.verify(sign(good({ auth_time: undefined }))), 'uid123');
  await rejects(auth.verify(sign(good({ sub: '' }))), 'sub');
  await rejects(auth.verify(sign(good({ sub: 'x'.repeat(129) }))), 'sub');
});

test('firma mala', async () => {
  const { auth } = setup();
  await rejects(auth.verify(sign(good(), { kp: B })), 'firma');   // firmado con otra clave
  const t = sign(good());
  const forged = t.split('.');
  forged[1] = enc(good({ sub: 'otro' }));
  await rejects(auth.verify(forged.join('.')), 'firma');
});

test('alg none y mal formados', async () => {
  const { auth } = setup();
  const none = enc({ alg: 'none', kid: 'a' }) + '.' + enc(good()) + '.';
  await rejects(auth.verify(none), 'alg');
  await rejects(auth.verify(sign(good(), { header: { alg: 'HS256', kid: 'a' } })), 'alg');
  await rejects(auth.verify(sign(good(), { header: { alg: 'RS256' } })), 'kid');
  await rejects(auth.verify('a.b'));
  await rejects(auth.verify('!!.!!.!!'));
  await rejects(auth.verify(''));
  await rejects(auth.verify(null));
});

test('kid desconocido: refresca como mucho una vez por minuto', async () => {
  const { auth, clock, calls, state } = setup();
  assert.strictEqual(await auth.verify(sign(good())), 'uid123');
  assert.strictEqual(calls.n, 1);
  // Google rota las claves: llega un token con kid 'b'.
  state.keys = { a: pem(A), b: pem(B) };
  // Recién descargadas: no se vuelve a pedir antes de un minuto.
  await rejects(auth.verify(sign(good(), { kid: 'b', kp: B })), 'kid');
  assert.strictEqual(calls.n, 1);
  clock.t += 61;
  assert.strictEqual(await auth.verify(sign(good({ exp: clock.t + 100 }), { kid: 'b', kp: B })), 'uid123');
  assert.strictEqual(calls.n, 2);
  // Un kid que no existe tampoco provoca otra descarga dentro del minuto.
  await rejects(auth.verify(sign(good({ exp: clock.t + 100 }), { kid: 'zz' })), 'kid');
  assert.strictEqual(calls.n, 2);
});

test('caché de claves: se piden una vez y otra al caducar max-age', async () => {
  const { auth, clock, calls } = setup({ maxAge: 600 });
  const tok = sign(good({ exp: T0 + 10000 }));
  await Promise.all([auth.verify(tok), auth.verify(tok), auth.verify(tok)]);   // a la vez: una descarga
  await auth.verify(tok);
  assert.strictEqual(calls.n, 1);
  clock.t += 601;
  await auth.verify(tok);
  assert.strictEqual(calls.n, 2);
});

test('fallo al descargar: sin claves rechaza; con claves viejas sigue', async () => {
  let fail = true, n = 0;
  const clock = { t: T0 };
  const auth = createAuth({
    projectId: PROJECT, now: () => clock.t,
    fetchKeys: async () => { n++; if (fail) throw new Error('sin red'); return { keys: { a: pem(A) }, maxAge: 10 }; }
  });
  const tok = sign(good());
  await rejects(auth.verify(tok), 'claves');
  await rejects(auth.verify(tok), 'claves');   // dentro del minuto no se reintenta
  assert.strictEqual(n, 1);
  clock.t += 61;
  fail = false;
  assert.strictEqual(await auth.verify(tok), 'uid123');
  fail = true;
  clock.t += 11;   // caducan, falla la descarga: se siguen usando
  assert.strictEqual(await auth.verify(tok), 'uid123');
  const before = n;
  await auth.verify(tok);   // y no se reintenta en cada verificación
  assert.strictEqual(n, before);
  await rejects(auth.verify(sign(good(), { kid: 'zz' })), 'kid');   // con claves viejas, un kid nuevo sigue sin valer
});

test('claves en certificado X.509 (el formato de Google)', async () => {
  const { auth } = setup({ keys: { c: CERT } });
  const kp = { privateKey: crypto.createPrivateKey(CERT_KEY) };
  assert.strictEqual(await auth.verify(sign(good(), { kid: 'c', kp })), 'uid123');
  await rejects(auth.verify(sign(good(), { kid: 'c' })), 'firma');
});

test('claims malos no descargan claves', async () => {
  const { auth, calls } = setup();
  await rejects(auth.verify(sign(good({ aud: 'otro' }))), 'aud');
  assert.strictEqual(calls.n, 0);
});

test('dev:<uid> sólo con devAuth', async () => {
  const off = setup().auth, on = setup({ devAuth: true }).auth;
  await rejects(off.verify('dev:bot1'));
  assert.strictEqual(await on.verify('dev:bot1'), 'bot1');
  await rejects(on.verify('dev:'));
  await rejects(on.verify('dev:a-b'));
  await rejects(on.verify('dev:' + 'x'.repeat(41)));
  assert.strictEqual(await on.verify(sign(good())), 'uid123');   // los de verdad siguen valiendo
});

test('projectIdFromConfig lee js/config.js', () => {
  assert.strictEqual(projectIdFromConfig(), PROJECT);
});
