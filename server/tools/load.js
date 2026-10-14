/* ============ load.js — prueba de carga del servidor del cooperativo ============
 *
 * Lanza N salas de bots (bots.js) contra el servidor y dice cuánto cuesta cada
 * una: CPU, RAM, tráfico por jugador y tamaño de las instantáneas. Con eso
 * sugiere MAX_ROOMS.
 *
 *   node server/tools/load.js --spawn --rooms 5 --secs 60
 *       arranca el servidor AQUÍ MISMO (require('../index').start, DEV_AUTH) y
 *       mide este proceso con process.cpuUsage() y memoryUsage().
 *   node server/tools/load.js --url ws://localhost:8787/ws --rooms 5
 *       contra un servidor ya arrancado: sólo tráfico y snaps (la CPU y la RAM,
 *       en el panel del servidor). Para una URL que no es local hace falta
 *       --remote-ok (y el servidor con DEV_AUTH=1: nunca en producción).
 *
 * Opciones: --size 4 (bots por sala) · --cpu 70 (% de un núcleo que se puede
 * gastar) · --ram-mb 1024 (RAM del VPS para este servicio) · --origin <url>.
 *
 * LIMITACIÓN de --spawn: servidor y bots van en el mismo proceso, así que la
 * CPU y la RAM medidas incluyen las de los bots (sockets, JSON, decodificar
 * snaps). Los bots gastan poco al lado de la simulación, pero la cifra es un
 * techo: la sugerencia de MAX_ROOMS sale algo prudente. Node simula todas las
 * salas en UN hilo: lo que limita es un núcleo, tenga el VPS los vCPU que tenga.
 */
'use strict';
const { monitorEventLoopDelay } = require('perf_hooks');
const { runBots, parseArgs, ok } = require('./bots');

/** ¿La URL es de esta máquina? */
function isLocal(url) {
  try { return ['localhost', '127.0.0.1', '[::1]', '::1'].includes(new URL(url).hostname); } catch (e) { return false; }
}

const mb = n => Math.round(n / 1048576 * 10) / 10;

/**
 * Prueba de carga.
 * @param {object} o
 * @param {boolean} [o.spawn=false]  arrancar el servidor en este proceso y medirlo
 * @param {string} [o.url]  si no se arranca
 * @param {number} [o.rooms=5] @param {number} [o.size=4] @param {number} [o.secs=60]
 * @param {number} [o.cpu=70]  % de un núcleo que se da por bueno
 * @param {number} [o.ramMb=1024]  RAM disponible para el servicio
 * @param {string} [o.origin]
 * @returns {Promise<{bots: object, cpuPct?: number, rssBaseMb?: number, rssPeakMb?: number,
 *   heapPeakMb?: number, lagP99Ms?: number, cpuPerRoom?: number, ramPerRoomMb?: number,
 *   maxRooms?: number, mbPerPlayerHour: number}>}
 */
