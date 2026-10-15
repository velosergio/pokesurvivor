# Optimizar el rendimiento

Revisión del código (octubre de 2026) buscando qué frena el juego. Sale de leer el código,
no de perfilarlo en marcha: el orden por impacto es una estimación y hay que medir antes y
después de cada cambio.

Lo que ya está bien y conviene no romper: calidad automática según los FPS
(`js/core/settings.js`), topes de partículas por calidad (`js/entities/fx.js`), el suelo
dibujado por trozos y guardado (`js/world/world.js`), los sprites de efectos guardados ya
dibujados (`js/entities/vfx.js`), la cuadrícula para buscar enemigos cercanos
(`js/entities/enemy.js`) y gzip en `nginx.conf`.

## Cómo medir

1. Chrome DevTools → Performance, con la CPU ralentizada 4×.
2. Una partida avanzada: jefe en pantalla, muchos enemigos y muchas partículas.
3. Apuntar los FPS con el contador del juego (Ajustes → FPS) antes y después de cada cambio.
4. Si un cambio toca lógica (todo lo que corre en `G.Step`), debe seguir pasando
   `node --test server/test/sim.test.js`: el servidor del cooperativo usa ese mismo código.

## Mayor impacto: el dibujo

Es lo que más pesa, sobre todo en móvil.

### 1. Números de daño con texto de canvas

`js/entities/fx.js`, en `draw`: cada número cambia la fuente, hace `save`/`restore` y
dibuja el texto dos veces (`strokeText` + `fillText`). Puede haber hasta 70 a la vez, y el
texto es de lo más caro que se puede pedir a un canvas.

**Propuesta:** dibujar una vez cada carácter (0‑9, `-`, `!`…) por color y tamaño en un
canvas aparte, con su borde, y componer los números con `drawImage`. Los avisos de texto
largos («¡Muy eficaz!») pueden guardarse enteros la primera vez que salen.

### 2. `save`/`restore` en cada entidad y cada sprite de efecto

- `js/entities/enemy.js` (`draw`): de 2 a 4 parejas de `save`/`restore` por enemigo.
- `js/entities/vfx.js` (`draw`): `save` + `translate` + `rotate` + `restore` en cada
  proyectil y en cada partícula con sprite.

**Propuesta:** cambiar `globalAlpha` a mano y colocar con `ctx.setTransform(...)` usando la
matriz de la cámara, sin rotar cuando el ángulo es 0. Es un cambio mecánico y con cientos de
sprites se nota.

### 3. Sombras dibujadas como rutas

`js/core/sprites.js` (`drawShadow`) y `js/entities/projectile.js` (`draw`): cada sombra es
`beginPath` + `ellipse` + `fill`.

**Propuesta:** guardar ya dibujadas las 3 sombras de tamaño PMD y pintarlas con `drawImage`
escaladas. Las sombras de los proyectiles, que son todas del mismo color, caben en una sola
ruta con un único `fill()`, y lo mismo vale para los aros rojos de los disparos enemigos.

### 4. Degradados creados en cada fotograma

- Viñeta: `js/world/world.js` (`drawVignette`).
- Barra de experiencia: `js/ui/hud.js` (al principio de `draw`).
- Niebla: `js/game.js` (`render`).

**Propuesta:** dibujar la viñeta y la niebla en un canvas aparte solo al cambiar el tamaño
de la ventana (la niebla se pinta encima con `globalAlpha`) y guardar el degradado de la
barra de experiencia hasta que cambie el ancho.

### 5. Contexto del canvas

`js/game.js`: `cv.getContext('2d')`.

**Propuesta:** probar `getContext('2d', { alpha: false, desynchronized: true })`. El suelo
tapa toda la pantalla, así que el canvas no necesita transparencia y el navegador lo compone
más barato. Hay que cambiar `clearRect` por un `fillRect` con el color de fondo (también en
el fondo de los menús).

### Menores del dibujo

- **Partículas** (`js/entities/fx.js`): cambian `fillStyle` y `globalAlpha` en cada una.
  Agruparlas por color y escalón de transparencia (solo hay 3) reduce los cambios de estado.
