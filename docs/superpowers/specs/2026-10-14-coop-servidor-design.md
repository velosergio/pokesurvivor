# Copia propia + cooperativo en servidor — diseño

Fecha: 14-10-2026 · Estado: aprobado en conversación, pendiente de revisar por escrito.

## 1. Objetivo

Montar una **copia propia y aparte** de PokéSurvivor en `https://poke.sergioveloza.com`, con
infraestructura del usuario (Firebase `pokesurvivor-662eb`, VPS con Easypanel en 82.29.197.223,
DNS en Hostinger), y cambiar el **cooperativo** para que la partida la lleve un **servidor
autoritativo** en el VPS en vez del navegador del anfitrión.

Problemas que resuelve (todos pedidos por el usuario):

| Problema | Hoy | Con el servidor |
|---|---|---|
| Se corta | Si el anfitrión se va o cambia de pestaña, la partida se para o termina | Nadie es imprescindible; la sala sigue mientras quede alguien |
| Trampas | El anfitrión decide enemigos, XP y reloj; cada uno decide sus golpes; la marca de grupo la escribe un navegador | Golpes, vida, XP, reloj y marca de grupo los decide el servidor |
| Conexión y coste | WebRTC + TURN de Cloudflare (de pago por GB) + Realtime Database (100 conexiones gratis) | Un WebSocket `wss://` al VPS; sin TURN ni Realtime Database |
| Lag | El móvil del anfitrión simula todo para todos | El VPS simula; los navegadores sólo envían órdenes y dibujan |

**Fuera de alcance:** las partidas en solitario siguen en el navegador (sin conexión, sin coste
de servidor), con las defensas actuales del ranking. No se migran cuentas ni partidas del juego
original: el proyecto nuevo empieza vacío. No se toca nada de pokesurvivor.com.

## 2. Infraestructura

### 2.1 Configuración única

`js/config.js` (cargado el primero en `dev.html`) reúne todo lo que hoy está escrito a fuego:

```js
G.Config = {
  site: 'https://poke.sergioveloza.com',
  ws: 'wss://poke.sergioveloza.com/ws',      // en local: ws://localhost:8787/ws
  firebase: { apiKey, authDomain, projectId: 'pokesurvivor-662eb', ... },
  admins: [/* uid de tu cuenta, se rellena tras crearla en el paso 1 */],
  kofi: '',                                    // vacío: sin botón de apoyo
};
```

- `tools/build.js`, `tools/export_data.js` y `tools/make_seo_pages.py` leen el sitio de aquí
  (canonical, sitemap, robots, páginas `en/`).
- `firestore.rules` no puede leer JS: el UID admin se inyecta con `tools/make_rules.js`
  (que ya genera parte de las reglas).
- `.firebaserc` → `pokesurvivor-662eb`.

### 2.2 Lo que se elimina

En el paso 1: `functions/` (portero de cuentas) y la sección `functions` de `firebase.json`,
`cloudflare/` (Worker TURN/MAU/online), `js/net/signups.js`, `CNAME`,
`tools/activar_dominio.sh`, `docs/TURN.md`, `docs/DOMINIO.md`. El cooperativo antiguo sigue
funcionando sin TURN (sólo conexión directa) usando una Realtime Database en tu proyecto.

En el paso 5, cuando el servidor ya funciona: `database.rules.json`, la sección `database` de
`firebase.json` (y la Realtime Database del proyecto), WebRTC, señalización y relé de `net.js`, y
la sala en Realtime Database de `social.js`.

### 2.3 Firebase (`pokesurvivor-662eb`, plan Spark)

- Registrar la app web y copiar su configuración a `js/config.js`.
- Crear Firestore (ubicación `eur3` o la más cercana a los jugadores) y desplegar
  `firestore.rules` + `firestore.indexes.json`.
- Crear una Realtime Database (sólo hasta el paso 5, para las salas del cooperativo antiguo) y
  desplegar `database.rules.json`.
- Authentication: activar usuario/contraseña (email interno) y Google, en modo **normal**.
  **Nunca** Identity Platform ni funciones de bloqueo (cobran por usuario).
