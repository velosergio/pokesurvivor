# Modo Rumble

Fecha: 2026-10-25 · Estado: decisiones cerradas, pendiente de revisión

Run de superviviente, en solitario y en cooperativo, en la que el Pokémon cambia durante la partida. Se empieza con uno común, elegido entre tres. Cada 10 niveles se puede dar un paso de evolución o cambiar a otro. Cuanto más alto es el nivel, menos comunes salen. La partida acaba al llegar al nivel 100.

## Decisiones

1. Al cambiar o al evolucionar te quedas con el **nivel de la run** y **pierdes los movimientos**. Seguir con el mismo no borra nada.
2. Siempre hay una carta de **seguir con este**.
3. El sorteo usa **toda la Pokédex** jugable, la tengas o no.
4. Si **tienes** ese Pokémon, cuentan sus mejoras de la tienda, su naturaleza, su habilidad y su shiny. Si no lo tienes, sale en blanco.
5. Los de las grietas (`leg`) **sí pueden salir** en un cambio, dentro de la rareza legendaria. La curva ya los hace raros al principio y frecuentes cerca del final.
6. Si la línea se abre, hay **una sola carta** de evolucionar. La forma se tira al montar la oferta y la carta enseña cuál es.
7. La **curva** de la tabla se queda como está.
8. En el 10, el 20, el 30… la elección de Rumble va **antes** de las tres cartas de siempre.
9. **El nivel 100 es el final.** No hay Juicio ni Arceus. La última elección es la del 90: al llegar al 100 la run acaba y no se vuelve a cambiar (un cambio borraría los movimientos y la partida ya habría terminado).
10. Hay **tabla propia desde la primera versión**. No sube a las tablas del Clásico y usar un Pokémon aquí no lo añade a la colección.

## Cómo se juega

Mismo mapa, mismas oleadas y la misma experiencia que el Clásico. No aparece el Juicio. El Pokémon no tiene por qué ser el compañero de la colección.

1. En el menú, junto a Clásico y Desafío diario, se elige Rumble y se pulsa Jugar.
2. Antes de que salgan enemigos, la partida se para y enseña tres comunes distintos (sprite, nombre, tipos y rareza). Se elige uno. En el arranque siempre son comunes: esa elección no usa la curva.
3. Se juega como siempre. Cada nivel salen las tres cartas de siempre (movimiento nuevo, mejora, estadística).
4. Al llegar a 10, 20, 30… y 90, **primero** sale la elección de Rumble y **después** las tres cartas de ese nivel. El combate sigue parado, igual que en una subida de nivel.
5. En esa parada las cartas son:
   - **Evolucionar**, si hay un paso siguiente (Charmander pasa a Charmeleon, no a Charizard). Si hay varias formas, una sola carta: la forma ya está tirada y se ve en la carta.
   - **Tres cambios.** Cada carta tira primero una rareza con la curva de ese nivel y luego una especie de esa rareza, `leg` incluidos. Si sale el que ya llevas, o uno repetido en las tres, se vuelve a tirar. Si una rareza se queda sin especies libres, se tira otra rareza.
   - **Seguir con el mismo.**
6. Si la especie no evoluciona, esa carta no sale. Quedan los tres cambios y seguir igual.
7. Al llegar al **nivel 100** la run termina en victoria. Si caes antes, termina ahí. El nivel del que habla este modo es el de la experiencia, no el de un movimiento.

## La curva de rareza

Rarezas del gacha: 1 Común, 2 Poco común, 3 Rara, 4 Épica, 5 Legendaria.

El avance sube con el cuadrado del tramo recorrido, para que a mitad de camino un común siga siendo lo habitual:

```
u = 0                     si nivel < 10
u = 1                     si nivel >= 100
u = ((nivel - 10) / 90)² si no
```

Cada rareza interpola entre su peso en el 10 y su peso en el 100. Los dos extremos suman 100, así que cualquier nivel intermedio también.

| Rareza | Nv. 10 | Nv. 40 | Nv. 70 | Nv. 90 (última elección) | Techo, nv. 100 |
|---|---:|---:|---:|---:|---:|
| Común | 95 % | 84,6 % | 53,3 % | 20,7 % | 1 % |
| Poco común | 4 % | 4 % | 4 % | 4 % | 4 % |
| Rara | 0,9 % | 2,5 % | 7,2 % | 12,0 % | 15 % |
| Épica | 0,09 % | 5,1 % | 20 % | 35,6 % | 45 % |
| Legendaria | 0,01 % | 3,9 % | 15,5 % | 27,7 % | 35 % |

El techo describe la curva. No hay sorteo en el 100: la run acaba al llegar. El arranque, antes del nivel 10, tampoco usa la tabla.

La rareza 5 junta a los legendarios de la Pokédex (Dragonite, Tyranitar…) y a los `leg` de las grietas (Articuno, Mewtwo, Mew…). La carta de evolución no mira la curva: si el paso siguiente es un `leg`, puede salir igual.

## Qué pasa al cambiar

Cambiar o evolucionar cambia el cuerpo y vacía los movimientos. Seguir con el mismo deja la run como estaba.

Se queda:

- El nivel de la run y la experiencia que ya llevas de ese nivel.
- Las mejoras de la run (Vigor, Potencia, Carrera…). La respuesta solo quita los movimientos.
- El objeto equipado.

Se pierde:

- Todos los movimientos, con su nivel y con su evolución de movimiento. Los huecos quedan vacíos. Las tres cartas de ese mismo nivel, que salen justo después, ofrecen ataques del Pokémon nuevo.

El cuerpo nuevo entra con la **vida llena**. La vida máxima es la de esa especie, más el Vigor de la run y, si la tienes, la mejora de vida de la tienda de esa especie.

