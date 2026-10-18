# Desafío diario — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un modo "Desafío diario" junto al clásico: una run al día con el Pokémon y la semilla del día (iguales para todos), tabla propia, intento único vigilado por Firestore, tickets y logros.

**Architecture:** Tres piezas nuevas con una responsabilidad cada una: `G.RNG` (azar con semilla y flujos con nombre), `G.Daily` (cálculos puros del día: Pokémon, semilla, premios, racha) y `G.Modes` (estrategia de modo de juego: `classic` y `daily`, a la que `game.js` pide héroe, semilla, inicio, fin y tablas). La red del diario (intento y cobro) va en `G.DailyNet`. El ranking se generaliza para recibir del modo las tablas a las que sube.

**Tech Stack:** JS sin frameworks (scripts `defer` en `dev.html`, empaquetados por `tools/build.js`), Firestore compat, Node 24 (`node --test`), emulador de Firestore para las reglas.

**Spec:** `docs/superpowers/specs/2026-10-17-desafio-diario-design.md` (léelo entero antes de empezar).

## Global Constraints

- Se edita `dev.html`, nunca `index.html`. Los scripts nuevos se añaden entre `<!-- scripts:begin -->` y `<!-- scripts:end -->` (la misma lista la usan `tools/build.js` y `server/sim.js`).
- Hora del juego: `G.Config.tz` (`America/Bogota`) con `G.U.gameDate` / `G.U.gameDay` / `G.U.msUntilReset` (js/core/util.js). Nunca otra zona ni la hora del navegador.
- Lógica sin pantalla: nada de `document`, `Image`, `location` ni temporizadores en `js/core/rng.js`, `js/systems/daily.js` ni en la lógica de partida (lo exige `server/test/sim.test.js`).
- Todo texto visible nuevo, en español en el código y su traducción en `js/data/lang-en.js`.
- Comentarios y nombres en español, con la densidad y el tono del archivo que se toca.
- Al final: `node tools/build.js && node tools/export_data.js && python tools/make_seo_pages.py`, `node tools/check_copy.js --built` → `ok`, `node --test server/test/sim.test.js`, `npm test --prefix server` y `npm test --prefix tools/rules` (emulador, Java 21+).
- Commits sin "Co-Authored-By" ni firma de IA. Sin push (lo hace el dueño).
- Recompensas exactas: por jugar 5 min → 1 · 10 → 2 · 20 → 3 · final (minuto 30) → 5 tickets ×1 (no acumulativos). Por puesto de ayer: top 1 → 2 ×10 · top 2-3 → 1 ×10 · top 4-10 → 5 ×1. Cobro a partir de la 01:30 hora del juego, solo del día anterior.
- Tablas del diario: prefijo `x_`, una por día (`x_d20261018`). Mínimo para entrar: `MIN_T` (120 s), como el resto.

## Review Focus

1. **Doble pestaña / doble aparato el mismo día:** dos navegadores pulsan "Empezar" a la vez. Se espera que solo uno empiece; el otro ve "Ya has jugado hoy". → test de reglas en la Tarea 6 (`daily/{uid}` no deja escribir el mismo día dos veces).
2. **Empezar a las 23:59 y acabar a las 00:20:** la marca va a la tabla del día en que empezó, no a la del siguiente. → test en la Tarea 5 (`dailyBoards(day)` usa el día guardado al empezar, no la fecha al acabar).
3. **Sin conexión al pulsar "Empezar":** no empieza y no gasta el intento. → test en la Tarea 4 (`G.Modes.daily.begin` rechaza si `G.DailyNet.start` falla y `startRun` no se llama).
4. **Clásico intacto:** el modo clásico sigue subiendo a `s_...` y a la tabla por Pokémon igual que antes, con el compañero y su shiny. → test en la Tarea 4 (`classic.boards(dex)` = las 5 tablas de antes).
5. **Cobrar dos veces el premio de ayer** (recargar, dos aparatos). → test de reglas en la Tarea 6 y de lógica en la Tarea 7 (`claimed` ya igual a ayer → no da nada).

---

### Task 1: `G.RNG` — azar con semilla y flujos con nombre

**Files:**
- Create: `js/core/rng.js`
- Modify: `js/core/util.js` (`rand`, `randInt`, `pick`, `pickN` pasan a ser los de `G.RNG.wrap(Math.random)`), `dev.html` (script tras `util.js`)
- Test: `server/test/rng.test.js`

