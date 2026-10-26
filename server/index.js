/* ============ index.js — arranque del servidor del cooperativo (Node) ============
 *
 * Un servidor HTTP con dos cosas:
 *   GET /health  → 200 "ok" (cabeceras X-Rooms y X-Draining), para Easypanel.
 *   /ws          → WebSocket del juego (ws, upgrade manual con noServer).
 *
 * Cada conexión: el primer mensaje tiene que ser `hello {token, proto, name,
 * dex, shiny, kit}` en 10 s como mucho (kit: ver cleanKit). Si el protocolo no es el nuestro → `bye
 * update`; si el token no vale → `bye auth`. Con el hello bueno se crea el
 * `conn` y se pasa al lobby; desde ahí cada mensaje va decodificado a
 * lobby.message(conn, msg). Límites: 4 KB por mensaje, 40 mensajes por
 * segundo, ping cada 20 s.
 *
 * Apagado (SIGTERM de Easypanel al redesplegar): el lobby deja de aceptar
 * salas y se espera a que acaben las partidas en marcha (40 min como mucho).
 * Mientras, /health sigue respondiendo y los jugadores pueden reconectar.
 */
'use strict';
const http = require('http');
const { WebSocketServer } = require('ws');

/** Tamaño máximo de un mensaje del navegador (bytes). */
const MAX_PAYLOAD = 4 * 1024;
/** Mensajes por segundo a partir de los cuales se corta la conexión. */
const MAX_RATE = 40;
/** Con más que esto pendiente de enviar, las instantáneas se saltan (llegaría tarde). */
const MAX_BUFFERED = 256 * 1024;
/** Largo máximo del nombre que se enseña a los demás. */
const NAME_MAX = 16;
/** MT de un Pokémon que se aceptan en el kit (el que más puede aprender, 56). */
const MAX_TMS = 64;

/** Nombre limpio: sin caracteres de control ni de formato (bidi, ancho cero), recortado a 16 (sin partir emojis). */
function cleanName(v) {
  const s = String(v == null ? '' : v).replace(/[\p{Cc}\p{Cf}]/gu, '').trim();
  return [...s].slice(0, NAME_MAX).join('');
}

/** Número de la Pokédex: entero positivo; si no, 1. */
function cleanDex(v) {
  return Number.isInteger(v) && v > 0 && v < 100000 ? v : 1;
}

/**
 * Lo que el navegador cuenta de su Pokémon: { up: {mejora: nivel}, bind: [ids], ban: [ids],
 * start, start2, nat, ab, tms } (movimientos iniciales, naturaleza, hueco de la habilidad y MT).
 * Sólo claves cortas, niveles enteros 0-99 e ids de texto; room.js lo recorta con los datos del juego.
 */
function cleanKit(v) {
  const k = v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  const up = {};
  if (k.up && typeof k.up === 'object' && !Array.isArray(k.up)) {
    for (const key of Object.keys(k.up).slice(0, 32)) {
      const n = k.up[key];
      if (/^[a-z]{1,12}$/.test(key) && Number.isInteger(n) && n > 0 && n < 100) up[key] = n;
    }
  }
  const ids = (a, max) => (Array.isArray(a) ? a.slice(0, max).map(x => (typeof x === 'string' && /^[a-z0-9_-]{1,24}$/.test(x) ? x : '')) : []);
  // Naturaleza, hueco de la habilidad (0, 1 o 2: la oculta) y MT (G.Mons.picksOf; las comprueba room.js heroOf).
  return { up, bind: ids(k.bind, 4), ban: ids(k.ban, 5).filter(Boolean), start: ids([k.start], 1)[0] || '', start2: ids([k.start2], 1)[0] || '',
           nat: typeof k.nat === 'string' && /^[a-z]{1,12}$/.test(k.nat) ? k.nat : '', ab: [0, 1, 2].includes(k.ab) ? k.ab : 0,
           tms: ids(k.tms, MAX_TMS).filter(Boolean) };
}

