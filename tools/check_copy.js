/* Comprueba que esta copia no tiene restos de la infraestructura del juego
 * original (pokesurvivor.com). Sale con código 1 si encuentra alguno.
 *   node tools/check_copy.js           archivos fuente
 *   node tools/check_copy.js --built   también lo generado (index.html, app.min.js, páginas)
 */
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const BAD = ['pokesurvivor.com', 'pokesurvivor-free', 'turn.pokesurvivor', 'rshaa5gKD3fXw6lE4PPXITbowaG2',
             "kofi: 'jpter78'", "sponsors: 'JPTER78'", 'ko-fi.com/jpter78'];
const BUILT = process.argv.includes('--built');
// Lo que puede nombrar el original: créditos, historia y documentos de diseño.
const SKIP_DIRS = new Set(['.git', 'assets', 'node_modules', 'cache', 'superpowers', '.superpowers', '.wrangler']);
const SKIP_FILES = new Set(['LICENSE', 'CREDITS.md', 'README.md', 'GDD.md', 'check_copy.js', 'changelog.js']);
const GENERATED = /^(index\.html|js[\\/]app\.min\.js|sitemap\.xml|robots\.txt|404\.html|en[\\/].*|apoyar[\\/].*|guia[\\/].*|legendarios[\\/].*|logros[\\/].*|movimientos[\\/].*|novedades[\\/].*|objetos[\\/].*|pokedex[\\/].*|shinies[\\/].*|tipos[\\/].*)$/;
const hits = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name), rel = path.relative(ROOT, full);
    if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) walk(full); continue; }
    if (SKIP_FILES.has(e.name) || (!BUILT && GENERATED.test(rel))) continue;
    if (!/\.(js|html|json|py|md|txt|xml|rules|conf|toml|sh|webmanifest)$|^(CNAME|\.firebaserc|Dockerfile)$/.test(e.name)) continue;
    const src = fs.readFileSync(full, 'utf8');
    for (const b of BAD) if (src.includes(b)) hits.push(rel + '  →  ' + b);
  }
})(ROOT);
if (hits.length) { console.error('Restos del juego original:\n  ' + hits.join('\n  ')); process.exit(1); }
console.log('ok: sin restos del original' + (BUILT ? ' (incluido lo generado)' : ''));
