# Vista Debug del moderador — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un moderador puede, desde un botón Debug del menú principal, anotar +100.000 monedas o +1.000 tickets ×10 a un jugador buscado por apodo, y ese jugador los recibe al sincronizar sin que la cuenta quede marcada.

**Architecture:** La pantalla solo escribe `grants/{uid}` (totales acumulados). `js/core/grant.js` suma a la partida lo que aún no se ha aplicado. `db.js` lo hace al entrar y dentro de la transacción de subida, después de fusionar. Las reglas dejan pasar exactamente ese extra y nada más.

**Tech Stack:** JavaScript de navegador sin framework, Firestore rules v2, Node ≥ 20 (`node --test`), Firebase CLI (`firebase deploy --only firestore`). Sin dependencias npm nuevas.

**Spec:** `docs/superpowers/specs/2026-10-14-debug-moderador-design.md`

## Global Constraints

- Se edita `dev.html`, nunca `index.html` (lo genera `node tools/build.js`).
- No quitar `js/core/updater.js` ni la escritura de `version.json` en `tools/build.js`.
- No añadir nada a `js/data/changelog.js`.
- No meter el `match /grants` entre las marcas `<admins>` ni `<logros>` de `firestore.rules`.
- Cantidades fijas: monedas `100000`, tickets ×10 `1000`. No son editables.
- El botón solo lo ve `G.Ranking.isAdmin()` (`G.Config.admins`).
- Desplegar reglas con `firebase deploy --only firestore`. Nunca `firebase deploy` a secas. Nunca activar Identity Platform.
- No hacer `git push` ni redesplegar el sitio hasta que el dueño lo pida.
- Commits sin "Co-Authored-By" ni firma de IA. Mensaje de una línea, en español, como el historial.
- No crear `package.json` ni instalar paquetes.

## Review Focus

1. **Orden:** las reglas se despliegan (Tarea 3) antes de cablear `pushNow` (Tarea 4). Si el cliente nuevo lee `grants/{uid}` y la regla aún no existe, el cierre `match /{document=**}` deniega la lectura y **falla cada guardado en la nube**.
2. **El crédito no es presupuesto libre.** `t10Credit` solo anula los tickets ×10 regalados (`+ 10 * tc` en el lado izquierdo de `budget`). No debe permitir Pokémon ni monedas de más.
3. **`uid` se pasa como argumento.** `possibleSave` y `freshSave` están definidas fuera de `match /saves/{uid}` y no ven ese comodín. Si `grantVal` usa `uid` suelto, la regla no compila o niega todos los guardados.
4. **Lecturas de la transacción, antes de escribir.** En `pushNow`, `tx.get` de `grants/{uid}` va junto al `tx.get` de la partida, y `applyGrant` va después de `merge` y antes de `tx.set`.

---

### Task 1: Aplicar la libreta (función pura)

**Files:**
- Create: `js/core/grant.js`
- Test: `tools/grant.test.js`

**Interfaces:**
- Consumes: nada
- Produces: `G.Grant.applyGrant(save, grant) -> { dc: number, dt: number }` en el navegador. En Node, `require('../js/core/grant.js').applyGrant`. `save` se muta. `grant` es `{ coins, t10 }` o null. `dc`/`dt` son lo sumado esta vez. Si `save.grantedCoins` ya supera `grant.coins`, no se baja ni se suman monedas. Igual con `grantedT10`.

- [ ] **Step 1: Write the failing test**

Crear `tools/grant.test.js`:

