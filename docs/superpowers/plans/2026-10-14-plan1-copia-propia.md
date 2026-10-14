# Plan 1 — Copia propia en poke.sergioveloza.com

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el juego funcione en `https://poke.sergioveloza.com` con el Firebase `pokesurvivor-662eb` del usuario, sin ninguna dependencia de la infraestructura de pokesurvivor.com, y con el cooperativo antiguo (WebRTC directo, sin TURN) todavía en marcha.

**Architecture:** Un archivo `js/config.js` (`G.Config`) reúne los datos de esta copia (sitio, Firebase, admins, apoyo, TURN). El juego, `tools/export_data.js` → `tools/cache/gamedata.json`, `tools/make_seo_pages.py` y `tools/make_rules.js` leen de ahí. Se borra lo que sólo sirve al original (portero, Worker, CNAME). La web se sirve con el `Dockerfile` + `nginx.conf` existentes como servicio `web` de Easypanel.

**Tech Stack:** JavaScript sin frameworks (Canvas 2D), Node ≥ 20 para las herramientas, Python 3 para las páginas SEO, Firebase CLI 15 (`firebase`), Firebase Auth/Firestore/Realtime Database (plan Spark), Easypanel (Docker, nginx).

**Spec:** `docs/superpowers/specs/2026-10-14-coop-servidor-design.md` (secciones 2 y 7.1). Este plan cubre **sólo el paso 1**; los pasos 2-5 (servidor de partidas) irán en el Plan 2.

## Global Constraints

- Sitio: `https://poke.sergioveloza.com/` (con barra final en `G.Config.site`).
- Proyecto Firebase: `pokesurvivor-662eb`. Nunca activar Identity Platform ni funciones de bloqueo (cobran por usuario).
- DNS: `poke.sergioveloza.com A 82.29.197.223` ya existe en Hostinger (no tocar).
- Se edita `dev.html`, nunca `index.html` (se genera con `node tools/build.js`).
- Publicar: `node tools/build.js && node tools/export_data.js && python tools/make_seo_pages.py`.
- `updater.js` y la escritura de `version.json` en `tools/build.js` no se quitan.
- Commits sin "Co-Authored-By" ni firma de IA. No hacer `git push` salvo que el usuario lo pida.
- Los cambios de infraestructura NO van al changelog (`js/data/changelog.js`).
- Se mantiene el crédito al proyecto original (`LICENSE`, `CREDITS.md`, enlaces a `github.com/JPTER78/pokesurvivor`).
- Los cambios del usuario sin commit (`Dockerfile`, `functions/*`) no se pisan sin preguntar.

## Review Focus

1. **Juego sin Firebase configurado** (Tareas 1-4, `G.Config.firebase = null`): debe arrancar en modo local (sólo navegador) sin errores en consola; lo cubre el paso de prueba en navegador de la Tarea 1.
2. **Página inglesa `/en/`**: tras cambiar el dominio, canonical/og:url deben ser `https://poke.sergioveloza.com/en/` y el juego debe cargar (usa `<base href="../">`); comprobado en la Tarea 2.
3. **Reglas con lista de admins vacía** (`me() in []`): deben compilar y no dar permisos a nadie; validado con `firebase_validate_security_rules` en la Tarea 4.
4. **Restos del original**: ninguna cadena de pokesurvivor.com / pokesurvivor-free / turn.pokesurvivor / UID admin original / Ko-fi original en archivos servidos; `tools/check_copy.js` lo comprueba (Tareas 1-3 y 7).
5. **Inicio de sesión con Google en el dominio nuevo**: falla con `auth/unauthorized-domain` si no se añade `poke.sergioveloza.com` a los dominios autorizados; prueba manual en la Tarea 7.

---

### Task 1: `js/config.js` y comprobación de restos del original

**Files:**
- Create: `js/config.js`
- Create: `tools/check_copy.js`
- Delete: `js/core/firebase-config.js`, `js/net/signups.js`
- Modify: `dev.html:568` (cargar `js/config.js` en lugar de `firebase-config.js`), `dev.html:611` (quitar `signups.js`)
- Modify: `js/net/ranking.js:423`, `js/data/funding.js:11-19`, `js/net/net.js:34-44`, `js/data/lang-en.js:454`

**Interfaces:**
- Produces: `G.Config = { site: string, turn: string, admins: string[], kofi: string, sponsors: string, firebase: object|null }` y `G.FIREBASE_CONFIG` (alias de `G.Config.firebase`, el que ya usa `js/core/db.js`). `node tools/check_copy.js [--built]` → sale con código 1 y lista los restos si los hay.

