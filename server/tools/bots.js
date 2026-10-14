/* ============ bots.js — jugadores de mentira para el servidor del cooperativo ============
 *
 * Abre salas llenas de bots contra el servidor (local o remoto) y cuenta lo
 * que llega. Cada bot hace lo que haría un navegador:
 *
 *   hello {token:'dev:<uid>', proto, name, dex, shiny:false}
 *   el primero de la sala `create`; los demás, al saber el código, `join {code}`;
 *   con la sala llena, el líder `start` (y otra vez si la partida acaba antes de tiempo).
 *   Tras `started`: `in` a 15/s andando en círculos desde la posición que le da
 *   el primer snap; si el servidor lo tiene muy lejos de donde cree, se corrige.
 *   A cada `level` (cartas, objeto o fusión) contesta `pick {choice:0}` en 0,3-1 s.
 *   Mientras alguien elige (ev `wait` con nombres) se queda quieto, como el juego.
 *   A los `secs` segundos cierran todos.
 *
 * Necesita el servidor con DEV_AUTH=1 (los tokens dev:<uid> no se comprueban).
 *
 * Uso: node server/tools/bots.js --rooms 2 --size 4 --secs 60 [--url ws://localhost:8787/ws]
 *      [--origin http://localhost] [--prefix bot]
 * Sale con 1 si hubo errores o algún bot no recibió `started` o `snap`.
 */
'use strict';
const WebSocket = require('ws');
const proto = require('../proto');

/** Entradas por segundo de cada bot (el navegador manda ~15). */
const IN_HZ = 15;
/** Velocidad a la que anda el bot (px/s): por debajo de la de cualquier Pokémon. */
const SPEED = 80;
/** Radio del círculo que recorre (px). */
const RADIUS = 160;
/** Más lejos que esto de donde el servidor dice → se coloca donde dice el servidor. */
const FIX_DIST = 60;
/** Pokémon de los bots, por turnos. */
const DEXES = [4, 7, 1, 25];
/** Espera antes de elegir carta (ms). */
const PICK_MIN = 300, PICK_MAX = 1000;
/** Espera para conectar (ms) antes de darlo por fallido. */
const OPEN_TIMEOUT = 10000;

/**
 * Lanza las salas de bots y espera a que acaben.
 * @param {object} [o]
 * @param {string} [o.url='ws://localhost:8787/ws']
 * @param {number} [o.rooms=1]   salas
 * @param {number} [o.size=4]    bots por sala (1-4)
 * @param {number} [o.secs=60]   duración (s) desde que conectan
 * @param {string} [o.origin]    cabecera Origin (si el servidor tiene ALLOWED_ORIGINS)
 * @param {string} [o.prefix='bot']  uid = prefix + número (sólo letras y cifras)
 * @param {number} [o.stagger=50]  ms entre una sala y la siguiente al arrancar
 * @returns {Promise<object>} estadísticas: { rooms, players, secs, msgsIn, bytesIn, snaps, maxSnap,
 *   avgSnap, kbsPerPlayer, levels, picks, overs, overWhy:{why:n}, overT:[s], starts, corrections, byes:{reason:n}, errors:[],
 *   noStarted, noSnap }
 */
