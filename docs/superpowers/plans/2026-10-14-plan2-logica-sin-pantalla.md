# Plan 2 — Lógica sin pantalla (paso 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que la lógica de `js/` funcione en Node sin navegador (sin `document`, `Image` ni canvas), con el mismo orden de actualización que el juego y resultados repetibles con una semilla, sin ningún cambio visible en el navegador.

**Architecture:** Lo que hace avanzar el mundo en cada fotograma sale de `game.js` a `G.Step.world()` (`js/systems/step.js`), que usan igual el juego y la simulación. `server/sim.js` carga los mismos scripts que `dev.html` (salvo pantalla, sonido, entrada, red, interfaz y guardado) en un contexto `vm` sin DOM, sustituye lo que falta por objetos que no hacen nada, pone semilla a `Math.random` y hace de `performance.now()` el reloj de la simulación. Las pruebas (`node:test`) juegan partidas con un bot.

**Tech Stack:** JavaScript sin frameworks (Canvas 2D), Node ≥ 20 (`node:test`, `vm`), sin dependencias nuevas.

**Spec:** `docs/superpowers/specs/2026-10-14-coop-servidor-design.md` (secciones 3.2, 6 y 7.2). Este plan cubre **sólo el paso 2**.

**Qué se ha visto al preparar el plan** (sonda en Node sobre el código actual): `update()` y `draw()` ya están separados en casi todos los archivos que nombra la spec (3.2). Una partida de 34 minutos sin pantalla, con grieta y Sentencia, sólo toca el navegador en tres sitios:
1. `js/core/i18n.js:23-26` lee `location`, `navigator` y `document` al cargar.
2. `js/systems/judgment.js:226` → `ember()` (ceniza de la pelea, puro dibujo) se mueve dentro de `update()` y lee el tamaño del `<canvas>` con `document.getElementById('game')`.
3. `G.Sprites.preload()` (lo llama `spawner.js`) crea `new Image()`: en la simulación se sustituye (la spec ya lo prevé: `G.Sprites` sólo para tamaños y metadatos).

Además, el orden de los sistemas en cada fotograma sólo existe dentro del cierre de `G.Game` (`js/game.js:617-635`), así que el servidor no podría reutilizarlo: por eso se crea `G.Step`. El resto de dependencias (`G.Camera.sees`, `G.Game.player`, `G.Input.axis`, `G.Coop.*`) se resuelven con sustitutos en la simulación y con la cámara real (`camera.js` no usa el DOM); tratarlas para varios jugadores es del paso 3.

## Global Constraints

- Se edita `dev.html`, nunca `index.html` (se genera con `node tools/build.js`).
- Publicar: `node tools/build.js && node tools/export_data.js && python tools/make_seo_pages.py`; `node tools/check_copy.js --built` debe dar `ok`.
- **Sin cambios visibles** en el juego (spec 7.2): mismo orden de actualización, mismos dibujos, mismo comportamiento en pausa.
- `updater.js` y la escritura de `version.json` en `tools/build.js` no se quitan.
- Este paso no cambia el juego para los jugadores: **no va al changelog** (`js/data/changelog.js`).
- Sin dependencias npm nuevas: sólo módulos de Node (`fs`, `path`, `vm`, `node:test`, `node:assert`).
- Commits sin "Co-Authored-By" ni ninguna firma de IA. No hacer `git push` salvo que el dueño lo pida. Se trabaja en `main`, sin worktrees.
- `server/` no se sirve en la web: va a `.dockerignore`.

## Review Focus

1. **Pausa durante la pelea de la Sentencia**: la ceniza debe quedarse quieta en pausa y con las cartas de nivel abiertas, como ahora (antes se movía en `update()`; ahora se mueve con `frameDt`, que es 0 fuera de `'playing'`). Prueba manual en la Tarea 3.
2. **Cooperativo como invitado** (`host = false` en `G.Step.world`): debe seguir corriendo sólo el reloj del aviso (`Spawner.tickBanner`) y no hacer aparecer enemigos. Prueba manual con dos pestañas en la Tarea 1.
3. **Página inglesa `/en/`**: tras tocar `i18n.js`, el juego debe seguir en inglés y con `<html lang="en">`. Prueba manual en la Tarea 2.
4. **Versión publicada** (`index.html` + `js/app.min.js`, encerrada y ofuscada): `step.js` debe entrar en el paquete, en su sitio, y el juego arrancar sin errores. Prueba en la Tarea 4.
5. **Muerte y fin de partida en solitario**: la animación de caer y el resumen deben salir igual que antes (esa rama de `update()` no pasa por `G.Step`). Prueba manual en la Tarea 1.