Entran el sprite, los tipos, el ataque y la velocidad base, y el repertorio de los movimientos nuevos.

### Si lo tienes en la colección

Cuentan la ficha de **esa** especie, no la de las anteriores:

- Mejoras de la tienda de ese Pokémon.
- Su naturaleza y su habilidad (las de `save.pnat` y `save.pabil`, o las que le tocarían si no las ha cambiado).
- Sus MT: las siguientes cartas de movimiento salen de su repertorio, igual que en el Clásico.
- Shiny, si tienes el shiny de esa especie.

Al salir de una especie, sus mejoras de tienda, su naturaleza y su habilidad se van con ella. No se acumulan las de toda la run.

Si no lo tienes, o juegas de invitado, esa especie sale en blanco: sin mejoras de tienda, sin naturaleza, sin habilidad, sin MT y sin shiny.

Usarlo en Rumble no lo añade a la colección ni desbloquea el shiny.

## La tabla

Tabla propia, modo `r`, con los mismos periodos que el solitario (día, semana, mes, histórico). No hay tabla por Pokémon: en una run se pasan varios.

Orden: **más nivel gana**. A igual nivel, **menos tiempo gana**. Llegar al 100 es la marca alta; entre dos que llegan, queda delante quien tardó menos.

Hace falta cuenta, como en las otras tablas. Por debajo de 2 minutos no se sube. La marca guarda el nivel, el tiempo y la especie con la que acabaste. No escribe en las tablas `s`.

Monedas y tickets cogidos en el mapa cuentan igual que en una run normal.

## Qué no entra

- El Juicio de Arceus.
- Subir la marca a las tablas del Clásico.
- Regalar el Pokémon a la colección.
- Logros propios del modo. Pueden venir después, cuando la tabla ya exista.

## Dónde encaja

Un modo nuevo es un objeto más en `G.Modes` (`js/modes/modes.js`): con qué Pokémon se empieza, la semilla, si se puede jugar, a qué tablas sube y qué premios da. Clásico y Desafío diario ya funcionan así. Rumble no reparte `if (rumble)` por el bucle.

Hoy un modo solo elige el Pokémon al empezar (`hero`). Rumble añade una pregunta opcional. Clásico y Diario responden «nada»:

- `draft(level, mon, rng)` → las cartas de esta parada, o nada si este nivel no toca.

`game.js` la llama al cruzar un nivel, antes de las tres cartas de siempre. Las dibuja la misma pantalla de subida de nivel. Al llegar al 100 no llama a `draft`: cierra la run.

La Pokédex (`js/data/pokedex.js`) tiene rareza y no tiene líneas de evolución. Esas líneas son datos nuevos, en un solo sitio.

Cambiar de especie es un método del jugador. Ahí se vacían los movimientos, se aplica la ficha de la especie nueva (o el cuerpo en blanco) y se llena la vida. El nivel, las mejoras de la run y el objeto no se recalculan en otro sitio.

## Fases

Cada fase se puede probar sola. No se empieza la siguiente hasta que la anterior juega.

### Fase 1. Reglas, sin pantalla

Funciones puras, con pruebas en Node (sin `document`):

- `pesos(nivel)` con la tabla de arriba. El 100 es el techo de la fórmula; el sorteo de especies ocurre en 10, 20… 90.
- Tres especies distintas, sin repetir la actual, con `leg` dentro de la rareza 5.
- Grafo de evolución. Si hay varias formas siguientes, la oferta se queda con una, tirada al montarla.

### Fase 2. Entrar

- Modo `rumble` en `G.Modes`: semilla al azar, se puede jugar de invitado, la marca va a las tablas `r` y no a las `s`.
- Tercer botón en el selector del menú (`dev.html`, junto a Clásico y Desafío diario).
- Parada inicial con tres comunes. Si tienes el elegido, entra con su ficha. Si no, en blanco.

### Fase 3. La parada de cada 10 niveles

- Al cruzar 10, 20… 90 se pausa: evolucionar (una forma, ya visible), tres cambios y seguir igual.
- Después salen las tres cartas normales de ese nivel.
- En esta fase la carta aún no cambia el sprite: solo se recuerda la elección.

### Fase 4. Cambiar el cuerpo

- Confirmar un cambio o una evolución pasa a esa especie, vacía los movimientos y deja la vida llena.
- El nivel, la experiencia de ese nivel, las mejoras de la run y el objeto se quedan.
- Seguir con el mismo no toca nada.
- La ficha de tienda, naturaleza, habilidad, MT y shiny es la de la especie actual, y solo si la tienes.
- Las cartas de movimiento que salen después usan el repertorio de esa especie.

### Fase 5. Cerrar la run y que se entienda

- Al llegar al nivel 100, victoria. Si caes antes, fin de run con el nivel alcanzado.
- En este modo no se abre el Juicio.
- Textos en español, con clave para el resto de idiomas.
- Una línea en el changelog (español e inglés).
- Un destello corto al evolucionar o al cambiar, el mismo que ya existe al evolucionar un movimiento.

### Fase 6. La tabla `r`

- Periodos día, semana, mes e histórico.
- Orden por nivel, y a igual nivel por tiempo.
- Cuenta obligatoria y mínimo de 2 minutos, como el resto de tablas.
- La marca enseña la especie final. No hay filtro por Pokémon.

### Fase 7. Cooperativo

El modo también se juega en grupo. El servidor no pasa por `G.Modes` y un cambio de especie a mitad de partida tiene que viajar en el protocolo (`js/net/proto.js`, subir `VERSION`). Esta fase espera a que el solitario ya cambie de cuerpo y cierre en el 100, y reutiliza las mismas reglas de sorteo, de ficha y de borrado de movimientos.
