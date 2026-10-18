# Desafío diario — diseño

Fecha: 2026-10-17 · Estado: listo para revisión del dueño

## Intención

Un modo nuevo junto al clásico: **una run al día**, con el **mismo Pokémon y la misma semilla
para todo el mundo** y una **tabla aparte**. Así se compara cómo le fue a cada jugador con las
mismas reglas, sin tocar el ranking normal. Además, el dueño quiere que el modo entre **a nivel de
arquitectura** (principios SOLID y DRY): nada de `if (daily)` repartidos por el código, sino un
concepto de "modo de juego" en el que el clásico y el diario sean dos implementaciones.

## Decisiones del dueño

1. En "Jugar" hay un selector **Clásico / Desafío diario**.
2. Cada día hay un **Pokémon del reto**, igual para todos. El jugador juega **con ese Pokémon en
   lugar de su compañero**. El resto de la partida es la normal.
3. **Las mejoras cuentan**: si el jugador tiene ese Pokémon y tiene mejoras, se aplican.
4. **La misma semilla para todos** (ver "Qué significa la semilla").
5. En el ranking hay una **sección nueva "Desafío diario"**. El ranking normal no cambia.
6. **Un único intento al día.**
7. Si la partida se corta (conexión, navegador cerrado, móvil reiniciado…), **el intento se
   pierde**.
8. Recompensas: **logros + tickets** con las cifras de "Recompensas" (aceptadas tal cual).
9. Arquitectura con SOLID y DRY (ver "Arquitectura").

## Decisiones de Claude (aceptadas sin objeción; el dueño puede cambiarlas)

- **Pokémon y semilla del día se calculan a partir de la fecha** en la hora del juego
  (`G.Config.tz` = `America/Bogota`, con `G.U.gameDate`, como `G.Ranking.periodIds`), con un hash determinista. No hay servidor que lo
  sortee, no gasta lecturas y no puede fallar a medianoche. "A nivel de servidor" = idéntico para
  todos.
- **Sale de toda la Pokédex** (`G.DEX`, sin contar los que no son jugables, si los hay), lo tenga o
  no el jugador. Si no lo tiene, juega sin las mejoras de ese Pokémon. Las mejoras generales de la
  tienda sí se aplican. Sin shiny (el reto es igual para todos; decisión de Claude).
- **Solo en solitario.** El cooperativo no ofrece el modo.
- **Solo con cuenta.** El intento único lo vigila Firestore. Los invitados ven el modo bloqueado
  con "Crea una cuenta para jugar el desafío".
- El intento **se gasta al empezar** la partida, no al acabarla (si no, cerrar la pestaña daría
  otro intento).
- La run cuenta para el **día en que empezó** (si empiezas a las 23:58, va a la tabla de ese día).
- Si la run dura menos de 2 min (`MIN_T`), no entra en la tabla, igual que en el ranking normal.
- La run del desafío **da lo mismo que una normal** (monedas, tickets recogidos, misiones,
  estadísticas), más las recompensas propias del desafío. **No sube al ranking normal** (tablas
  `s_...`) ni a los récords que se comparan entre jugadores. Las estadísticas personales
  (`save.stats`) sí se actualizan.
- **Récords personales:** la run del diario cuenta como cualquier otra para `save.stats`
  (`bestTime`, `bestLevel`), el perfil público (`G.Social.publishProfile`), los logros de tiempo
  (`time5`…) y el aviso de "récord". Es una run normal y solo hay una al día, así que no se puede
  abusar. Lo único que no hace es subir a las tablas `s_...`.
- **Cuándo cuenta como jugado:** al **empezar**, no al acabar. El contador de desafíos jugados y la
  racha (último día y longitud) se actualizan en el momento de gastar el intento, se guardan en el
  save y se suben a la nube enseguida. Así, una partida cortada no rompe la racha. Las de menos de
  2 min también cuentan como jugadas (aunque no entren en la tabla). Los logros `daily*` y
  `streak*` se comprueban en ese momento.
