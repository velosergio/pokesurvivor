/* node --test tools/grants-rules.test.js */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'firestore.rules'), 'utf8');

test('la libreta no cae en el cierre ni en un bloque generado', () => {
  const g = src.indexOf('match /grants/{uid}');
  assert.ok(g > src.indexOf('// </admins>'));
  const a = src.indexOf('// <logros>'), b = src.indexOf('// </logros>');
  if (a >= 0) assert.ok(g < a || g > b);
  assert.ok(g < src.indexOf('match /{document=**}'));
});

test('solo saltos fijos', () => {
  assert.match(src, /coins == 100000 && request\.resource\.data\.t10 == 0/);
  assert.match(src, /t10 == 100 && request\.resource\.data\.coins == 0/);
  assert.match(src, /coins == resource\.data\.coins \+ 100000/);
  assert.match(src, /t10 == resource\.data\.t10 \+ 100(?!\d)/);
  assert.match(src, /allow delete: if false;/);
});

test('el jugador no se quita el baneo', () => {
  assert.match(src, /request\.resource\.data\.get\('ban', false\) == false/);
  assert.match(src, /request\.resource\.data\.get\('ban', false\) == resource\.data\.get\('ban', false\)/);
  assert.match(src, /hasOnly\(\['ban', 'sus'\]\)/);
});

test('Pokémon: de uno en uno y sin quitar ninguno', () => {
  assert.match(src, /hasOnly\(\['coins', 't10', 'at', 'mons', 'shinies'\]\)/);
  assert.match(src, /dm\.removedKeys\(\)\.size\(\) == 0/);
  assert.match(src, /dm\.addedKeys\(\)\.size\(\) \+ ds\.addedKeys\(\)\.size\(\) == \(one \? 1 : 0\)/);
});

