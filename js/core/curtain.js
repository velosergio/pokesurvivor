/* ============ curtain.js — cuánto tapa el telón de la grieta ============
 * Puro: no dibuja ni toca el DOM. En el navegador queda en G.Curtain.
 * 0,25 s opaco del todo y 0,4 s abriéndose en línea. A los 0,65 s se apaga.
 */
(function (root) {
  const HOLD = 0.25, FADE = 0.4, TOTAL = HOLD + FADE;

  function alpha(t) {
    if (t < HOLD) return 1;
    if (t >= TOTAL - 1e-9) return 0;
    return 1 - (t - HOLD) / FADE;
  }

  function create() {
    let t = -1, col = '#c9a6ff';
    return {
      start(c) { col = c || '#c9a6ff'; t = 0; },
      tick(dt) {
        if (t < 0) return;
        t += dt;
        if (t >= TOTAL - 1e-9) t = -1;
      },
      get on() { return t >= 0; },
      get alpha() { return t < 0 ? 0 : alpha(t); },
      get color() { return col; },
      lock(cam, pl) {
        if (t < 0) return;
        cam.x = pl.x + (pl.netOffX || 0);
        cam.y = pl.y + (pl.netOffY || 0);
      }
    };
  }

  root.create = create;
})(typeof module !== 'undefined' && module.exports ? module.exports : (G.Curtain = G.Curtain || {}));
