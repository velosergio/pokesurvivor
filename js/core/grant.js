/* ============ grant.js — aplicar la libreta de regalos a una partida ya fusionada ============
 * Puro: no toca la red. En el navegador queda en G.Grant.applyGrant.
 * Pokémon: libreta.mons / libreta.shinies son { dex: true }. No hace falta llevar la cuenta
 * de lo ya dado: owned y shiny se fusionan por unión, así que darlo otra vez no cambia nada.
 */
(function (root) {
  const num = v => (Number.isFinite(+v) && +v > 0 ? Math.floor(+v) : 0);
  const dexes = m => (m && typeof m === 'object' ? Object.keys(m).filter(d => m[d] && num(d) > 0 && String(num(d)) === d) : []);
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
    let dm = 0;
    if (!save.owned) save.owned = {};
    if (!save.shiny) save.shiny = {};
    const give = (coll, d) => { if (!save[coll][d]) { save[coll][d] = { at: Date.now(), from: 'gift' }; dm++; } };
    for (const d of dexes(grant.mons)) give('owned', d);
    for (const d of dexes(grant.shinies)) { give('owned', d); give('shiny', d); }
    return { dc: dc, dt: dt, dm: dm };
  }
  /*
   * Regalo a todos (gifts/all, botón del regalo en Debug): sus totales se suman a los
   * de la libreta propia. Como ambos sólo crecen, grantedCoins / grantedT10 siguen
   * valiendo: lo de gifts/all se da una vez por cuenta (también a las que se creen después).
   */
  function withAll(grant, all) {
    const g = Object.assign({}, grant || {});
    g.coins = num(g.coins) + num(all && all.coins);
    g.t10 = num(g.t10) + num(all && all.t10);
    return g;
  }
  root.applyGrant = applyGrant;
  root.withAll = withAll;
})(typeof module !== 'undefined' && module.exports ? module.exports : (G.Grant = G.Grant || {}));
