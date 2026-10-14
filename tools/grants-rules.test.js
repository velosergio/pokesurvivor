/* node --test tools/grants-rules.test.js */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'firestore.rules'), 'utf8');

test('la libreta no cae en un bloque generado', () => {
  const g = src.indexOf('match /grants/{uid}');
  assert.ok(g > src.indexOf('// </admins>'));
  const a = src.indexOf('// <logros>'), b = src.indexOf('// </logros>');
  assert.ok(g < a || g > b);
  assert.ok(g < src.indexOf('match /{document=**}'));
});

test('solo saltos fijos, y el uid viaja como argumento', () => {
  assert.match(src, /coins == 100000 && request\.resource\.data\.t10 == 0/);
  assert.match(src, /t10 == 100 && request\.resource\.data\.coins == 0/);
  assert.match(src, /coins == resource\.data\.coins \+ 100000/);
  assert.match(src, /t10 == resource\.data\.t10 \+ 100(?!\d)/);
  assert.match(src, /function grantVal\(userId, k\)/);
  assert.match(src, /function possibleSave\(o, n, secs, userId\)/);
  assert.match(src, /function freshSave\(s, userId\)/);
  assert.match(src, /freshSave\(request\.resource\.data\.save, uid\)/);
  assert.match(src, /possibleSave\(resource\.data\.save, request\.resource\.data\.save,\s*\(request\.time - resource\.data\.updatedAt\)\.seconds\(\), uid\)/);
});

test('el crédito solo anula la misma cosa', () => {
  assert.match(src, /function mn\(a, b\) \{ return a < b \? a : b; \}/);
  assert.match(src, /function budget\(o, n, e, k, dm, cc, tc\)/);
  assert.match(src, /\+ 10 \* tc/);
  assert.match(src, /- cc -/);
  assert.match(src, /allow delete: if false;/);
});