**Interfaces:**
- Produces:
  - `G.RNG.reseed(seed: number): void` — fija la semilla de la run (uint32) y descarta los flujos creados.
  - `G.RNG.seed: number` — la semilla actual (getter).
  - `G.RNG.stream(name: string): Rand` — flujo con nombre, el mismo objeto hasta el próximo `reseed`. Su semilla es `hash(seed, name)`.
  - `G.RNG.fork(name: string, ...keys: (string|number)[]): Rand` — flujo nuevo cada vez, determinado por `(seed, name, keys)`.
  - `G.RNG.wrap(next: () => number): Rand`
  - `Rand = { next(): number /* [0,1) */, rand(a, b), randInt(a, b), pick(arr), pickN(arr, n), chance(p): boolean }`
- Al cargar: `reseed((Math.random() * 2 ** 32) >>> 0)`. En el servidor `Math.random` ya lleva semilla (server/sim.js), así que sigue siendo determinista.

- [ ] **Step 1: Write the failing test** (`server/test/rng.test.js`, usa `createSim`)
  - `misma semilla, mismos números`: dos sims, `reseed(42)`, 20 `stream('a').next()` iguales.
  - `flujos independientes`: con `reseed(42)`, gastar 100 de `stream('b')` no cambia los 20 primeros de `stream('a')`.
  - `fork determinista`: `fork('levelup', 5, 1).next()` igual tras `reseed(42)` en dos sims; distinto de `fork('levelup', 5, 2).next()`.
  - `reseed reinicia`: la secuencia de `stream('a')` tras `reseed(42)` se repite tras otro `reseed(42)`.
  - `G.U sigue funcionando`: `G.U.pickN([1,2,3,4], 2)` devuelve 2 elementos distintos de la lista.
- [ ] **Step 2:** `node --test server/test/rng.test.js` → FAIL (`G.RNG` no existe).
- [ ] **Step 3: Implement** `js/core/rng.js`: mulberry32 (como `rng()` de `server/sim.js`), semilla de cada flujo con un hash de 32 bits (FNV-1a de `name` y `keys` mezclado con la semilla). `G.U.rand/randInt/pick/pickN` se definen a partir de `G.RNG.wrap(Math.random)` (una sola implementación de esas cuatro funciones). Añadir el script a `dev.html`.
- [ ] **Step 4:** `node --test server/test/rng.test.js server/test/sim.test.js` → PASS.
- [ ] **Step 5: Commit** `feat: azar con semilla y flujos (G.RNG)`

### Task 2: la partida usa los flujos

**Files:**
- Modify (solo las llamadas de lógica): `js/entities/enemy.js`, `js/systems/combat.js`, `js/systems/events.js`, `js/systems/spawner.js`, `js/world/world.js`, `js/systems/judgment.js`, `js/entities/pickup.js`, `js/systems/weather.js`, `js/systems/rift.js`, `js/systems/levelup.js`, `js/systems/interact.js`, `js/systems/hazards.js` si tiene, `js/data/enemies.js`, `js/data/items.js`, `js/data/starters.js`, `js/entities/player.js`, `js/game.js`
- Modify: `js/game.js:startRun` y `server/room.js` (cerca de `G.World.reset(seed | 0 || 1)`, línea ~257) y `server/test/solo.js` → llaman a `G.RNG.reseed(seed)` antes de los `reset`
- Modify: `js/net/proto.js` → subir `VERSION` (cambia la lógica compartida)
- Test: `server/test/rng.test.js` (añadir)

**Interfaces:**
- Consumes: `G.RNG.stream`, `G.RNG.fork` (Tarea 1).
- Produces:
  - Nombres de flujo fijos: `'world'`, `'spawn'`, `'enemy'`, `'combat'`, `'loot'` (pickup e items), `'events'`, `'weather'`, `'rift'`, `'judgment'`, `'run'` (game.js, player, interact, starters).
  - `G.LevelUp.offer(pl, n = 3)` saca su azar de `G.RNG.fork('levelup', pl.level, k)`, con `k` = cuántas ofertas lleva `pl` en ese nivel (contador `pl.offerSeq`, objeto nuevo en cada `G.Player`). `candidates(pl, R)` recibe ese mismo `Rand`.
  - `startRun(...)` recibe la semilla del modo (Tarea 4). Hasta entonces: clásico `reseed` con semilla aleatoria y `G.World.reset` con esa misma semilla.

