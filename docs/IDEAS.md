# Ideas

> Toda nueva idea que implique nuevos cambios debe seguir los principios SOLID y DRY

### Modo Rumble

Se empieza con Pokémon comunes: al arrancar se elige uno de tres al azar. Cada 10 niveles se puede evolucionar, si tiene evolución, o cambiar a otro Pokémon. La rareza se mueve con el nivel: en el 10 un común sale cerca del 95 %; en el 100, cerca del 1 %. El 100 se trata como el techo de esa curva.

Documentado en docs/RUMBLE.md

### Modo Arena

Un modo JcJ por rondas. Entre enfrentamientos cada jugador farmea en su propio mundo; cada 2 minutos los mundos se cruzan y hay un combate. Gana quien aguante más rondas o quien deje al rival fuera.

## Nuevas
- Nuevo poder: Zoom Out se aleja un 10% la camara
- Shader CTR
- investigar bugs de desconexion
- agregar unirse a partida en el menu amigos
- nuevo modo: uno para todos en coop
- Boton subir al maximo en mejoras
- Nuevo conjunto de poderes para sanar aliados
- Nuevo modo de juego combinar hasta 6 combinaciones
- Nuevo modo de juego craft
- nuevo stats maximo historico de maximo de daño / maximo cofres / maximo numero de veces revividos en una nueva pestaña del ranking

Falta por implementar:

Esferas

Ahora están apagadas en el servidor (G.Orbs.enabled = false). Para activarlas:
- Objetos en el suelo: el snap sólo manda el tipo del objeto, no cuál de las 6 esfe al final de PICK_KINDS y mandar el número de esfera (un byte más por objeto, o un tipo por esfera).
- Bolsa: al recogerla, el servidor la mete en la bolsa de ese jugador. Hay que man y avisar al cogerla, para que salga el texto que explica qué hace.
- Usarla: orden nueva del navegador al servidor, orb{i} con el hueco. El servidor comprueba que la tiene y la recarga.
- Cambiar js/systems/orbs.js:
  - La recarga (cd) y la esfera elegida (sel) son únicas para todo el archivo; tienen que ir por jugador.
  - foe() usa la cámara del navegador para saber qué ve el que la lanza; en el serión y el zoom de ese jugador.
  - nearBuff() sólo da la mejora a G.Game.player; tiene que dársela a cada compañero cercano.
- Efectos:
  - Focosfera y Rapidosfera: el servidor las aplica y la velocidad nueva ya viaja en kit.
  - Luminosfera: sólo aleja la cámara del cliente, así que hace falta un evento pae. Hay que comprobar que con la cámara más lejos sigue llegando todo lo que se ve(radio de 950).
- Cliente: en grupo, Orbs.use manda la orden en vez de aplicarla, y el HUD enseña .
- Protocolo: sube VERSION. Pruebas de coger, usar, recarga y mejora a compañeros.