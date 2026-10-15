# Telón de la grieta — diseño

Fecha: 14-10-2026 · Estado: aprobado. Escrito revisado.

## 1. Objetivo

Al entrar en la arena de la grieta y al volver al mapa, la pantalla se tapa del todo
en el acto. Cuando se abre, ya estás en el sitio nuevo. La cámara sigue saltando por
debajo (la arena sigue lejos, a propósito), pero ese recorrido no se ve.

Hoy `begin()` y `finish()` en `js/systems/rift.js` teletransportan y clavan la cámara
en el mismo fotograma, y llaman a `G.Game.flash` (violeta, 0,9 s al entrar y 0,8 s al
salir). Ese destello se va apagando desde el principio y, con «menos destellos», queda
al 30 %. En grupo, `Camera.follow` amortigua hacia el jugador: si el servidor te
recoloca mientras el color se va, la vista recorre el mapa.

**Fuera de alcance:** acercar la arena al jugador, el destello de los golpes, la cámara
y el destello de la Sentencia de Arceus, y el suavizado de las correcciones cortas del
servidor (pared, trampa).

## 2. Telón

Lo dibuja el cliente, en `js/game.js`, en el mismo sitio que el destello de ahora:
encima de la escena y del HUD, un rectángulo de toda la pantalla. El servidor no
dibuja. `G.Game.curtain()` en `server/room.js`, `server/test/team.js` y
`server/test/solo.js` es una función vacía, como `flash()`.

`begin()` y `finish()` llaman a `G.Game.curtain('#c9a6ff')` en lugar de `G.Game.flash`.
El resto de destellos no cambia.

- El fotograma del viaje ya sale con alfa 1. No hay fundido de entrada.
- Se queda opaco 0,25 s.
- Se abre en línea durante 0,4 s (alfa de 1 a 0). A los 0,65 s desaparece.
- «Menos destellos» (`G.Settings.get('calm')`) no le baja el alfa.
- Si otro viaje llama a `curtain()` mientras uno sigue en pantalla, el tiempo vuelve
  a empezar (otra vez opaco 0,25 s y luego la apertura).

## 3. Cámara

En el fotograma de `begin()` y de `finish()` la cámara pasa al jugador, como ahora.

Mientras el telón dura (los 0,65 s enteros, opaco y apertura), cada fotograma, después
de `G.Camera.follow`, la cámara se coloca en el mismo punto que esa llamada iba a
seguir: `pl.x + netOffX`, `pl.y + netOffY`. Así un recorte lejano del servidor, que
pone el desfase a cero, no se ve deslizar. Al terminar el telón, el seguimiento
normal sigue desde donde ya está la cámara.

## 4. Novedades

Al implementarlo, una línea en `fix` de `js/data/changelog.js`, en la fecha de ese día:

- «Al entrar o salir de una grieta, la pantalla se tapa un momento y apareces ya en el sitio: la cámara ya no recorre el mapa.»
- «Entering or leaving a rift covers the screen for a moment and you appear already there: the camera no longer travels across the map.»

## 5. Pruebas

`node --test server/test/sim.test.js` sigue pasando: la grieta entra y vuelve, y
`curtain()` no hace nada en el servidor. No hay prueba de píxeles.

En el navegador, en solitario y en grupo, con «menos destellos» activado y sin él:
entrar en una grieta y salir (ganar o perder). La vista no recorre el mapa; el telón
está sólido al principio y se abre ya en el sitio nuevo. Un golpe y la Sentencia
siguen con su destello de siempre.