**Regla de clasificación** (para cada `Math.random` / `G.U.rand|randInt|pick|pickN`): si el valor cambia el estado de la partida (posiciones, vida, daño, críticos, apariciones, botín, tiempos, cartas, eventos), pasa al flujo de su archivo (`const R = G.RNG.stream('spawn')` dentro de la función que lo usa, no al cargar el módulo, para que `reseed` lo renueve). Si solo alimenta `G.FX`, `G.VFX`, `G.Audio`, `G.Camera` o partículas, se queda como está. En caso de duda, a flujo.

- [ ] **Step 1: Write the failing tests** (añadir a `server/test/rng.test.js`)
  - `cartas iguales con la misma semilla y la misma build`: dos sims con `soloRun(sim, { dex: 4 })`, `G.RNG.reseed(99)`, `pl.level = 5`, `G.LevelUp.offer(pl).map(c => c.key)` iguales.
  - `las cartas no dependen de los enemigos`: igual que el anterior, pero en uno se gastan 500 números de `G.RNG.stream('enemy')` antes. Las claves siguen siendo iguales.
  - `segunda oferta del mismo nivel distinta y repetible`: la 2.ª llamada a `offer` en el nivel 5 coincide entre sims.
- [ ] **Step 2:** `node --test server/test/rng.test.js` → FAIL.
- [ ] **Step 3: Implement** la migración archivo por archivo con la regla de arriba, `pl.offerSeq` en `G.Player`, el `reseed` en `startRun`, `room.js` y `solo.js`, y subir `VERSION` en `proto.js`.
- [ ] **Step 4:** `node --test server/test/rng.test.js server/test/sim.test.js && npm test --prefix server` → PASS (incluido "misma semilla, misma partida").
- [ ] **Step 5:** `grep -n "Math.random" js/systems js/entities js/world js/data js/game.js`: cada uno que quede debe ser visual. Anotarlo en el commit.
- [ ] **Step 6: Commit** `feat: la partida saca el azar de flujos con semilla`

### Task 3: `G.Daily` — cálculos puros del día

**Files:**
- Create: `js/systems/daily.js` (script en `dev.html`, tras `levelup.js`)
- Test: `server/test/daily.test.js`

**Interfaces:**
- Consumes: `G.U.gameDate` y `G.U.hash` (util.js), `G.DEX` / `G.DEX_BY`.
- Produces:
  - `G.Daily.dayId(date = new Date()): string` → `'20261018'` (hora del juego).
  - `G.Daily.prevDay(day: string): string` → `'20261017'`.
  - `G.Daily.today(date = new Date()): { day: string, dex: number, seed: number }`. `dex` sale de `G.DEX` (todos los que se pueden elegir de compañero, el mismo filtro que la Pokédex del menú), con `G.U.hash` sobre el día. `seed` = otro `G.U.hash` del día (uint32 ≠ 0).
  - `G.Daily.playTickets(t: number): number` → 0 / 1 / 2 / 3 / 5 por los cortes 300 / 600 / 1200 / fin. "Fin" = `t >=` el segundo en que acaba la Sentencia de Arceus (la constante que ya use `G.Judgment`; si no existe, `1800`).
  - `G.Daily.placePrize(rank: number): { t1: number, t10: number }` → 1: `{t1:0,t10:2}` · 2-3: `{t1:0,t10:1}` · 4-10: `{t1:5,t10:0}` · resto: `{t1:0,t10:0}`.
  - `G.Daily.claimOpen(date = new Date()): boolean` → `true` desde las 01:30 hora del juego.
  - `G.Daily.nextStreak(d: { last?: string, streak?: number }, day: string): number` → `streak + 1` si `last === prevDay(day)`, la misma si `last === day`, si no `1`.