- [ ] **Step 1: Escribir la comprobación (el "test")**

`tools/check_copy.js`:

```js
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
const SKIP_DIRS = new Set(['.git', 'assets', 'node_modules', 'cache', 'superpowers', '.wrangler']);
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
```

- [ ] **Step 2: Ejecutarla y ver que falla**

Run: `node tools/check_copy.js`
Expected: FAIL (código 1) con una lista que incluye `js/core/firebase-config.js → pokesurvivor-free`, `js/net/net.js → turn.pokesurvivor`, `js/net/ranking.js → rshaa5…`, `js/data/funding.js → kofi: 'jpter78'`, `dev.html → pokesurvivor.com`, etc.

- [ ] **Step 3: Crear `js/config.js`**

```js
/* ============ config.js — los datos de ESTA copia del juego ============
 * Todo lo que cambia de una instalación a otra está aquí (y en ningún otro
 * sitio): dominio, proyecto de Firebase, moderadores y apoyo.
 * Lo leen el juego, tools/export_data.js (-> páginas web y reglas) y
 * tools/make_rules.js. Tras cambiarlo: node tools/export_data.js, desplegar
 * las reglas (firebase deploy --only firestore) y publicar.
 *
 * firebase: la configuración de la app web de Firebase (no es secreta: lo que
 * protege las partidas son las reglas). null = el juego guarda sólo en el
 * navegador (sin cuentas, amigos ni ranking).
 */
G.Config = {
  site: 'https://poke.sergioveloza.com/',
  turn: '',                 // Worker de claves TURN para el cooperativo ('' = sin TURN)
  admins: [],               // uids con acceso a Moderación (y en firestore.rules)
  kofi: '',                 // usuario de Ko-fi ('' = sin botón "Apoyar")
  sponsors: '',             // usuario de GitHub Sponsors ('' = sin enlace)
  firebase: null
};
G.FIREBASE_CONFIG = G.Config.firebase;
```

- [ ] **Step 4: Cargarlo en `dev.html` y quitar `signups.js`**

En `dev.html`, cambiar la línea 568:

```html
<script defer src="js/core/firebase-config.js"></script>
```
por
```html
<script defer src="js/config.js"></script>
```
y borrar la línea 611:
```html
<script defer src="js/net/signups.js"></script>
```
Después: `git rm js/core/firebase-config.js js/net/signups.js`. (Las llamadas a `G.Signups` en `js/core/db.js` y `js/ui/login.js` ya van protegidas con `if (G.Signups)`: no hacen nada sin el archivo.)

- [ ] **Step 5: Admins, apoyo y TURN desde `G.Config`**

`js/net/ranking.js:423`:
```js
  const ADMINS = G.Config.admins;
```

`js/data/funding.js`, sustituir el objeto (líneas 11-19):
```js
G.Funding = {
  kofi: G.Config.kofi,
  sponsors: G.Config.sponsors,
  costs: [
    ['Servidores (partidas, cuentas, ranking y multijugador)', 'Según cuánta gente juegue']
  ],
  get url() { return this.kofi ? 'https://ko-fi.com/' + this.kofi : ''; }
};
```

`js/data/lang-en.js:454`: quitar sólo el par `'Dominio pokesurvivor.com': 'Domain pokesurvivor.com', ` (dejar el resto de la línea igual).

`js/net/net.js:34`:
```js
  const TURN_URL = G.Config.turn;
```
y en `fetchTurn()` (línea ~39), la primera condición pasa a:
```js
    if (!TURN_URL || !fb || fb.emulator || !fb.auth || !fb.auth.currentUser) return Promise.resolve(null);
```

- [ ] **Step 6: Comprobar que estos archivos ya no salen**

Run: `node tools/check_copy.js`
Expected: sigue FAIL, pero ya **no** aparecen `js/config.js`, `js/net/*`, `js/data/funding.js`, `js/data/lang-en.js` ni `js/core/firebase-config.js`. (Quedan `dev.html`, `tools/*`, `firestore.rules`, `functions/`, `cloudflare/`… de las tareas siguientes.)

- [ ] **Step 7: Probar en el navegador**

Run: `npx --yes http-server -p 8765 -c-1 .` y abrir `http://localhost:8765/dev.html`.
Expected: el juego arranca en modo local (sin pantalla de cuenta en la nube), sin errores en consola; una partida en solitario empieza y se puede pausar.

