# Telón de la grieta — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Al entrar en la arena de la grieta y al volver al mapa, un telón violeta tapa la pantalla al instante y se abre ya en el sitio nuevo, sin que la cámara recorra el mapa.

**Architecture:** La cuenta del tiempo (opaco 0,25 s, apertura lineal 0,4 s, reinicio) es una función pura en `js/core/curtain.js`, medible sin navegador. `js/game.js` la dibuja encima de la escena y, mientras dura, clava la cámara en el jugador después de `Camera.follow`. `begin()` y `finish()` de `js/systems/rift.js` llaman a `G.Game.curtain('#c9a6ff')` en vez de `G.Game.flash`. En el servidor esa función no hace nada.

**Tech Stack:** JavaScript de navegador sin framework, Node ≥ 24.12 (`node --test`). Sin dependencias npm nuevas. No se genera `index.html` en este plan.

**Spec:** `docs/superpowers/specs/2026-10-14-grieta-telon-design.md`

## Global Constraints

- Se edita `dev.html`, nunca `index.html` (lo genera `node tools/build.js`).
- No quitar `js/core/updater.js` ni la escritura de `version.json` en `tools/build.js`.
- Color del telón: `#c9a6ff`. Opaco 0,25 s, apertura lineal 0,4 s, desaparece a los 0,65 s.
- «Menos destellos» (`G.Settings.get('calm')`) no multiplica el alfa del telón.
- No cambiar `G.Game.flash` ni sus llamadas en `js/systems/judgment.js`. No acercar la arena. No tocar `FIX_FAR` ni el suavizado de correcciones cortas en `js/net/coop.js`.
- `G.Game.curtain()` en el servidor es una función vacía.
- No hacer `git push` ni redesplegar hasta que el dueño lo pida.
- Commits sin "Co-Authored-By" ni firma de IA. Mensaje de una línea, en español, como el historial.

## File structure

- `js/core/curtain.js` — crea el estado del telón: `start`, `tick`, `on`, `alpha`, `color`, `lock`. No dibuja ni toca el DOM. El simulador lo carga (no está en el `SKIP` de `server/sim.js`) y no lo usa.
- `js/game.js` — un estado `veil`, `G.Game.curtain`, el dibujo y el clavado de la cámara. El simulador no carga este archivo.
- `js/systems/rift.js` — las dos llamadas del viaje.
- `server/room.js`, `server/test/solo.js`, `server/test/team.js` — `curtain() {}`.
- `dev.html` — la etiqueta del script, dentro de `scripts:begin` / `scripts:end`, justo después de `js/core/camera.js`.
- `js/data/changelog.js` — una línea en `fix`.
- `tools/curtain.test.js` — la cuenta del tiempo y el clavado, sin pantalla.
- `server/test/sim.test.js` — el viaje llama a `curtain` y no a `flash`.

---

### Task 1: La cuenta del telón, sin pantalla

**Files:**
- Create: `js/core/curtain.js`
- Test: `tools/curtain.test.js`

**Interfaces:**
- Consumes: nada
- Produces: en el navegador, `G.Curtain.create() -> veil`. En Node, `require('../js/core/curtain.js').create`. `veil.start(color?: string)` pone el tiempo a 0 y guarda el color (`#c9a6ff` si no viene). `veil.tick(dt)` avanza; al llegar a 0,65 s se apaga (`on === false`). `veil.on` es boolean. `veil.alpha` es 1 antes de 0,25 s, baja en línea hasta 0 a los 0,65 s, y es 0 si está apagado. `veil.color` es el string guardado. `veil.lock(cam, pl)` escribe `cam.x/y` con `pl.x + (pl.netOffX || 0)` y `pl.y + (pl.netOffY || 0)` solo mientras `on` es true.

- [ ] **Step 1: Write the failing test**

Crear `tools/curtain.test.js`:

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tools/curtain.test.js`

Expected: FAIL con `Cannot find module '../js/core/curtain.js'`.

- [ ] **Step 3: Write minimal implementation**

Crear `js/core/curtain.js`:

```js
/* ============ curtain.js — cuánto tapa el telón de la grieta ============
 * Puro: no dibuja ni toca el DOM. En el navegador queda en G.Curtain.
 * 0,25 s opaco del todo y 0,4 s abriéndose en línea. A los 0,65 s se apaga.
 */
