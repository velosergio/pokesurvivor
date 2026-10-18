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

  /** Gasta el intento de `day`. Falla (sin gastar nada) si no hay red o ya se jugó. */
  async function start(day) {
    const fb = fbx();
    if (!fb) throw new Error('sin conexión');
    const st = await state();
    if (st && st.d >= day) throw new Error('ya jugado');
    const claimed = st ? st.claimed : '';
    await ref(fb).set({ d: day, at: firebase.firestore.FieldValue.serverTimestamp(), claimed });
    cache = { d: day, claimed };
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

  return { state, start, claim };
})();
