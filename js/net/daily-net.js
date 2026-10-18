/* ============ daily-net.js — el intento del Desafío diario en Firestore ============
 *
 *   daily/{uid}   { d, at, claimed }
 *                 d = último día jugado ('AAAAMMDD'), claimed = último día
 *                 cuyo premio por puesto se cobró ('' si ninguno)
 *
 * firestore.rules sólo deja avanzar d (un intento al día, gastado al EMPEZAR)
 * y cobrar cada día una vez, ya cerrado. Se lee una vez por sesión (1 lectura)
 * y lo escrito se recuerda aquí.
 */
G.DailyNet = (() => {
  const fbx = () => G.DB.online ? G.DB.fb : null;
  const ref = fb => fb.fs.collection('daily').doc(fb.uid);
  let cache = null, cacheUid = null;      // { d, claimed } de la cuenta de ahora

  /** El intento guardado ({ d, claimed }, o null si nunca has jugado). */
  async function state() {
    const fb = fbx();
    if (!fb) throw new Error('sin conexión');
    if (cacheUid === fb.uid) return cache;
    const s = await ref(fb).get();
    cache = s.exists ? { d: s.data().d || '', claimed: s.data().claimed || '' } : null;
    cacheUid = fb.uid;
    return cache;
  }

  const fail = (code, msg) => Object.assign(new Error(msg), { code });

  /**
   * Gasta el intento de `day`, en una transacción: lee lo que hay de verdad en
   * el servidor (otro aparato puede haber jugado ya) y, sin red, falla en vez
   * de quedarse esperando a que vuelva. Si falla, no se gasta nada.
   * Errores: code 'played' (ya jugado hoy) o 'unavailable' (sin conexión).
   */
  async function start(day) {
    const fb = fbx();
    if (!fb) throw fail('unavailable', 'sin conexión');
    let timer;
    const late = new Promise((_, no) => { timer = setTimeout(() => no(fail('unavailable', 'sin respuesta')), api.timeout); });
    try {
      const now = await Promise.race([late, fb.fs.runTransaction(async tx => {
        const s = await tx.get(ref(fb));
        const old = s.exists ? s.data() : null;
        if (old && old.d >= day) throw fail('played', 'ya jugado');
        const claimed = (old && old.claimed) || '';
        tx.set(ref(fb), { d: day, at: firebase.firestore.FieldValue.serverTimestamp(), claimed });
        return { d: day, claimed };
      })]);
      cache = now; cacheUid = fb.uid;
    } catch (e) {
      cacheUid = null;                     // lo que se sabía puede estar mal: se vuelve a leer
      if (e.code === 'played') throw e;
      throw e.code === 'unavailable' ? e : fail(e.code === 'permission-denied' ? 'played' : 'unavailable', e.message);
    } finally { clearTimeout(timer); }
  }

  /** Apunta el premio de `day` como cobrado. → false si las reglas no lo dejan. */
  async function claim(day) {
    const fb = fbx();
    if (!fb) return false;
    try {
      await ref(fb).update({ claimed: day });
      if (cache) cache.claimed = day;
      return true;
    } catch (e) {
      console.warn('[Diario] cobro:', e.code || e.message);
      return false;
    }
  }

  const api = { state, start, claim, timeout: 10000 };   // timeout: ms esperando al servidor al empezar
  return api;
})();