---

### Task 1: `G.Step.world()` — un paso del mundo, fuera de `game.js`

**Files:**
- Create: `js/systems/step.js`
- Modify: `js/game.js:617-635` (el bloque que avanza los sistemas)
- Modify: `dev.html:607` (cargar `step.js` justo después de `hazards.js`)

**Interfaces:**
- Produces: `G.Step.world(dt, time, all, me, host, collect)` — `dt` y `time` en segundos; `all`: array de `G.Player`; `me`: el `G.Player` cuyos ataques se resuelven; `host`: boolean; `collect(pickup, who)`. No devuelve nada. Llama, en este orden: `World.update`, `Path.update` + `Spawner.update` (si `host`) o `Spawner.tickBanner`, `EnemyMgr.update`, `EnemyMgr.rebuildGrid`, `Combat.tick`, `Projectiles.update`, `Combat.resolve`, `Combat.updateFields`, `Pickups.update`, `Hazards.update`, `Interact.update`, `Rift.update`, `Judgment.update`, `Events.update`, `Weather.update`.

- [ ] **Step 1: Crear `js/systems/step.js`**

```js
/* ============ step.js — un paso del mundo ============
 *
 * Todo lo que avanza en la partida salvo el Pokémon propio, la cámara, la
 * música y las pantallas: terreno, enemigos, ataques, objetos, trampas, grietas,
 * la Sentencia, eventos y clima. Siempre en este orden.
 *
 * Lo usan el juego (game.js) y la simulación sin pantalla (server/sim.js), así
 * los dos avanzan exactamente igual. Aquí no se dibuja nada.
 */
G.Step = {
  /**
   * @param time     segundos de partida
   * @param all      todos los jugadores (en solitario, [me])
   * @param me       el jugador cuyos ataques se resuelven en este paso
   * @param host     lleva enemigos y apariciones (solitario o anfitrión)
   * @param collect  (objeto, quién) al recoger algo del suelo
   */
  world(dt, time, all, me, host, collect) {
    G.World.update(dt, G.Camera);
    if (host) { G.Path.update(dt, all); G.Spawner.update(dt, all, time); }
    else G.Spawner.tickBanner(dt);
    G.EnemyMgr.update(dt, all);
    G.EnemyMgr.rebuildGrid();
    G.Combat.tick(dt, me, time);
    G.Projectiles.update(dt, me, G.EnemyMgr.all());
    G.Combat.resolve(dt, me, time);
    G.Combat.updateFields(dt);
    G.Pickups.update(dt, all, collect);
    G.Hazards.update(dt);
    G.Interact.update(dt, me);
    G.Rift.update(dt, me, time);
    G.Judgment.update(dt, me, time);
    G.Events.update(dt, all, time);
    G.Weather.update(dt, time, me);
  }
};
```

- [ ] **Step 2: Cargarlo en `dev.html`**

Después de `<script defer src="js/systems/hazards.js"></script>` (línea 607) añadir:

```html
<script defer src="js/systems/step.js"></script>
```

- [ ] **Step 3: Usarlo en `js/game.js`**

En `update(dt)`, sustituir desde `G.World.update(dt, G.Camera);` hasta `G.Weather.update(dt, time, pl);` (ambos incluidos, con la línea en blanco y `const all = everyone();`) por:

```js
    G.Step.world(dt, time, everyone(), pl, !coop || G.Coop.isHost, onCollect);
```

Debe quedar así (la línea anterior y la siguiente no cambian):