- Dominios autorizados: añadir `poke.sergioveloza.com`.
- Cuenta de servicio para el servidor (sólo para escribir el ranking de grupo): su JSON va como
  variable secreta `FIREBASE_SERVICE_ACCOUNT` en Easypanel, nunca al repositorio.

### 2.4 DNS (hecho)

Hostinger: `poke.sergioveloza.com A 82.29.197.223` (TTL 300). Sin AAAA hasta comprobar que el
VPS sirve bien por IPv6. Cloudflare no va delante (la zona está en Hostinger; meter sólo un
subdominio en su proxy es del plan Business). Si un día se quiere su protección, se mueve la
zona a Cloudflare sin tocar el juego.

### 2.5 Easypanel: dos servicios

| Servicio | Imagen | Dominio / ruta | Notas |
|---|---|---|---|
| `web` | `Dockerfile` actual (nginx 1.27) | `poke.sergioveloza.com` | `nginx.conf` con `server_name` del nuevo dominio |
| `game` | `server/Dockerfile` (Node 20 alpine) | `poke.sergioveloza.com`, ruta `/ws` | puerto 8787; HTTPS lo pone Easypanel |

Separados para que publicar la web no corte partidas. `game` lee: `PORT`, `FIREBASE_SERVICE_ACCOUNT`,
`ALLOWED_ORIGINS`, `PROTO` (versión del protocolo).

## 3. Arquitectura del cooperativo

### 3.1 Quién manda en qué

| Cosa | Quién |
|---|---|
| Movimiento propio | Navegador (al momento, sin esperar). El servidor lo **valida** (velocidad máxima, paredes) y, si es imposible, corrige la posición |
| Elegir movimiento activo, mejoras al subir de nivel, fusiones | Navegador manda la orden; el servidor la aplica |
| Ataques: quién da a quién y cuánto | **Servidor** |
| Enemigos (aparición, IA, vida, muerte), objetos del suelo, trampas, altares, cofres, climas, grietas, Sentencia de Arceus | **Servidor** |
| Vida de los jugadores, experiencia y nivel del equipo, reloj, fin de partida | **Servidor** |
| Marca de grupo en el ranking | **Servidor** (cuenta de servicio) |
| Premios de cada uno (monedas, tickets, Pokémon, shinies) | El servidor los anuncia al acabar; cada navegador los guarda en su `saves/{uid}` como hoy (las reglas de guardado no cambian) |

### 3.2 Simulación reutilizando `js/`

El servidor carga los **mismos archivos** de `js/` que el juego, en el mismo orden que
`dev.html`, dentro de un contexto `vm` de Node con `G` propio. Lo que no existe en el servidor se
sustituye por funciones vacías: `G.Audio`, `G.FX`, `G.VFX`, `G.Sprites` (sólo tamaños y
metadatos), `G.Camera` (sin pantalla), `G.UI`, `G.HUD`.

Requisito previo (paso 2 del plan): separar en cada archivo de lógica lo que es **actualizar**
de lo que es **dibujar**, de forma que la lógica no llame a `ctx` ni a sprites. Afecta sobre todo a
`enemy.js`, `combat.js`, `world.js`, `pickup.js`, `projectile.js`, `player.js`, `events.js`,
`rift.js`, `judgment.js`, `hazards.js`, `weather.js`, `levelup.js`, `spawner.js`. Ninguno usa
`document`; las llamadas a sonido y efectos se quedan (en el servidor no hacen nada).

Una sala = una instancia de simulación con semilla propia, a **20 actualizaciones por segundo**
(paso fijo de 50 ms). Los jugadores conectados son `Player` dentro de esa simulación, movidos por
sus órdenes en vez de por el teclado.

### 3.3 Componentes del servidor (`server/`)