- **La tabla de ayer es definitiva a partir de la 01:30** (hora de Colombia). Antes de esa hora no
  se cobra el premio por puesto ni se conceden `dailyTop10`/`dailyWin` (las runs empezadas a las
  23:59 pueden seguir escribiendo hasta pasadas las 00:30). Si la moderación quita a alguien
  después de que otro haya cobrado, lo cobrado se queda como está.
- Con el desafío ya jugado hoy, el selector muestra tu resultado (tiempo, puesto si lo sabe) y una
  cuenta atrás hasta el siguiente.

## Qué significa la semilla

El juego hoy usa `Math.random` (directo o con `G.U.rand/randInt/pick/pickN`) en unos 20 archivos.
En el diario:

- **Se comparte:** el mapa (`G.World.reset(seed)` ya acepta semilla), la secuencia de oleadas y
  eventos, el tiempo, lo que sueltan los enemigos y las opciones al subir de nivel.
- **Un "dado" por sistema** (flujos de azar independientes): uno para las cartas de nivel, otro
  para los enemigos, otro para objetos y botín, otro para eventos y tiempo, etc.
- **Cartas de nivel (decisión del dueño, opción A):** el sorteo del nivel N es el mismo para todos
  (un sub-flujo derivado de la semilla, del nivel y del número de cambio de cartas). Las cartas
  solo coinciden si la lista de candidatas es la misma (misma build hasta ahí). `levelup.js` no
  cambia sus reglas ni el equilibrio. Se descartó un conjunto fijo de cartas por nivel.
- **No es una partida calcada:** en cuanto cada uno juega distinto, lo que depende del orden de
  las cosas diverge. Es lo esperado (igual que en los retos diarios de otros juegos). El dueño lo
  sabe y está de acuerdo.
- **Lo visual no usa la semilla:** partículas, sonido, cámara y la interfaz (`fx.js`, `vfx.js`,
  `audio.js`, `camera.js`, `ui/`) siguen con `Math.random`, para no gastar números de los flujos de
  la partida.
- **En clásico** la semilla es aleatoria cada vez: el comportamiento es el de ahora.
- **Cooperativo:** `server/sim.js` ya sustituye `Math.random` por uno con semilla dentro del `vm`
  de cada sala. Los flujos nuevos deben vivir en el contexto de cada sala (nada global del proceso)
  y el cooperativo debe seguir funcionando igual. Si cambia algo de la jugabilidad compartida, subir
  `VERSION` en `js/net/proto.js`.

## Recompensas

**Tickets por jugar** (al acabar la run del día, además de lo normal), tickets ×1, no
acumulativos:
- 5 min → 1 · 10 min → 2 · 20 min → 3 · final (minuto 30, Sentencia de Arceus) → 5

**Tickets por puesto** en la tabla del día, cobrados **al día siguiente**:
- top 1 → 2 tickets ×10 · top 2-3 → 1 ticket ×10 · top 4-10 → 5 tickets ×1
- Plan Spark: sin funciones en la nube, así que nadie reparte a medianoche. Al abrir el juego (o
  el menú), si el jugador jugó ayer y no ha cobrado, se lee el resumen de la tabla de ayer
  (`lbs/{tabla}`, 1 lectura, o 0 si está en caché), se mira su puesto y se le da el premio **una
  sola vez**. Un documento en Firestore apunta el último día cobrado y las reglas impiden cobrar dos
  veces el mismo día. Solo se cobra el día inmediatamente anterior (si no entraste ayer, ese premio
  se pierde: decisión de Claude, más simple y barata).
- Los tickets pasan por la libreta de monedas y tickets de `db.js` (como el resto), con aviso al
  jugador.

**Logros** (categoría nueva "Desafío diario" en `js/data/achievements.js`):