async function runLoad({ spawn = false, url, rooms = 5, size = 4, secs = 60, cpu = 70, ramMb = 1024, origin } = {}) {
  let app = null;
  if (spawn) {
    const quiet = { log() {}, warn() {}, error: (...a) => console.error(...a) };
    app = require('../index').start({ port: 0, devAuth: true, allowedOrigins: [], maxRooms: rooms + 5, logger: quiet });
    const port = await app.ready;
    url = `ws://127.0.0.1:${port}/ws`;
  }
  // La simulación se carga con la primera sala: la base es sin ella.
  if (global.gc) global.gc();
  const rssBase = process.memoryUsage().rss;
  let rssPeak = rssBase, heapPeak = process.memoryUsage().heapUsed;
  const sampler = setInterval(() => {
    const m = process.memoryUsage();
    if (m.rss > rssPeak) rssPeak = m.rss;
    if (m.heapUsed > heapPeak) heapPeak = m.heapUsed;
  }, 500);
  const lag = monitorEventLoopDelay({ resolution: 10 });
  lag.enable();
  const c0 = process.cpuUsage(), w0 = process.hrtime.bigint();
  let bots;
  try {
    bots = await runBots({ url, rooms, size, secs, origin });
  } finally {
    clearInterval(sampler);
    lag.disable();
  }
  const c = process.cpuUsage(c0), wall = Number(process.hrtime.bigint() - w0) / 1e6; // ms
  if (app) await app.close();

  const out = { url, bots, mbPerPlayerHour: Math.round(bots.kbsPerPlayer * 3600 / 1024) };
  if (spawn) {
    const cpuPct = (c.user + c.system) / 1000 / wall * 100;
    const started = Math.max(1, bots.starts || rooms);
    out.cpuPct = Math.round(cpuPct * 10) / 10;
    out.rssBaseMb = mb(rssBase);
    out.rssPeakMb = mb(rssPeak);
    out.heapPeakMb = mb(heapPeak);
    out.lagP99Ms = Math.round(lag.percentile(99) / 1e6 * 10) / 10;
    out.cpuPerRoom = Math.round(cpuPct / started * 100) / 100;
    out.ramPerRoomMb = Math.round(Math.max(0.1, (rssPeak - rssBase) / 1048576 / started) * 10) / 10;
    const byCpu = Math.floor(cpu / Math.max(0.01, out.cpuPerRoom));
    const byRam = Math.floor((ramMb * 0.8 - out.rssBaseMb) / out.ramPerRoomMb);
    out.maxRoomsByCpu = byCpu;
    out.maxRoomsByRam = byRam;
    out.maxRooms = Math.max(1, Math.min(byCpu, byRam));
  }
  return out;
}

module.exports = { runLoad, isLocal };

// ---- Ejecutado directamente ----
if (require.main === module) {
  const a = parseArgs(process.argv.slice(2));
  const opts = {
    spawn: !!a.spawn, url: typeof a.url === 'string' ? a.url : 'ws://localhost:8787/ws',
    rooms: +a.rooms || 5, size: +a.size || 4, secs: +a.secs || 60,
    cpu: +a.cpu || 70, ramMb: +a['ram-mb'] || 1024,
    origin: typeof a.origin === 'string' ? a.origin : undefined
  };
  if (!opts.spawn && !isLocal(opts.url) && !a['remote-ok']) {
    console.error(`[load] ${opts.url} no es local: añade --remote-ok si de verdad es un servidor de pruebas con DEV_AUTH=1`);
    process.exit(2);
  }
  console.log(`[load] ${opts.rooms} sala(s) de ${opts.size} durante ${opts.secs} s ${opts.spawn ? '(servidor en este proceso)' : 'contra ' + opts.url}`);
  runLoad(opts).then(r => {
    const b = r.bots;
    console.log(`[load] jugadores ${b.players} · partidas ${b.starts} · snaps ${b.snaps} · niveles ${b.levels} · correcciones ${b.corrections}`);
    console.log(`[load] snap medio ${b.avgSnap} B, máximo ${b.maxSnap} B · ${b.kbsPerPlayer} KB/s por jugador (~${r.mbPerPlayerHour} MB por jugador y hora)`);
    if (r.cpuPct !== undefined) {
      console.log(`[load] CPU ${r.cpuPct} % de un núcleo (${r.cpuPerRoom} % por sala) · RAM base ${r.rssBaseMb} MB, pico ${r.rssPeakMb} MB (~${r.ramPerRoomMb} MB por sala) · retraso del bucle p99 ${r.lagP99Ms} ms`);
      console.log(`[load] MAX_ROOMS sugerido: ${r.maxRooms} (por CPU ${r.maxRoomsByCpu} al ${opts.cpu} % de un núcleo, por RAM ${r.maxRoomsByRam} con ${opts.ramMb} MB) — incluye lo que gastan los bots`);
    }
    if (b.errors.length) console.log('[load] errores:', b.errors.slice(0, 10));
    if (Object.keys(b.byes).length) console.log('[load] bye:', b.byes);
    process.exit(ok(b) ? 0 : 1);
  }, e => { console.error('[load]', e && e.stack || e); process.exit(1); });
}
