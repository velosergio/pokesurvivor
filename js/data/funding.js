/* ============ funding.js — donaciones ============
 * Las donaciones son voluntarias, no dan ninguna ventaja en el juego y se
 * usan sólo para mantenerlo en línea: servidores y dominio.
 * Este archivo es la fuente de lo que se enseña en el juego (botón "Apoyar")
 * y en la página /apoyar/. Se actualiza a mano:
 *
 *   kofi      usuario de Ko-fi (vacío = el botón no sale)       -> js/config.js
 *   sponsors  usuario de GitHub Sponsors (para quien entra al repositorio) -> js/config.js
 *   costs     gastos [concepto, euros al mes]; si el coste no es fijo, un texto
 */
G.Funding = {
  kofi: G.Config.kofi,
  sponsors: G.Config.sponsors,
  costs: [
    ['Servidores (partidas, cuentas, ranking y multijugador)', 'Según cuánta gente juegue']
  ],
  get url() { return this.kofi ? 'https://ko-fi.com/' + this.kofi : ''; }
};