/** ¿Se acepta este Origin? Lista vacía = cualquiera (en local). */
function originOk(origin, allowed) {
  if (!allowed || !allowed.length) return true;
  return !!origin && allowed.includes(origin);
}

/** Entero >= min de una variable de entorno; si falta o no vale, `def` (y avisa). */
function envInt(name, v, def, min = 0, warn = console.warn) {
  if (v === undefined || v === '') return def;
  const n = Number(String(v).trim());
  if (Number.isInteger(n) && n >= min) return n;
  warn(`[game] ${name}=${JSON.stringify(v)} no es un entero válido: se usa ${def}`);
  return def;
}

/** Lista de orígenes desde una cadena separada por comas. */
function parseOrigins(s) {
  return String(s || '').split(',').map(x => x.trim().replace(/\/+$/, '')).filter(Boolean);
}

/** Lo que hacen falta si no se inyectan: los módulos reales del servidor. */
function realDeps({ devAuth, maxRooms, serviceAccount, logger = console }) {
  if (devAuth && serviceAccount) {
    logger.warn('[game] DEV_AUTH: el ranking de grupo NO se escribe (los uid dev: nunca llegan a Firestore)');
    serviceAccount = null;
  }
  const authMod = require('./auth');
  const auth = authMod.createAuth({ projectId: authMod.projectIdFromConfig(), devAuth });
  const rank = require('./rank').createRank({ serviceAccount });
  // room.js (y con él la simulación) se carga al crear la primera partida.
  // Con la cuenta de servicio, al empezar se comprueban las mejoras y el Pokémon con la partida guardada.
  const lobby = require('./lobby').createLobby({ createRoom: o => require('./room').createRoom({ ...o, rank }), checkKits: rank.checkKits, maxRooms });
  return { auth, lobby, proto: require('./proto') };
}

/**
 * Arranca el servidor.
 * @param {object} o
 * @param {number} [o.port=8787]  0 = uno libre (pruebas)
 * @param {string[]} [o.allowedOrigins=[]]  vacío = cualquier origen
 * @param {boolean} [o.devAuth=false]  acepta tokens `dev:<uid>` (sólo local)
 * @param {number} [o.maxRooms=30]
 * @param {object|null} [o.serviceAccount]  JSON de la cuenta de servicio (ranking de grupo)
 * @param {{auth?, lobby?, proto?}} [o.deps]  sustitutos para pruebas
 * @param {number} [o.helloTimeout=10000]  ms para mandar el hello
 * @param {number} [o.pingInterval=20000]  ms entre pings
 * @param {number} [o.drainPoll=5000]  ms entre comprobaciones durante el apagado
 * @param {number} [o.drainMax=2400000]  ms máximos de espera en el apagado (40 min)
 * @param {number} [o.closeGrace=1000]  ms para que los clientes cierren bien al final
 * @param {{log: Function, warn: Function, error: Function}} [o.logger=console]
 * @returns {{ server: http.Server, wss: WebSocketServer, ready: Promise<number>,
 *             shutdown: () => Promise<void>, close: () => Promise<void> }}
 *          ready → el puerto en el que escucha; shutdown = apagado ordenado
 *          (drain y esperar a las salas); close = cerrar ya.
 */