| Archivo | Hace | Depende de |
|---|---|---|
| `index.js` | Servidor HTTP + WebSocket (`ws`), `/ws` y `/health`; apagado ordenado | `ws`, `auth`, `lobby` |
| `auth.js` | Verifica el token de Firebase (RS256, claves públicas de Google, `aud = pokesurvivor-662eb`, caducidad). Devuelve el uid | — |
| `lobby.js` | Salas: crear, unirse con código, miembros (máx. 4), líder, abrir/cerrar, empezar, reconexión | `room` |
| `sim.js` | Carga `js/` en un contexto `vm` con los sustitutos; crea simulaciones | `js/` |
| `room.js` | Bucle de una partida: aplica órdenes, avanza la simulación, valida movimiento, arma las instantáneas por jugador, detecta el final | `sim`, `proto`, `rank` |
| `proto.js` | Codifica/decodifica mensajes binarios. **Compartido** con el navegador (`js/net/proto.js`) | — |
| `rank.js` | Escribe la marca de grupo en Firestore (`lb/{tabla}/e/{id}` y el resumen `lbs/{tabla}`) con la REST API y la cuenta de servicio | — |
| `Dockerfile` | Node 20 alpine; copia `server/` y los `js/` necesarios | — |

### 3.4 Protocolo

Conexión: `wss://poke.sergioveloza.com/ws`. Primer mensaje del navegador:
`hello { token, proto, name, dex, shiny }`. Si `proto` no coincide → `bye { reason: 'update' }`
y el juego pide recargar (lo hace `updater.js` en el menú).

Navegador → servidor (texto JSON salvo `in`):
- `create`, `join { code }`, `leave`, `open { v }`, `start` (sólo el líder)
- `in` (binario, ~15/s): secuencia, posición propia, dirección, movimiento activo
- `pick { choice }` (mejora/fusión), `hold { on }` (pausa para elegir fusión)

Servidor → navegador:
- `room { code, leader, members, open }`, `started { seed, members }`
- `snap` (binario, ~10/s por jugador): reloj, nivel/XP del equipo, jugadores (posición, vida,
  animación), **enemigos cercanos** (radio ~950 px, sólo los cambios desde la última
  instantánea confirmada), proyectiles enemigos, objetos del suelo, y la última secuencia de
  `in` aplicada (para corregir la posición propia sin saltos)
- `ev [...]` eventos sueltos (números de daño, efectos, frases, shiny, cofres…)
- `level { options }`, `over { results }`, `bye { reason }`

El navegador interpola enemigos y compañeros entre instantáneas (100 ms de retraso) y dibuja
su propio Pokémon al momento; cuando llega la posición validada, corrige suavemente.

### 3.5 Salas y amigos

- La sala vive en el servidor, en memoria. Código corto (6 caracteres) para unirse.
- Firestore sigue llevando apodos, amigos, "en línea" (`pres`) e invitaciones (`inv`); el campo
  `room` de la invitación pasa a ser el código de la sala del servidor.
- Líder: el primero; si se va, pasa al siguiente. Sólo el líder empieza y abre/cierra la sala.
- Reconexión: si se corta, el jugador tiene 20 s para volver con el mismo uid y recupera su
  sitio (su Pokémon se queda quieto mientras). Pasado ese tiempo, queda fuera de la partida.
- Si la sala se queda sin nadie conectado, se cierra.

### 3.6 Ranking de grupo

- El servidor mide el tiempo con su propio reloj de simulación y conoce los uids reales.
- Al acabar, `rank.js` escribe la marca (mismo formato que hoy) con la cuenta de servicio, que
  salta las reglas. Antes comprueba que ningún miembro tenga `saves/{uid}.sus == true` (si lo
  tiene, esa partida no sube).
- `firestore.rules`: las tablas de grupo (`board` que no empieza por `s_`) dejan de aceptar
  escrituras de navegadores. Las de solitario siguen igual. Se corrige además `addMine` para
  comprobar también `shiny`, `lv` y `kills`.

### 3.7 Despliegues sin cortar partidas

- `PROTO` es un número que sube sólo cuando cambia el protocolo o la jugabilidad compartida.
  `tools/build.js` lo escribe en `version.json` junto a la huella; el cliente lo manda en `hello`.
- Al recibir `SIGTERM` (redespliegue en Easypanel), `game` deja de aceptar salas nuevas
  (`bye { reason: 'restart' }` a quien intente crear o unirse) y espera a que acaben las
  partidas en marcha, como mucho 40 min (la Sentencia acaba hacia el minuto 31-32). En
  Easypanel el tiempo de parada del servicio se sube a 45 min.
