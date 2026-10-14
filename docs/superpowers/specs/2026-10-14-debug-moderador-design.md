# Vista Debug del moderador — diseño

Fecha: 14-10-2026 · Estado: aprobado.

## 1. Objetivo

Una pantalla **Debug**, visible solo para los moderadores de `G.Config.admins`, con dos
acciones:

- **Dar monedas:** buscar un jugador por apodo y anotar **+100.000** monedas.
- **Dar tickets:** buscar un jugador por apodo y anotar **+1.000** tickets ×10 (los morados).

El botón está en el **menú principal**, debajo de Ajustes. Quien no es moderador no lo ve.
Abrir la pantalla sin serlo no hace nada. Quien no es moderador no puede escribir el regalo:
lo impiden las reglas de Firestore, no solo el botón.

El regalo no se escribe dentro de `saves/{uid}`. Se anota en una libreta (`grants/{uid}`) y el
juego de ese jugador lo suma al sincronizar. Así no se pierde si la copia local es más nueva,
no se duplica en otro aparato y no marca la cuenta como trampa.

**Fuera de alcance:** cantidades editables, tickets ×1 (los amarillos), borrar regalos, un
historial de quién dio qué, y una entrada en `js/data/changelog.js` (no es un cambio de juego).

## 2. Pantalla

### 2.1 Menú

En `dev.html`, al final de `.menu-list`, un botón oculto de inicio:

```html
<button class="menu-item hidden" id="menu-debug" data-go="debug">Debug<small>Monedas y tickets</small></button>
```

`G.MenuUI.open` hace `$('menu-debug').classList.toggle('hidden', !G.Ranking.isAdmin())`.
El icono es `flag` (ya existe en `js/ui/icons.js`). El clic llama a `G.DebugUI.open()`.

`G.UI` incluye `scr-debug` en `SCREENS`. Si no está, `show()` no la enseña ni la tapa al salir.

### 2.2 Pantalla `scr-debug`

Misma caja que Moderación (`section.scr.dim`, `div.box`). Título **Debug** y botón Volver,
que regresa al menú.

- Campo de apodo y botón **Buscar**.
- Ficha del jugador elegido: apodo, monedas, tickets ×10 y lo pendiente de la libreta.
  El apodo va con `translate="no"`.
- **Dar 100.000 monedas** y **Dar 1.000 tickets ×10**. Desactivados hasta que hay un jugador.
  Cada uno pide `confirm` con el apodo. Mientras la escritura va en curso, los dos botones
  se desactivan.

Textos en español, como la pantalla de Moderación. No se añaden cadenas a `lang-en.js`.

`G.DebugUI.open()` sale al momento si `!G.Ranking.isAdmin()`.

## 3. Buscador

El apodo es único y vive en `names/{minúsculas}` → `{ uid }`. Cualquier sesión iniciada puede
leerlo.

1. Recortar y pasar a minúsculas. Si no cumple `^[A-Za-z0-9_ñÑáéíóúÁÉÍÓÚ]{3,16}$`, avisar y no consultar.
2. Leer `names/{lower}`. Si no existe: «No hay ningún jugador con ese apodo.» y limpiar la ficha.
3. Si existe, leer en paralelo `profiles/{uid}`, `saves/{uid}` y `grants/{uid}`.
   - Sin perfil: mostrar el apodo buscado.
   - Sin partida: «Aún no tiene partida.» Las monedas y los tickets se enseñan como 0.
     El regalo se puede anotar igual.
   - Pendiente = `max(0, grants.coins − save.grantedCoins)` y lo mismo con `t10` /
     `grantedT10`. Sin libreta, pendiente 0.

Tras un regalo con éxito se vuelve a leer la ficha.

## 4. Libreta

Un documento por jugador, `grants/{uid}`:

| Campo | Tipo | Significado |
|---|---|---|
| `coins` | int ≥ 0 | Total de monedas regaladas alguna vez |
| `t10` | int ≥ 0 | Total de tickets ×10 regalados alguna vez |
| `at` | timestamp | Hora del servidor en el último regalo |

