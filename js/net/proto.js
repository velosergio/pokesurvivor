/* ============ proto.js — protocolo del cooperativo (navegador y servidor) ============
 *
 * El mismo archivo en los dos lados: en el navegador define G.Proto; en Node
 * se usa con require (server/proto.js). Sin dependencias.
 *
 * Mensajes de texto (JSON con el tipo en el campo `t`):
 *   navegador -> servidor: hello{token,proto,name,dex,shiny} create join{code} leave
 *                          open{v} start pick{choice} reroll hold{on}
 *                          back (volver a la partida de la que te fuiste: ver `away`)
 *   servidor -> navegador: hi{uid} (hello aceptado) room{code,leader,members,open}
 *                          started{seed,members} ev{list:[...]} level{options}
 *                          over{results} bye{reason} err{reason}
 *                          away{code,n} (tras el hello: tu partida en grupo sigue sin ti,
 *                          con n conectados; con `back` vuelves a ella)
 *   (encJson('ev', [...]) mete la lista en `list`.)
 *
 * Mensajes binarios (primer byte = tipo; números en little endian):
 *   1 in   (16 B): seq u32 · x f32 · y f32 · dx i8 · dy i8 · move u8
 *          dx, dy: dirección normalizada (-1..1) ×127.
 *   2 snap: ack u32 · t f32 · lv u16 · xp f32 · xpNext f32
 *          · u16 n + n jugadores   (id u8 · x f32 · y f32 · hp f32 · maxHp f32 · anim u8 · dead u8)  19 B
 *          · u16 n + n enemigos nuevos      (id u32 · dex u16 · x f32 · y f32 · hp f32 · maxHp f32 · flags u8)  23 B
 *          · u16 n + n enemigos cambiados   (igual que los nuevos)
 *          · u16 n + n ids de enemigos idos (u32)
 *          · u16 n + n disparos             (x f32 · y f32 · kind u8)  9 B
 *          · u16 n + n objetos nuevos       (id u32 · kind u8 · x f32 · y f32)  13 B
 *          · u16 n + n ids de objetos idos  (u32)
 *   Un snap típico (4 jugadores; con 10, ~120 B más; 80 enemigos, 20 disparos, 30 objetos) ocupa ~2,5 KB.
 *
 * Coordenadas, vida y XP van en float32 (de sobra para el mundo); lo que no
 * cabe en su tipo (ids, índices) lanza un Error al codificar.
 */
