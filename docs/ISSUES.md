# Fallos conocidos

Auditoría del 17-10-2026 (sobre `abdd1a6`). Ordenados por gravedad. Los dos graves (libreta con dos pestañas y partida en
grupo que acababa a los 20 s sin nadie conectado) se arreglaron el mismo día. Las pruebas
(`server/test/sim.test.js`, `npm test --prefix server`, `tools/*.test.js`) y
`node tools/check_copy.js --built` pasaban: nada de esto lo cazan.

Al arreglar uno, bórralo de aquí y apúntalo en `js/data/changelog.js` si es de juego.

## Medios

### 1. Lo pendiente no siempre sube a la nube antes de recargar o salir
`js/core/db.js` (`pushNow`, `MIN_GAP`) · `js/core/updater.js` (`reload`)

Si hubo una subida buena hace menos de 65 s, `pushNow()` sin `force` sólo
programa otra. Así:

- `pagehide` y `logout` no suben nada (la pestaña se cierra antes).
- `updater.js` llama a `G.DB.flush()` sin `force` y recarga igualmente: en una
  actualización obligatoria, la partida recién terminada no llega a la nube.

Queda en la copia del navegador y se sube al volver a entrar **en ese aparato**;
en otro se ve la versión vieja. CLAUDE.md pide subirlo antes de recargar.
En el actualizador basta `G.DB.flush({ force: true })`; en `pagehide` y `logout`, igual.

### 2. El ranking de grupo todavía hace caso a la marca vieja `sus`
`server/rank.js` (`flagged`, `checkKits`)

`firestore.rules` dice que `sus` ya no cuenta (14-10-2026) y el ranking en
solitario sólo mira `ban`, pero el servidor sigue dejando fuera del ranking de
grupo (y marcando `ok: false`) a quien la tenga de los falsos positivos de antes.
Quitar `sus` de las dos comprobaciones (y de `mask`).

### 3. En cooperativo se puede ir unas 3 veces más rápido
`server/room.js` (`movePlayers`, `SLACK`)

El margen `SLACK = 8` px se suma a **cada** `in` aceptado, y se acepta uno por
paso (30/s). Con una velocidad de ~110 px/s, un navegador modificado que mande
30 `in` por segundo puede moverse a unos 375 px/s (~3,4×). Da ventaja en el
ranking de grupo. El margen debería ser por tiempo (o acumulado con tope), no
por mensaje.

## Leves

### 4. La Banda Focus no funciona el primer minuto en el servidor
`js/entities/player.js` (`sashT = -999`). En la simulación `performance.now()`
empieza en 0, así que `now - sashT > 60000` no se cumple hasta los ~59 s de
partida. Mejor `-Infinity`.

### 5. Monedas extra perdidas en cooperativo
`js/game.js` (`G.onShinyCaught`, `G.onRescue`, `coopApi.over`). Los +300 de un
shiny repetido y los +150 de un rescate repetido se suman a `pl.coins`, pero
`over()` lo sustituye por las monedas del servidor (`r.co`).

### 6. Objetos que esperan a las cartas de nivel y no salen nunca
`js/game.js` (`afterLevelUp`, `laterItems`, `openItem`). `afterLevelUp()` sólo
se llama desde `offerItem`: al elegir carta (`take` en `maybeLevelUp`) no se
llama, así que un objeto guardado en `laterItems` no se ofrece. Además
`laterItems` y `openItem` no se vacían en `startRun`.

### 7. Los 2 s sin daño al subir de nivel no protegen de la lava
`js/entities/player.js` (terreno líquido: `this.invuln = 0`). Puede ser lo
querido, pero la novedad del changelog no lo dice.

### 8. La partida guardada no tiene topes en la nube
`firestore.rules` (`saneSave`) sólo comprueba que monedas y tickets no sean
negativos: cualquiera puede ponerse lo que quiera editando su guardado (y
`checkKits` se fía de lo guardado). Es así desde siempre; se deja anotado.