- [ ] **Step 1: Write the failing tests** (`server/test/daily.test.js`, con `createSim`)
  - `dayId en hora de Colombia`: `dayId(new Date('2026-10-19T04:59:00Z')) === '20261018'` y `'2026-10-19T05:00:00Z'` → `'20261019'`.
  - `today estable`: mismo resultado dos veces y en dos sims; `G.DEX_BY[today(d).dex]` existe; 30 días seguidos dan al menos 20 Pokémon distintos.
  - `prevDay cambia de mes y de año`: `'20261101'` → `'20261031'`, `'20270101'` → `'20261231'`.
  - `playTickets`: 299→0, 300→1, 600→2, 1200→3, fin→5.
  - `placePrize`: 1, 2, 3, 4, 10, 11 con los valores de arriba.
  - `claimOpen`: 06:29 UTC → false, 06:30 UTC → true (01:29 / 01:30 en Colombia).
  - `nextStreak`: `{}`→1; `{last:'20261017',streak:4}` en `'20261018'`→5; mismo día→4; hueco→1.
- [ ] **Step 2:** `node --test server/test/daily.test.js` → FAIL.
- [ ] **Step 3: Implement** `js/systems/daily.js`.
- [ ] **Step 4:** `node --test server/test/daily.test.js server/test/sim.test.js` → PASS.
- [ ] **Step 5: Commit** `feat: cálculos del desafío diario (G.Daily)`

### Task 4: `G.Modes` — el modo de juego como estrategia

**Files:**
- Create: `js/modes/modes.js` (registro + `classic`), `js/modes/daily-mode.js` (`daily`); scripts en `dev.html` tras `js/net/*` y antes de `js/game.js`
- Modify: `server/sim.js` → añadir `js\/modes\/` a `SKIP` (los modos son flujo de pantallas, no simulación)
- Modify: `js/game.js` (`startRun`, `endRun`, `G.Flow.play`)
- Test: `server/test/modes.test.js` (carga `js/core/util.js`, `js/core/rng.js`, `js/systems/daily.js` y `js/modes/*.js` en un `vm` con `G.DB`, `G.Ranking`, `G.DailyNet` y `G.Upgrades` falsos)

**Interfaces:**
- Consumes: `G.Daily.today`, `G.DailyNet.start(day)` (Tarea 6; en esta tarea, un falso del test), `G.Ranking.soloBoards(dex)` / `G.Ranking.dailyBoards(day)` (Tarea 5; en esta tarea, falsos del test).
- Produces (`Mode`):
  - `id: 'classic' | 'daily'`
  - `hero(save): { mon, shiny: boolean }` — clásico: `save.partner` y `save.partnerShiny && G.DB.ownsShiny(...)`. Diario: `G.DEX_BY[G.Daily.today().dex]`, `shiny: false`.
  - `seed(): number` — clásico: aleatoria. Diario: la de `today()` (la guardada en `begin`).
  - `availability(): Promise<{ ok: boolean, reason?: 'guest' | 'offline' | 'played', last?: { t: number, day: string } }>`
  - `begin(): Promise<void>` — clásico: `G.Ranking.runStarted('s')`. Diario: guarda `{ day, dex, seed }`, llama a `G.DailyNet.start(day)` (rechaza si falla), actualiza `save.daily` (Tarea 7) y después `runStarted('s')`.
  - `boards(dex): Array<[board: string, period: string]>` — clásico: `G.Ranking.soloBoards(dex)`. Diario: `G.Ranking.dailyBoards(day del begin)`.
  - `finish(run: { t: number }): { t1: number, t10: number }` — premios extra del modo. Clásico: `{0,0}`. Diario: `{ t1: G.Daily.playTickets(run.t), t10: 0 }`.
  - `G.Modes.get(id)`, `G.Modes.current` (getter), `G.Modes.select(id)` (guarda la elección en `localStorage` `ps.mode` con try/catch; por defecto `'classic'`).
- `game.js`: `startRun(coop)` saca héroe y semilla de `G.Modes.current` salvo en cooperativo (que sigue como hoy, con `coop.seed` y el compañero). `G.World.reset(seed)` y `G.RNG.reseed(seed)` con la misma semilla. `endRun` sube con `G.Ranking.submitSolo(mark, mode.boards(pl.dex))` y suma `mode.finish(...)` a los tickets (por la libreta de `db.js`, como `bankTickets`). `G.Flow.play()` es `async`: `await mode.begin()`; si rechaza, avisa (`G.UI.toast`) y no empieza.