```js
    G.Camera.follow(pl.x, pl.y, dt);
    G.Step.world(dt, time, everyone(), pl, !coop || G.Coop.isHost, onCollect);
    G.FX.update(dt);
```

Comprobar que `all` no se usa más abajo en `update()`: `grep -n "\ball\b" js/game.js` no debe dar ninguna línea entre `function update` y `function reviveTick`.

- [ ] **Step 4: Probar en el navegador**

Con XAMPP en marcha, abrir `http://localhost/pokesurvivor/dev.html` con la consola abierta (F12):
- Partida en solitario de 2-3 minutos: salen enemigos, los ataques dan, se recoge experiencia y se sube de nivel. Ningún error en consola.
- Dejarse caer: animación de caída y resumen como siempre (Review Focus 5).
- Si se puede, cooperativo con dos pestañas (Review Focus 2): en la del invitado no aparecen enemigos propios y el aviso grande ("¡Marea de Pokémon!") se va solo.

- [ ] **Step 5: Commit**

```bash
git add js/systems/step.js js/game.js dev.html
git commit -m "Paso 2: el avance del mundo en G.Step.world (js/systems/step.js), compartido con la simulación"
```

---

### Task 2: Simulación sin pantalla (`server/sim.js`) y pruebas

**Files:**
- Create: `server/sim.js`
- Create: `server/test/solo.js`
- Create: `server/test/sim.test.js`
- Modify: `js/core/i18n.js:23-26`

**Interfaces:**
- Consumes: `G.Step.world(dt, time, all, me, host, collect)` (Tarea 1).
- Produces:
  - `require('server/sim.js')` → `{ createSim({ seed = 1 }) → { G, clock }, scripts() → string[], rng(seed) → () => number }`. `clock.t` son segundos de simulación (lo avanza quien la usa) y es lo que devuelve `performance.now() / 1000` dentro del contexto. En el `G` devuelto, `Audio`, `FX`, `Touch`, `UI`, `HUD`, `RunUI`, `Social`, `Ranking`, `Progress`, `Icons`, `Settings`, `Input`, `DB` y `Coop` son sustitutos que no hacen nada; `G.Sprites.preload` devuelve una promesa ya resuelta; `G.Camera` es la real, a 1280×720.
  - `require('server/test/solo.js')` → `{ soloRun(sim, { dex = 4, world = 1234, god = false }) → { pl, step(dt), time } }`. Define `G.Game` (`player`, `st`, `everyone`, `flash`, `levelXp`, `offerBond`) y mueve al jugador con `G.Input.axis`.

- [ ] **Step 1: Escribir la simulación (`server/sim.js`)**

