/* ============ lobby.js — salas del cooperativo (Node) ============
 *
 * Las salas viven en memoria. Cada una tiene un código corto (6 caracteres sin
 * ambiguos), hasta 10 miembros, un líder (el primero; si se va, el siguiente) y
 * puede estar abierta o cerrada. Cuando el líder empieza, se crea la partida
 * (createRoom, room.js) y el lobby le reenvía las órdenes de cada jugador.
 *
 * Desconexiones:
 *  - en espera: el jugador sale de la sala al momento;
 *  - en partida: room.drop(uid) y tiene 60 s para volver con el mismo uid
 *    (hello → room.back(uid) y se le repiten `room` y `started`); pasado, sale.
 *    Aunque no quede nadie conectado, la partida sigue ese minuto: así quien
 *    recarga la página (o se queda solo) puede volver. Si sale a propósito, no.
 * Si pasado ese tiempo no queda nadie, se para la partida y se borra.
 *
 * Al empezar, si hay checkKits (rank.js, con la cuenta de servicio), se leen
 * antes las partidas guardadas de los miembros (5 s como mucho): las mejoras de
 * cada uno son lo menos entre lo que dice su navegador y lo guardado, y si algo
 * no cuadra (Pokémon o shiny que no es suyo, cuenta baneada) o no se puede
 * leer, la partida se juega pero no sube al ranking de grupo (ranked: false).
 *
 * drain() (SIGTERM): ya no se crean salas ni se entra en ellas
 * (conn.close('restart')); las salas en espera se cierran y las partidas en
 * marcha siguen hasta acabar. `size` dice cuántas quedan (index.js sale en 0).
 *
 * No toca la red: recibe conns ({ uid, name, dex, shiny, send, close }) y
 * mensajes ya decodificados; index.js codifica lo que se manda con send().
 */
'use strict';
const crypto = require('crypto');

/** Letras del código: sin 0/O ni 1/I para que se lea y se dicte sin dudas. */
const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LEN = 6;
const MAX_MEMBERS = 10;
/** Tiempo para volver tras un corte o una recarga en partida (ms). Igual que RETRY_FOR en js/net/net.js. */
const BACK_MS = 60000;

/**
 * Crea el lobby.
 * @param {object} o
 * @param {Function} o.createRoom  ({members, seed, send, onOver, ranked}) → partida
 * @param {Function} [o.checkKits]  (jugadores) → Promise<Map uid → {up, ok}> (ver arriba)
 * @param {number} [o.maxRooms=30] salas a la vez como mucho
 * @param {Function} [o.setTimer]  (fn, ms) → id   (por defecto setTimeout)
 * @param {Function} [o.clearTimer] (id)           (por defecto clearTimeout)
 * @param {Function} [o.rand]      aleatorio en [0, 1) para códigos y semillas (por defecto crypto)
 */
/** Tiempo máximo para leer las partidas guardadas al empezar (ms). */
const CHECK_MS = 5000;

