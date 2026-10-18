/* ============ daily-mode.js — el Desafío diario como modo de juego ============
 * Una run al día con el Pokémon y la semilla del día (G.Daily.today), iguales
 * para todos; la marca va a la tabla del día (x_d...). El intento se gasta al
 * EMPEZAR (G.DailyNet.start, vigilado por firestore.rules): cerrar la pestaña
 * no da otro. Sólo con cuenta y con conexión.
 *
 * save.daily = { played, streak, last, prev, lastT, best, wins, top10 }
 *   played/streak/last cuentan al empezar (una partida cortada no rompe la
 *   racha); prev = el día jugado antes de `last`; lastT = tu tiempo de hoy;
 *   best/wins/top10 = mejor puesto, días ganados y días en el top 10 (se
 *   saben al cobrar el premio, al día siguiente). Los logros, en achievements.js.
 */
G.Modes.add((() => {
  let run = null;            // { day, dex, seed } del intento en curso (desde begin)

  const reto = () => run || G.Daily.today();
  const daily = () => (G.DB.save.daily = G.DB.save.daily || {});

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
      const d = daily();
      d.streak = G.Daily.nextStreak(d, t.day);
      if (d.last !== t.day) { d.prev = d.last || ''; d.last = t.day; d.played = (d.played || 0) + 1; }
      d.lastT = 0;
      G.Progress.checkAch();
      G.DB.commit(true);
      G.Ranking.runStarted('s');
    },

    // La tabla del día en que EMPEZÓ (si acabas pasada la medianoche, sigue siendo la de ayer).
    boards() { return G.Ranking.dailyBoards(reto().day); },
    finish({ t }) {
      daily().lastT = t;
      return { t1: G.Daily.playTickets(t), t10: 0 };
    },

    /**
     * El premio por tu puesto en la tabla de ayer (una vez, desde la 01:30).
     * → { rank, prize } si se ha dado algo; null si no.
     */
    async claimYesterday() {
      if (!G.Daily.claimOpen()) return null;
      const yday = G.Daily.prevDay(G.Daily.dayId());
      const st = await G.DailyNet.state();
      const d = daily();
      const playedY = st && (st.d === yday || (st.d === G.Daily.dayId() && d.prev === yday));
      if (!playedY || st.claimed >= yday) return null;
      let me;
      try { me = await G.Ranking.myRank('x', yday); } catch (e) { return null; }
      const rank = me && me.pos ? me.pos : 0;
      // Se apunta aunque no haya premio: así no se vuelve a mirar la tabla.
      if (!await G.DailyNet.claim(yday)) return null;
      const prize = G.Daily.placePrize(rank);
      if (!prize.t1 && !prize.t10) return null;
      if (rank <= 10) d.top10 = (d.top10 || 0) + 1;
      if (rank === 1) d.wins = (d.wins || 0) + 1;
      d.best = d.best ? Math.min(d.best, rank) : rank;
      G.Progress.grant(prize);
      G.Progress.checkAch();
      G.DB.commit(true);
      return { rank, prize };
    }
  };
})());
