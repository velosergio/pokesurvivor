/* Comprueba que esta copia está limpia. Sale con código 1 si encuentra algo:
 *   - restos de la infraestructura del juego original (pokesurvivor.com);
 *   - el dominio de esta copia escrito fuera de js/config.js (debe ser una sola
 *     variable: G.Config.site; los documentos la citan, no la repiten);
 *   - datos personales que no deben publicarse;
 *   - (con --built) líneas en blanco de más en index.html por saltos de línea mezclados.
 *   node tools/check_copy.js           archivos fuente
 *   node tools/check_copy.js --built   también lo generado (index.html, app.min.js, páginas)
 */
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const BAD = ['pokesurvivor.com', 'pokesurvivor-free', 'turn.pokesurvivor', 'rshaa5gKD3fXw6lE4PPXITbowaG2',
             "kofi: 'jpter78'", "sponsors: 'JPTER78'", 'ko-fi.com/jpter78', 'ko_fi: jpter78', 'github: JPTER78',
             'jpieratorregrosa@gmail.com', 'pokesurvivor-jpter', 'jpter78.github.io'];
const CONFIG = path.join('js', 'config.js');
const SITE = (fs.readFileSync(path.join(ROOT, CONFIG), 'utf8').match(/site:\s*'https?:\/\/([^/']+)/) || [])[1];
if (!SITE) { console.error('No encuentro site en js/config.js'); process.exit(1); }
const BUILT = process.argv.includes('--built');
// Lo que puede nombrar el original: créditos, historia y documentos de diseño.
// (rutas desde la raíz, para no saltarse por error una carpeta "assets" o "cache" de otro sitio)
const SKIP_DIRS = new Set(['.git', 'assets', 'node_modules', 'tools/cache', 'docs/superpowers', '.superpowers', '.wrangler']);
const SKIP_FILES = new Set(['LICENSE', 'CREDITS.md', 'README.md', 'GDD.md', 'check_copy.js', 'changelog.js']);
const GENERATED = /^(index\.html|js[\\/]app\.min\.js|sitemap\.xml|robots\.txt|404\.html|en[\\/].*|apoyar[\\/].*|guia[\\/].*|legendarios[\\/].*|logros[\\/].*|movimientos[\\/].*|novedades[\\/].*|objetos[\\/].*|pokedex[\\/].*|shinies[\\/].*|tipos[\\/].*)$/;
const blanks = s => s.split('\n').filter(l => /^\r?$/.test(l)).length;
const hits = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name), rel = path.relative(ROOT, full);
    if (e.isDirectory()) { if (!SKIP_DIRS.has(rel.replace(/\\/g, '/')) && e.name !== 'node_modules') walk(full); continue; }
    if (SKIP_FILES.has(e.name)) continue;
    const generated = GENERATED.test(rel);
    if (!BUILT && generated) continue;
    if (!/\.(js|html|css|json|py|md|txt|xml|rules|conf|toml|sh|yml|yaml|webmanifest)$|^(CNAME|\.firebaserc|Dockerfile)$/.test(e.name)) continue;
    const src = fs.readFileSync(full, 'utf8');
    for (const b of BAD) if (src.includes(b)) hits.push(rel + '  →  ' + b);
    if (!generated && rel !== CONFIG && src.includes(SITE)) hits.push(rel + '  →  ' + SITE + ' (usa G.Config.site / {{SITE}})');
    if (generated && rel === 'index.html' && blanks(src) > blanks(fs.readFileSync(path.join(ROOT, 'dev.html'), 'utf8')))
      hits.push(rel + '  →  más líneas en blanco que dev.html (las marcas seo: dejan su salto de línea)');
  }
})(ROOT);
if (hits.length) { console.error('Problemas en la copia:\n  ' + hits.join('\n  ')); process.exit(1); }
console.log('ok: copia limpia' + (BUILT ? ' (incluido lo generado)' : ''));
