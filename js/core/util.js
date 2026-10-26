/* ============ util.js — helpers compartidos ============ */
window.G = window.G || {};

/** Altura a la que vuelan proyectiles y efectos sobre el plano del suelo. */
G.LIFT = 18;

G.U = {
  clamp(v, a, b) { return v < a ? a : v > b ? b : v; },
  /*
   * Lo que llega de OTROS jugadores (ranking, perfiles, reportes) se limpia
   * con esto al leerlo, antes de usarlo en ningún sitio (18-10-2026: alguien
   * metió código en el "nivel" de su fila del ranking y se ejecutaba en el
   * navegador de quien lo abría). Un número es siempre un número y un texto,
   * siempre texto (y se escapa al pintarlo).
   */
  int(v, max = 1e12) { return Number.isFinite(+v) && +v > 0 ? Math.min(max, Math.floor(+v)) : 0; },
  str(v, max = 64) { return typeof v === 'string' ? v.slice(0, max) : ''; },
  list(v, max = 50) { return Array.isArray(v) ? v.slice(0, max) : []; },
  lerp(a, b, t) { return a + (b - a) * t; },
  // rand, randInt, pick y pickN: los de G.RNG.wrap sobre Math.random (sin
  // semilla; para lo visual. La partida usa los flujos de G.RNG).
  ...(({ rand, randInt, pick, pickN }) => ({ rand, randInt, pick, pickN }))(G.RNG.wrap(() => Math.random())),

  dist(ax, ay, bx, by) { return Math.hypot(bx - ax, by - ay); },
  dist2(ax, ay, bx, by) { const dx = bx - ax, dy = by - ay; return dx * dx + dy * dy; },

  /** Normaliza un vector; devuelve [0,0] si es nulo. */
  norm(x, y) { const m = Math.hypot(x, y); return m > 1e-6 ? [x / m, y / m] : [0, 0]; },

  /** Interpolación independiente del framerate. */
  damp(a, b, rate, dt) { return b + (a - b) * Math.exp(-rate * dt); },

  /** Hash determinista 2D -> [0,1). Para generar el mapa siempre igual. */
  hash(x, y, seed = 0) {
    // Todo en enteros de 32 bits con Math.imul: es la función más llamada
    // al hornear el mapa, y así V8 no sale nunca de la ruta rápida.
    let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed | 0, 2246822519);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  },

  /**
   * Fecha y hora en la hora del juego (G.Config.tz; server/rank.js tiene la misma
   * cuenta). → { y, m, d, h, mi, s, wd } con wd = 1 (lunes) … 7 (domingo).
   */
  gameDate(date = new Date()) {
    const p = {};
    for (const x of new Intl.DateTimeFormat('en-CA', { timeZone: G.Config.tz, hourCycle: 'h23', year: 'numeric', month: '2-digit',
      day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(date)) p[x.type] = x.value;
    const y = +p.year, m = +p.month, d = +p.day;
    return { y, m, d, h: +p.hour, mi: +p.minute, s: +p.second, wd: new Date(Date.UTC(y, m - 1, d)).getUTCDay() || 7 };
  },

  /** "2026-10-17": el día de hoy en la hora del juego. */
  gameDay(date = new Date()) {
    const { y, m, d } = G.U.gameDate(date);
    return y + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');
  },

  /** Milisegundos hasta la próxima medianoche (o el próximo lunes, con week) en la hora del juego. */
  msUntilReset(week = false, date = new Date()) {
    const g = G.U.gameDate(date);
    const days = week ? 8 - g.wd : 1;
    return days * 86400000 - ((g.h * 60 + g.mi) * 60 + g.s) * 1000 - date.getMilliseconds();
  },

  /** "3:07" a partir de segundos. */
  mmss(s) {
    const m = Math.floor(s / 60);
    return m + ':' + String(Math.floor(s % 60)).padStart(2, '0');
  },
  /** Como mmss, pero con horas si pasa de una: "1:02:05". */
  hmmss(t) { return t >= 3600 ? Math.floor(t / 3600) + ':' + G.U.mmss(t % 3600).padStart(5, '0') : G.U.mmss(t); },

  /** Texto seguro para meterlo en HTML (nombres y demás que escriben otros jugadores). */
  esc(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); },

  /** Colores de tipo Pokémon (para proyectiles, tags y efectos). */
  TYPE_COLOR: {
    normal: '#b0a99f', fire: '#ff7b3d', water: '#4b9bff', grass: '#5fcb6a',
    electric: '#ffd33d', ice: '#7fe0e0', fighting: '#e0533d', poison: '#b45ec4',
    ground: '#d6b25c', flying: '#9bb8ff', psychic: '#ff5f9e', bug: '#a3c43d',
    rock: '#bfa96b', ghost: '#7a6bc4', dragon: '#6b58ff', dark: '#6b5c52',
    steel: '#a8b8c4', fairy: '#ff9ed8'
  },

  TYPE_NAME: {
    normal: 'Normal', fire: 'Fuego', water: 'Agua', grass: 'Planta',
    electric: 'Eléctrico', ice: 'Hielo', fighting: 'Lucha', poison: 'Veneno',
    ground: 'Tierra', flying: 'Volador', psychic: 'Psíquico', bug: 'Bicho',
    rock: 'Roca', ghost: 'Fantasma', dragon: 'Dragón', dark: 'Siniestro',
    steel: 'Acero', fairy: 'Hada'
  }
};
