/* ============ config.js — los datos de esta copia, leídos de js/config.js ============
 * El servidor no repite nada de la instalación (CLAUDE.md): lo saca de
 * G.Config, igual que el navegador. Se lee una vez por proceso.
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');

let cached = null;
/** G.Config de js/config.js. */
function readConfig() {
  if (cached) return cached;
  const file = path.join(__dirname, '..', 'js', 'config.js');
  const ctx = { G: {} };
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), ctx, { filename: file });
  if (!ctx.G.Config) throw new Error('js/config.js no define G.Config');
  return (cached = ctx.G.Config);
}

module.exports = { readConfig };