```js
/* node --test tools/grant.test.js */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { applyGrant } = require('../js/core/grant.js');

const base = () => ({ coins: 10, tickets: { t1: 1, t10: 2 }, grantedCoins: 0, grantedT10: 0 });

test('suma monedas una sola vez', () => {
  const s = base();
  assert.deepEqual(applyGrant(s, { coins: 100000, t10: 0 }), { dc: 100000, dt: 0 });
  assert.equal(s.coins, 100010);
  assert.equal(s.grantedCoins, 100000);
  assert.equal(s.tickets.t10, 2);
  assert.deepEqual(applyGrant(s, { coins: 100000, t10: 0 }), { dc: 0, dt: 0 });
  assert.equal(s.coins, 100010);
});

test('un gasto posterior se conserva y el segundo regalo solo suma el delta', () => {
  const s = base();
  applyGrant(s, { coins: 100000, t10: 0 });
  s.coins -= 500;
  assert.deepEqual(applyGrant(s, { coins: 200000, t10: 1000 }), { dc: 100000, dt: 1000 });
  assert.equal(s.coins, 100010 - 500 + 100000);
  assert.equal(s.tickets.t10, 1002);
  assert.equal(s.grantedCoins, 200000);
  assert.equal(s.grantedT10, 1000);
  assert.equal(s.tickets.t1, 1);
});

test('no baja granted ni regala si la copia local ya se pasó', () => {
  const s = base();
  s.grantedCoins = 150000;
  s.coins = 50;
  assert.deepEqual(applyGrant(s, { coins: 100000, t10: 0 }), { dc: 0, dt: 0 });
  assert.equal(s.coins, 50);
  assert.equal(s.grantedCoins, 150000);
});

test('libreta vacía o ausente no cambia nada', () => {
  const s = base();
  assert.deepEqual(applyGrant(s, null), { dc: 0, dt: 0 });
  assert.equal(s.coins, 10);
  assert.deepEqual(applyGrant(s, {}), { dc: 0, dt: 0 });
  assert.equal(s.coins, 10);
});

test('crea tickets si la partida no los trae', () => {
  const s = { coins: 0, grantedCoins: 0, grantedT10: 0 };
  applyGrant(s, { coins: 0, t10: 1000 });
  assert.equal(s.tickets.t10, 1000);
  assert.equal(s.tickets.t1, 0);
  assert.equal(s.grantedT10, 1000);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tools/grant.test.js`

Expected: FAIL, no encuentra `js/core/grant.js`.

- [ ] **Step 3: Write minimal implementation**

Crear `js/core/grant.js`:

```js
/* ============ grant.js — aplicar la libreta de regalos a una partida ya fusionada ============
 * Puro: no toca la red. En el navegador queda en G.Grant.applyGrant.
 */
(function (root) {
  const num = v => (Number.isFinite(+v) && +v > 0 ? Math.floor(+v) : 0);
  function applyGrant(save, grant) {
    grant = grant || {};
    if (!save.tickets) save.tickets = { t1: 0, t10: 0 };
    const dc = Math.max(0, num(grant.coins) - num(save.grantedCoins));
    const dt = Math.max(0, num(grant.t10) - num(save.grantedT10));
    save.coins = num(save.coins) + dc;
    save.tickets.t1 = num(save.tickets.t1);
    save.tickets.t10 = num(save.tickets.t10) + dt;
    save.grantedCoins = num(save.grantedCoins) + dc;
    save.grantedT10 = num(save.grantedT10) + dt;
    return { dc: dc, dt: dt };
  }
  root.applyGrant = applyGrant;
})(typeof module !== 'undefined' && module.exports ? module.exports : (G.Grant = G.Grant || {}));
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tools/grant.test.js`

Expected: PASS, 5 pruebas.

- [ ] **Step 5: Commit**

```powershell
git add js/core/grant.js tools/grant.test.js
git commit -m "Debug: aplicar la libreta de regalos sin duplicar ni devolver el gasto"
```

---

### Task 2: Reglas de `grants` y del presupuesto

**Files:**
- Modify: `firestore.rules` (funciones junto a `budget` / `freshSave` / `possibleSave`, y un `match /grants/{uid}` justo antes de `match /{document=**}`)
- Test: `tools/grants-rules.test.js`

**Interfaces:**
- Consumes: nada del juego
- Produces: un moderador puede crear o aumentar `grants/{uid}` solo en saltos de +100000 monedas o +1000 `t10`. El dueño puede leer el suyo. `possibleSave(o, n, secs, userId)` y `freshSave(s, userId)` leen la libreta una vez por campo. `budget(o, n, e, k, dm, cc, tc)` resta `cc` de las monedas y suma `10 * tc` a los tickets.

