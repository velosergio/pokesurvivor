/* ============ daily-mode.js — el Desafío diario como modo de juego ============
 * Una run al día con el Pokémon y la semilla del día (G.Daily.today), iguales
 * para todos; la marca va a la tabla del día (x_d...). El intento se gasta al
 * EMPEZAR (G.DailyNet.start, vigilado por firestore.rules): cerrar la pestaña
 * no da otro. Sólo con cuenta y con conexión.
 */
G.Modes.add((() => {
  let run = null;            // { day, dex, seed } del intento en curso (desde begin)

  const reto = () => run || G.Daily.today();

  return {
    id: 'daily',
    hero() { return { mon: G.DEX_BY[reto().dex], shiny: false }; },
    seed() { return reto().seed; },

    async availability() {
      if (G.DB.guest) return { ok: false, reason: 'guest' };
      if (!G.DB.online) return { ok: false, reason: 'offline' };
      const day = G.Daily.dayId();
      let st;
      try { st = await G.DailyNet.state(); } catch (e) { return { ok: false, reason: 'offline' }; }
      if (st && st.d === day) {
        const d = G.DB.save.daily || {};
        return { ok: false, reason: 'played', last: { t: d.lastT || 0, day } };
      }
      return { ok: true };
    },

    async begin() {
      const t = G.Daily.today();
      await G.DailyNet.start(t.day);      // si falla, no se empieza (ni se gasta el intento)
      run = t;
      G.Ranking.runStarted('s');
    },

    // La tabla del día en que EMPEZÓ (si acabas pasada la medianoche, sigue siendo la de ayer).
    boards() { return G.Ranking.dailyBoards(reto().day); },
    finish({ t }) { return { t1: G.Daily.playTickets(t), t10: 0 }; }
  };
})());