- [ ] **Step 1: Write the failing tests** (`server/test/modes.test.js`)
  - `clásico: héroe = compañero y tablas de siempre`: `hero(save).mon.dex === save.partner`; `boards(25)` = lo que devuelve el `soloBoards(25)` falso.
  - `diario: héroe del día sin shiny`: `hero(save)` = `G.DEX_BY[today().dex]`, `shiny === false` aunque `save.partnerShiny`.
  - `diario: sin red no empieza` (Review Focus 3): con `G.DailyNet.start` que rechaza, `begin()` rechaza y `save.daily` no cambia.
  - `diario: invitado` → `availability()` = `{ ok: false, reason: 'guest' }`; `G.DailyNet.state()` con `day === hoy` → `reason: 'played'`.
  - `diario: tablas del día en que empezó` (Review Focus 2): `begin()` a las 23:59 del 18 y `boards()` llamado con el reloj en el 19 → `dailyBoards('20261018')`.
  - `finish`: diario `{ t: 650 }` → `{ t1: 2, t10: 0 }`; clásico → `{ t1: 0, t10: 0 }`.
- [ ] **Step 2:** `node --test server/test/modes.test.js` → FAIL.
- [ ] **Step 3: Implement** `js/modes/*.js` y el cambio de `game.js` (sin ningún `if (daily)` en `game.js`: todo pasa por el modo).
- [ ] **Step 4:** `npm test --prefix server` → PASS.
- [ ] **Step 5: Commit** `feat: modos de juego (clásico y diario)`

### Task 5: ranking del diario

**Files:**
- Modify: `js/net/ranking.js`, `js/ui/ranking-ui.js`, `dev.html` (si hace falta marcado para el selector Hoy/Ayer)
- Test: `server/test/ranking-boards.test.js` (carga `util.js` + `ranking.js` en `vm` con `G.DB` sin conexión)

**Interfaces:**
- Produces:
  - `G.Ranking.soloBoards(dex: number): Array<[string, string]>` — las 5 de hoy: `['s_'+id, p]` por cada periodo de `PERIODS` + `['s_all2_p'+dex, 'p']` (sale de lo que hoy hace `submitSoloNow`).
  - `G.Ranking.dailyBoards(day: string): Array<[string, string]>` → `[['x_d' + day, 'x']]`.
  - `G.Ranking.submitSolo(r, boards)` — `boards` obligatorio (el modo las da).
  - `'x'` entra en `TOP_ONLY`.
  - `saveBests` / `noteTop` conservan también `x_d<ayer>` (se necesita para cobrar el premio).
  - `G.Ranking.top('x', day, null, friendsOnly)` y `myRank` funcionan con el día en lugar del periodo (la firma interna de `board()` acepta `mode === 'x'` → `'x_d' + day`).
- `ranking-ui.js`: tercer botón de modo `['x', 'Diario']` (icono como los otros dos). Con `x`, se ocultan las fichas de periodo y el filtro por Pokémon y salen dos fichas "Hoy" / "Ayer". Arriba, el Pokémon del día (sprite, nombre y tipos con los ayudantes de `G.UI` que ya usa el menú).

- [ ] **Step 1: Write the failing tests**
  - `soloBoards igual que antes` (Review Focus 4): `soloBoards(25)` con fecha fija = `[['s_d20261014','d'],['s_w2026-42j','w'],['s_m202610j','m'],['s_all2','a'],['s_all2_p25','p']]`.
  - `dailyBoards`: `dailyBoards('20261018')` = `[['x_d20261018','x']]`.
  - `saveBests conserva el diario de ayer`: con bests `{ 'x_d20261017:ana': 300, 'x_d20261001:ana': 200 }` el día 18 → queda la primera y no la segunda.
- [ ] **Step 2:** `node --test server/test/ranking-boards.test.js` → FAIL.
- [ ] **Step 3: Implement** en `ranking.js` y la pestaña en `ranking-ui.js`.
- [ ] **Step 4:** `npm test --prefix server` → PASS.
- [ ] **Step 5: Commit** `feat: tabla del desafío diario en el ranking`

### Task 6: Firestore — intento único, tabla `x_` y cobro

**Files:**
- Create: `js/net/daily-net.js` (`G.DailyNet`; script en `dev.html` tras `ranking.js`)
- Modify: `firestore.rules` (fuera de los bloques generados `<admins>` / `<logros>`, que reescribe `tools/make_rules.js`)
- Test: `tools/rules/rules.test.js` (añadir)