- [ ] **Step 1: Write the failing test**

Crear `tools/grants-rules.test.js`:

```js
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
  assert.match(src, /t10 == 1000 && request\.resource\.data\.coins == 0/);
  assert.match(src, /coins == resource\.data\.coins \+ 100000/);
  assert.match(src, /t10 == resource\.data\.t10 \+ 1000/);
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tools/grants-rules.test.js`

Expected: FAIL en `match /grants/{uid}`.

- [ ] **Step 3: Write minimal implementation**

En `firestore.rules`, sustituir `saneSave`, `freshSave`, `possibleSave` y `budget`. No dejes copia vieja de esas cuatro funciones. Añade `mn` una sola vez. No toques el bloque `<logros>`.

`saneSave` queda así (se añaden las dos últimas líneas):

```
    function saneSave(s) {
      return s.get('coins', 0) is number && s.get('coins', 0) >= 0
        && tk(s, 't1') is number && tk(s, 't1') >= 0
        && tk(s, 't10') is number && tk(s, 't10') >= 0
        && mis(s) is number && s.get('created', 0) is number
        && cnt(s, 'owned') <= 1100 && cnt(s, 'shiny') <= 1100
        && s.get('grantedCoins', 0) is int && s.get('grantedCoins', 0) >= 0
        && s.get('grantedT10', 0) is int && s.get('grantedT10', 0) >= 0;
    }
```

Sustituir `freshSave` y `possibleSave` por estas, y poner `grantVal`, `mn`, `coinCredit`, `t10Credit` y `grantedWithin` al lado. `budget` gana dos argumentos. El ternario de `grantVal` tiene que seguir en una sola expresión: si el documento no existe no se llama a `get()`.

```
    function grantVal(userId, k) {
      return exists(/databases/$(database)/documents/grants/$(userId))
        ? get(/databases/$(database)/documents/grants/$(userId)).data.get(k, 0)
        : 0;
    }
    function mn(a, b) { return a < b ? a : b; }
    function coinCredit(o, n) {
      return mn(mx(0, n.get('coins', 0) - o.get('coins', 0)),
                mx(0, n.get('grantedCoins', 0) - o.get('grantedCoins', 0)));
    }
    function t10Credit(o, n) {
      return mn(mx(0, tk(n, 't10') - tk(o, 't10')),
                mx(0, n.get('grantedT10', 0) - o.get('grantedT10', 0)));
    }
    function grantedWithin(o, n, gc, gt) {
      return n.get('grantedCoins', 0) >= o.get('grantedCoins', 0)
        && n.get('grantedT10', 0) >= o.get('grantedT10', 0)
        && n.get('grantedCoins', 0) <= gc
        && n.get('grantedT10', 0) <= gt;
    }
    function freshSave(s, userId) {
      let gc = grantVal(userId, 'coins');
      let gt = grantVal(userId, 't10');
      return s.get('coins', 0) <= 2000 + s.get('grantedCoins', 0)
        && s.get('grantedCoins', 0) <= gc
        && tk(s, 't1') <= 10 && tk(s, 't10') <= 2 + s.get('grantedT10', 0)
        && s.get('grantedT10', 0) <= gt
        && cnt(s, 'owned') <= 3 && cnt(s, 'shiny') <= 1 && cnt(s, 'ach') <= 5 && mis(s) <= 3
        && s.get('created', 0) > request.time.toMillis() - 2 * 86400000;
    }
    function possibleSave(o, n, secs, userId) {
      let gc = grantVal(userId, 'coins');
      let gt = grantVal(userId, 't10');
      return n.get('created', 0) == o.get('created', 0)
        && n.get('ach', {}).keys().hasAll(o.get('ach', {}).keys())
        && cnt(n, 'ach') <= 150
        && mis(n) >= mis(o)
        && mis(n) <= 10 + (request.time.toMillis() - o.get('created', 0)) / 86400000 * 5
        && grantedWithin(o, n, gc, gt)
        && budget(o, n, secs > 10800 ? 10800 : (secs > 0 ? secs : 0),
                  secs >= 60 ? 1.0 : (secs > 0 ? secs / 60.0 : 0.0),
                  mis(n) - mis(o), coinCredit(o, n), t10Credit(o, n));
    }
    function budget(o, n, e, k, dm, cc, tc) {
      return tk(o, 't1') + 10 * tk(o, 't10')
        + 3 * k + e / 30 + cnt(n, 'ach') - cnt(o, 'ach') + 3 * dm
        + 10 * (1 * k + e / 300 + dm)
        + achV()
        - tk(n, 't1') - 10 * tk(n, 't10')
        + 10 * tc
        >= mx(mx(0, cnt(n, 'owned') - cnt(o, 'owned') - 3 * k - e / 600),
              mx(cnt(n, 'shiny') - cnt(o, 'shiny') - 2 * k - e / 900,
                 (n.get('coins', 0) - o.get('coins', 0) - cc - 8000 * k - 40 * e - 1000 * dm) / 300));
    }
```