function start({
  port = 8787, allowedOrigins = [], devAuth = false, maxRooms = 30, serviceAccount = null, deps = {},
  helloTimeout = 10000, pingInterval = 20000, drainPoll = 5000, drainMax = 40 * 60 * 1000, closeGrace = 1000, logger = console
} = {}) {
  const need = !deps.auth || !deps.lobby || !deps.proto;
  const real = need ? realDeps({ devAuth, maxRooms, serviceAccount, logger }) : {};
  const auth = deps.auth || real.auth, lobby = deps.lobby || real.lobby, proto = deps.proto || real.proto;
  const origins = (allowedOrigins || []).map(x => String(x).replace(/\/+$/, ''));

  /** Mensaje ya codificado, para no repetir el JSON al mandar lo mismo a toda la sala. */
  const encoded = new WeakMap();
  /** uid → estado de la conexión con hello bueno (para cerrar duplicados). */
  const byUid = new Map();
  let draining = false, closed = false, shutdownP = null, connSeq = 0;

  // ---- HTTP ----
  const server = http.createServer((req, res) => {
    const url = (req.url || '/').split('?')[0];
    if ((req.method === 'GET' || req.method === 'HEAD') && url === '/health') {
      res.writeHead(200, {
        'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store',
        'X-Rooms': String(lobby.size | 0), 'X-Draining': draining ? '1' : '0', 'X-Proto': String(proto.VERSION)
      });
      res.end(req.method === 'HEAD' ? undefined : (draining ? 'ok draining' : 'ok'));
      return;
    }
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('not found');
  });

  // ---- WebSocket ----
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_PAYLOAD, perMessageDeflate: false });

  /** Rechaza un upgrade con un código HTTP y cierra el socket. */
  const refuse = (socket, code, text) => {
    try { socket.write(`HTTP/1.1 ${code} ${text}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`); } catch (e) { /* ya cerrado */ }
    socket.destroy();
  };

  server.on('upgrade', (req, socket, head) => {
    socket.on('error', () => {});
    if ((req.url || '').split('?')[0] !== '/ws') return refuse(socket, 404, 'Not Found');
    if (closed) return refuse(socket, 503, 'Service Unavailable');
    if (!originOk(req.headers.origin, origins)) return refuse(socket, 403, 'Forbidden');
    wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, req));
  });

  wss.on('connection', ws => {
    /** Estado de esta conexión. conn = lo que ve el lobby (null hasta el hello bueno). */
    const st = { ws, seq: ++connSeq, conn: null, phase: 'hello', queue: [], gone: false, win: 0, count: 0 };

    /** Manda un objeto {t,...} como JSON (o binario para snap). → false si no ha salido. */
    const sendMsg = msg => {
      if (ws.readyState !== ws.OPEN || !msg) return false;
      try {
        if (msg.t === 'snap' && msg.bin) {
          if (ws.bufferedAmount > MAX_BUFFERED) return false;
          ws.send(msg.bin, { binary: true });
        } else {
          let txt = encoded.get(msg);
          if (txt === undefined) {
            const { t, ...rest } = msg;
            txt = proto.encJson(t, rest);
            encoded.set(msg, txt);
          }
          ws.send(txt);
        }
        return true;
      } catch (e) { logger.error('[ws] envío fallido:', e && e.message); return false; }
    };
    /** bye {reason} y cerrar. */
    const bye = reason => {
      sendMsg({ t: 'bye', reason });
      if (ws.readyState === ws.OPEN || ws.readyState === ws.CONNECTING) ws.close(1000, String(reason || '').slice(0, 60));
    };

    const helloTimer = setTimeout(() => { if (st.phase === 'hello') bye('timeout'); }, helloTimeout);

    ws._psAlive = true;
    ws.on('pong', () => { ws._psAlive = true; });
    ws.on('error', () => {}); // p. ej. mensaje de más de 4 KB: ws ya cierra con 1009

    ws.on('message', (data, isBinary) => {
      if (st.gone || ws.readyState !== ws.OPEN) return;
      // Límite de ritmo: ventana de 1 s; cuenta todo, también lo malformado.
      const now = Date.now();
      if (now - st.win >= 1000) { st.win = now; st.count = 0; }
      if (++st.count > MAX_RATE) { bye('flood'); return; }

      let msg = null;
      try { msg = proto.decode(isBinary ? data : data.toString('utf8')); } catch (e) { msg = null; }
      // proto.decode da {type}; el lobby mira msg.t: van los dos.
      if (msg && typeof msg === 'object' && msg.t === undefined) msg.t = msg.type;

      if (st.phase === 'hello') {
        if (!msg || msg.type !== 'hello') { bye('hello'); return; }
        st.phase = 'auth';
        clearTimeout(helloTimer);
        onHello(msg);
        return;
      }
      if (!msg || msg.type === 'hello') return;      // malformado o repetido: se ignora
      if (st.phase === 'auth') { st.queue.push(msg); return; } // llegó antes de terminar la comprobación
      if (st.phase === 'ready') deliver(msg);
    });

    /** Pasa un mensaje al lobby sin que un fallo tumbe el proceso. */
    const deliver = msg => {
      try { lobby.message(st.conn, msg); } catch (e) { logger.error('[lobby] message:', e && e.stack || e); }
    };

    const onHello = async msg => {
      if (String(msg.proto) !== String(proto.VERSION)) { bye('update'); return; }
      let uid;
      try {
        uid = await auth.verify(msg.token);
        if (!uid || typeof uid !== 'string') throw new Error('sin uid');
      } catch (e) { bye('auth'); return; }
      if (st.gone || ws.readyState !== ws.OPEN) return;

      // Mismo uid ya dentro con una conexión MÁS NUEVA (su comprobación acabó
      // antes que la nuestra): la que sobra es ésta.
      const old = byUid.get(uid);
      if (old && old !== st && old.seq > st.seq) { bye('dup'); return; }

      const conn = {
        uid, name: cleanName(msg.name), dex: cleanDex(msg.dex), shiny: !!msg.shiny, kit: cleanKit(msg.kit),
        send: sendMsg,
        close: reason => bye(reason)
      };
      st.conn = conn;
      // Mismo uid en otra conexión: la vieja recibe bye dup y se cierra. Al
      // lobby no se le dice close(vieja) antes del hello de la nueva: así la
      // nueva hereda el sitio en la sala (lobby.hello la reconoce por el uid) y
      // el close(vieja) que llega luego, al cerrarse el socket, ya no la toca.
      if (old && old !== st) old.conn.close('dup');
      byUid.set(uid, st);
      st.phase = 'ready';
      // hello aceptado (el navegador sabe así que puede crear o unirse).
      sendMsg({ t: 'hi', uid });
      try { lobby.hello(conn); } catch (e) {
        logger.error('[lobby] hello:', e && e.stack || e);
        detach(st);
        bye('error');
        return;
      }
      const q = st.queue; st.queue = [];
      for (const m of q) { if (st.gone) break; deliver(m); }
    };

    ws.on('close', () => {
      clearTimeout(helloTimer);
      detach(st);
    });
  });

  /** Saca la conexión del lobby (una sola vez). */
  function detach(st) {
    if (st.gone) return;
    st.gone = true;
    if (!st.conn) return;
    if (byUid.get(st.conn.uid) === st) byUid.delete(st.conn.uid);
    try { lobby.close(st.conn); } catch (e) { logger.error('[lobby] close:', e && e.stack || e); }
  }

  // Ping: quien no contesta al anterior, fuera.
  const pinger = setInterval(() => {
    for (const ws of wss.clients) {
      if (ws._psAlive === false) { ws.terminate(); continue; }
      ws._psAlive = false;
      try { ws.ping(); } catch (e) { /* se cerrará */ }
    }
  }, pingInterval);

  const ready = new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, () => { server.off('error', reject); resolve(server.address().port); });
  });

  /** Cierra ya: clientes, WebSocket y HTTP. */
  function close() {
    if (closed) return Promise.resolve();
    closed = true;
    clearInterval(pinger);
    const left = [...wss.clients];
    for (const ws of left) { try { ws.close(1001, 'restart'); } catch (e) { ws.terminate(); } }
    // Un momento para que el cierre (1001 restart) llegue; quien no conteste, fuera.
    const grace = new Promise(resolve => {
      const t = setTimeout(() => { for (const ws of left) ws.terminate(); resolve(); }, closeGrace);
      const check = () => { if (left.every(ws => ws.readyState === ws.CLOSED)) { clearTimeout(t); resolve(); } };
      for (const ws of left) ws.once('close', check);
      check();
    });
    return grace.then(() => new Promise(resolve => {
      wss.close();
      server.close(() => resolve());
      if (server.closeAllConnections) server.closeAllConnections();
    }));
  }

  /** Apagado ordenado: no más salas; espera a que acaben (o a drainMax) y cierra. */
  function shutdown() {
    if (shutdownP) return shutdownP;
    draining = true;
    try { lobby.drain(); } catch (e) { logger.error('[lobby] drain:', e && e.stack || e); }
    const t0 = Date.now();
    logger.log(`[game] apagando: esperando a ${lobby.size | 0} sala(s), como mucho ${Math.round(drainMax / 60000)} min`);
    shutdownP = new Promise(resolve => {
      const check = () => {
        if ((lobby.size | 0) === 0 || Date.now() - t0 >= drainMax) {
          if (lobby.size | 0) logger.warn(`[game] tiempo de apagado agotado con ${lobby.size} sala(s)`);
          close().then(resolve);
          return;
        }
        setTimeout(check, drainPoll);
      };
      check();
    });
    return shutdownP;
  }

  return { server, wss, ready, shutdown, close, get draining() { return draining; } };
}