(function () {
  'use strict';
  /** Versión del protocolo: sube sólo cuando cambia el protocolo o la jugabilidad compartida. */
  const VERSION = 4;
  /** Tipos binarios (primer byte). */
  const BIN = { in: 1, snap: 2 };
  /** Tipos de texto que se aceptan. */
  const JSON_TYPES = ['hello', 'create', 'join', 'leave', 'open', 'start', 'pick', 'reroll', 'hold', 'back',
    'hi', 'away', 'room', 'started', 'ev', 'level', 'over', 'bye', 'err'];
  const IN_LEN = 16;
  const LIMIT_U16 = 0xFFFF;

  /** Escritor sobre un búfer que crece solo. */
  function writer(size) {
    let buf = new ArrayBuffer(size), dv = new DataView(buf), o = 0;
    const need = n => {
      if (o + n <= buf.byteLength) return;
      const nb = new ArrayBuffer(Math.max(buf.byteLength * 2, o + n));
      new Uint8Array(nb).set(new Uint8Array(buf, 0, o));
      buf = nb; dv = new DataView(buf);
    };
    const int = (v, max, what) => {
      if (!Number.isInteger(v) || v < 0 || v > max) throw new Error('proto: ' + what + ' fuera de rango: ' + v);
      return v;
    };
    return {
      u8(v, what) { need(1); dv.setUint8(o, int(v, 0xFF, what || 'u8')); o += 1; },
      i8(v) { need(1); dv.setInt8(o, v); o += 1; },
      u16(v, what) { need(2); dv.setUint16(o, int(v, LIMIT_U16, what || 'u16'), true); o += 2; },
      u32(v, what) { need(4); dv.setUint32(o, int(v, 0xFFFFFFFF, what || 'u32'), true); o += 4; },
      f32(v) { need(4); dv.setFloat32(o, +v || 0, true); o += 4; },
      done: () => new Uint8Array(buf, 0, o),
    };
  }

  /** Lector; DataView ya lanza RangeError si se pasa del final. */
  function reader(u8) {
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    let o = 0;
    const r = {
      u8() { const v = dv.getUint8(o); o += 1; return v; },
      i8() { const v = dv.getInt8(o); o += 1; return v; },
      u16() { const v = dv.getUint16(o, true); o += 2; return v; },
      u32() { const v = dv.getUint32(o, true); o += 4; return v; },
      f32() { const v = dv.getFloat32(o, true); o += 4; return v; },
      end() { if (o !== dv.byteLength) throw new Error('proto: sobran ' + (dv.byteLength - o) + ' bytes'); },
    };
    return r;
  }

  /** Cualquier binario (Uint8Array, Buffer de Node, ArrayBuffer, vista) -> Uint8Array; si no, null. */
  function bytes(data) {
    if (data instanceof Uint8Array) return data;
    if (data instanceof ArrayBuffer) return new Uint8Array(data);
    if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    // ArrayBuffer de otro contexto (vm, iframe): instanceof falla.
    if (data && Object.prototype.toString.call(data) === '[object ArrayBuffer]') return new Uint8Array(data);
    return null;
  }

  /** Dirección -1..1 -> int8 (×127). */
  const dir = v => Math.max(-127, Math.min(127, Math.round((+v || 0) * 127)));
  const list = a => (Array.isArray(a) ? a : []);
  const count = (w, a, what) => { if (a.length > LIMIT_U16) throw new Error('proto: demasiados ' + what); w.u16(a.length); };

  /** Codifica la entrada del jugador. @param {{seq:number,x:number,y:number,dx:number,dy:number,move:number}} m */
  function encIn(m) {
    const w = writer(IN_LEN);
    w.u8(BIN.in); w.u32(m.seq >>> 0, 'seq'); w.f32(m.x); w.f32(m.y);
    w.i8(dir(m.dx)); w.i8(dir(m.dy)); w.u8(m.move | 0, 'move');
    return w.done();
  }

  /** Decodifica una entrada. @returns {{type:'in',seq,x,y,dx,dy,move}} */
  function decIn(buf) {
    const b = bytes(buf);
    if (!b) throw new Error('proto: in no es binario');
    const r = reader(b);
    if (r.u8() !== BIN.in) throw new Error('proto: no es un in');
    const m = { type: 'in', seq: r.u32(), x: r.f32(), y: r.f32(), dx: r.i8() / 127, dy: r.i8() / 127, move: r.u8() };
    r.end();
    return m;
  }

  function encEnemy(w, e) {
    w.u32(e.id, 'id de enemigo'); w.u16(e.dex | 0, 'dex'); w.f32(e.x); w.f32(e.y);
    w.f32(e.hp); w.f32(e.maxHp); w.u8(e.flags | 0, 'flags');
  }
  function decEnemy(r) {
    return { id: r.u32(), dex: r.u16(), x: r.f32(), y: r.f32(), hp: r.f32(), maxHp: r.f32(), flags: r.u8() };
  }

  /**
   * Codifica una instantánea. Las listas que falten van vacías.
   * @param {{ack:number,t:number,lv:number,xp:number,xpNext:number,players:Array,
   *   enemies:{add:Array,upd:Array,gone:number[]},shots:Array,pickups:{add:Array,gone:number[]}}} s
   */
  function encSnap(s) {
    const pl = list(s.players), en = s.enemies || {}, sh = list(s.shots), pk = s.pickups || {};
    const eAdd = list(en.add), eUpd = list(en.upd), eGone = list(en.gone), pAdd = list(pk.add), pGone = list(pk.gone);
    const w = writer(19 + 14 + pl.length * 19 + (eAdd.length + eUpd.length) * 23 + eGone.length * 4 +
      sh.length * 9 + pAdd.length * 13 + pGone.length * 4);
    w.u8(BIN.snap); w.u32((s.ack || 0) >>> 0, 'ack'); w.f32(s.t); w.u16(s.lv | 0, 'lv'); w.f32(s.xp); w.f32(s.xpNext);
    count(w, pl, 'jugadores');
    for (const p of pl) {
      w.u8(p.id, 'id de jugador'); w.f32(p.x); w.f32(p.y); w.f32(p.hp); w.f32(p.maxHp);
      w.u8(p.anim | 0, 'anim'); w.u8(p.dead ? 1 : 0);
    }
    count(w, eAdd, 'enemigos'); for (const e of eAdd) encEnemy(w, e);
    count(w, eUpd, 'enemigos'); for (const e of eUpd) encEnemy(w, e);
    count(w, eGone, 'enemigos'); for (const id of eGone) w.u32(id, 'id de enemigo');
    count(w, sh, 'disparos');
    for (const d of sh) { w.f32(d.x); w.f32(d.y); w.u8(d.kind | 0, 'kind'); }
    count(w, pAdd, 'objetos');
    for (const p of pAdd) { w.u32(p.id, 'id de objeto'); w.u8(p.kind | 0, 'kind'); w.f32(p.x); w.f32(p.y); }
    count(w, pGone, 'objetos'); for (const id of pGone) w.u32(id, 'id de objeto');
    return w.done();
  }

  /** Decodifica una instantánea (mismo objeto que encSnap, con `type: 'snap'`). */
  function decSnap(buf) {
    const b = bytes(buf);
    if (!b) throw new Error('proto: snap no es binario');
    const r = reader(b);
    if (r.u8() !== BIN.snap) throw new Error('proto: no es un snap');
    const s = { type: 'snap', ack: r.u32(), t: r.f32(), lv: r.u16(), xp: r.f32(), xpNext: r.f32(),
      players: [], enemies: { add: [], upd: [], gone: [] }, shots: [], pickups: { add: [], gone: [] } };
    for (let n = r.u16(); n > 0; n--) {
      s.players.push({ id: r.u8(), x: r.f32(), y: r.f32(), hp: r.f32(), maxHp: r.f32(), anim: r.u8(), dead: r.u8() !== 0 });
    }
    for (let n = r.u16(); n > 0; n--) s.enemies.add.push(decEnemy(r));
    for (let n = r.u16(); n > 0; n--) s.enemies.upd.push(decEnemy(r));
    for (let n = r.u16(); n > 0; n--) s.enemies.gone.push(r.u32());
    for (let n = r.u16(); n > 0; n--) s.shots.push({ x: r.f32(), y: r.f32(), kind: r.u8() });
    for (let n = r.u16(); n > 0; n--) s.pickups.add.push({ id: r.u32(), kind: r.u8(), x: r.f32(), y: r.f32() });
    for (let n = r.u16(); n > 0; n--) s.pickups.gone.push(r.u32());
    r.end();
    return s;
  }

  /**
   * Mensaje de texto. @param {string} type uno de JSON_TYPES
   * @param {object|Array} [obj] campos; si es una lista (ev), va en `list`
   * @returns {string}
   */
  function encJson(type, obj) {
    if (!JSON_TYPES.includes(type)) throw new Error('proto: tipo desconocido: ' + type);
    const body = Array.isArray(obj) ? { list: obj } : (obj || {});
    if ('t' in body) throw new Error('proto: el campo t está reservado');
    return JSON.stringify(Object.assign({ t: type }, body));
  }

  function decText(text) {
    const m = JSON.parse(text);
    if (!m || typeof m !== 'object' || Array.isArray(m)) throw new Error('proto: el mensaje no es un objeto');
    if (!JSON_TYPES.includes(m.t)) throw new Error('proto: tipo desconocido: ' + m.t);
    const out = { type: m.t };
    // __proto__ no se copia: cambiaría el prototipo de out y colaría campos que no vienen.
    for (const k of Object.keys(m)) if (k !== 't' && k !== '__proto__') out[k] = m[k];
    return out;
  }

  /**
   * Decodifica cualquier mensaje: texto JSON o binario (Uint8Array, Buffer,
   * ArrayBuffer). Un binario que empieza por '{' se lee como texto (ws de Node
   * entrega también el texto como Buffer). Lanza Error si no se entiende.
   * @returns {{type:string}}
   */
  function decode(data) {
    if (typeof data === 'string') return decText(data);
    const b = bytes(data);
    if (!b || !b.length) throw new Error('proto: mensaje vacío o de tipo no válido');
    if (b[0] === BIN.in) return decIn(b);
    if (b[0] === BIN.snap) return decSnap(b);
    if (b[0] === 0x7B) return decText(new TextDecoder('utf-8', { fatal: true }).decode(b));
    throw new Error('proto: tipo binario desconocido: ' + b[0]);
  }

  const Proto = { VERSION, BIN, JSON_TYPES, encIn, decIn, encSnap, decSnap, encJson, decode };
  if (typeof module === 'object' && module && module.exports) module.exports = Proto;
  else G.Proto = Proto;
})();