`mx` ya existe: no lo dupliques. `mn` va justo debajo de `mx` si no cabe arriba sin mover `mx`. El test busca la línea `function mn(a, b) { return a < b ? a : b; }`, así que esa línea tiene que existir una vez, con esas llaves y espacios.

En el `match /saves/{uid}`, las llamadas pasan `uid`:

```
        && (marked() || (saneSave(request.resource.data.save) && freshSave(request.resource.data.save, uid)));
```

```
        && (marked() || (saneSave(request.resource.data.save)
              && possibleSave(resource.data.save, request.resource.data.save,
                              (request.time - resource.data.updatedAt).seconds(), uid)));
```

Justo antes de `match /{document=**}`, añadir:

```
    // Libreta de regalos del moderador (js/ui/debug-ui.js). Totales, nunca se borran.
    match /grants/{uid} {
      allow read: if admin() || (signedIn() && me() == uid);

      allow create: if admin()
        && request.resource.data.keys().hasOnly(['coins', 't10', 'at'])
        && request.resource.data.coins is int
        && request.resource.data.t10 is int
        && request.resource.data.at == request.time
        && ((request.resource.data.coins == 100000 && request.resource.data.t10 == 0)
            || (request.resource.data.t10 == 1000 && request.resource.data.coins == 0));

      allow update: if admin()
        && request.resource.data.keys().hasOnly(['coins', 't10', 'at'])
        && request.resource.data.coins is int
        && request.resource.data.t10 is int
        && request.resource.data.at == request.time
        && ((request.resource.data.coins == resource.data.coins + 100000
              && request.resource.data.t10 == resource.data.t10)
            || (request.resource.data.t10 == resource.data.t10 + 1000
              && request.resource.data.coins == resource.data.coins));

      allow delete: if false;
    }
```