- **Anillos y tajos** (`drawRing`, `drawSlash`): un `fillRect` por píxel de arte. Se pueden
  juntar en una ruta con `rect()` por color y un solo `fill()`.

## Impacto medio: la lógica

Crece con la cantidad de cosas en pantalla. Todo esto corre también en el servidor.

### 6. `splice` dentro de bucles

`js/entities/fx.js` (`update`, hasta 1400 partículas), `js/entities/projectile.js`
(`update`) y `js/entities/enemy.js` (`update` del gestor). Cada `splice` mueve todo lo que
hay detrás; cuando mueren muchas cosas a la vez el coste crece con el cuadrado.

**Propuesta:** compactar el array en una sola pasada con un índice de escritura. Conserva
el orden, así que el resultado es idéntico y no afecta al determinismo del servidor.

### 7. Teledirigidos y torretas recorren todos los enemigos

`js/entities/projectile.js` (`nearest(enemies, …)` en `update`): cada proyectil
teledirigido busca entre todos los enemigos en cada fotograma. Lo mismo las torretas en
`js/systems/combat.js` (`G.Projectiles.nearest(G.EnemyMgr.all(), …)`).

**Propuesta:** usar `G.EnemyMgr.queryCircle(x, y, 340)`, que ya existe, o recalcular el
objetivo cada ~0,1 s y guardarlo en el proyectil mientras siga vivo. Ojo: `nearest` mide
hasta `e.cy()` y `queryCircle` hasta los pies; el radio de búsqueda debe cubrir esa
diferencia para no cambiar a quién se apunta.

### 8. La cuadrícula de enemigos se rehace dos veces por paso

`js/entities/enemy.js` (`update` llama a `rebuildGrid`) y `js/systems/step.js` (vuelve a
llamarla justo después). Además crea un array nuevo por celda cada vez.

**Propuesta:**
- Reutilizar las listas de cada celda (vaciarlas con `length = 0`) en vez de crear Maps y
  arrays nuevos.
- Revisar si la segunda llamada hace falta (la separación mueve enemigos, así que puede que
  sí; entonces basta con no repetir la primera reconstrucción si nada se ha movido aún).
- La clave `cx * 73856093 ^ cy * 19349663` puede repetirse para celdas distintas. En
  `queryCircle` da igual porque luego filtra por distancia, pero `separate` puede contar
  vecinos que no son. Una clave sin choques (por ejemplo `(cx + 32768) * 65536 + (cy + 32768)`)
  lo evita.

### 9. Orden por Y con objetos nuevos en cada fotograma

`js/game.js` (`drawScene`): crea un objeto `{ y, ent }` por cada cosa que se dibuja y
ordena la lista entera.

**Propuesta:** reutilizar un mismo array de entradas. Como de un fotograma a otro el orden
apenas cambia, una ordenación por inserción sobre la lista anterior sale casi gratis.

## Carga inicial

### 10. Tamaño del paquete

`js/app.min.js` ocupa 1,79 MB (353 KB con gzip) y lleva dentro `js/data/sprites-meta.js`
(556 KB) y `js/data/pokedex.js` (127 KB).

**Propuesta:**
- Sacar los metadatos de sprites a un `.json` cargado con `fetch` al arrancar:
  `JSON.parse` es bastante más rápido que analizar el mismo contenido como código, y el
  archivo se cachea aparte del código (no se vuelve a bajar en cada versión).
- Activar Brotli en nginx si la imagen lo trae.

### 11. Ofuscador

`tools/build.js`: `--self-defending` y la tabla de cadenas en base64 (umbral 0,1) añaden
algo de coste al arrancar y en las funciones que leen esas cadenas. El umbral ya es bajo;
solo merece la pena tocarlo si el perfilado muestra la función decodificadora (`a0_0x…`)
entre las que más tiempo consumen.

## Orden recomendado

1 → 2 → 3 → 6 → 7: son los cambios más baratos con más efecto. Medir tras cada uno y
seguir con el resto solo si hace falta.
