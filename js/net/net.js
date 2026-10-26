/* ============ net.js — conexión con el servidor del cooperativo ============
 * Un WebSocket con el servidor de partidas (server/, servicio `game`). La sala
 * y la partida viven allí: aquí sólo se abre la conexión, se presenta uno
 * (`hello` con el token de Firebase) y se pasan los mensajes (js/net/proto.js).
 *
 * Sólo se conecta mientras estás en una sala o partida en grupo, y sólo desde
 * la web de esta copia (G.Config.site) o desde localhost, con cuenta en la
 * nube (como el resto de lo online: ver allowedHosts en db.js).
 *
 * Si la conexión se corta estando en una sala (o con una partida en grupo
 * pendiente de recuperar tras recargar), se reintenta sola durante 60 s
 * (el servidor guarda tu sitio en la partida ese tiempo: BACK_MS en server/lobby.js).
 * En partida el servidor manda ~15 snaps por segundo (también mientras alguien
 * elige carta): si pasan SILENT_MS sin nada, la conexión se da por muerta y se
 * reintenta. Antes, un corte sin cierre (cambio de wifi a datos, el móvil en
 * segundo plano) dejaba la partida congelada durante minutos.
 *
 * API:  available() · connect() → Promise · renew() · close() · send(type, campos)
 *       sendIn({seq,x,y,dx,dy,move}) · on(fn(msg)) · onState(fn(estado))
 *       state: 'closed' | 'connecting' | 'open' | 'retry'
 */
