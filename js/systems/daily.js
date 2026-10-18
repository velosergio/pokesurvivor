/* ============ daily.js — cálculos del Desafío diario ============
 * Todo lo del día sale de la fecha en la hora del juego (G.Config.tz): el
 * Pokémon y la semilla son los mismos para todos sin preguntar a ningún
 * servidor. Aquí sólo hay cuentas (sin red ni pantalla); el modo está en
 * js/modes/daily-mode.js y el intento único en js/net/daily-net.js.
 *
 *   día = 'AAAAMMDD' (como las tablas del ranking: x_d20261018)
 */
G.Daily = (() => {
  // Tickets ×1 por aguantar (no se suman: el último corte que pases).
  const PLAY = [[300, 1], [600, 2], [1200, 3]];
  const FINAL = 5;                 // llegar a la Sentencia de Arceus (G.Judgment.AT)
  const CLAIM_AT = 90;             // la tabla de ayer es definitiva a la 01:30 (minutos)

  const p2 = n => String(n).padStart(2, '0');
  const idOf = (y, m, d) => y + p2(m) + p2(d);

  /** El día de hoy (o de `date`) en la hora del juego. */
  function dayId(date = new Date()) {
    const { y, m, d } = G.U.gameDate(date);
    return idOf(y, m, d);
  }

  /** El día anterior a `day`. */
  function prevDay(day) {
    const t = new Date(Date.UTC(+day.slice(0, 4), +day.slice(4, 6) - 1, +day.slice(6, 8) - 1));
    return idOf(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
  }

  /** Los que se pueden jugar: los de la Pokédex con sprites. */
  let pool = null;
  const playable = () => pool || (pool = G.DEX.filter(p => G.SPRITE_META[p.dex]));

  /** El reto de hoy: { day, dex, seed } (igual para todos). */
  function today(date = new Date()) { return forDay(dayId(date)); }

  /** El reto de un día cualquiera ('AAAAMMDD'). */
  function forDay(day) {
    const n = +day, list = playable();
    const dex = list[Math.floor(G.U.hash(n, 0, 0xD411) * list.length)].dex;
    const seed = Math.floor(G.U.hash(n, 1, 0x5EED) * 4294967296) || 1;
    return { day, dex, seed };
  }

  /** Tickets ×1 por el tiempo aguantado (segundos). */
  function playTickets(t) {
    if (t >= G.Judgment.AT) return FINAL;
    let n = 0;
    for (const [at, k] of PLAY) if (t >= at) n = k;
    return n;
  }

  /** Premio por el puesto en la tabla del día (se cobra al día siguiente). */
  function placePrize(rank) {
    if (rank === 1) return { t1: 0, t10: 2 };
    if (rank === 2 || rank === 3) return { t1: 0, t10: 1 };
    if (rank >= 4 && rank <= 10) return { t1: 5, t10: 0 };
    return { t1: 0, t10: 0 };
  }

  /** ¿Ya se puede cobrar el premio de ayer? (desde la 01:30: antes aún pueden entrar marcas) */
  function claimOpen(date = new Date()) {
    const g = G.U.gameDate(date);
    return g.h * 60 + g.mi >= CLAIM_AT;
  }

  /** La racha al jugar `day`: sigue si jugaste ayer, igual si ya contaba hoy, y si no, 1. */
  function nextStreak(d, day) {
    const streak = (d && d.streak) || 0;
    if (d && d.last === day) return streak;
    return d && d.last === prevDay(day) ? streak + 1 : 1;
  }

  return { dayId, prevDay, today, forDay, playTickets, placePrize, claimOpen, nextStreak };
})();