| id (orientativo) | medalla | condición | premio | título |
|---|---|---|---|---|
| daily1 | bronce | jugar 1 desafío | 2 tickets ×1 | — |
| daily7 | plata | jugar 7 desafíos | según el patrón de premios del archivo | — |
| daily30 | oro | jugar 30 desafíos | ídem | Retador diario |
| streak7 | plata | 7 días seguidos | ídem | — |
| streak30 | oro | 30 días seguidos | ídem | (título a elegir por el builder, en la línea del archivo) |
| dailyTop10 | plata | entrar en el top 10 de un día | ídem | — |
| dailyWin | oro | ganar un día (top 1) | ídem | Campeón del día |

Los premios de plata y oro que no se han fijado siguen la escala del resto de logros del mismo
nivel. Se necesitan contadores nuevos en el save (desafíos jugados, racha actual y su último día,
mejor puesto). Los de top 10 y top 1 se conceden al cobrar el premio del día siguiente.

## Ranking

- Tablas nuevas con prefijo propio (orientativo: `x_d20261017`), solo del día. Sin semanal,
  mensual ni histórico.
- **Reutiliza** `ranking.js`: resumen top 50, caché, umbrales, `store`, lectura del puesto. Nada de
  copiarlo. Lo que cambie entre modos (prefijo, periodos, si sube a la tabla por Pokémon) lo
  decide el modo de juego, no un `if` dentro del ranking.
- `firestore.rules`: hoy `validEntry` y `addMine` exigen `board.matches('s_.*')`. Hay que admitir
  las tablas del diario con las mismas validaciones (tiempo real desde `runs/{uid}`, nivel,
  derrotados, baneo) y además: la entrada del diario solo si existe el intento del día del jugador
  y su día coincide con el de la tabla. Ojo: `export_data.js` reescribe `firestore.rules` (los
  cambios deben ir en lo que genera ese script, o sobrevivir a él), y hay que desplegar con
  `firebase deploy --only firestore`. Las reglas tienen tests (`npm test --prefix tools/rules`):
  añadir casos.
- `ranking-ui.js`: sección/pestaña "Desafío diario", con el Pokémon del día arriba, la tabla de
  hoy y la opción de ver la de ayer (con su ganador).
- Para cobrar ayer hay que conservar la tabla del día anterior: ojo con `saveBests`/`noteTop`,
  que borran lo que no es del periodo actual.
- La moderación actual (quitar filas, reportes) debe funcionar igual en estas tablas.

## Intento único (Firestore)

- Documento por jugador (orientativo: `daily/{uid}` con `{ d: 'YYYYMMDD', startedAt, claimed }`).
- Al empezar el desafío se escribe el día. Las reglas solo dejan **avanzar** el día (nunca repetir
  ni retroceder) y exigen que esté cerca de `request.time` (±1 día, por la zona horaria; los
  detalles los decide el builder).
- Si la escritura falla (sin conexión), **no se empieza la partida**: se avisa al jugador y el
  intento no se ha gastado.
- El cobro del premio por puesto usa el mismo documento (`claimed` = último día cobrado) o uno
  aparte, a criterio del builder.
- Antitrampas: el mismo nivel que el ranking normal (`clean()` en `game.js` + reglas). Las reglas
  no pueden recalcular el hash del Pokémon del día, así que el `dex` de la entrada se confía al
  cliente como hoy. Si se quiere comprobar, que lo haga la propia regla de alguna forma barata;
  si no se puede, se deja así.

## Arquitectura (SOLID / DRY)

- **Modo de juego como estrategia.** Una interfaz común (orientativo: `G.Modes`, con
  `G.Modes.classic` y `G.Modes.daily`) que responde a lo que hoy `game.js` decide por su cuenta:
  - qué Pokémon y qué shiny se usan (`save.partner` en clásico; el del día en diario)
  - qué semilla y qué flujos de azar
  - si se puede empezar ahora y por qué no (invitado, ya jugado hoy, sin conexión)
  - qué hacer al empezar (clásico: `G.Ranking.runStarted('s')`; diario: además gastar el intento)
  - qué hacer al acabar: a qué tablas sube la marca y qué recompensas extra da
  - qué texto y qué estado enseña el selector de "Jugar"
