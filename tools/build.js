/* Empaqueta el juego para publicarlo: un solo JS minificado en vez de ~60.
 *   node tools/build.js
 *
 * - dev.html es la página "fuente": carga cada script por separado (para
 *   programar y depurar cómodamente). SE EDITA dev.html, no index.html.
 * - index.html se genera a partir de dev.html, cambiando el bloque de scripts
 *   por js/app.min.js (con la huella en la URL para que no se quede en caché).
 * - node tools/build.js --sin-seo  ->  sin lo de SEO (hasta tener el dominio).
 * - Después hay que regenerar en/index.html: python tools/make_seo_pages.py
 */
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const DEV = path.join(ROOT, 'dev.html'), OUT = path.join(ROOT, 'index.html');
const BEGIN = '<!-- scripts:begin -->', END = '<!-- scripts:end -->';

const dev = fs.readFileSync(DEV, 'utf8');
/** G.Config.site de js/config.js (con / final), sin cargar el juego. */
function site() {
  const ctx = { G: {} };
  require('vm').runInNewContext(fs.readFileSync(path.join(ROOT, 'js', 'config.js'), 'utf8'), ctx);
  const s = ctx.G.Config && ctx.G.Config.site;
  if (!/^https:\/\/[^/]+\/$/.test(s || '')) throw new Error('G.Config.site en js/config.js debe ser https://dominio/ (con / final)');
  return s;
}
const i = dev.indexOf(BEGIN), j = dev.indexOf(END);
if (i < 0 || j < 0) throw new Error('dev.html no tiene las marcas ' + BEGIN + ' / ' + END);
const block = dev.slice(i, j + END.length);
const files = [...block.matchAll(/<script[^>]*src="(js\/[^"]+\.js)"/g)].map(m => m[1]);

// Une los archivos en orden; cada uno separado por ';' por si alguno no acaba en punto y coma.
let joined = files.map(f => `/* ${f} */\n` + fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n;\n');
// Anti-trampas: en la versión publicada el juego va ENCERRADO en una función:
// G deja de existir en la consola del navegador (F12), y con él los atajos para
// hacerse invencible, saltar el reloj, etc. (dev.html sigue igual, para programar).
//   --expose   sin encerrar ni ofuscar (para las pruebas automáticas)
const EXPOSE = process.argv.includes('--expose');
if (!EXPOSE) {
  const WIN_G = 'window.G = window.G || {};';
  if (!joined.includes(WIN_G)) throw new Error('util.js ya no crea G como se esperaba: revisa build.js');
  joined = '(() => {\n' + joined.replace(WIN_G, 'var G = {};') + '\n})();\n';
}
const tmp = path.join(ROOT, 'tools', 'cache', 'app.js');
fs.mkdirSync(path.dirname(tmp), { recursive: true });
fs.writeFileSync(tmp, joined);
const outJs = path.join(ROOT, 'js', 'app.min.js');
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const shell = process.platform === 'win32';
execFileSync(npx, ['--yes', 'terser@5', tmp, '--compress', 'passes=1', '--mangle', '--comments', 'false', '--ecma', '2020', '-o', outJs],
  { stdio: 'inherit', shell });
// Y ofuscado: el código queda ilegible y se rompe solo si lo reformatean para
// tocarlo. Las cadenas, en una tabla codificada (sólo una parte, para no frenar
// el juego). Semilla fija: el mismo código da siempre el mismo archivo.
if (!EXPOSE) {
  execFileSync(npx, ['--yes', 'javascript-obfuscator@4.1.1', outJs, '--output', outJs,
    '--compact', 'true', '--self-defending', 'true', '--seed', '7',
    '--string-array', 'true', '--string-array-encoding', 'base64', '--string-array-threshold', '0.1',
    '--identifier-names-generator', 'hexadecimal', '--rename-globals', 'false', '--transform-object-keys', 'false',
    '--split-strings', 'false', '--control-flow-flattening', 'false', '--dead-code-injection', 'false',
    '--unicode-escape-sequence', 'false', '--target', 'browser'], { stdio: 'inherit', shell });
}
const min = fs.readFileSync(outJs);
const hash = crypto.createHash('sha1').update(min).digest('hex').slice(0, 10);

let html = dev.slice(0, i) + `<script defer src="js/app.min.js?v=${hash}"></script>` + dev.slice(j + END.length);
html = html.replace(/<meta name="robots" content="noindex">\s*/, '');
// --sin-seo: sin canonical/redes/datos estructurados ni enlaces a las páginas
// (para publicar antes de tener el dominio).
const SIN_SEO = process.argv.includes('--sin-seo');
// (\r?\n: dev.html va con CRLF; sin el \r se quedaba una línea en blanco por cada marca.)
html = SIN_SEO ? html.replace(/<!-- seo:begin -->[\s\S]*?<!-- seo:end -->(\r?\n)?/g, '') : html.replace(/<!-- seo:(begin|end) -->(\r?\n)?/g, '');
// El dominio sólo está en js/config.js (G.Config.site); dev.html lo cita como {{SITE}}.
html = html.split('{{SITE}}').join(site());
html = html.replace(/<!-- dev.html: página fuente[^>]*-->/, '<!-- GENERADO desde dev.html por tools/build.js: no editar a mano (se edita dev.html). -->');
fs.writeFileSync(OUT, html);
// Versión publicada: los jugadores la miran cada 5 min y, si cambia, el juego se
// actualiza solo (en el menú, o al acabar la partida). Ver js/core/updater.js.
fs.writeFileSync(path.join(ROOT, 'version.json'), JSON.stringify({ v: hash, at: new Date().toISOString() }) + '\n');
console.log(`${SIN_SEO ? '[sin SEO] ' : ''}${EXPOSE ? '[SIN PROTEGER, sólo pruebas] ' : ''}ok: ${files.length} scripts · ${(joined.length / 1024).toFixed(0)} KB -> ${(min.length / 1024).toFixed(0)} KB (app.min.js?v=${hash})`);