- [ ] **Step 8: Commit**

```bash
git add js/config.js tools/check_copy.js dev.html js/net/ranking.js js/data/funding.js js/net/net.js js/data/lang-en.js
git commit -m "Copia propia: js/config.js con los datos de esta instalación; fuera firebase-config.js y signups.js"
```

---

### Task 2: Dominio nuevo en páginas, SEO y nginx

**Files:**
- Modify: `dev.html` (todas las `https://pokesurvivor.com/`), `tools/export_data.js`, `tools/make_seo_pages.py:11-13` y sus tuplas con el dominio, `tools/build.js:8,60` (comentarios), `nginx.conf:4-10`
- Regenerated: `index.html`, `en/**`, `apoyar/`, `guia/`, …, `sitemap.xml`, `robots.txt`

**Interfaces:**
- Consumes: `G.Config.site` (Tarea 1).
- Produces: `gamedata.json` gana `config: { site, admins }`; `make_seo_pages.py` usa `SITE = D['config']['site']`.

- [ ] **Step 1: Exportar la config en `tools/export_data.js`**

En la lista de archivos que carga (la del `for (const f of [...])`), añadir `'js/config.js'` **antes** de `'js/data/funding.js'`. En el objeto `out`, añadir:
```js
  config: { site: G.Config.site, admins: G.Config.admins },
```

- [ ] **Step 2: `make_seo_pages.py` toma el sitio de ahí**

Mover la carga de `D` antes de `SITE` y definir:
```python
D = json.load(open(os.path.join(ROOT, 'tools', 'cache', 'gamedata.json'), encoding='utf-8'))
SITE = D['config']['site']
```
(borrando la línea `SITE = 'https://pokesurvivor.com/'`). En las tuplas de reemplazo de la página inglesa (líneas ~573 y ~575) cambiar el literal por `SITE`:
```python
        (f'<link rel="canonical" href="{SITE}">', f'<link rel="canonical" href="{SITE}en/">'),
        ...
        (f'<meta property="og:url" content="{SITE}">', f'<meta property="og:url" content="{SITE}en/">'),
```

- [ ] **Step 3: `dev.html` y comentarios**

Run (Git Bash): `sed -i 's#https://pokesurvivor\.com/#https://poke.sergioveloza.com/#g' dev.html`
y en `tools/build.js` cambiar en los comentarios de las líneas 8 y 60 `pokesurvivor.com` por `el dominio`.

- [ ] **Step 4: `nginx.conf` con el dominio nuevo**

Sustituir los dos primeros bloques `server` (líneas 2-10) por un único bloque con:
```nginx
# PokéSurvivor (copia en poke.sergioveloza.com). EasyPanel termina el HTTPS y llega aquí por el puerto 80.
server {
    listen 80 default_server;
    server_name poke.sergioveloza.com _;
```
(el resto del bloque — `root`, `gzip`, cabeceras, `location` — se queda igual; se borra la redirección de `www.pokesurvivor.com`).

- [ ] **Step 5: Regenerar y comprobar**

Run: `node tools/build.js && node tools/export_data.js && python tools/make_seo_pages.py && node tools/check_copy.js --built`
Expected: el build acaba con `ok: N scripts …`; `check_copy` puede seguir fallando **sólo** por `firestore.rules`, `functions/`, `cloudflare/`, `CNAME`, `.firebaserc`, `docs/*`, `tools/activar_dominio.sh` (Tareas 3-4).
Run: `grep -o 'canonical" href="[^"]*' en/index.html index.html`
Expected: `https://poke.sergioveloza.com/en/` y `https://poke.sergioveloza.com/`.

- [ ] **Step 6: Commit**

```bash
git add -A dev.html index.html en apoyar guia legendarios logros movimientos novedades objetos pokedex shinies tipos sitemap.xml robots.txt 404.html js/app.min.js version.json nginx.conf tools/export_data.js tools/make_seo_pages.py tools/build.js
git commit -m "Copia propia: dominio poke.sergioveloza.com en la web, las páginas y nginx"
```

---

### Task 3: Quitar la infraestructura del original

**Files:**
- Delete: `functions/`, `cloudflare/`, `CNAME`, `tools/activar_dominio.sh`, `docs/TURN.md`, `docs/DOMINIO.md`
- Modify: `firebase.json` (quitar la sección `functions`), `.firebaserc`, `docs/FIREBASE.md`, `docs/PUBLICAR.md`, `docs/SEO.md`

- [ ] **Step 1: Comprobar cambios sin guardar**