No se borra. Cada acción suma **una** cantidad fija y deja la otra igual:

- Monedas: `coins` pasa a `anterior + 100000` (0 si el documento no existe) y `t10` no cambia.
- Tickets: `t10` pasa a `anterior + 1000` y `coins` no cambia.

La partida guarda lo ya sumado, dentro de `save`:

| Campo | Significado |
|---|---|
| `grantedCoins` | Monedas de la libreta ya metidas en `save.coins` |
| `grantedT10` | Tickets ×10 de la libreta ya metidos en `save.tickets.t10` |

`newSave` los crea a 0. `migrate` rellena los que falten, sin subir `VERSION`. `sanitize` los
deja en enteros ≥ 0, igual que las monedas. No se tocan `stats.coinsEarned` ni `stats.pulls`.

`merge()` no los trata aparte: se queda con los de la copia más nueva, como con las monedas.
La suma del regalo ocurre **después** de fusionar.

### 4.1 Aplicar

```
dc = max(0, libreta.coins − save.grantedCoins)
dt = max(0, libreta.t10 − save.grantedT10)
save.coins += dc
save.tickets.t10 += dt
save.grantedCoins += dc
save.grantedT10 += dt
```

Si `grantedCoins` local ya es mayor que la libreta, no se baja ni se suman monedas (un cliente
manipulado no puede usar eso para inflar el presupuesto). Lo mismo con `grantedT10`.

Dónde se aplica, solo en modo nube y no invitado:

- `openCloud`, después de fusionar la copia local y la remota. Si `dc` o `dt` es mayor que 0,
  se sube con `pushNow`. Si la lectura de la libreta falla (sin red), se entra igual; se
  aplicará en la siguiente subida que sí la lea.
- `pushNow`, dentro de la transacción, después de `merge` y antes de `tx.set`: se lee
  `grants/{uid}` y se aplica sobre la partida fusionada.

Es idempotente. Dos aparatos, o una copia sin conexión más nueva, reciben el regalo una vez.
Gastar monedas después no se deshace, porque el gasto vive en la copia más nueva y el delta
de la libreta ya es 0.

El jugador lo ve al entrar, o en el siguiente guardado si ya estaba dentro. No hay escucha en
vivo del documento.

## 5. Reglas de Firestore

El `match /grants/{uid}` va antes del cierre `match /{document=**}`. No se mete entre las
marcas `<admins>` ni `<logros>` (las reescribe `tools/make_rules.js`).

Lectura: el moderador, o el dueño (`me() == uid`). Nadie más.

Escritura: solo `admin()`, y solo con esta forma.

- Claves exactas: `coins`, `t10`, `at`. Las dos cantidades son `int` ≥ 0. `at == request.time`.
- Crear: o bien `coins == 100000` y `t10 == 0`, o bien `coins == 0` y `t10 == 1000`.
- Actualizar: o bien `coins == resource.data.coins + 100000` y `t10` igual, o bien
  `t10 == resource.data.t10 + 1000` y `coins` igual.
- Borrar: no.

En `saves/{uid}`, el presupuesto descuenta el regalo **solo de la misma cosa** que aumenta.
Si no, 1.000 tickets ×10 valdrían 10.000 tiradas libres para Pokémon o monedas.

El lenguaje de reglas no tiene `min` ni `max`: se usan los auxiliares `mx` (ya existe) y
`mn(a, b) = a < b ? a : b`. `possibleSave` lee la libreta **una vez por campo** y pasa los
créditos a `budget`. `budget` no llama a `get()`: cada `get()` cuenta, y el tope es 10 por
escritura. Hoy el guardado del dueño no lee otros documentos, así que dos `exists` y dos
`get` caben.

```
extraCoins = n.grantedCoins − o.grantedCoins          // 0 si faltan
extraT10   = n.grantedT10 − o.grantedT10
coinCredit = mn(mx(0, n.coins − o.coins), mx(0, extraCoins))
t10Credit  = mn(mx(0, n.tickets.t10 − o.tickets.t10), mx(0, extraT10))
```