```js
/* ============ sim.js — el juego sin pantalla (Node) ============
 *
 * Carga la lógica de js/ (los mismos archivos y en el mismo orden que
 * dev.html) en un contexto vm con su propio G. Lo que es pantalla, sonido,
 * teclado, red, interfaz o partida guardada no se carga: se sustituye por
 * objetos que no hacen nada.
 *
 * En el contexto NO hay document, Image, window.addEventListener ni canvas:
 * si la lógica los toca, falla (así lo cazan las pruebas).
 * Math.random lleva semilla y performance.now() es el reloj de la simulación,
 * así dos simulaciones con la misma semilla y las mismas órdenes dan lo mismo.
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');

const ROOT = path.join(__dirname, '..');
/** Lo que no se carga: pantalla, sonido, entrada, red, interfaz y guardado. */
const SKIP = /^js\/(ui|net)\/|^js\/(game|main)\.js$|^js\/core\/(settings|db|audio|input|touch|updater)\.js$|^js\/entities\/fx\.js$/;

/** Scripts de dev.html que forman la simulación, en su orden. */
function scripts() {
  const html = fs.readFileSync(path.join(ROOT, 'dev.html'), 'utf8');
  return [...html.matchAll(/<script defer src="(js\/[^"]+\.js)"/g)].map(m => m[1]).filter(f => !SKIP.test(f));
}

/** mulberry32: aleatorio con semilla, en [0, 1). */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const noop = () => {};
/** Objeto en el que cualquier método existe y no hace nada (salvo los de `own`). */
const mute = (own = {}) => new Proxy(own, { get: (o, k) => (k in o ? o[k] : noop) });

/**
 * Una simulación nueva, con su G.
 * @returns {{ G: object, clock: { t: number } }}  clock.t = segundos de simulación
 *          (lo avanza quien la usa; es lo que devuelve performance.now()/1000)
 */
function createSim({ seed = 1 } = {}) {
  const clock = { t: 0 };
  const sb = {
    console,
    performance: { now: () => clock.t * 1000 },
    localStorage: { getItem: () => null, setItem: noop, removeItem: noop },
    setTimeout: noop, clearTimeout: noop, setInterval: noop, clearInterval: noop,
    __rng: rng(seed)
  };
  sb.window = sb;
  vm.createContext(sb);
  vm.runInContext('Math.random = __rng; delete window.__rng;', sb);
  for (const f of scripts()) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), sb, { filename: f });

  const G = sb.G;
  for (const k of ['Audio', 'FX', 'Touch', 'UI', 'HUD', 'RunUI', 'Social', 'Ranking', 'Progress', 'Icons']) G[k] = mute();
  G.Settings = mute({ fx: 1, get: () => false });
  G.Input = mute({ axis: () => [0, 0] });
  G.DB = mute({ save: { legends: {} } });
  G.Coop = mute({ active: false, isHost: false, scaleRate: () => 1, scaleHp: () => 1, xpFactor: () => 1, players: () => [], puppets: () => [] });
  // Sin imágenes: las hojas de sprites no se descargan (los tamaños salen de G.SPRITE_META).
  G.Sprites.preload = () => Promise.resolve();
  G.Camera.resize(1280, 720, 1);
  return { G, clock };
}

module.exports = { createSim, scripts, rng };
```

- [ ] **Step 2: Escribir el bot de pruebas (`server/test/solo.js`)**

```js
/* Partida en solitario sin pantalla, llevada por un bot (sólo para pruebas).
 * Hace lo mismo que G.Game.startRun + update de js/game.js, sin pantallas:
 * las cartas de nivel se eligen solas (la primera) y no hay pausa. */
'use strict';

/**
 * @param sim  lo que devuelve createSim()
 * @param o.god  si cae, se levanta al momento (para llegar lejos en la partida)
 * @returns {{ pl, step(dt), time: number }}
 */
function soloRun(sim, { dex = 4, world = 1234, god = false } = {}) {
  const { G, clock } = sim;
  const mon = G.DEX_BY[dex];
  const pl = new G.Player(mon, G.Upgrades.perks({}), false);
  let time = 0, levels = 0, biome = 0;
  G.Game = { player: pl, st: { get time() { return time; } }, everyone: () => [pl], flash() {}, levelXp: () => 20, offerBond() {} };
  for (const m of [G.Projectiles, G.EnemyMgr, G.Pickups, G.Path, G.Hazards]) m.clear();
  for (const m of [G.Spawner, G.Rift, G.Judgment, G.Events, G.Weather]) m.reset();
  G.Combat.clearFields();
  G.World.reset(world);
  G.World.setBiome(0, true);
  pl.addMove(G.startMoveOf(mon.dex));
  G.Camera.x = pl.x; G.Camera.y = pl.y;
  // El bot da vueltas grandes (así recorre mapa, rompe cosas y recoge).
  G.Input.axis = () => [Math.cos(time * 0.3), Math.sin(time * 0.3)];

  function collect(p) {
    if (p.kind === 'xp' || p.kind === 'xpBig') levels += pl.gainXp(p.value);
    else if (p.kind === 'coin') pl.coins += p.value;
    else if (p.kind === 'heal') pl.heal(pl.maxHp * 0.3);
    else if (p.kind === 'magnet') G.Pickups.pullAll();
  }

  function step(dt) {
    clock.t += dt;
    if (G.Judgment.cinematic) { G.Judgment.cineTick(dt); pl.anim.update(dt); G.World.update(dt, G.Camera); return; }
    time += dt;
    const b = Math.floor(time / 240);
    if (b !== biome && !G.Rift.inArena && !G.Judgment.active) { biome = b; G.World.setBiome(b); }
    pl.update(dt);
    G.Camera.follow(pl.x, pl.y, dt);
    G.Step.world(dt, time, [pl], pl, true, collect);
    while (levels > 0) { levels--; const o = G.LevelUp.offer(pl); if (o.length) o[0].apply(pl); }
    if (god) { if (pl.dead) pl.revive(1); pl.hp = pl.maxHp; }
  }

  return { pl, step, get time() { return time; } };
}

module.exports = { soloRun };
```