function createLobby({ createRoom, checkKits = null, maxRooms = 30, setTimer = setTimeout, clearTimer = clearTimeout, rand } = {}) {
  if (typeof createRoom !== 'function') throw new Error('createLobby necesita createRoom');
  const random = rand || (() => crypto.randomInt(0x100000000) / 0x100000000);
  /** código → sala { code, leader, members:[{uid,name,dex,shiny,on}], open, game, seed, timers:Map } */
  const rooms = new Map();
  /** uid → código de su sala (un uid sólo está en una). */
  const byUid = new Map();
  /** uid → conn actual (la última que hizo hello). */
  const conns = new Map();
  let draining = false;

  const err = (conn, reason) => conn.send({ t: 'err', reason });

  function newCode() {
    for (;;) {
      let c = '';
      for (let i = 0; i < CODE_LEN; i++) c += ALPHA[Math.floor(random() * ALPHA.length)];
      if (!rooms.has(c)) return c;
    }
  }

  /** Lo que se cuenta de la sala a sus miembros. */
  function info(r) {
    return { t: 'room', code: r.code, leader: r.leader, open: r.open,
      members: r.members.map(m => ({ uid: m.uid, name: m.name, dex: m.dex, shiny: m.shiny, on: m.on })) };
  }

  /** Manda a los miembros conectados de la sala. */
  function each(r, msg) {
    for (const m of r.members) if (m.on) { const c = conns.get(m.uid); if (c) c.send(msg); }
  }

  const started = r => ({ t: 'started', seed: r.seed, members: r.members.map(m => ({ uid: m.uid, name: m.name, dex: m.dex, shiny: m.shiny })) });

  /** Borra la sala (para la partida si la hay). */
  function destroy(r) {
    for (const t of r.timers.values()) clearTimer(t);
    r.timers.clear();
    for (const m of r.members) if (byUid.get(m.uid) === r.code) byUid.delete(m.uid);
    rooms.delete(r.code);
    const g = r.game;
    r.game = null;
    if (g) g.stop();
  }

  /** Saca a uid de la sala; pasa el liderato (a un conectado) y borra la sala si no queda nadie conectado. quiet: sin avisar. */
  function remove(r, uid, quiet) {
    const i = r.members.findIndex(m => m.uid === uid);
    if (i < 0) return;
    const t = r.timers.get(uid);
    if (t !== undefined) { clearTimer(t); r.timers.delete(uid); }
    const [m] = r.members.splice(i, 1);
    if (byUid.get(uid) === r.code) byUid.delete(uid);
    if (r.game && m.on) r.game.drop(uid);
    if (!r.members.some(x => x.on)) {
      // Partida en marcha y alguien más aún está a tiempo de volver (su corte
      // fue después): no se tira la sala al caducar el primero.
      if (!(r.game && r.timers.size > 0)) { destroy(r); return; }
    }
    if (!r.members.length) { destroy(r); return; }
    if (r.leader === uid) r.leader = (r.members.find(x => x.on) || r.members[0]).uid;
    if (!quiet) each(r, info(r));
  }

  /** Fin de una partida: la sala vuelve a la espera sin los desconectados. */
  function over(r, game) {
    if (rooms.get(r.code) !== r || r.game !== game) return;
    r.game = null;
    for (const t of r.timers.values()) clearTimer(t);
    r.timers.clear();
    if (draining) {
      // Apagándose: no se vuelve a la espera, se cierra la sala.
      const left = r.members.filter(m => m.on).map(m => conns.get(m.uid)).filter(Boolean);
      destroy(r);
      for (const c of left) { conns.delete(c.uid); c.close('restart'); }
      return;
    }
    for (const m of r.members.slice()) if (!m.on) remove(r, m.uid, true);
    if (rooms.get(r.code) === r) each(r, info(r));
  }

  function member(conn) {
    return { uid: conn.uid, name: conn.name, dex: conn.dex, shiny: conn.shiny, kit: conn.kit, on: true };
  }

  /** Sala actual de uid (o null). */
  const roomOf = uid => rooms.get(byUid.get(uid)) || null;

  /** Antes de crear o unirse: sale de la sala (en espera) en la que esté. */
  function free(conn) {
    const r = roomOf(conn.uid);
    if (r) remove(r, conn.uid);
  }

  /** Cierra la conexión y la olvida (así su close() posterior no hace nada). */
  function kick(conn, reason) {
    if (conns.get(conn.uid) === conn) conns.delete(conn.uid);
    conn.close(reason);
  }

  /**
   * Crea la partida. res: lo leído de las partidas guardadas (Map uid → {up, ok})
   * o null (sin comprobación configurada, o no se pudo leer).
   */
  function launch(r, res) {
    r.seed = Math.floor(random() * 0x100000000) >>> 0;
    const members = r.members.map(m => {
      const v = res && res.get(m.uid);
      const kit = Object.assign({}, m.kit || {});
      if (res) kit.up = v ? v.up : {};
      return { uid: m.uid, name: m.name, dex: m.dex, shiny: m.shiny, kit };
    });
    // Sin comprobación configurada (local) sube como siempre; con ella, sólo si todo cuadra.
    const ranked = !checkKits || (!!res && r.members.every(m => { const v = res.get(m.uid); return v && v.ok; }));
    let game = null;
    game = createRoom({
      members, seed: r.seed, ranked,
      send(uid, m) {
        if (rooms.get(r.code) !== r || r.game !== game) return;
        const mm = r.members.find(x => x.uid === uid);
        if (!mm || !mm.on) return;
        const c = conns.get(uid);
        if (c) return c.send(m);          // false: no ha salido (la sala lo necesita para los snap)
      },
      onOver() { over(r, game); },
    });
    r.game = game;
    each(r, started(r));
    game.start();
  }

  const handlers = {
    create(conn) {
      const cur = roomOf(conn.uid);
      if (cur && cur.game) return err(conn, 'ingame');
      if (draining) return kick(conn, 'restart');
      // Si está solo en su sala, al salir deja hueco; si no, no.
      const freed = cur && cur.members.length === 1 ? 1 : 0;
      if (rooms.size - freed >= maxRooms) return kick(conn, 'full');
      free(conn);
      const r = { code: newCode(), leader: conn.uid, members: [member(conn)], open: true, game: null, seed: 0, timers: new Map() };
      rooms.set(r.code, r);
      byUid.set(conn.uid, r.code);
      each(r, info(r));
    },

    join(conn, msg) {
      const code = String(msg.code || '').trim().toUpperCase();
      const cur = roomOf(conn.uid);
      if (cur && cur.game) return err(conn, 'ingame');
      if (draining) return kick(conn, 'restart');
      if (cur && cur.code === code) return conn.send(info(cur));
      const r = rooms.get(code);
      if (!r) return err(conn, 'nocode');
      if (r.game) return err(conn, 'started');
      if (!r.open) return err(conn, 'closed');
      if (r.members.length >= MAX_MEMBERS) return err(conn, 'full');
      free(conn);
      r.members.push(member(conn));
      byUid.set(conn.uid, r.code);
      each(r, info(r));
    },

    leave(conn) {
      const r = roomOf(conn.uid);
      if (r) remove(r, conn.uid);
    },

    open(conn, msg, r) {
      if (!r) return;
      if (r.leader !== conn.uid) return err(conn, 'leader');
      r.open = !!msg.v;
      each(r, info(r));
    },

    start(conn, msg, r) {
      if (!r) return;
      if (r.leader !== conn.uid) return err(conn, 'leader');
      if (r.game || r.starting) return err(conn, 'started');
      if (!checkKits) { launch(r, null); return; }
      // Antes, lo que tiene cada uno de verdad en su partida guardada.
      r.starting = true;
      const players = r.members.map(m => ({ uid: m.uid, dex: m.dex, shiny: !!m.shiny, up: (m.kit && m.kit.up) || {} }));
      let done = false;
      const go = res => {
        if (done) return;
        done = true;
        clearTimer(t);
        r.starting = false;
        if (rooms.get(r.code) !== r || r.game) return;
        launch(r, res);
      };
      const t = setTimer(() => go(null), CHECK_MS);
      let p;
      try { p = Promise.resolve(checkKits(players)); } catch (e) { p = Promise.reject(e); }
      p.then(go, e => { console.warn('[lobby] no se pudieron leer las partidas guardadas:', e && e.message); go(null); });
    },

    in(conn, msg, r) { if (r && r.game) r.game.input(conn.uid, msg); },
    pick(conn, msg, r) { if (r && r.game) r.game.pick(conn.uid, msg.choice); },
    reroll(conn, msg, r) { if (r && r.game && r.game.reroll) r.game.reroll(conn.uid); },
    hold(conn, msg, r) { if (r && r.game) r.game.hold(conn.uid, !!msg.on); },
  };

  return {
    /** Conexión autenticada. Si estaba en una partida y se había cortado, vuelve a ella. */
    hello(conn) {
      const old = conns.get(conn.uid);
      conns.set(conn.uid, conn);
      if (old && old !== conn) old.close('replaced');
      const r = roomOf(conn.uid);
      if (!r) return;
      const m = r.members.find(x => x.uid === conn.uid);
      if (!m) return;
      // En la espera, el hello nuevo trae su Pokémon y sus mejoras de ahora.
      if (!r.game) Object.assign(m, { name: conn.name, dex: conn.dex, shiny: conn.shiny, kit: conn.kit });
      if (!m.on) {
        const t = r.timers.get(conn.uid);
        if (t !== undefined) { clearTimer(t); r.timers.delete(conn.uid); }
        m.on = true;
        if (r.game) r.game.back(conn.uid);
        each(r, info(r));
      } else if (!r.game) each(r, info(r));
      else conn.send(info(r));
      if (r.game) conn.send(started(r));
    },

    /** Mensaje ya decodificado de una conexión. Los desconocidos se ignoran. */
    message(conn, msg) {
      if (!msg || typeof msg.t !== 'string' || conns.get(conn.uid) !== conn) return;
      const h = Object.prototype.hasOwnProperty.call(handlers, msg.t) && handlers[msg.t];
      if (!h) return;
      h(conn, msg, roomOf(conn.uid));
    },

    /** Se ha cortado la conexión. */
    close(conn) {
      if (conns.get(conn.uid) !== conn) return;
      conns.delete(conn.uid);
      const r = roomOf(conn.uid);
      if (!r) return;
      const m = r.members.find(x => x.uid === conn.uid);
      if (!m) return;
      if (!r.game) { remove(r, conn.uid); return; }
      m.on = false;
      r.game.drop(conn.uid);
      // Aunque sea el último: la sala aguanta BACK_MS para una recarga.
      r.timers.set(conn.uid, setTimer(() => {
        r.timers.delete(conn.uid);
        const mm = r.members.find(x => x.uid === conn.uid);
        if (rooms.get(r.code) === r && mm && !mm.on) remove(r, conn.uid);
      }, BACK_MS));
      each(r, info(r));
    },

    /** Apagado ordenado: sin salas nuevas; se cierran las de espera y siguen las partidas. */
    drain() {
      if (draining) return;
      draining = true;
      for (const r of [...rooms.values()]) {
        if (r.game) continue;
        const left = r.members.map(m => conns.get(m.uid)).filter(Boolean);
        destroy(r);
        for (const c of left) kick(c, 'restart');
      }
    },

    get draining() { return draining; },
    get size() { return rooms.size; },
  };
}

module.exports = { createLobby, BACK_MS };