Run: `git status --short functions cloudflare`
Expected: vacío. **Si hay cambios (a 14-10-2026 los hay en `functions/`), PARAR y preguntar al usuario** si se pueden descartar: la función "portero" es de bloqueo y desplegarla activaría Identity Platform.

- [ ] **Step 2: Borrar**

```bash
git rm -r functions cloudflare CNAME tools/activar_dominio.sh docs/TURN.md docs/DOMINIO.md
```

- [ ] **Step 3: `firebase.json` y `.firebaserc`**

`firebase.json` queda:
```json
{
  "firestore": { "rules": "firestore.rules", "indexes": "firestore.indexes.json" },
  "database": { "rules": "database.rules.json" },
  "emulators": {
    "auth": { "port": 9099 },
    "firestore": { "port": 8080 },
    "database": { "port": 9000 },
    "ui": { "enabled": false },
    "singleProjectMode": true
  }
}
```
`.firebaserc`:
```json
{ "projects": { "default": "pokesurvivor-662eb" } }
```

- [ ] **Step 4: Documentos**

En `docs/FIREBASE.md`, `docs/PUBLICAR.md` y `docs/SEO.md`, sustituir `pokesurvivor-free` por `pokesurvivor-662eb`, `pokesurvivor.com` por `poke.sergioveloza.com`, y donde se explique GitHub Pages o el Worker, poner: "La web se publica en Easypanel (servicio `web`, `Dockerfile` + `nginx.conf`); ver `CLAUDE.md`." En `docs/FIREBASE.md`, donde diga dónde pegar la configuración, poner `js/config.js` (campo `firebase`).

- [ ] **Step 5: Comprobar**

Run: `node tools/check_copy.js`
Expected: FAIL sólo por `firestore.rules` (UID admin original) — Tarea 4.

- [ ] **Step 6: Commit**

```bash
git add -A firebase.json .firebaserc docs
git commit -m "Copia propia: fuera el portero, el Worker de Cloudflare y GitHub Pages; Firebase pokesurvivor-662eb"
```

---

### Task 4: Admins de las reglas desde `js/config.js`

**Files:**
- Modify: `firestore.rules:20` (función `admin()`), `tools/make_rules.js`

**Interfaces:**
- Consumes: `gamedata.json → config.admins` (Tarea 2).
- Produces: bloque `// <admins> … // </admins>` en `firestore.rules`, regenerado por `node tools/make_rules.js`.

- [ ] **Step 1: Marcas en las reglas**

Sustituir en `firestore.rules`:
```
    // Moderación (pantalla oculta del juego, js/ui/mod-ui.js): sólo esta cuenta.
    function admin() { return signedIn() && me() in ['rshaa5gKD3fXw6lE4PPXITbowaG2']; }
```
por:
```
    // Moderación (pantalla oculta del juego, js/ui/mod-ui.js): las cuentas de G.Config.admins.
    // <admins> (generado por tools/make_rules.js desde js/config.js, no editar a mano)
    function admin() { return signedIn() && me() in []; }
    // </admins>
```

- [ ] **Step 2: `make_rules.js` escribe los admins**

Dentro de `run()`, tras `const out = src.replace(re, …)`, cambiar para encadenar un segundo reemplazo:
```js
  const admins = (data.config && data.config.admins) || [];
  if (!admins.every(u => /^[A-Za-z0-9]{20,40}$/.test(u))) throw new Error('uid de admin raro en js/config.js');
  const reA = /    \/\/ <admins>[\s\S]*?\/\/ <\/admins>/;
  if (!reA.test(src)) throw new Error('faltan las marcas <admins> en firestore.rules');
  const blockA = [
    '    // <admins> (generado por tools/make_rules.js desde js/config.js, no editar a mano)',
    `    function admin() { return signedIn() && me() in [${admins.map(u => `'${u}'`).join(', ')}]; }`,
    '    // </admins>'
  ].join('\n');
  const out = src.replace(re, block.replace(/\n/g, nl)).replace(reA, blockA.replace(/\n/g, nl));
```
(sustituyendo la línea `const out = src.replace(re, block.replace(/\n/g, nl));` existente).

- [ ] **Step 3: Regenerar y validar**

Run: `node tools/export_data.js && node tools/check_copy.js`
Expected: `ok: sin restos del original`.
Validar las reglas con la herramienta MCP `firebase_validate_security_rules` (tipo `firestore`, archivo `firestore.rules`) o con `firebase emulators:exec --only firestore "echo ok"`.
Expected: sin errores de compilación (`me() in []` es válido y no da permisos a nadie).