function runBots({ url = 'ws://localhost:8787/ws', rooms = 1, size = 4, secs = 60, origin, prefix = 'bot', stagger = 50 } = {}) {
  size = Math.max(1, Math.min(4, size | 0));
  rooms = Math.max(1, rooms | 0);
  const st = { msgsIn: 0, bytesIn: 0, snaps: 0, snapBytes: 0, maxSnap: 0, levels: 0, picks: 0, overs: 0, overWhy: {}, overT: [],
    starts: 0, corrections: 0, byes: {}, errors: [] };
  const bots = [];
  const t0 = Date.now();
  let ending = false;
  const err = (b, what) => { if (st.errors.length < 200) st.errors.push(`${b.uid}: ${what}`); };

  /** Un bot. roomBots: los de su sala (el primero es el líder, que la crea). */
  function bot(n, roomBots) {
    const uid = prefix + n;
    const b = { uid, n, roomBots, ws: null, started: false, snapped: false, closed: false, code: null,
      me: -1, x: 0, y: 0, ang: 0, cx: 0, cy: 0, have: false, seq: 0, sent: new Map(),
      choosing: false, othersWait: false, timers: new Set(), inTimer: null, startAsked: false,
      name: 'Bot ' + n, onAt: 0, offAt: 0 };
    bots.push(b);
    roomBots.push(b);

    b.later = (fn, ms) => { const t = setTimeout(() => { b.timers.delete(t); fn(); }, ms); b.timers.add(t); };
    const send = obj => {
      if (!b.ws || b.ws.readyState !== WebSocket.OPEN) return;
      const { t, ...rest } = obj;
      b.ws.send(proto.encJson(t, rest));
    };
    b.send = send;

    b.connect = extra => {
      const opts = { handshakeTimeout: OPEN_TIMEOUT, perMessageDeflate: false };
      if (origin) opts.headers = { Origin: origin };
      const ws = new WebSocket(url, opts);
      b.ws = ws;
      ws.on('open', () => {
        b.onAt = Date.now();
        send({ t: 'hello', token: 'dev:' + uid, proto: proto.VERSION, name: b.name, dex: DEXES[n % DEXES.length], shiny: false });
        if (extra) send(extra);
      });
      ws.on('error', e => { if (!ending) err(b, 'socket: ' + (e && e.message)); });
      ws.on('close', (code, reason) => {
        b.closed = true;
        if (b.onAt && !b.offAt) b.offAt = Date.now();
        stopIn(b);
        if (!ending) err(b, `cerrado antes de tiempo (${code} ${String(reason || '')})`);
      });
      ws.on('message', (data, isBinary) => onMessage(b, data, isBinary));
    };
    return b;
  }

  /** Deja de mandar `in`. */
  function stopIn(b) { if (b.inTimer) { clearInterval(b.inTimer); b.inTimer = null; } }
  /** Cancela las elecciones pendientes. */
  function clearTimers(b) { for (const t of b.timers) clearTimeout(t); b.timers.clear(); }

  /** Mensaje del servidor. */
  function onMessage(b, data, isBinary) {
    st.msgsIn++;
    st.bytesIn += data.length;
    let m;
    try { m = proto.decode(isBinary ? data : data.toString('utf8')); } catch (e) { err(b, 'mensaje ilegible: ' + e.message); return; }
    switch (m.type) {
      case 'room': onRoom(b, m); break;
      case 'started': onStarted(b, m); break;
      case 'snap': onSnap(b, m, data.length); break;
      case 'level': onLevel(b, m); break;
      case 'ev': onEv(b, m); break;
      case 'over':
        st.overs++;
        { const r = m.results || {}, why = String(r.why || '?');
          st.overWhy[why] = (st.overWhy[why] || 0) + 1;
          if (b === b.roomBots[0] && st.overT.length < 100) st.overT.push(Math.round(+r.t || 0)); }
        stopIn(b); clearTimers(b);    // una carta pendiente ya no vale (y no debe caer en la siguiente partida)
        b.inGame = false; b.have = false; b.choosing = false; b.othersWait = false;
        break;
      case 'bye': st.byes[m.reason] = (st.byes[m.reason] || 0) + 1; break;
      case 'err':
        err(b, 'err ' + m.reason);
        b.startAsked = false;         // si era el start, se reintenta
        break;
      default: break;
    }
  }

  function onRoom(b, m) {
    b.code = m.code;
    const lead = b.roomBots[0];
    // El líder, con el código: entran los demás.
    if (b === lead && !b.joinedOthers) {
      b.joinedOthers = true;
      for (const o of b.roomBots) if (o !== b) o.connect({ t: 'join', code: m.code });
    }
    // Sala llena y sin partida: empezar (una vez por espera).
    const inGame = b.roomBots.some(o => o.inGame);
    if (b.uid === m.leader && !inGame && !b.startAsked && Array.isArray(m.members) &&
        m.members.length >= b.roomBots.length && m.members.every(x => x.on !== false) && !ending) {
      b.startAsked = true;
      b.send({ t: 'start' });
    }
  }

  function onStarted(b, m) {
    if (b.inGame) return;            // repetido tras reconectar (no pasa aquí)
    b.started = true; b.inGame = true; b.startAsked = false;
    if (b === b.roomBots[0]) st.starts++;
    b.me = Array.isArray(m.members) ? m.members.findIndex(x => x.uid === b.uid) : -1;
    if (b.me < 0) err(b, 'started sin mí en members');
    b.have = false; b.sent.clear(); b.choosing = false; b.othersWait = false;
    b.ang = (b.n * 1.7) % (Math.PI * 2);
    stopIn(b);
    let last = Date.now();
    b.inTimer = setInterval(() => {
      const now = Date.now(), dt = Math.min(0.2, (now - last) / 1000);
      last = now;
      step(b, dt);
    }, Math.round(1000 / IN_HZ));
  }

  /** Avanza el círculo y manda `in`. */
  function step(b, dt) {
    if (!b.have || !b.ws || b.ws.readyState !== WebSocket.OPEN) return;
    let dx = 0, dy = 0;
    if (!b.choosing && !b.othersWait) {
      b.ang += SPEED * dt / RADIUS;
      const nx = b.cx + Math.cos(b.ang) * RADIUS, ny = b.cy + Math.sin(b.ang) * RADIUS;
      const l = Math.hypot(nx - b.x, ny - b.y) || 1;
      dx = (nx - b.x) / l; dy = (ny - b.y) / l;
      b.x = nx; b.y = ny;
    }
    b.seq++;
    b.sent.set(b.seq, [b.x, b.y]);
    if (b.sent.size > 60) b.sent.delete(b.sent.keys().next().value);
    b.ws.send(proto.encIn({ seq: b.seq, x: b.x, y: b.y, dx, dy, move: 0 }), { binary: true });
  }

  /** Coloca el círculo para que pase por (x, y) en el ángulo actual. */
  function placeAt(b, x, y) {
    b.x = x; b.y = y;
    b.cx = x - Math.cos(b.ang) * RADIUS; b.cy = y - Math.sin(b.ang) * RADIUS;
  }

  function onSnap(b, s, len) {
    st.snaps++;
    st.snapBytes += len;
    if (len > st.maxSnap) st.maxSnap = len;
    b.snapped = true;
    const p = s.players.find(q => q.id === b.me);
    if (!p) return;
    if (!b.have) { b.have = true; placeAt(b, p.x, p.y); return; }
    // Lo que el servidor ha aceptado frente a lo que mandé en ese seq.
    const mine = b.sent.get(s.ack);
    if (!mine) return;
    for (const k of b.sent.keys()) { if (k < s.ack) b.sent.delete(k); else break; }
    if (Math.hypot(p.x - mine[0], p.y - mine[1]) > FIX_DIST) {
      st.corrections++;
      placeAt(b, p.x, p.y);
      b.sent.clear();
    }
  }

  function onLevel(b, m) {
    st.levels++;
    b.choosing = true;
    const n = Array.isArray(m.options) ? m.options.length : 0;
    if (!n) err(b, 'level sin opciones (' + m.kind + ')');
    b.later(() => {
      if (b.closed || ending) return;
      st.picks++;
      b.choosing = false;      // si hay otra, llega otro level
      b.send({ t: 'pick', choice: 0 });
    }, PICK_MIN + Math.random() * (PICK_MAX - PICK_MIN));
  }

  function onEv(b, m) {
    for (const ev of Array.isArray(m.list) ? m.list : []) {
      // La lista trae a todos los que eligen, también a él: cuentan sólo los demás.
      if (Array.isArray(ev) && ev[0] === 'wait') b.othersWait = Array.isArray(ev[1]) && ev[1].some(x => x !== b.name);
    }
  }

  // ---- arranque y fin ----

  return new Promise(resolve => {
    let n = 0;
    const roomsBots = [];
    for (let r = 0; r < rooms; r++) {
      const group = [];
      for (let i = 0; i < size; i++) bot(++n, group);
      roomsBots.push(group);
    }
    // Las salas empiezan escalonadas (como llegan jugadores de verdad); el resto entra con el código.
    const launch = roomsBots.map((g, i) => setTimeout(() => { if (!ending) g[0].connect({ t: 'create' }); }, i * stagger));

    /** Si la partida de una sala se acaba antes de tiempo, el líder vuelve a empezar. */
    const restarter = setInterval(() => {
      for (const g of roomsBots) {
        const lead = g[0];
        if (lead.started && !lead.startAsked && !g.some(o => o.inGame) && g.every(o => o.ws && o.ws.readyState === WebSocket.OPEN)) {
          lead.startAsked = true;
          lead.send({ t: 'start' });
        }
      }
    }, 1000);

    setTimeout(() => {
      ending = true;
      clearInterval(restarter);
      for (const t of launch) clearTimeout(t);
      const waits = bots.map(b => new Promise(done => {
        stopIn(b);
        clearTimers(b);
        const ws = b.ws;
        if (!ws || ws.readyState === WebSocket.CLOSED) return done();
        const kill = setTimeout(() => { ws.terminate(); done(); }, 2000);
        ws.once('close', () => { clearTimeout(kill); done(); });
        try { ws.close(1000, 'fin'); } catch (e) { ws.terminate(); }
      }));
      Promise.all(waits).then(() => {
        const el = (Date.now() - t0) / 1000;
        // Tráfico por jugador: lo recibido entre el tiempo que ha estado conectado cada uno.
        const onSecs = bots.reduce((a, b) => a + (b.onAt ? ((b.offAt || Date.now()) - b.onAt) / 1000 : 0), 0);
        const out = {
          rooms, players: bots.length, secs: Math.round(el * 10) / 10,
          msgsIn: st.msgsIn, bytesIn: st.bytesIn, snaps: st.snaps, maxSnap: st.maxSnap,
          avgSnap: st.snaps ? Math.round(st.snapBytes / st.snaps) : 0,
          kbsPerPlayer: Math.round(st.bytesIn / 1024 / Math.max(0.001, onSecs) * 100) / 100,
          levels: st.levels, picks: st.picks, overs: st.overs, overWhy: st.overWhy, overT: st.overT, starts: st.starts, corrections: st.corrections,
          byes: st.byes, errors: st.errors,
          noStarted: bots.filter(b => !b.started).map(b => b.uid),
          noSnap: bots.filter(b => !b.snapped).map(b => b.uid)
        };
        resolve(out);
      });
    }, secs * 1000 + (rooms - 1) * stagger);  // cada sala, sus `secs` aunque haya entrado más tarde
  });
}