module.exports = { start, parseOrigins, cleanName, cleanDex, cleanKit, originOk, envInt };

// ---- Ejecutado directamente: node server/index.js ----
if (require.main === module) {
  const env = process.env;
  let serviceAccount = null;
  if (env.FIREBASE_SERVICE_ACCOUNT) {
    try { serviceAccount = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT); } catch (e) {
      console.warn('[game] FIREBASE_SERVICE_ACCOUNT no es JSON válido: el ranking de grupo no se escribirá');
    }
  }
  const proto = require('./proto');
  if (env.PROTO && String(env.PROTO) !== String(proto.VERSION)) {
    console.warn(`[game] PROTO=${env.PROTO} no coincide con proto.VERSION=${proto.VERSION} (manda el del código)`);
  }
  const origins = parseOrigins(env.ALLOWED_ORIGINS);
  const devAuth = env.DEV_AUTH === '1';
  if (devAuth) console.warn('[game] AVISO: DEV_AUTH=1 acepta tokens dev:<uid> sin comprobar. Sólo para local, nunca en Easypanel.');
  if (!origins.length && !devAuth) {
    console.warn('[game] AVISO: ALLOWED_ORIGINS vacío: cualquier página puede abrir /ws. En Easypanel ponlo al dominio de la web.');
  }
  const app = start({
    port: envInt('PORT', env.PORT, 8787, 0),
    allowedOrigins: origins,
    devAuth,
    maxRooms: envInt('MAX_ROOMS', env.MAX_ROOMS, 30, 1),
    serviceAccount
  });
  app.ready.then(p => {
    console.log(`[game] escuchando en :${p} (proto ${proto.VERSION}, orígenes: ${origins.join(', ') || 'cualquiera'}${env.DEV_AUTH === '1' ? ', DEV_AUTH' : ''})`);
    // Compila js/ ya, y no al crear la primera sala (bloquearía ~0,2 s).
    require('./sim').warm();
  }, e => { console.error('[game] no se pudo escuchar:', e.message); process.exit(1); });
  let stopping = false;
  const onSignal = sig => {
    if (stopping) { if (sig === 'SIGINT') process.exit(130); return; } // segundo Ctrl+C: salir ya
    stopping = true;
    console.log(`[game] ${sig}: no se aceptan salas nuevas`);
    app.shutdown().then(() => { console.log('[game] apagado'); process.exit(0); });
  };
  process.on('SIGTERM', () => onSignal('SIGTERM'));
  process.on('SIGINT', () => onSignal('SIGINT'));
}