- [ ] **Step 3: Escribir las pruebas (`server/test/sim.test.js`)**

```js
/* Pruebas de la simulación sin pantalla:  node --test server/test/sim.test.js */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { createSim } = require('../sim.js');
const { soloRun } = require('./solo.js');

const DT = 1 / 30;
const run = (r, secs, each) => { for (let i = Math.round(secs / DT); i > 0; i--) { r.step(DT); if (each) each(); } };

/** Huella del estado: si dos partidas la dan igual, han ido igual. */
function print({ G }, r) {
  const en = G.EnemyMgr.all().map(e => [e.dex, Math.round(e.x), Math.round(e.y), Math.round(e.hp)]);
  return JSON.stringify({ t: r.time.toFixed(2), x: Math.round(r.pl.x), y: Math.round(r.pl.y), hp: Math.round(r.pl.hp),
    lv: r.pl.level, xp: r.pl.xp, ki: r.pl.kills, co: r.pl.coins, en, pk: G.Pickups.all().length });
}

test('carga la lógica sin navegador', () => {
  const { G } = createSim();
  for (const k of ['World', 'Player', 'EnemyMgr', 'Combat', 'Spawner', 'Step', 'Rift', 'Judgment']) assert.ok(G[k], 'falta G.' + k);
});

test('dos minutos de partida en solitario', () => {
  const sim = createSim({ seed: 3 });
  const r = soloRun(sim);
  run(r, 120);
  assert.ok(r.pl.kills > 0, 'no ha derrotado a nadie');
  assert.ok(sim.G.EnemyMgr.all().length > 0, 'no han salido enemigos');
});

test('misma semilla, misma partida; otra semilla, otra', () => {
  const a = createSim({ seed: 7 }), b = createSim({ seed: 7 }), c = createSim({ seed: 8 });
  const ra = soloRun(a), rb = soloRun(b), rc = soloRun(c);
  run(ra, 90); run(rb, 90); run(rc, 90);
  assert.strictEqual(print(a, ra), print(b, rb));
  assert.notStrictEqual(print(a, ra), print(c, rc));
});

test('una grieta: entra en la arena y vuelve', () => {
  const sim = createSim({ seed: 5 });
  const r = soloRun(sim, { god: true });
  run(r, 20);
  sim.G.Rift.debugOpen();
  let inside = false, back = false;
  run(r, 240, () => { if (sim.G.Rift.inArena) inside = true; else if (inside) back = true; });
  assert.ok(inside, 'no ha entrado en la grieta');
  assert.ok(back, 'no ha vuelto de la grieta');
});
```

- [ ] **Step 4: Ejecutarlas y ver que fallan**

Run: `node --test server/test/sim.test.js`
Expected: FAIL las 4, con `ReferenceError: location is not defined` (de `js/core/i18n.js`, al cargar).

- [ ] **Step 5: `i18n.js` sin navegador**

En `js/core/i18n.js`, sustituir:

```js
  const byPath = /\/en(\/|$)/.test(location.pathname) ? 'en' : null;
  const nav = ((navigator.languages && navigator.languages[0]) || navigator.language || 'es').toLowerCase();
  const lang = saved === 'es' || saved === 'en' ? saved : byPath || (nav.startsWith('es') ? 'es' : 'en');
  document.documentElement.lang = lang;
```

por:

```js
  // (En el servidor no hay navegador: español, que es como se escribe el juego.)
  const web = typeof document !== 'undefined';
  const byPath = web && /\/en(\/|$)/.test(location.pathname) ? 'en' : null;
  const nav = web ? ((navigator.languages && navigator.languages[0]) || navigator.language || 'es').toLowerCase() : 'es';
  const lang = saved === 'es' || saved === 'en' ? saved : byPath || (nav.startsWith('es') ? 'es' : 'en');
  if (web) document.documentElement.lang = lang;
```

- [ ] **Step 6: Ejecutarlas y ver que pasan**

Run: `node --test server/test/sim.test.js`
Expected: PASS las 4 (unos 30 s en total).

- [ ] **Step 7: Probar el inglés en el navegador** (Review Focus 3)

Abrir `http://localhost/pokesurvivor/en/` y `http://localhost/pokesurvivor/dev.html`; en la consola, `document.documentElement.lang` debe dar `"en"` en la primera y lo de siempre en la segunda; los menús de `/en/` en inglés. Ningún error en consola.

- [ ] **Step 8: Commit**

```bash
git add server/sim.js server/test/solo.js server/test/sim.test.js js/core/i18n.js
git commit -m "Paso 2: el juego sin pantalla en Node (server/sim.js) con pruebas de partida, semilla y grieta"
```

---

### Task 3: La ceniza de la Sentencia, al dibujo

**Files:**
- Modify: `js/systems/judgment.js:226` (quitar `ember(dt)` de `update`), `:468-471` (`drawOverlay`), `:606-607` (`drawFight`), `:659-662` (`ember`)
- Modify: `js/game.js:717` (pasar `frameDt` a `drawOverlay`)
- Test: `server/test/sim.test.js`

**Interfaces:**
- Consumes: `createSim`, `soloRun` (Tarea 2); `G.Judgment.debugStart()` (ya existe, `judgment.js:704`).
- Produces: `G.Judgment.drawOverlay(ctx, w, h, dt)` — `dt` = tiempo de juego del fotograma (0 en pausa).

- [ ] **Step 1: Escribir la prueba**

Añadir al final de `server/test/sim.test.js`:

```js
test('la Sentencia de Arceus, de la animación a la pelea', () => {
  const sim = createSim({ seed: 9 });
  const r = soloRun(sim, { god: true });
  run(r, 20);
  sim.G.Judgment.debugStart();
  let fight = false;
  run(r, 150, () => { if (sim.G.Judgment.active && !sim.G.Judgment.cinematic) fight = true; });
  assert.ok(fight, 'no ha llegado a la pelea');
});
```

- [ ] **Step 2: Ejecutarla y ver que falla**

Run: `node --test --test-name-pattern=Sentencia server/test/sim.test.js`
Expected: FAIL con `ReferenceError: document is not defined` (en `ember`, `js/systems/judgment.js`).

- [ ] **Step 3: Mover `ember` al dibujo**

En `js/systems/judgment.js`:

En `update(dt, pl, time)`, quitar la línea `    ember(dt);` (la que va justo después de `    touch(pl);`).

`drawOverlay` pasa a ser:

```js
  /** @param dt  tiempo de juego del fotograma (0 en pausa): mueve la ceniza */
  function drawOverlay(ctx, w, h, dt) {
    if (phase === 'cine') drawCine(ctx, w, h);
    else if (phase === 'fight') drawFight(ctx, w, h, dt);
  }
```

El principio de `drawFight` pasa a ser:

```js
  function drawFight(ctx, w, h, dt) {
    ember(dt, w, h);
    ctx.save();
```

Y el principio de `ember` (quitando las dos líneas que leían el `<canvas>`):

```js
  /** Ceniza y chispas que caen (en pantalla, de w × h). Sólo de dibujo. */
  function ember(dt, w, h) {
    if (embers.length < 70 && Math.random() < dt * 40) {
```

En `js/game.js`, en `render()`:

```js
    G.Judgment.drawOverlay(ctx, w, h, frameDt);
```

(`frameDt` ya existe: es `dt` con el juego en `'playing'` y 0 si no; lo usa `G.Weather.draw` dos líneas antes.)

- [ ] **Step 4: Ejecutar todas las pruebas**

Run: `node --test server/test/sim.test.js`
Expected: PASS las 5.