(function (root) {
  const HOLD = 0.25, FADE = 0.4, TOTAL = HOLD + FADE;

  function alpha(t) {
    if (t < HOLD) return 1;
    if (t >= TOTAL) return 0;
    return 1 - (t - HOLD) / FADE;
  }

  function create() {
    let t = -1, col = '#c9a6ff';
    return {
      start(c) { col = c || '#c9a6ff'; t = 0; },
      tick(dt) {
        if (t < 0) return;
        t += dt;
        if (t >= TOTAL) t = -1;
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tools/curtain.test.js`

Expected: PASS, 4 pruebas.

- [ ] **Step 5: Commit**

```bash
git add js/core/curtain.js tools/curtain.test.js
git commit -m "La cuenta del telón de la grieta, medible sin pantalla"
```

---

### Task 2: El viaje llama al telón, y el servidor lo ignora

**Files:**
- Modify: `js/systems/rift.js:141`
- Modify: `js/systems/rift.js:241`
- Modify: `server/room.js:192`
- Modify: `server/test/solo.js:16`
- Modify: `server/test/team.js:19-20`
- Test: `server/test/sim.test.js` (añadir un test al final del archivo)

**Interfaces:**
- Consumes: nada de la Tarea 1. `G.Game.curtain(color: string)` lo pone el juego en la Tarea 3; aquí solo se llama.
- Produces: `begin()` y `finish()` llaman `G.Game.curtain('#c9a6ff')` y ya no llaman a `G.Game.flash`. Siguen haciendo `G.Camera.x = pl.x; G.Camera.y = pl.y` en ese fotograma (el `follow` de ese fotograma ya corrió, antes del viaje). Los tres `G.Game` del servidor tienen `curtain() {}`.

- [ ] **Step 1: Write the failing test**

Al final de `server/test/sim.test.js`, antes de que se acabe el archivo, añadir:

```js
test('la grieta avisa con curtain y no con flash', () => {
  const sim = createSim({ seed: 5 });
  const r = soloRun(sim, { god: true });
  let curtains = 0, flashes = 0;
  sim.G.Game.curtain = () => { curtains++; };
  sim.G.Game.flash = () => { flashes++; };
  run(r, 20);
  sim.G.Rift.debugOpen();
  let inside = false, back = false;
  run(r, 240, () => { if (sim.G.Rift.inArena) inside = true; else if (inside) back = true; });
  assert.ok(inside && back, 'no ha ido y vuelto');
  assert.ok(curtains >= 2, 'curtain ' + curtains);
  assert.equal(flashes, 0);
});
```

`soloRun` sustituye `G.Game` entero: las dos asignaciones van después de `soloRun`. En 260 s de partida no llega la Sentencia (minuto 30), así que un `flash` solo podía venir de la grieta. Puede haber más de una grieta: por eso `>= 2`, no `=== 2`.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --test-name-pattern "curtain y no con flash" server/test/sim.test.js`

Expected: FAIL con `curtain 0` (entra y vuelve, pero `curtains` se queda en 0).

- [ ] **Step 3: Write minimal implementation**

En `js/systems/rift.js`, dentro de `begin()`, cambiar la línea del destello:

```js
    G.Camera.x = pl.x; G.Camera.y = pl.y;
    G.Game.curtain('#c9a6ff');
    G.Audio.sfx('rift');
```

En `finish()`, igual:

```js
    G.Camera.x = pl.x; G.Camera.y = pl.y;
    G.Game.curtain('#c9a6ff');
    if (pl.bonds > 0) G.Game.offerBond();
```

No quitar las dos líneas de `G.Camera.x` / `G.Camera.y`.

En `server/room.js`, en el objeto `G.Game`, junto a `flash() {}`:

```js
    flash() {},
    curtain() {},
```

En `server/test/solo.js`, en el objeto `G.Game`:

```js
  G.Game = { player: pl, st: { get time() { return time; } }, everyone: () => [pl], flash() {}, curtain() {}, levelXp: () => 20, offerBond() {} };
```

En `server/test/team.js`, en el objeto `G.Game`:

```js
  G.Game = { player: players[0], st: { get time() { return time; } }, everyone: () => players,
             flash() {}, curtain() {}, levelXp: () => 20, offerBond() {} };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test --test-name-pattern "curtain y no con flash" server/test/sim.test.js`

Expected: PASS.

Run: `npm test --prefix server`

Expected: PASS (la grieta de siempre entra y vuelve; `curtain()` vacío no lanza).

- [ ] **Step 5: Commit**

```bash
git add js/systems/rift.js server/room.js server/test/solo.js server/test/team.js server/test/sim.test.js
git commit -m "El viaje de la grieta avisa con un telón que el servidor ignora"
```

---

### Task 3: Dibujar el telón y clavar la cámara

**Files:**
- Modify: `dev.html:606` (justo después de la línea de `js/core/camera.js`)
- Modify: `js/game.js:163-164` (estado, junto al destello)
- Modify: `js/game.js:607` (avanzar el tiempo)
- Modify: `js/game.js:625` y `js/game.js:648` (clavar después de `follow`)
- Modify: `js/game.js:741-748` (dibujo, después del destello)
- Modify: `js/game.js:845` (exportar `curtain`)
- Modify: `js/data/changelog.js:14` (el `fix` del bloque `2026-10-15`)

**Interfaces:**
- Consumes: `G.Curtain.create()` de la Tarea 1. `G.Game.curtain(color)` lo llama la Tarea 2.
- Produces: `G.Game.curtain(color: string)` arranca el telón. Mientras `veil.on`, después de cada `G.Camera.follow` del `update` de la partida, `veil.lock(G.Camera, pl)`. El dibujo usa `veil.alpha` y `veil.color` sin mirar `calm`.

- [ ] **Step 1: Cargar el script**

En `dev.html`, justo después de `<script defer src="js/core/camera.js"></script>`, añadir:

```html
<script defer src="js/core/curtain.js"></script>
```

Tiene que quedar entre `<!-- scripts:begin -->` y `<!-- scripts:end -->`, y antes de `js/game.js`. No editar `index.html`.

- [ ] **Step 2: Estado y arranque**

En `js/game.js`, deja `function flash` como está. Justo debajo de `let flashT = 0, flashDur = 1, flashCol = '#fff';` añade solo esto:

```js
  const veil = G.Curtain.create();
  function curtain(col) { veil.start(col); }
```

En el `return` de `G.Game`, junto a `flash`:

```js
    init, startRun, everyone, levelXp, flash, curtain, offerBond,
```

- [ ] **Step 3: Tiempo, cámara y dibujo**

Al principio de `update(dt)`, donde ya se hace `if (flashT > 0) flashT -= dt;`, avanzar el telón en el mismo sitio (también si luego la función sale por la Sentencia o por la muerte: el tiempo no se queda parado):

```js
    if (flashT > 0) flashT -= dt;
    veil.tick(dt);
```

Después de cada `G.Camera.follow` de ese `update` (el de la muerte y el de la partida; no el del fondo del menú), clavar:

```js
      G.Camera.follow(pl.x, pl.y, dt);
      veil.lock(G.Camera, pl);
```

```js
    G.Camera.follow(pl.x + (pl.netOffX || 0), pl.y + (pl.netOffY || 0), dt);
    veil.lock(G.Camera, pl);
```

El `follow` de ese fotograma corre antes de `G.Step.world`, y el viaje ocurre dentro del step. Por eso `begin()` y `finish()` siguen asignando `G.Camera.x` y `G.Camera.y`: ese fotograma el `lock` aún no ha visto el telón. Los fotogramas siguientes sí: `tick` ya corrió, `follow` amortigua y `lock` lo deshace.

En `render`, justo después del bloque `if (flashT > 0) { ... }`, dibujar el telón. No multiplicar el alfa por `G.Settings.get('calm')`:

```js
    if (veil.on) {
      ctx.save();
      ctx.globalAlpha = veil.alpha;
      ctx.fillStyle = veil.color;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }
```

El primer fotograma del viaje `tick` ya pasó (el telón aún no existía) y `curtain()` deja el tiempo en 0: `alpha` es 1. Un segundo viaje llama otra vez a `start` y el tiempo vuelve a 0.

- [ ] **Step 4: Novedades**

En `js/data/changelog.js`, dentro del `fix` del bloque `d: '2026-10-15'` (el de arriba), como primera línea de ese array:

```js
    ['Al entrar o salir de una grieta, la pantalla se tapa un momento y apareces ya en el sitio: la cámara ya no recorre el mapa.',
     'Entering or leaving a rift covers the screen for a moment and you appear already there: the camera no longer travels across the map.'],
```

Si al implementar ese bloque ya no es el primero, no lo uses: crea uno nuevo arriba con la fecha de ese día y esta única línea en `fix`.

- [ ] **Step 5: Run tests**

Run: `node --test tools/curtain.test.js`

Expected: PASS, 4 pruebas.

Run: `npm test --prefix server`

Expected: PASS.

- [ ] **Step 6: Verlo en el navegador**

Abrir `http://localhost/pokesurvivor/dev.html` (la página fuente, no `index.html`). En la consola de la partida, `G.Rift.debugArena()` entra ya en la arena; `G.Rift.debugOpen()` abre una grieta para caminar hasta ella.

1. Partida en solitario. `G.Rift.debugArena()`. La pantalla queda violeta del todo en el acto, sin recorrer el mapa, y se abre ya en la arena.
2. Ganar o perder. Al volver, el mismo telón, y apareces donde estabas.
3. En Ajustes, activar «menos destellos». Repetir la entrada. El telón sigue sólido; un golpe de la pelea sigue con el destello flojo de siempre.
4. `js/systems/judgment.js` no se ha tocado y sigue llamando a `G.Game.flash`. No hace falta jugar hasta el minuto 30 para comprobarlo.
5. Si el servidor del cooperativo está en marcha, entrar y salir de una grieta en grupo. Cada pantalla hace su propio telón; la vista no se desliza cuando el servidor recoloca.

- [ ] **Step 7: Commit**

```bash
git add dev.html js/game.js js/data/changelog.js
git commit -m "Al entrar y salir de la grieta un telón tapa el salto de la cámara"
```