- [ ] **Step 4: Commit**

```bash
git add firestore.rules tools/make_rules.js
git commit -m "Copia propia: los moderadores de las reglas salen de js/config.js"
```

---

### Task 5: Preparar el Firebase `pokesurvivor-662eb`

**Files:**
- Modify: `js/config.js` (campo `firebase`)

Pasos en el proyecto (los marcados **[usuario]** se hacen en la consola web, porque la CLI no los permite o porque hay riesgo de activar Identity Platform):

- [ ] **Step 1: App web**

Run: `firebase apps:create WEB "PokeSurvivor web" --project pokesurvivor-662eb`
Run: `firebase apps:sdkconfig WEB <APP_ID que devuelve el anterior> --project pokesurvivor-662eb`
Expected: un objeto con `apiKey`, `authDomain: 'pokesurvivor-662eb.firebaseapp.com'`, `projectId`, `storageBucket`, `messagingSenderId`, `appId`.

- [ ] **Step 2: Firestore**

Herramienta MCP `firestore_create_database` (proyecto `pokesurvivor-662eb`, base `(default)`, ubicación `eur3`), o `firebase firestore:databases:create "(default)" --location=eur3 --project pokesurvivor-662eb`.
Si responde 403 "Cloud Firestore API has not been used": **[usuario]** abrir `https://console.developers.google.com/apis/api/firestore.googleapis.com/overview?project=pokesurvivor-662eb`, pulsar *Habilitar*, esperar 2 min y repetir.

- [ ] **Step 3: Realtime Database (temporal, para el cooperativo antiguo)**

Run: `firebase database:instances:create pokesurvivor-662eb-default-rtdb --location europe-west1 --project pokesurvivor-662eb`
Si falla: **[usuario]** consola → Realtime Database → Crear base de datos → Bélgica (europe-west1) → modo bloqueado.
Expected: URL `https://pokesurvivor-662eb-default-rtdb.europe-west1.firebasedatabase.app`.

- [ ] **Step 4: Authentication [usuario]**

Consola → Authentication → Comenzar → Método de acceso:
- *Correo electrónico/contraseña*: habilitar (sin "vínculo de correo").
- *Google*: habilitar, con el correo de asistencia del usuario.
- Configuración → Dominios autorizados → añadir `poke.sergioveloza.com`.
- **Si en algún momento aparece "Actualizar a Identity Platform" / "Upgrade": NO pulsar.**

- [ ] **Step 5: Rellenar `js/config.js`**

```js
  firebase: {
    apiKey: '<de Step 1>',
    authDomain: 'pokesurvivor-662eb.firebaseapp.com',
    projectId: 'pokesurvivor-662eb',
    storageBucket: '<de Step 1>',
    messagingSenderId: '<de Step 1>',
    appId: '<de Step 1>',
    databaseURL: 'https://pokesurvivor-662eb-default-rtdb.europe-west1.firebasedatabase.app'
  }
```
(los `<…>` se copian literalmente de la salida del Step 1; no se deja ninguno sin rellenar).

- [ ] **Step 6: Desplegar reglas e índices**

Run: `firebase deploy --only firestore,database --project pokesurvivor-662eb`
Expected: `Deploy complete!` con reglas de Firestore, índices y reglas de la Realtime Database. (Nunca `firebase deploy` a secas.)

- [ ] **Step 7: Probar en local**

Abrir `http://localhost:8765/dev.html` (servidor de la Tarea 1; `localhost` ya está autorizado por defecto). Crear una cuenta con nombre y contraseña, elegir apodo, jugar una partida corta y volver al menú.
Expected: sin errores; con la herramienta MCP `firestore_get_document` en `saves/<uid>` aparece la partida, y en `names/<apodo>` el apodo.

- [ ] **Step 8: Commit**

```bash
git add js/config.js
git commit -m "Copia propia: conectada al Firebase pokesurvivor-662eb"
```

---

### Task 6: `CLAUDE.md` de esta copia

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Reescribir**

