/* node --test tools/debug-view.test.js */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const read = rel => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');

test('el botón nace oculto y la pantalla existe', () => {
  const html = read('dev.html');
  assert.match(html, /id="menu-debug" class="menu-item hidden"/);
  assert.match(html, /id="scr-debug"/);
  assert.match(html, /id="dbg-coins"/);
  assert.match(html, /id="dbg-t10"/);
  assert.ok(html.indexOf('js/ui/debug-ui.js') > html.indexOf('js/ui/mod-ui.js'));
});

test('solo el moderador lo ve y puede abrirlo', () => {
  const menu = read('js/ui/menu.js');
  const ui = read('js/ui/ui.js');
  const game = read('js/game.js');
  const view = read('js/ui/debug-ui.js');
  assert.match(menu, /debug: 'flag'/);
  assert.match(menu, /menu-debug'\)\.classList\.toggle\('hidden', !G\.Ranking\.isAdmin\(\)\)/);
  assert.match(menu, /go === 'debug'\) G\.DebugUI\.open\(\)/);
  assert.match(ui, /'scr-debug'/);
  assert.match(game, /G\.DebugUI\.init\(\)/);
  assert.match(view, /if \(!G\.Ranking\.isAdmin\(\)\) return/);
  assert.match(view, /100000/);
  assert.match(view, /field === 't10' \? 100 : 0/);
  assert.match(view, /100 tickets ×10/);
  assert.match(view, /collection\('grants'\)/);
  assert.match(view, /No hay ningún jugador con ese apodo/);
});