**Interfaces:**
- Documento `daily/{uid}`: `{ d: string /* '20261018' */, at: timestamp, claimed: string /* último día cobrado, '' al principio */ }`.
- Reglas:
  - `create/update` del intento: solo el dueño; `d` válido (`^[0-9]{8}$`), `d > resource.data.d` (o sin documento), `at == request.time`, y `d` dentro de ±1 día de `request.time` (compara con `request.time` en UTC convertido a `YYYYMMDD` con `-36 h` / `+36 h` de margen). `claimed` no cambia al empezar.
  - `update` del cobro: solo cambia `claimed`, `claimed > resource.data.claimed`, `claimed < resource.data.d` o `== resource.data.d` (no se cobra un día que no jugaste) y `request.time` al menos 1 h 30 min después del final de ese día (en UTC-5: el día `D` cierra a las `D+1 05:00 UTC` → cobro desde `D+1 06:30 UTC`).
  - `validEntry` / `addMine` aceptan también `board.matches('x_d[0-9]{8}')`, con las mismas comprobaciones, y además `get(daily/{me}).data.d == board.substring(3)`.
- `G.DailyNet`:
  - `state(): Promise<{ d: string, claimed: string } | null>` (1 lectura, caché en memoria durante la sesión)
  - `start(day: string): Promise<void>` — escribe el intento; rechaza si falla o si ya existe ese día.
  - `claim(day: string): Promise<boolean>` — marca `claimed = day`; `false` si las reglas lo rechazan.

- [ ] **Step 1: Write the failing tests** (`tools/rules/rules.test.js`)
  - `diario: el intento se crea y no se repite el mismo día` (Review Focus 1): crear `d: hoy` OK; volver a escribir `d: hoy` → falla.
  - `diario: no se puede volver a un día anterior`.
  - `diario: la marca x_ solo con intento de ese día`: con `daily/ana.d = hoy`, `submit(db, 'x_d'+hoy, ...)` OK; con `x_d`+ayer → falla.
  - `diario: el cobro solo una vez y del día jugado` (Review Focus 5): `claimed: ayer` OK si `d == ayer` y ya es la hora; repetirlo → falla; `claimed: hoy` → falla.
  - `diario: nadie escribe el intento de otro`.
  - (Las fechas del test se calculan con `Date.now()`; para la hora de cobro, usar un día lo bastante antiguo.)
- [ ] **Step 2:** `npm test --prefix tools/rules` → FAIL.
- [ ] **Step 3: Implement** las reglas y `js/net/daily-net.js`.
- [ ] **Step 4:** `node tools/export_data.js` (comprobar que no borra lo nuevo) y `npm test --prefix tools/rules` → PASS.
- [ ] **Step 5: Commit** `feat: reglas del desafío diario (intento único, tabla y cobro)`

### Task 7: recompensas, racha y logros

**Files:**
- Modify: `js/core/db.js` (campo nuevo `save.daily = { played: 0, streak: 0, last: '', best: 0, wins: 0, top10: 0 }`, normalizado al cargar como el resto)
- Modify: `js/data/achievements.js` (categoría `['diario', 'Desafío diario']` y 7 logros), `js/modes/daily-mode.js` (actualizar `save.daily` en `begin`), `js/net/daily-net.js` o un `G.DailyNet.claimYesterday()` llamado desde `G.Flow.goMenu`
- Test: `server/test/modes.test.js` (añadir) y `server/test/daily.test.js`

**Interfaces:**
- Consumes: `G.Daily.nextStreak`, `G.Daily.placePrize`, `G.Daily.claimOpen`, `G.Daily.prevDay`, `G.Ranking.top('x', day)` / `myRank`, `G.DailyNet.state` / `claim`, `G.Progress.grant(reward)`, `G.Progress.checkAch()`.
- Produces:
  - En `begin()`: `played++`, `streak = nextStreak(save.daily, day)`, `last = day`, después `G.Progress.checkAch()` y `G.DB.commit(true)`.
  - `G.DailyNet.claimYesterday(): Promise<{ rank: number, prize } | null>` — si `claimOpen()`, `state().d === prevDay(hoy)` y `state().claimed !== prevDay(hoy)`: lee tu puesto en `x_d<ayer>`; si `rank <= 10`, `top10++`; si `rank === 1`, `wins++`; `best = min(best || ∞, rank)`; `claim(ayer)` y, solo si devuelve `true`, `G.Progress.grant(placePrize(rank))`, toast y `checkAch()`. Se llama una vez por sesión desde `G.Flow.goMenu`.
  - Logros (`value` desde `save.daily`):