- [ ] **Step 5: Probar en el navegador** (Review Focus 1)

En `http://localhost/pokesurvivor/dev.html`, con una partida en marcha, en la consola: `G.Judgment.debugStart()`. Tras la animación, en la pelea: la ceniza cae como antes; con Esc (pausa) se queda quieta y al seguir vuelve a caer. Ningún error en consola.

- [ ] **Step 6: Commit**

```bash
git add js/systems/judgment.js js/game.js server/test/sim.test.js
git commit -m "Paso 2: la ceniza de la Sentencia se mueve al dibujarla (la lógica ya no lee el canvas)"
```

---

### Task 4: Publicación, documentos y cierre del paso

**Files:**
- Modify: `.dockerignore` (añadir `server`)
- Modify: `CLAUDE.md` (sección "Publicar una versión")
- Modify: `docs/superpowers/specs/2026-10-14-coop-servidor-design.md:3` (estado)
- Regenerados: `index.html`, `js/app.min.js`, `version.json` y lo que reescriban `export_data.js` / `make_seo_pages.py`

- [ ] **Step 1: `server/` fuera de la web**

Añadir al final de `.dockerignore` la línea:

```
server
```

- [ ] **Step 2: Las pruebas, en las normas de publicación**

En `CLAUDE.md`, dentro de "## Publicar una versión", después de la viñeta de `node tools/check_copy.js --built`, añadir:

```markdown
   - `node --test server/test/sim.test.js` debe pasar (la lógica del juego sigue funcionando sin
     navegador; la usará el servidor del cooperativo). Si falla con `document`/`Image`/`location is
     not defined`, algo de lógica está tocando la pantalla: muévelo a la parte de dibujo.
```

- [ ] **Step 3: Build y comprobaciones**

Run: `node tools/build.js && node tools/export_data.js && python tools/make_seo_pages.py && node tools/check_copy.js --built && node --test server/test/sim.test.js`
Expected: `check_copy` da `ok`; las 5 pruebas pasan. `grep -c "G.Step" js/app.min.js` da al menos 1 (si el paquete ofusca nombres, buscar `step.js` en el bloque de scripts de `dev.html` y comprobar que `build.js` no avisa de nada).

- [ ] **Step 4: Probar la versión publicada** (Review Focus 4)

Abrir `http://localhost/pokesurvivor/index.html` (no `dev.html`): partida en solitario de un par de minutos sin errores en consola.

- [ ] **Step 5: Estado de la spec**

En `docs/superpowers/specs/2026-10-14-coop-servidor-design.md`, línea 3, sustituir el estado por:

```markdown
Fecha: 14-10-2026 · Estado: pasos 1 y 2 hechos (Plan 1 y Plan 2); pasos 3-5 pendientes.
```

- [ ] **Step 6: Commit**

```bash
git add .dockerignore CLAUDE.md docs/superpowers/specs/2026-10-14-coop-servidor-design.md index.html js/app.min.js version.json
git status --short
```

Añadir también lo que `export_data.js` y `make_seo_pages.py` hayan cambiado (según `git status --short`; si no han cambiado nada, nada). Luego:

```bash
git commit -m "Paso 2: pruebas de la simulación en las normas de publicación, server/ fuera de la web y versión publicada"
```

---

## Para el paso 3 (no se hace aquí)

Lo que la sonda ha dejado a la vista y es trabajo del servidor:
- `G.Camera.sees()` / `outerRadius()` deciden cosas de juego (proyectiles que se descartan, rezagados, zona de aparición): en el servidor la cámara tiene que ser "lo que ve algún jugador".
- `Combat.tick`, `Projectiles.update`, `Interact`, `Rift` y `Judgment` reciben **un** jugador (`me`): con varios jugadores en el servidor hay que llamarlos por cada uno o cambiarlos.
- El cambio de bioma (`Math.floor(time / 240)`) sigue en `game.js` y repetido en `server/test/solo.js`; el servidor tendrá que llevarlo igual.
- El juego avanza con `dt` ≤ 1/30 s; la spec quiere 20 Hz (50 ms): comprobar choques y proyectiles con ese paso.