- `game.js` (`startRun`, `endRun`) **pide esas cosas al modo actual** en vez de preguntar "¿es
  diario?". Un modo nuevo en el futuro es otra implementación, sin tocar el bucle (abierto/
  cerrado). El cooperativo se puede quedar como está: no hay que reescribirlo como modo en esta
  tarea, siempre que no se rompa (decisión de Claude, para acotar el cambio).
- **Azar en un único módulo** (orientativo: `G.RNG` en `js/core/`): generador con semilla
  (p. ej. mulberry32 o sfc32), flujos con nombre derivados de la semilla de la run, y `reseed(seed)`
  al empezar cada partida. `G.U.rand/randInt/pick/pickN` aceptan un flujo (o usan uno por defecto)
  y los sistemas de la partida dejan de llamar a `Math.random` directamente.
- **Pokémon y semilla del día** en una función pura y testeable (fecha → `{ day, dex, seed }`),
  que reutiliza `G.U.gameDate` / `G.U.gameDay` / `G.U.msUntilReset` (js/core/util.js), sin
  duplicar el cálculo de fecha.
- **Separación lógica / dibujo:** todo lo nuevo de lógica debe funcionar sin navegador (lo exige
  `server/test/sim.test.js`). Nada de `document`, `Image` ni `location` fuera de la parte de dibujo
  y de la interfaz.

## Interfaz

- Selector Clásico / Desafío diario en "Jugar" (`js/ui/menu.js`, `dev.html`). El clásico es el de
  siempre (el compañero en el escenario).
- Diario: el Pokémon del día en el escenario, su nombre y tipos, si tienes mejoras para él, la
  cuenta atrás hasta el siguiente y el botón de empezar. Hay que dejar claro que **solo hay un
  intento** y que **si se corta, se pierde** (una confirmación antes de empezar).
- Estados: invitado (bloqueado, con el motivo), sin conexión (bloqueado), ya jugado (tu resultado y
  la cuenta atrás), premio de ayer pendiente (aviso al cobrarlo).
- Durante la partida: algo discreto en el HUD que indique que es el desafío diario.
- Pantalla final: marca del desafío, tickets del desafío y enlace a la tabla.
- Todo texto nuevo en español y en inglés (`js/data/lang-en.js`), como el resto.

## Obligaciones del proyecto (CLAUDE.md)

- Editar `dev.html`, nunca `index.html`.
- `node tools/build.js && node tools/export_data.js && python tools/make_seo_pages.py`,
  `node tools/check_copy.js --built` en `ok`, `node --test server/test/sim.test.js`,
  `npm test --prefix server` y `npm test --prefix tools/rules`.
- Entrada en `js/data/changelog.js` (español e inglés, en `new` de la fecha del día en que se
  publique).
- No quitar `updater.js` ni la escritura de `version.json`. Un jugador en mitad del desafío no se
  recarga (ya lo garantiza el updater).
- Commit sin firma de IA. El push solo cuando lo pida el dueño.

## Pruebas mínimas

- Misma semilla y misma build → mismas cartas en el nivel N; mismo mapa (test sin navegador).
- Clásico: el mismo comportamiento que antes (los tests actuales siguen pasando).
- Fecha → Pokémon del día: estable, igual en cualquier zona horaria del cliente, y cambia a
  medianoche de Colombia.
- Reglas: no se puede repetir el día, no se puede cobrar dos veces, no se puede escribir en la
  tabla del diario sin intento de ese día.

## Fuera de alcance

- Desafío en cooperativo.
- Tablas semanales o mensuales del desafío.
- Repetir o retomar el intento.
- Que las partidas sean idénticas paso a paso.

## A criterio del builder

Nombres concretos de módulos, colecciones y tablas; el generador de números; el reparto exacto de
flujos por sistema; qué llamadas a `Math.random` son de lógica y cuáles visuales (con la regla de
arriba); el diseño visual del selector, en la línea de la interfaz actual; los premios de plata y
oro no fijados, según la escala existente.