- Riesgo aceptado: Easypanel para el contenedor viejo antes de arrancar el nuevo, así que
  mientras el viejo termina sus partidas **no se pueden crear salas nuevas** (como mucho 40 min
  tras un despliegue de `game`). Se publica `game` sólo cuando cambie de verdad.

## 4. Errores y límites

- Token inválido o caducado → `bye { reason: 'auth' }`; el juego renueva el token y reintenta una vez.
- Mensajes: tamaño máximo 4 KB; más de 40 mensajes/s por conexión → se corta esa conexión.
- Máximo de salas a la vez (`MAX_ROOMS`, empieza en 30 y se ajusta tras la prueba de carga). Si
  se llega, `bye { reason: 'full' }` y el juego dice "servidor lleno, prueba en un rato".
- Un fallo en la simulación de una sala cierra **sólo esa sala** (`over` con lo conseguido hasta
  entonces) y se registra; el resto sigue.
- Sin conexión con el servidor: el botón de cooperativo dice que no está disponible; el solitario
  funciona igual.

## 5. Coste y capacidad (estimaciones a comprobar)

- CPU: una sala de 4 con varios cientos de enemigos a 20 Hz se estima en 2-5 % de un vCPU →
  20-40 salas en un VPS de 1-2 vCPU. Se confirma en la prueba de carga.
- RAM: ~30-60 MB por sala (sobre todo `sprites-meta`, que se carga una sola vez y se comparte).
- Tráfico: con binario y sólo enemigos cercanos, objetivo ≤ 3 KB por instantánea → ~30 KB/s
  por jugador → ~430 MB por jugador y hora de juego. Comparar con el tráfico mensual del plan.

## 6. Pruebas

- **Simulación sin pantalla** (`server/test/sim.test.js`): sala de 4 bots que se mueven solos
  hasta la Sentencia sin errores; dos ejecuciones con la misma semilla y las mismas órdenes dan
  el mismo resultado.
- **Protocolo** (`proto.test.js`): codificar → decodificar da lo mismo, para cada mensaje.
- **Validación**: un `in` con salto imposible o atravesando una pared se corrige.
- **Reglas** (emulador de Firestore): un navegador no puede escribir en tablas de grupo; sí en
  las de solitario como antes.
- **Carga** (`server/tools/load.js`): N salas de 4 bots contra el VPS; se mide CPU, RAM y
  tráfico por sala y se fija `MAX_ROOMS`.
- **Manual**: dos navegadores con `dev.html` contra `node server` en local; luego en
  `poke.sergioveloza.com`.
- **Sin cambios visibles** tras separar lógica y dibujo: partida en solitario con semilla fija,
  comparar capturas y el resumen final antes/después.

## 7. Orden de trabajo

Cada paso deja el juego funcionando:

1. **Copia propia**: `js/config.js`, tu Firebase (app web, Firestore, Auth, reglas), quitar lo del
   original, `nginx.conf` con el dominio nuevo, desplegar `web`. El juego funciona en
   `poke.sergioveloza.com` con el cooperativo antiguo (WebRTC sin TURN).
2. **Separar lógica y dibujo** en `js/`, sin cambios visibles.
3. **Servidor** `server/` en local con bots, pruebas de simulación, protocolo y validación.
4. **Cliente nuevo**: `net.js`/`coop.js` por WebSocket, salas en el servidor, ranking de grupo
   escrito por el servidor, reglas cerradas para grupo.
5. **Desplegar `game`** en Easypanel, prueba de carga, ajustar `MAX_ROOMS`, retirar WebRTC y
   Realtime Database.

## 8. Normas que cambian para esta copia

`CLAUDE.md` se reescribe para la copia: proyecto `pokesurvivor-662eb`, dominio
`poke.sergioveloza.com`, publicación en Easypanel (servicios `web` y `game`), sin Worker ni TURN.
Se mantienen: editar `dev.html` y no `index.html`, `version.json` + `updater.js`, changelog en
español e inglés, nunca Identity Platform, commits sin firma de IA.
