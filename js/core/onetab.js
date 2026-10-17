/* ============ onetab.js — el juego, en una sola pestaña a la vez ============
 * Todas las pestañas de un navegador apuntan las monedas y los tickets en el
 * mismo aparato de la libreta (db.js) y, al fusionar, lo de una tapaba lo de
 * la otra: gastar en dos pestañas devolvía parte de lo gastado (tiradas del
 * gacha gratis) y ganar en dos perdía parte de lo ganado (17-10-2026). Por eso
 * el juego sólo corre en una pestaña (Web Locks: el candado se suelta solo al
 * cerrarla o recargarla).
 *
 *   - Al abrir el juego con otra pestaña dentro: aviso y botón «Jugar aquí».
 *   - «Jugar aquí» le quita el candado a la otra: ésa deja de guardar al
 *     momento (G.DB.freeze) y se recarga, y enseña el mismo aviso.
 * Sin Web Locks (navegadores viejos, file://) se juega como antes.
 */
G.OneTab = (() => {
  const NAME = 'pokesurvivor.tab';
  let held = false;

  /** Otra pestaña ha pulsado «Jugar aquí»: aquí no se guarda nada más. */
  function lost() {
    G.DB.freeze();
    location.reload();
  }

  /**
   * Pide el candado (steal: quitárselo a otra pestaña).
   * → true si lo tiene (o no hay Web Locks), false si otra pestaña lo tiene.
   */
  function request(steal) {
    return new Promise(resolve => {
      const locks = navigator.locks;
      if (!locks || !locks.request) { resolve(true); return; }
      try {
        locks.request(NAME, steal ? { steal: true } : { ifAvailable: true }, lock => {
          if (!lock) { resolve(false); return null; }
          held = true;
          resolve(true);
          return new Promise(() => {});            // se queda hasta cerrar la pestaña
        }).catch(() => {
          if (held) { held = false; lost(); }      // se lo ha quitado otra pestaña
          else resolve(true);                      // Web Locks no disponible aquí
        });
      } catch (e) { resolve(true); }
    });
  }

  /** Antes de leer la partida (db.js ready): espera a tener el juego para esta pestaña. */
  async function claim() {
    if (await request(false)) return;
    const el = document.getElementById('onetab');
    el.classList.remove('hidden');
    await new Promise(res => { document.getElementById('onetab-go').onclick = res; });
    el.classList.add('hidden');
    await request(true);
  }

  return { claim, get held() { return held; } };
})();