| id | tier | value | goal | reward | title |
|---|---|---|---|---|---|
| daily1 | 1 | played | 1 | `{ t1: 2 }` | — |
| daily7 | 2 | played | 7 | `{ t10: 1 }` | — |
| daily30 | 3 | played | 30 | `{ t10: 2 }` | Retador diario |
| streak7 | 2 | streak | 7 | `{ t10: 1 }` | — |
| streak30 | 3 | streak | 30 | `{ t10: 2 }` | Constancia de hierro |
| dailyTop10 | 2 | top10 | 1 | `{ t10: 1 }` | — |
| dailyWin | 3 | wins | 1 | `{ t10: 2 }` | Campeón del día |

- [ ] **Step 1: Write the failing tests**
  - `begin suma la racha`: con `save.daily = { last: '20261017', streak: 4, played: 9 }`, `begin()` el 18 → `{ streak: 5, played: 10, last: '20261018' }`.
  - `claimYesterday: premio una sola vez` (Review Focus 5): con `state() = { d: ayer, claimed: '' }` y rango 2 → da `{ t10: 1 }`; con `claimed: ayer` → `null` y sin premio.
  - `claimYesterday: antes de la 01:30 no cobra`.
  - `claimYesterday: si claim() devuelve false, no se da nada`.
- [ ] **Step 2:** `node --test server/test/modes.test.js` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4:** `npm test --prefix server` → PASS; `node tools/export_data.js` → `ok` (cuenta 137 logros).
- [ ] **Step 5: Commit** `feat: recompensas y logros del desafío diario`

### Task 8: interfaz, textos y publicación

**Files:**
- Modify: `dev.html` (selector en el menú y estilos), `js/ui/menu.js`, `js/ui/run-ui.js` (pantalla final), el HUD de la partida (donde se pinta el reloj en `run-ui.js`), `js/data/lang-en.js`, `js/data/changelog.js`

**Interfaces:**
- Consumes: `G.Modes.select/current/availability`, `G.Daily.today`, `G.U.msUntilReset()`, `G.Modes.daily.hero(save)`, `G.Upgrades` / `G.DB.upgradesOf(dex)`.
- Menú: dos fichas "Clásico" / "Desafío diario" encima de "Jugar". Con "Desafío diario", el escenario (`#menu-partner`) enseña el Pokémon del día (nombre, tipos, rareza y "Tienes mejoras para él" si `upgradesOf(dex)` no está vacío), la cuenta atrás hasta el siguiente (`msUntilReset`) y el estado de `availability()`: `guest` → "Crea una cuenta para jugar el desafío"; `offline` → "Sin conexión"; `played` → "Ya has jugado hoy: 12:34" + cuenta atrás. "Jugar" con el diario pide confirmación: "Solo tienes un intento hoy. Si la partida se corta, se pierde. ¿Empezar?" (con el diálogo que ya use el juego, no `confirm()`).
- HUD: una etiqueta "Desafío diario" junto al reloj mientras dure la partida.
- Pantalla final: los tickets del desafío en el resumen y un botón "Ver tabla" que abre el ranking en la pestaña Diario.
- Changelog: entrada `new` con fecha del día de publicación, en español y en inglés, que explique el modo, el intento único y las recompensas.

- [ ] **Step 1:** Implementar el menú, el HUD y la pantalla final.
- [ ] **Step 2:** Textos en `lang-en.js` y changelog.
- [ ] **Step 3:** `node tools/build.js && node tools/export_data.js && python tools/make_seo_pages.py && node tools/check_copy.js --built && npm test --prefix server && npm test --prefix tools/rules` → todo `ok` / PASS.
- [ ] **Step 4:** Prueba manual en el navegador (`localhost` con `?dev` si hay mantenimiento): clásico igual que antes; diario con cuenta → empieza con el Pokémon del día, la etiqueta en el HUD, al morir sube a `x_d...` y no a `s_...`, el selector pasa a "Ya has jugado hoy"; invitado → bloqueado; recargar durante la run → al volver, "Ya has jugado hoy".
- [ ] **Step 5: Commit** `feat: desafío diario en el menú`
- [ ] **Step 6:** Recordar al dueño al publicar: `firebase deploy --only firestore` (reglas nuevas), redesplegar `web` y `game` (cambió `server/` y la lógica compartida; `VERSION` subida en la Tarea 2).
