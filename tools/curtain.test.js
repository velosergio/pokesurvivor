/* node --test tools/curtain.test.js */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { create } = require('../js/core/curtain.js');

test('empieza opaco, se abre en línea y se apaga a los 0,65 s', () => {
  const v = create();
  assert.equal(v.on, false);
  assert.equal(v.alpha, 0);
  v.start('#c9a6ff');
  assert.equal(v.on, true);
  assert.equal(v.color, '#c9a6ff');
  assert.equal(v.alpha, 1);
  v.tick(0.24);
  assert.equal(v.alpha, 1);
  v.tick(0.21);
  assert.ok(Math.abs(v.alpha - 0.5) < 1e-9);
  v.tick(0.2);
  assert.equal(v.on, false);
  assert.equal(v.alpha, 0);
});

test('otro start vuelve a dejarlo opaco', () => {
  const v = create();
  v.start();
  v.tick(0.5);
  assert.ok(v.alpha < 1);
  v.start('#c9a6ff');
  assert.equal(v.alpha, 1);
  assert.equal(v.color, '#c9a6ff');
});

test('sin color usa el violeta de la grieta', () => {
  const v = create();
  v.start();
  assert.equal(v.color, '#c9a6ff');
});

test('mientras dura, la cámara se clava en el jugador; al apagarse, no', () => {
  const v = create();
  const cam = { x: 0, y: 0 };
  const pl = { x: 8000, y: -3000, netOffX: -40, netOffY: 15 };
  v.lock(cam, pl);
  assert.equal(cam.x, 0);
  assert.equal(cam.y, 0);
  v.start('#c9a6ff');
  v.lock(cam, pl);
  assert.equal(cam.x, 7960);
  assert.equal(cam.y, -2985);
  v.tick(0.65);
  cam.x = 3; cam.y = 4;
  v.lock(cam, pl);
  assert.equal(cam.x, 3);
  assert.equal(cam.y, 4);
});
