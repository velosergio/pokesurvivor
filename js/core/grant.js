/* ============ grant.js — aplicar la libreta de regalos a una partida ya fusionada ============
 * Puro: no toca la red. En el navegador queda en G.Grant.applyGrant.
 */
(function (root) {
  const num = v => (Number.isFinite(+v) && +v > 0 ? Math.floor(+v) : 0);
  function applyGrant(save, grant) {
    grant = grant || {};
    if (!save.tickets) save.tickets = { t1: 0, t10: 0 };
    const dc = Math.max(0, num(grant.coins) - num(save.grantedCoins));
    const dt = Math.max(0, num(grant.t10) - num(save.grantedT10));
    save.coins = num(save.coins) + dc;
    save.tickets.t1 = num(save.tickets.t1);
    save.tickets.t10 = num(save.tickets.t10) + dt;
    save.grantedCoins = num(save.grantedCoins) + dc;
    save.grantedT10 = num(save.grantedT10) + dt;
    return { dc: dc, dt: dt };
  }
  root.applyGrant = applyGrant;
})(typeof module !== 'undefined' && module.exports ? module.exports : (G.Grant = G.Grant || {}));