```markdown
# PokéSurvivor (copia en poke.sergioveloza.com) — cómo se trabaja y se publica

Copia propia del juego de JPTER78 (github.com/JPTER78/pokesurvivor, código MIT; sprites
CC BY-NC: sin uso comercial). Los datos de esta instalación están en `js/config.js`.

## Publicar una versión
1. Se edita `dev.html` (nunca `index.html`, que se genera).
2. `node tools/build.js && node tools/export_data.js && python tools/make_seo_pages.py`
   - `build.js` genera `index.html`, `js/app.min.js` y **`version.json`** (la huella de esta versión).
   - `node tools/check_copy.js --built` debe dar `ok`.
3. Commit (sin "Co-Authored-By" ni ninguna firma de IA) y `git push origin main` sólo cuando el dueño lo pida.
4. Easypanel redespliega el servicio `web` desde `origin/main` (Dockerfile + nginx.conf).

## Actualización automática de los jugadores (obligatorio)
(igual que antes: `js/core/updater.js` mira `version.json` cada 5 min; fuera de partida, aviso de
5 s y recarga; en partida no se toca; antes se sube a la nube lo pendiente.)
No quitar `updater.js` ni la escritura de `version.json` en `tools/build.js`.

## Novedades (changelog)
Cada cambio de juego o arreglo de fallos va también en `js/data/changelog.js`
(español e inglés). Los cambios de servidores, base de datos o costes NO van ahí.

## Servidores
- Firebase: proyecto **pokesurvivor-662eb** (plan Spark, autenticación normal).
  **Nunca** activar "Identity Platform" ni nada que lo active (funciones de bloqueo, MFA,
  "Actualizar para habilitar"): cobra por usuario. Desplegar sólo con
  `firebase deploy --only firestore,database`.
- VPS con Easypanel (82.29.197.223): servicio `web` en `poke.sergioveloza.com`.
- DNS en Hostinger (`poke` → 82.29.197.223).
- Mantenimiento: `MAINTENANCE` en `js/main.js` (con `?dev` se puede entrar para probar).
```
(en "Actualización automática", copiar literalmente las viñetas del `CLAUDE.md` actual en lugar del paréntesis).

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "Copia propia: CLAUDE.md con la infraestructura de esta instalación"
```

---

### Task 7: Publicar en Easypanel y comprobar

**Files:** ninguno nuevo (sólo build y despliegue).

- [ ] **Step 1: Build final y comprobación**

Run: `node tools/build.js && node tools/export_data.js && python tools/make_seo_pages.py && node tools/check_copy.js --built`
Expected: `ok: sin restos del original (incluido lo generado)`.
Commit de lo generado:
```bash
git add -A index.html js/app.min.js version.json en apoyar guia legendarios logros movimientos novedades objetos pokedex shinies tipos sitemap.xml robots.txt 404.html
git commit -m "Copia propia: versión publicada"
```

- [ ] **Step 2: Subir [usuario confirma]**

Preguntar al usuario antes de `git push origin main` (norma de `CLAUDE.md`).

- [ ] **Step 3: Servicio `web` en Easypanel [usuario]**

Easypanel → proyecto `pokesurvivor` → *+ Service* → *App* → nombre `web`:
- Source: GitHub `velosergio/pokesurvivor`, rama `main`, build *Dockerfile* (ruta `Dockerfile`).
- Domains: `poke.sergioveloza.com`, HTTPS activado, puerto interno 80.
- Deploy.

- [ ] **Step 4: Comprobar desde fuera**

Run: `curl -sI https://poke.sergioveloza.com/ | head -5`
Expected: `HTTP/2 200` y certificado válido.
Run: `curl -s https://poke.sergioveloza.com/version.json`
Expected: el mismo `v` que el `version.json` local.
Run: `curl -sI https://poke.sergioveloza.com/version.json | grep -i cache-control`
Expected: `no-store`.

- [ ] **Step 5: Prueba manual en el dominio**

En `https://poke.sergioveloza.com`: crear cuenta con nombre y contraseña, entrar con Google (si da `auth/unauthorized-domain`, falta el dominio autorizado de la Tarea 5 Step 4), jugar una partida, ver el ranking. En `/en/` la página carga en inglés.
Con dos navegadores (dos cuentas amigas): crear sala, invitar, empezar cooperativo. Si la red no deja conexión directa no conectará (sin TURN: esperado hasta el Plan 2).

- [ ] **Step 6: Admin**

Tras crear la cuenta del usuario, obtener su uid (herramienta MCP `auth_get_users` o consola), ponerlo en `G.Config.admins` de `js/config.js`, y:
Run: `node tools/build.js && node tools/export_data.js && python tools/make_seo_pages.py && firebase deploy --only firestore --project pokesurvivor-662eb`
Commit `"Copia propia: cuenta de moderación"`, push (con permiso) y comprobar que en el juego aparece *Moderación*.