G.Net = (() => {
  const OPEN_TIMEOUT = 10000;      // ms para conectar y presentarse
  const RETRY_FOR = 60000;         // ms reintentando tras un corte (lo que guarda el servidor)
  const RETRY_GAP = 1500;
  const SILENT_MS = 8000;          // ms sin mensajes en partida en grupo: conexión muerta

  let ws = null, state = 'closed', want = false, ready = null;
  let retryUntil = 0, retryT = 0, authRetried = false, lastRecv = 0;
  const handlers = new Set(), stateHandlers = new Set();
  const stats = { sent: 0, recv: 0, bytes: 0 };

  /** Dirección del servidor: la de config.js; en local, el de la máquina (node server). */
  function url() {
    const h = location.hostname;
    if (h === 'localhost' || h === '127.0.0.1') return 'ws://' + h + ':8787/ws';
    return G.Config.ws || '';
  }

  /** ¿Se puede jugar en grupo aquí? (nube, cuenta con apodo, web de esta copia o localhost) */
  function available() {
    if (!G.DB.online || !G.DB.fb || !G.DB.fb.auth || !G.DB.fb.auth.currentUser) return false;
    if (typeof WebSocket === 'undefined' || !url()) return false;
    const h = location.hostname;
    if (h === 'localhost' || h === '127.0.0.1') return true;
    try { return h === new URL(G.Config.site).hostname; } catch (e) { return false; }
  }

  function setState(s) {
    if (state === s) return;
    state = s;
    stateHandlers.forEach(fn => { try { fn(s); } catch (e) { console.warn(e); } });
  }

  function emit(msg) {
    stats.recv++;
    handlers.forEach(fn => { try { fn(msg); } catch (e) { console.error('[Net] mensaje:', e); } });
  }

  /**
   * Lo que el servidor necesita saber de tu Pokémon: mejoras de la tienda, atajos,
   * vetos, movimientos iniciales y naturaleza, hueco de la habilidad y MT
   * (G.Mons.picksOf), y la skin que lleva (la ven los compañeros). Con la nube,
   * el servidor lo comprueba con tu partida guardada.
   */
  function kit() {
    const s = G.DB.save, dex = s.partner;
    return Object.assign({ up: G.DB.upgradesOf(dex), bind: (s.pbind && s.pbind[dex] || []).slice(0, 4), ban: (s.pban && s.pban[dex] || []).slice(0, 5),
             start: (s.pstart && s.pstart[dex]) || '', start2: (s.pstart2 && s.pstart2[dex]) || '', sk: G.Skins.worn(s, dex) }, G.Mons.picksOf(dex));
  }

  async function hello(sock, fresh) {
    const s = G.DB.save;
    const token = await G.DB.fb.auth.currentUser.getIdToken(fresh);
    if (sock !== ws || sock.readyState !== 1) return;
    sock.send(G.Proto.encJson('hello', {
      token, proto: G.Proto.VERSION,
      name: G.Social.me ? G.Social.me.name : G.DB.user,
      dex: s.partner, shiny: !!s.partnerShiny && G.DB.ownsShiny(s.partner),
      kit: kit()
    }));
  }

  /**
   * Abre la conexión y se presenta. Se resuelve con el primer mensaje del
   * servidor tras el hello (o con la conexión ya abierta).
   * Falla con Error(motivo): 'off' (no disponible), 'timeout', 'closed' o el `bye` del servidor.
   */
  function connect() {
    if (!available()) return Promise.reject(new Error('off'));
    want = true;
    if (state === 'open' && ws) return Promise.resolve();
    if (ready) return ready.p;
    let ok, ko;
    const p = new Promise((a, b) => { ok = a; ko = b; });
    ready = { p, ok, ko };
    open();
    return p;
  }

  function settle(err) {
    const r = ready;
    ready = null;
    if (!r) return;
    if (err) r.ko(err); else r.ok();
  }

  function open(fresh = false) {
    clearTimeout(retryT);
    let sock;
    try { sock = new WebSocket(url()); } catch (e) { onDown(new Error('closed')); return; }
    ws = sock;
    sock.binaryType = 'arraybuffer';
    setState(state === 'retry' ? 'retry' : 'connecting');
    const timer = setTimeout(() => { if (sock === ws && state !== 'open') sock.close(); }, OPEN_TIMEOUT);
    let byeReason = '';
    sock.onopen = () => { hello(sock, fresh).catch(e => { console.warn('[Net] token:', e.message); sock.close(); }); };
    sock.onmessage = e => {
      if (sock !== ws) return;
      lastRecv = Date.now();
      stats.bytes += e.data.byteLength || e.data.length || 0;
      let m;
      try { m = G.Proto.decode(e.data); } catch (err) { console.warn('[Net] mensaje ilegible:', err.message); return; }
      if (m.type === 'bye') { byeReason = String(m.reason || ''); return; }
      if (state !== 'open') {
        clearTimeout(timer);
        retryUntil = 0; authRetried = false;
        setState('open');
        settle(null);
      }
      emit(m);
    };
    sock.onclose = () => {
      clearTimeout(timer);
      if (sock !== ws) return;
      ws = null;
      // Token caducado: se pide otro y se reintenta una vez.
      if (byeReason === 'auth' && !authRetried && want) { authRetried = true; open(true); return; }
      onDown(new Error(byeReason || 'closed'));
    };
  }

  /** Se ha cortado: si sigues en una sala, se reintenta un rato; si no, cerrado. */
  function onDown(err) {
    const hard = ['update', 'full', 'restart', 'dup', 'replaced', 'auth', 'flood', 'hello'].includes(err.message);
    // Sala en memoria, o una partida recordada al recargar (aún no ha llegado `room`).
    if (want && !hard && (G.Social.room || G.Social.hasRun())) {
      if (!retryUntil) retryUntil = Date.now() + RETRY_FOR;
      if (Date.now() < retryUntil) {
        setState('retry');
        retryT = setTimeout(() => { if (want) open(); }, RETRY_GAP);
        return;
      }
    }
    want = false; retryUntil = 0;
    setState('closed');
    settle(err);
    emit({ type: 'down', reason: err.message });
    if (err.message === 'update' && G.Updater && G.Updater.check) G.Updater.check();
  }

  /** En partida en grupo, sin mensajes desde hace SILENT_MS: se suelta y se reintenta. */
  function watch() {
    if (state !== 'open' || !ws || !(G.Coop && G.Coop.active)) return;
    if (Date.now() - lastRecv < SILENT_MS) return;
    const sock = ws;
    ws = null;                     // su onclose, si llega, ya no cuenta
    try { sock.close(); } catch (e) { /* nada */ }
    console.warn('[Net] sin mensajes del servidor: se reconecta');
    onDown(new Error('silent'));
  }
  setInterval(watch, 2000);
  // Al volver de segundo plano los mensajes en cola aún no han llegado: margen.
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') lastRecv = Date.now(); });

  /**
   * Se presenta otra vez (Pokémon y mejoras de ahora) con una conexión nueva,
   * sin soltar la vieja hasta que el servidor la sustituye: así no se sale de la sala.
   */
  function renew() {
    if (want && ws && state === 'open') open();
  }

  /** Cierra a propósito (sales de la sala): sin reintentos. */
  function close() {
    want = false; retryUntil = 0;
    clearTimeout(retryT);
    const sock = ws;
    ws = null;
    if (sock) { try { sock.close(1000, 'leave'); } catch (e) { /* nada */ } }
    settle(new Error('closed'));
    setState('closed');
  }

  function send(type, obj) {
    if (!ws || state !== 'open') return false;
    try { ws.send(G.Proto.encJson(type, obj)); stats.sent++; return true; } catch (e) { return false; }
  }

  function sendIn(m) {
    if (!ws || state !== 'open') return false;
    try { ws.send(G.Proto.encIn(m)); stats.sent++; return true; } catch (e) { return false; }
  }

  return {
    available, connect, renew, close, send, sendIn,
    on(fn) { handlers.add(fn); }, off(fn) { handlers.delete(fn); },
    onState(fn) { stateHandlers.add(fn); },
    get state() { return state; },
    get url() { return url(); },
    stats
  };
})();