/** Lee --clave valor de la línea de órdenes. */
function parseArgs(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const k = a.slice(2), v = argv[i + 1];
    if (v === undefined || v.startsWith('--')) { o[k] = true; continue; }
    o[k] = v; i++;
  }
  return o;
}

/**
 * Número de una opción: falta → def; si no es un entero >= min, Error.
 * @param {object} a  lo de parseArgs  @param {string} k  @param {number} def  @param {number} [min=1]
 */
function num(a, k, def, min = 1) {
  if (a[k] === undefined) return def;
  const n = Number(a[k]);
  if (a[k] === true || !Number.isInteger(n) || n < min) throw new Error(`--${k} necesita un entero >= ${min} (llegó ${JSON.stringify(a[k])})`);
  return n;
}

/** ¿Ha ido bien? (sin errores y todos con started y snap) */
const ok = s => !s.errors.length && !s.noStarted.length && !s.noSnap.length;

module.exports = { runBots, parseArgs, num, ok };

// ---- Ejecutado directamente ----
if (require.main === module) {
  const a = parseArgs(process.argv.slice(2));
  let opts;
  try {
    opts = {
      url: typeof a.url === 'string' ? a.url : 'ws://localhost:8787/ws',
      rooms: num(a, 'rooms', 1), size: num(a, 'size', 4), secs: num(a, 'secs', 60),
      origin: typeof a.origin === 'string' ? a.origin : undefined,
      prefix: typeof a.prefix === 'string' ? a.prefix : 'bot'
    };
    if (opts.size > 4) throw new Error('--size: como mucho 4 por sala');
    if (!/^[A-Za-z0-9]{1,30}$/.test(opts.prefix)) throw new Error('--prefix: sólo letras y cifras');
  } catch (e) { console.error('[bots]', e.message); process.exit(2); }
  console.log(`[bots] ${opts.rooms} sala(s) de ${opts.size} contra ${opts.url} durante ${opts.secs} s`);
  runBots(opts).then(s => {
    console.log(JSON.stringify(s, null, 2));
    console.log(`[bots] snap medio ${s.avgSnap} B, máximo ${s.maxSnap} B, ${s.kbsPerPlayer} KB/s por jugador`);
    if (!ok(s)) { console.error('[bots] FALLO'); process.exit(1); }
    process.exit(0);
  }, e => { console.error('[bots]', e && e.stack || e); process.exit(1); });
}