El orden de las comparaciones del `create` (`t10 == 1000 && ... coins == 0`, no al revés) es el que busca el test.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tools/grants-rules.test.js`

Expected: PASS, 3 pruebas.

- [ ] **Step 5: Commit**

```powershell
git add firestore.rules tools/grants-rules.test.js
git commit -m "Debug: la libreta de regalos solo crece en saltos fijos y no abre el anti-trampas"
```

---

### Task 3: Desplegar las reglas antes de que el cliente las lea

**Files:**
- Modify: ninguno (solo el despliegue de `firestore.rules`)

**Interfaces:**
- Consumes: el `match /grants/{uid}` de la Tarea 2
- Produces: en el proyecto `pokesurvivor-662eb`, el dueño puede leer `grants/{su uid}` (aunque no exista) y un moderador puede crearlo. Sin esto, la Tarea 4 rompe los guardados.

- [ ] **Step 1: Confirmar que el test de reglas sigue en verde**

Run: `node --test tools/grants-rules.test.js`

Expected: PASS.

- [ ] **Step 2: Desplegar solo Firestore**

Run, desde la raíz del repo: `firebase deploy --only firestore`

Expected: el comando termina en 0 y nombra `firestore.rules`. Si pide login, parar y decirlo: no usar otro proyecto y no desplegar hosting, functions ni database.

- [ ] **Step 3: Commit**

No hay archivos nuevos. No hagas un commit vacío.

---

### Task 4: Sumar el regalo al entrar y al subir la partida

**Files:**
- Modify: `dev.html` (el script de `grant.js` inmediatamente antes de `js/core/db.js`)
- Modify: `js/core/db.js` (`newSave`, `sanitize`, `openCloud`, la transacción de `pushNow`)
- Test: `tools/grant.test.js` (un test más, al final)

**Interfaces:**
- Consumes: `G.Grant.applyGrant(save, grant)` de la Tarea 1. Reglas ya desplegadas (Tarea 3).
- Produces: toda partida nueva tiene `grantedCoins: 0` y `grantedT10: 0`. `sanitize` los deja en enteros ≥ 0. `openCloud` aplica la libreta y, si `dc` o `dt` es > 0, llama a `pushNow` aunque la copia local no sea más nueva. `pushNow` lee `grants/{uid}` en la misma transacción, fusiona, aplica y entonces escribe.

- [ ] **Step 1: Write the failing test**

Añadir al final de `tools/grant.test.js`:

```js
test('la partida nueva y la subida usan la libreta', () => {
  const db = require('fs').readFileSync(require('path').join(__dirname, '..', 'js', 'core', 'db.js'), 'utf8');
  const html = require('fs').readFileSync(require('path').join(__dirname, '..', 'dev.html'), 'utf8');
  assert.match(db, /grantedCoins: 0/);
  assert.match(db, /grantedT10: 0/);
  assert.match(db, /s\.grantedCoins = n\(s\.grantedCoins\)/);
  assert.match(db, /s\.grantedT10 = n\(s\.grantedT10\)/);
  const uses = db.split('G.Grant.applyGrant').length - 1;
  assert.equal(uses, 2);
  assert.ok(html.indexOf('js/core/grant.js') < html.indexOf('js/core/db.js'));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tools/grant.test.js`

Expected: FAIL en `grantedCoins: 0`. Las 5 pruebas anteriores siguen en PASS.

- [ ] **Step 3: Write minimal implementation**

En `dev.html`, delante de la línea que ya existe `<script defer src="js/core/db.js"></script>`:

```html
<script defer src="js/core/grant.js"></script>
```

En `newSave`, justo después de `tickets: { t1: 0, t10: 0 },`:

```js
      grantedCoins: 0,        // monedas de grants/{uid} ya sumadas a coins
      grantedT10: 0,          // tickets ×10 de la libreta ya sumados
```

En `sanitize`, justo después de `s.tickets.t10 = n(s.tickets.t10);`:

```js
    s.grantedCoins = n(s.grantedCoins);
    s.grantedT10 = n(s.grantedT10);
```

En `openCloud`, sustituir desde `save = migrate(s, s.name);` hasta el `else pushNow();` por:

```js
    save = migrate(s, s.name);
    key = uid; user = save.name; guest = false;
    let grantDue = false;
    if (online) {
      try {
        const g = await fs.collection('grants').doc(uid).get();
        const d = G.Grant.applyGrant(save, g.exists ? g.data() : null);
        grantDue = d.dc > 0 || d.dt > 0;
      } catch (e) { /* sin red: la próxima subida lo lee dentro de la transacción */ }
    }
    write(K_CLOUD + uid, save);
    // Sólo se sube si hay algo que la nube no tenga (cuenta nueva, progreso de
    // este ordenador sin subir, o un regalo de la libreta todavía sin aplicar).
    const same = remote && !opts.legacy && (!cached || (cached.updated || 0) <= (remote.updated || 0));
    lastPush = Date.now();       // la primera compra o ticket no sube al momento: espera como las demás
    if (!online) { pending = true; setSync('offline'); scheduleRetry(); }
    else if (grantDue || !same) pushNow();
    else setSync('ok');
```

Dentro de la transacción de `pushNow`, las dos lecturas van antes de cualquier escritura. Sustituir el bloque que hace `tx.get(ref)`, calcula `merged` y aún no ha hecho `tx.set` por:

```js
      const ref = docRef();
      const snap = await tx.get(ref);
      const gsnap = await tx.get(fs.collection('grants').doc(uid));
      const remote = snap.exists ? migrate(snap.data().save) : null;
      merged = remote ? merge(plain(save), remote) : plain(save);
      G.Grant.applyGrant(merged, gsnap.exists ? gsnap.data() : null);
      const doc = { save: merged, updatedAt: firebase.firestore.FieldValue.serverTimestamp(), v: VERSION };
```

No muevas el `if (markNext || ...) doc.sus = true;` ni el `tx.set`. Siguen igual, debajo.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tools/grant.test.js`

Expected: PASS, 6 pruebas. `G.Grant.applyGrant` aparece exactamente dos veces en `db.js`.

- [ ] **Step 5: Commit**

```powershell
git add dev.html js/core/db.js tools/grant.test.js
git commit -m "Debug: el regalo se suma al entrar y al subir la partida, después de fusionar"
```

---

### Task 5: Pantalla Debug en el menú principal

**Files:**
- Create: `js/ui/debug-ui.js`
- Modify: `dev.html` (botón del menú, sección `scr-debug`, script después de `mod-ui.js`)
- Modify: `js/ui/menu.js` (icono, clic, visibilidad)
- Modify: `js/ui/ui.js` (`SCREENS`)
- Modify: `js/game.js` (`G.DebugUI.init()` junto a `G.ModUI.init()`)
- Test: `tools/debug-view.test.js`

**Interfaces:**
- Consumes: `G.Ranking.isAdmin()`, `G.DB.fb.fs`, `G.UI.show`, `G.UI.toast`, `firebase.firestore.FieldValue.serverTimestamp`.
- Produces: `G.DebugUI.init()` y `G.DebugUI.open()`. `open` no muestra nada si no eres moderador. El botón `#menu-debug` nace con la clase `hidden`.

- [ ] **Step 1: Write the failing test**

Crear `tools/debug-view.test.js`:

```js
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
  assert.match(view, /1000/);
  assert.match(view, /collection\('grants'\)/);
  assert.match(view, /No hay ningún jugador con ese apodo/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tools/debug-view.test.js`

Expected: FAIL, no está `#menu-debug`.

- [ ] **Step 3: Write minimal implementation**

En `dev.html`, el último botón de `.menu-list` (Ajustes) gana un hermano:

```html
        <button class="menu-item hidden" id="menu-debug" data-go="debug">Debug<small>Monedas y tickets</small></button>
```

Después de la sección `scr-mod`, añadir:

```html
<!-- ====== Debug del moderador (sólo G.Config.admins, ver js/ui/debug-ui.js) ====== -->
<section id="scr-debug" class="scr dim hidden">
  <div class="box">
    <div class="row between"><h2>Debug</h2><button class="btn small ghost" data-back>Volver</button></div>
    <form id="dbg-form" class="row" style="gap:8px">
      <input id="dbg-nick" class="field" placeholder="Apodo" maxlength="16" autocomplete="off" spellcheck="false">
      <button class="btn small" type="submit">Buscar</button>
    </form>
    <p id="dbg-err" class="sub"></p>
    <div id="dbg-card" class="hidden"></div>
    <div class="row" style="gap:8px;margin-top:10px">
      <button id="dbg-coins" class="btn small" type="button" disabled>Dar 100.000 monedas</button>
      <button id="dbg-t10" class="btn small" type="button" disabled>Dar 1.000 tickets ×10</button>
    </div>
  </div>
</section>
```

Después de `<script defer src="js/ui/mod-ui.js"></script>`:

```html
<script defer src="js/ui/debug-ui.js"></script>
```

Crear `js/ui/debug-ui.js`:

```js
/* ============ debug-ui.js — regalos del moderador (pantalla oculta) ============
 * Sólo G.Ranking.isAdmin. Escribe grants/{uid}; el juego del jugador lo suma
 * al sincronizar (js/core/grant.js). Las reglas rechazan a cualquiera más.
 */
G.DebugUI = (() => {
  const $ = G.UI.$;
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const VALID = /^[A-Za-z0-9_ñÑáéíóúÁÉÍÓÚ]{3,16}$/;
  let picked = null;

  function store() { return G.DB.fb && G.DB.fb.fs; }

  function init() {
    $('dbg-form').onsubmit = e => { e.preventDefault(); search($('dbg-nick').value); };
    $('dbg-coins').onclick = () => give('coins');
    $('dbg-t10').onclick = () => give('t10');
  }

  function open() {
    if (!G.Ranking.isAdmin()) return;
    G.UI.show('scr-debug', true);
  }

  function clearCard() {
    picked = null;
    $('dbg-card').classList.add('hidden');
    $('dbg-card').innerHTML = '';
    $('dbg-coins').disabled = true;
    $('dbg-t10').disabled = true;
  }

  async function search(raw) {
    $('dbg-err').textContent = '';
    const name = (raw || '').trim();
    if (!VALID.test(name)) {
      $('dbg-err').textContent = 'El apodo debe tener 3-16 letras, números o _.';
      clearCard();
      return;
    }
    const db = store();
    if (!db) { $('dbg-err').textContent = 'Hace falta una cuenta en la nube.'; clearCard(); return; }
    try {
      const snap = await db.collection('names').doc(name.toLowerCase()).get();
      if (!snap.exists) {
        $('dbg-err').textContent = 'No hay ningún jugador con ese apodo.';
        clearCard();
        return;
      }
      await showPicked(snap.data().uid, name);
    } catch (e) {
      $('dbg-err').textContent = 'No se pudo buscar (' + (e.code || e.message) + ').';
      clearCard();
    }
  }

  async function showPicked(uid, fallback) {
    const db = store();
    const [prof, save, grant] = await Promise.all([
      db.collection('profiles').doc(uid).get(),
      db.collection('saves').doc(uid).get(),
      db.collection('grants').doc(uid).get()
    ]);
    const name = (prof.exists && prof.data().name) || fallback;
    const s = save.exists ? (save.data().save || {}) : null;
    const coins = s ? (s.coins || 0) : 0;
    const t10 = s && s.tickets ? (s.tickets.t10 || 0) : 0;
    const g = grant.exists ? grant.data() : { coins: 0, t10: 0 };
    const pendC = Math.max(0, (g.coins || 0) - ((s && s.grantedCoins) || 0));
    const pendT = Math.max(0, (g.t10 || 0) - ((s && s.grantedT10) || 0));
    picked = { uid: uid, name: name };
    const card = $('dbg-card');
    card.classList.remove('hidden');
    card.innerHTML = '<p><b translate="no">' + esc(name) + '</b></p>'
      + '<p class="sub" translate="no">' + coins.toLocaleString('es') + ' monedas · ' + t10.toLocaleString('es') + ' tickets ×10</p>'
      + '<p class="sub" translate="no">Pendiente: ' + pendC.toLocaleString('es') + ' monedas · ' + pendT.toLocaleString('es') + ' tickets ×10</p>'
      + (s ? '' : '<p class="sub">Aún no tiene partida.</p>');
    $('dbg-coins').disabled = false;
    $('dbg-t10').disabled = false;
    $('dbg-err').textContent = '';
  }

  async function give(field) {
    if (!G.Ranking.isAdmin() || !picked) return;
    const label = field === 'coins' ? '100.000 monedas' : '1.000 tickets ×10';
    if (!confirm('¿Dar ' + label + ' a ' + picked.name + '?')) return;
    const uid = picked.uid, name = picked.name;
    $('dbg-coins').disabled = true;
    $('dbg-t10').disabled = true;
    try {
      const ref = store().collection('grants').doc(uid);
      await store().runTransaction(async tx => {
        const snap = await tx.get(ref);
        const d = snap.exists ? snap.data() : { coins: 0, t10: 0 };
        tx.set(ref, {
          coins: (d.coins || 0) + (field === 'coins' ? 100000 : 0),
          t10: (d.t10 || 0) + (field === 't10' ? 1000 : 0),
          at: firebase.firestore.FieldValue.serverTimestamp()
        });
      });
      G.UI.toast('Anotado. Lo verá al sincronizar.');
      await showPicked(uid, name);
    } catch (e) {
      G.UI.toast('No se pudo: ' + (e.code || e.message));
      if (picked) { $('dbg-coins').disabled = false; $('dbg-t10').disabled = false; }
    }
  }

  return { init: init, open: open };
})();
```

En `js/ui/menu.js`, el mapa de iconos gana `debug: 'flag'`:

```js
    const ICON = { play: 'ball', dex: 'book', upgrades: 'up', gacha: 'ball4', goals: 'medal3', friends: 'friends', rank: 'trophy', settings: 'gear', debug: 'flag' };
```

En el `onclick` del menú, después del `else if` de `settings`:

```js
        else if (go === 'debug') G.DebugUI.open();
```

Dentro de `open()`, justo después de `G.UI.show('scr-menu');`:

```js
    $('menu-debug').classList.toggle('hidden', !G.Ranking.isAdmin());
```

En `js/ui/ui.js`, añadir `'scr-debug'` al array `SCREENS` (después de `'scr-mod'`).

En `js/game.js`, en la línea que llama a `G.ModUI.init()`, añadir `G.DebugUI.init();` a continuación.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tools/debug-view.test.js tools/grant.test.js tools/grants-rules.test.js`

Expected: PASS en los tres archivos.

- [ ] **Step 5: Commit**

```powershell
git add dev.html js/ui/debug-ui.js js/ui/menu.js js/ui/ui.js js/game.js tools/debug-view.test.js
git commit -m "Debug: pantalla del moderador para anotar monedas y tickets ×10"
```

---

### Task 6: Generar la versión publicada

**Files:**
- Modify: `index.html`, `js/app.min.js`, `version.json` (los escribe `tools/build.js`; no se editan a mano)
- Modify: lo que regenere `node tools/export_data.js` y `python tools/make_seo_pages.py` si el comando lo toca. No debe cambiar `firestore.rules` (los admins y los logros no cambian). Si `export_data.js` reescribe las reglas, revisar el diff y no dejar que borre `match /grants`.

**Interfaces:**
- Consumes: las tareas 1 a 5
- Produces: `index.html` y `js/app.min.js` contienen Debug y `grant.js`. `node tools/check_copy.js --built` imprime `ok`.

- [ ] **Step 1: Build**

Run: `node tools/build.js && node tools/export_data.js && python tools/make_seo_pages.py`

Expected: termina en 0. Si `firestore.rules` aparece en `git diff` y ha perdido `match /grants/{uid}`, restaurar ese match antes de seguir: `export_data.js` solo debe reescribir los bloques `<admins>` y `<logros>`.

- [ ] **Step 2: Comprobar la copia**

Run: `node tools/check_copy.js --built`

Expected: la salida es `ok`.

Run: `node --test tools/grant.test.js tools/grants-rules.test.js tools/debug-view.test.js`

Expected: PASS.

- [ ] **Step 3: Probar la pantalla en el navegador**

Abre `dev.html` en local (Apache de XAMPP). Sin ser moderador —sesión cerrada o una cuenta que no esté en `G.Config.admins`— el menú no muestra Debug. Con la cuenta moderadora, el botón sale bajo Ajustes; buscar un apodo que no existe escribe «No hay ningún jugador con ese apodo.» y los dos botones de dar siguen desactivados. No des un regalo a un jugador real salvo que el dueño lo pida en esa prueba.

- [ ] **Step 4: Commit**

```powershell
git add index.html js/app.min.js version.json
git commit -m "Debug: publicar la pantalla del moderador"
```

Si `export_data.js` o `make_seo_pages.py` dejaron otros archivos generados con cambios reales (no un borrado de las reglas), añádelos a este mismo commit. No incluyas `firestore.rules` si el diff solo reordena un bloque generado sin cambiar admins ni logros: descártalo con `git checkout -- firestore.rules` únicamente en ese caso, y vuelve a pasar `node --test tools/grants-rules.test.js`.