- En el lado de las monedas se resta `coinCredit` antes de dividir entre 300.
- En el lado de los tickets se suma `10 * t10Credit`, que anula justo los tickets regalados
  y no deja presupuesto de más.

Además, en `possibleSave`:

- `grantedCoins` y `grantedT10`, si vienen, son `int` ≥ 0.
- Ninguno baja respecto al documento anterior.
- Ninguno pasa de la libreta (`0` si `grants/{uid}` no existe). `exists()` antes de `get()`:
  un `get()` de un documento que no está falla la regla entera. El `uid` es el del path
  `saves/{uid}`. Las funciones no ven ese comodín: `possibleSave` y `freshSave` lo reciben
  como argumento y se lo pasan a la lectura de la libreta.

`freshSave` (partida nueva) admite el regalo ya aplicado:

- `coins <= 2000 + grantedCoins`
- `tickets.t10 <= 2 + grantedT10`
- los dos `granted*` ≥ 0 y ≤ la libreta

Un cliente viejo, que no envía esos campos, sigue guardando como hasta ahora. Recibe el
regalo cuando actualice. `saneSave` acepta la partida con o sin esos campos; si están, son
`int` ≥ 0.

Estas reglas hay que desplegarlas con `firebase deploy --only firestore` (nunca `firebase
deploy` a secas). Sin eso, el botón responde permiso denegado. No se hace `git push` ni se
redespliega el sitio hasta que el dueño lo pida.

## 6. Archivos

| Archivo | Cambio |
|---|---|
| `dev.html` | Botón del menú y sección `scr-debug`. El `index.html` sale del build, no se edita a mano. |
| `js/ui/debug-ui.js` | Pantalla, búsqueda y escritura de la libreta. Su `<script>` va en `dev.html`, al lado del de `mod-ui.js`, para que el build lo meta en `app.min.js`. |
| `js/ui/menu.js` | Mostrar el botón y abrirlo. |
| `js/ui/ui.js` | Añadir `scr-debug` a `SCREENS`. |
| `js/core/db.js` | Campos en `newSave`, `sanitize`, aplicar en `openCloud` y en la transacción de `pushNow`. |
| `firestore.rules` | `match /grants/{uid}` y el hueco del presupuesto en `budget`, `possibleSave` y `freshSave`. |

## 7. Errores

| Caso | Qué se hace |
|---|---|
| Apodo inválido o inexistente | Texto bajo el campo. No se escribe. |
| Sin conexión o `permission-denied` | Aviso con el código. La libreta queda como estaba. |
| La libreta no se puede leer al entrar | Se entra igual. Se aplica en la próxima subida. |
| Doble clic | Botones desactivados hasta que la escritura termina. |

## 8. Pruebas

- Una cuenta que no está en `admins` no ve el botón. `DebugUI.open()` no muestra la pantalla.
- Un moderador lo ve en el menú principal y no en ningún otro sitio.
- Un apodo que no existe no deja pulsar los botones de dar.
- Un apodo real muestra monedas, tickets ×10 y pendiente.
- La primera moneda crea `grants/{uid}` con `coins == 100000` y `t10 == 0`. La segunda deja
  `coins == 200000`.
- Un ticket deja `t10 == 1000` y no toca `coins`.
- Al sincronizar, `coins` y `tickets.t10` suben exactamente el delta, y `granted*` queda igual
  que la libreta. Una segunda sincronización no suma otra vez.
- Una copia local más nueva, con monedas ya gastadas y `granted*` por detrás, conserva el gasto
  y suma solo lo pendiente.
- Un guardado normal, sin regalo nuevo, sigue cabiendo en `budget()`.
- Subir +100.000 monedas o +1.000 tickets ×10 sin avanzar `granted*` lo rechaza la regla.
- Avanzar `granted*` por encima de la libreta lo rechaza la regla.
- Un no-moderador no puede crear ni actualizar `grants/{uid}`.
