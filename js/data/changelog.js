/* ============ changelog.js — novedades del juego ============
 * Lo que ve la gente en el botón "Novedades" de la barra de arriba: cambios
 * de juego y fallos arreglados (nada de servidores ni bases de datos).
 * La fecha más nueva, arriba. En cada fecha, por apartados:
 *   new  lo nuevo · chg  cambios y ajustes · fix  fallos arreglados
 * Cada línea en español y en inglés.
 */
G.CHANGELOG = [
  { d: '2026-10-25', title: ['Tickets y Pokémon iguales en todos tus aparatos', 'The same tickets and Pokémon on all your devices'], new: [
    ['Al acabar la partida, sola o en grupo, sale el resumen: cada ataque con el daño que ha hecho y su daño por segundo, el daño total y tu objeto. En grupo, también el de cada compañero, con una pestaña por jugador (además de la tabla con los números de cada uno).',
     'When a run ends, solo or in a group, you get the summary: each move with the damage it dealt and its damage per second, your total damage and your item. In a group, also each teammate’s, with one tab per player (on top of the table with each player’s numbers).'],
    ['Móvil: vuelve «Apuntar a mano» (Ajustes → Accesibilidad), ahora con un segundo joystick: el dedo en la mitad derecha de la pantalla apunta tus ataques y el de la izquierda te mueve. Al soltarlo, vuelven a apuntar solos.',
     'Mobile: "Manual aim" is back (Settings → Accessibility), now with a second joystick: your finger on the right half of the screen aims your moves and the one on the left moves you. When you lift it, they aim on their own again.'],
    ['Grupo: al caer puedes mirar a un compañero vivo mientras esperas a que te levanten (botón «Ver a un compañero», Q / E o LB / RB) y ves a los enemigos de su alrededor. Al levantarte, o si él cae, vuelves a ti.',
     'Group: when you are down you can watch a teammate who is still standing while you wait to be revived ("Watch a teammate" button, Q / E or LB / RB) and you see the enemies around them. When you get back up, or if they go down, you are back on yourself.'],
    ['Mejoras: botón «Mejorar todo» arriba a la derecha, que dice cuántas Pokémonedas cuesta subir al máximo todas las mejoras del Pokémon elegido y las compra de una vez.',
     'Upgrades: "Upgrade all" button at the top right, which shows how many PokéCoins it costs to max out every upgrade of the selected Pokémon and buys them all at once.'],
    ['Grupo: tu Pokémon juega con su naturaleza, su habilidad (también la oculta), sus MT (salen en las cartas y de movimiento inicial) y el segundo movimiento inicial que hayas elegido, como en solitario. Se toman de tu partida guardada en la nube. Los avisos como «¡Esquiva!» o «¡Robustez!» se ven también en grupo.',
     'Group: your Pokémon plays with its nature, its ability (the hidden one too), its TMs (they show up in the cards and as a starting move) and the second starting move you chose, like in solo. They come from your cloud save. Notices like "Dodge!" or "Sturdy!" also show in a group.']
  ], chg: [
    ['Ranking por Pokémon: ahora cuentan las partidas de 10 minutos o más (antes 5). Los demás rankings siguen desde 2 minutos.',
     'Per-Pokémon ranking: runs now count from 10 minutes (it was 5). The other rankings still count from 2 minutes.'],
    ['Perfil público: tus récords y medallas les llegan a los demás como mucho cada 6 horas (antes cada 2). Tú los ves siempre al momento.',
     'Public profile: your records and medals reach other players at most every 6 hours (it was every 2). You always see them right away.']
  ], fix: [
    ['Móvil: con las cartas de nivel, de objeto o de vínculo abiertas ya puedes coger el joystick tocando fuera del recuadro, y al cerrarse sales andando sin tener que levantar el dedo, como con el teclado o el mando.',
     'Mobile: with the level-up, item or bond cards open you can now grab the joystick by touching outside the box, and when they close you walk off without lifting your finger, like with a keyboard or controller.'],
    ['Móvil en vertical: en la barra de arriba no se veían las monedas, los tickets ni tu nombre (con tantos botones no cabía y se salía por la izquierda). Ahora va en dos líneas y se ve todo.',
     'Mobile in portrait: the top bar did not show your coins, tickets or name (with so many buttons it did not fit and went off the left edge). Now it uses two lines and everything is visible.'],
    ['Gacha con mando: al pasar las animaciones pulsando A seguido, se volvía a tirar sin querer (tras «Continuar» quedaba elegido el botón de tirar) y se gastaban tickets a montones. Ahora los botones de tirar nunca se eligen solos: hay que ir a ellos.',
     'Gacha with a controller: skipping the animations by pressing A repeatedly pulled again by accident (after "Continue" the pull button was selected) and tickets were spent in bulk. Now the pull buttons are never selected on their own: you have to move to them.'],
    ['Gacha con mando: ya se pueden elegir «Saltar» y «Continuar» en la tirada (B también continúa).',
     'Gacha with a controller: you can now select "Skip" and "Continue" during a pull (B also continues).'],
    ['Esferas con mando: en cada casilla pone X (usar la elegida) o Y (pasar a otra) en vez de las teclas 5-8 del teclado.',
     'Orbs with a controller: each slot now shows X (use the selected one) or Y (switch) instead of the keyboard keys 5-8.'],
    ['Guardado en la nube: si conseguías tickets, monedas o Pokémon en un aparato y mientras tanto guardabas en otro, al volver al primero el juego creía que ya estaba todo guardado («Ya está todo guardado en la nube») y no lo subía: en el otro aparato no aparecían. Ahora se mira lo que falta de verdad y Guardar lo sube.',
     'Cloud save: if you got tickets, coins or Pokémon on one device and saved on another one in the meantime, back on the first one the game thought everything was already saved ("Everything is already saved in the cloud") and did not upload it, so it never showed up on the other device. Now it checks what is really missing and Save uploads it.'],
    ['Guardado en la nube: después de gastar en un aparato tickets o monedas que ya se habían gastado en otro, los tickets podían ir creciendo solos cada vez que guardabas, y luego bajar de golpe en el otro aparato. Ahora el saldo es el mismo en todos, y lo que ganes después no se descuenta.',
     'Cloud save: after spending on one device tickets or coins that had already been spent on another, your tickets could keep growing on their own every time you saved, and then suddenly drop on the other device. Now the balance is the same everywhere, and nothing you earn afterwards is taken away.'],
    ['Guardado en la nube: si al abrir el juego aún no había conexión (pasa a veces en el móvil), se jugaba con la copia guardada en ese aparato, que podía ser vieja, hasta pulsar Guardar: faltaba lo conseguido en otros aparatos. Ahora, en cuanto vuelve la conexión, se trae lo de la nube y se junta con lo tuyo.',
     'Cloud save: if there was no connection yet when the game opened (it sometimes happens on phones), you played with the copy stored on that device, which could be old, until you pressed Save: what you got on other devices was missing. Now, as soon as the connection is back, the cloud copy is brought in and merged with yours.'],
    ['Sentencia de Arceus: yendo muy rápido se podía salir de la arena, y ahí ni Arceus ni los legendarios te alcanzaban: se aguantaba para siempre. Ahora nadie sale de la arena.',
     'Arceus\'s Judgment: going very fast you could get out of the arena, where neither Arceus nor the legendaries could reach you, so you survived forever. Now nobody leaves the arena.'],
    ['Ranking: las mejores partidas (las de más de 12 derrotados por segundo) no se subían nunca, sin ningún aviso: el servidor las rechazaba enteras. Ahora siempre se suben.',
     'Ranking: the best runs (more than 12 defeated per second) were never uploaded, without any warning: the server rejected them entirely. Now they are always uploaded.'],
    ['Ranking: el semanal, el mensual y el histórico ya cuadran entre sí. Cada uno se cargaba por su cuenta y el histórico podía no tener todavía una marca que ya salía en el semanal.',
     'Ranking: weekly, monthly and all-time now match each other. Each one was loaded separately and all-time could still be missing a time already shown in weekly.'],
    ['Ranking de amigos: en diario, semanal y mensual sólo salen los amigos que están en el top 50; ahora lo dice en vez de «Todavía no hay marcas aquí». En Histórico salen todos.',
     'Friends ranking: daily, weekly and monthly only show friends who are in the top 50; it now says so instead of "No records here yet". All-time shows everyone.'],
    ['Ranking histórico: si tu marca no entraba en el top 50, el ranking seguía enseñando la vieja durante horas, y al mirar tu puesto una partida peor podía sustituir a la mejor que aún no se había subido. Ahora sale tu mejor marca al momento y no se pierde.',
     'All-time ranking: if your time did not make the top 50, the ranking kept showing your old one for hours, and checking your rank could let a worse run replace the better one that had not been uploaded yet. Now your best time shows up right away and is never lost.'],
    ['Con el juego abierto en dos pestañas del mismo navegador, lo conseguido o gastado en una ya no se pierde al usar la otra: las dos se pasan los cambios al momento.',
     'With the game open in two tabs of the same browser, what you get or spend in one is no longer lost when you use the other: both share their changes right away.']
  ]},
  { d: '2026-10-24', title: ['Ataques en la colección y ventanas del menú', 'Moves in the collection and menu windows'], chg: [
    ['Colección: los iconos de los ataques que puede aprender cada Pokémon son el doble de grandes y, al pasar el ratón (o al tocarlos en el móvil), dicen su tipo, si es físico o especial y lo que hace.',
     'Collection: the icons of the moves each Pokémon can learn are twice as big and, when you hover over them (or tap them on mobile), they show their type, whether they are physical or special, and what they do.'],
    ['Las ventanas del menú, Ajustes, Novedades y Apoyar se pueden cerrar pulsando fuera de ellas, además de con Volver o Cerrar.',
     "The menu windows, Settings, What's new and Support can be closed by clicking outside them, as well as with Back or Close."]
  ], fix: [
    ['Las ventanas de la Tienda Kecleon y de Novedades ya no se meten por debajo de la barra de arriba: ahora empiezan debajo de ella, como las demás.',
     "The Kecleon Shop and What's new windows no longer slide under the top bar: they now start below it, like the other windows."]
  ] },
  { d: '2026-10-23', title: ['Ranking de daño a Arceus y Tablas', 'Arceus damage ranking and Plates'], new: [
    ["Ranking partido en dos: a la izquierda, el daño que le has hecho a Arceus; a la derecha, el tiempo aguantado, como siempre. Las dos mitades se cargan a la vez. Todas las tablas empiezan de cero.",
     "The ranking is now split in two: on the left, the damage you dealt to Arceus; on the right, the time survived, as always. Both halves load at once. Every board starts from zero."],
    ["Sentencia de Arceus: ahora se le puede pegar. Es invencible y sólo recibe una pequeña parte del daño (cada vez menos), y los ataques le apuntan cuando no queda ningún legendario.",
     "Arceus's Judgment: you can now hit it. It is invincible and only takes a small part of the damage (less and less over time), and your attacks aim at it when no legendary is left."],
    ["Tablas: en cada partida Arceus lleva una al azar, que le da su tipo (se avisa al entrar en la arena). Ya no hay un tipo de ataque que sea siempre el mejor.",
     "Plates: in every run Arceus holds a random one, which gives it its type (you are told when you enter the arena). No move type is always the best anymore."]
  ], chg: [
    ["En el minuto 35, Arceus rompe el objeto de todos (Banda Focus incluida).",
     "At minute 35, Arceus breaks everyone's item (Focus Sash included)."],
    ["Los legendarios de la Sentencia ya no son el doble de fuertes que el anterior: cada uno tiene un 25 % más de vida y un 15 % más de daño, así que se pueden tumbar. Ya no hay límite de 45 minutos en el ranking.",
     "The Judgment legendaries are no longer twice as strong as the previous one: each one has 25% more HP and 15% more damage, so they can be taken down. There is no 45-minute limit in the ranking anymore."],
    ['Los movimientos evolucionados ya no cambian de nombre: se llaman igual con un «+» (Puño Meteoro pasa a Puño Meteoro +). Hacen lo mismo que antes y se siguen distinguiendo por el borde dorado.',
     'Evolved moves no longer change their name: they keep it with a "+" (Meteor Mash becomes Meteor Mash +). They work just like before and still stand out with their golden border.'],
    ["Puño Meteoro pega menos: 24 de daño en vez de 34 y una zona un poco más pequeña. Al máximo y evolucionado hacía casi el doble que Avalancha; ahora están a la par.",
     "Meteor Mash hits softer: 24 damage instead of 34 and a slightly smaller area. Maxed and evolved it dealt almost twice as much as Rock Slide; now they are on par."],
    ["En la Sentencia de Arceus, el veneno y las quemaduras quitan poco y siempre lo mismo a los legendarios (antes el veneno quitaba un % de su vida): envenenar y huir ya no sirve, hay que pegarles.",
     "In Arceus's Judgment, poison and burns deal a small, fixed amount to the legendaries (poison used to take a % of their HP): poisoning them and running away no longer works, you have to hit them."]
  ] },
  { d: '2026-10-22', title: ['Esferas de Mundo Misterioso, Amuletos Iris y gacha ×100', 'Mystery Dungeon orbs, Shiny Charms and ×100 gacha'], new: [
    ['Esferas de Mundo Misterioso: objetos de un solo uso que se encuentran durante la partida (cofres, jefes y, a veces, al derrotar a un Pokémon). Soporesfera, Ralentosfera y Rafagaesfera duermen, frenan o lanzan lejos a los enemigos; Focosfera, Luminosfera y Rapidosfera te dan crítico, más campo de visión o velocidad a ti y a los compañeros cercanos. Llevas hasta 4 distintas (3 de cada) y se usan con las teclas 5-8, tocando su casilla encima de los ataques o con X / Y en el mando. A los jefes y legendarios les afectan menos. En esta copia, de momento, no salen en el cooperativo.',
     'Mystery Dungeon orbs: single-use items you find during the run (chests, bosses and sometimes when you defeat a Pokémon). Slumber Orb, Slow Orb and Blowback Orb put enemies to sleep, slow them down or blow them away; Focus Orb, Luminous Orb and Quick Orb give critical hits, a wider view or speed to you and nearby teammates. You carry up to 4 different ones (3 of each) and use them with keys 5-8, by tapping their slot above your moves, or with X / Y on a controller. Bosses and legendaries are less affected. On this server they do not show up in co-op yet.'],
    ['Amuletos Iris: uno por región (Kanto, Johto, Hoenn, Sinnoh, Teselia, Kalos, Alola, Galar y Paldea). Al completar la Pokédex de una región (legendarios incluidos) te dan su Amuleto Iris y en su banner del gacha los shiny salen el doble: del 1 % al 2 %. Los tienes en la Mochila, con lo que te falta para cada uno. Si ya habías completado alguna región, el suyo ya es tuyo.',
     'Shiny Charms: one per region (Kanto, Johto, Hoenn, Sinnoh, Unova, Kalos, Alola, Galar and Paldea). Complete a region\'s Pokédex (legendaries included) to get its Shiny Charm, and shinies become twice as likely in its gacha banner: from 1% to 2%. You can find them in your Bag, along with how many you still need for each one. If you had already completed a region, its charm is already yours.'],
    ['Gacha: nueva tirada ×100, con 100 tickets normales o con 10 tickets ×10 (son diez ×10 seguidas, cada una con su Épica asegurada). La tragaperras gira 10 veces enseñando lo mejor de cada ×10 y al final ves un resumen (nuevos, shiny y Pokémonedas) con las cartas de mejor a peor. Para que quepa, ya no está la tirada ×1: se tira de 10, de 20 o de 100 (la ×20 de esta copia se queda).',
     'Gacha: new ×100 pull, with 100 normal tickets or with 10 ×10 tickets (ten ×10 pulls in a row, each with its guaranteed Epic). The slot machine spins 10 times showing the best of each ×10, and at the end you get a summary (new, shiny and PokéCoins) with the cards sorted from best to worst. To make room, the ×1 pull is gone: you pull 10, 20 or 100 at a time (this server keeps its ×20).'],
    ['Gacha: botón Saltar (o Esc) durante la animación: se acaba la tragaperras y salen todas las cartas de golpe.',
     'Gacha: Skip button (or Esc) during the animation: the slot machine ends and all the cards show up at once.']
  ]},
  { d: '2026-10-21', title: ['La gran actualización: Tienda Kecleon', 'The big update: Kecleon Shop'], new: [
    ['Mejora nueva: Tienda Kecleon (botón en el menú) con Mentas, Cápsulas Habilidad y 8 MT nuevas cada día. Cada Pokémon tiene ahora su naturaleza (±10 % a dos stats) y su habilidad, con efecto en la partida; se ven y se cambian en su ficha de la colección. Las MT enseñan para siempre ataques de fuera de sus tipos, pero sólo si los aprende en los juegos (Mewtwo puede aprender Bola Sombra; Psyduck no puede aprender Lanzallamas). Gracias a TheAdro7 por la idea y el trabajo de base. En esta copia, la naturaleza y la habilidad cuentan en solitario; en el cooperativo y en el Desafío diario, de momento, el Pokémon va tal cual.',
     'New: the Kecleon Shop (button in the menu) with Mints, Ability Capsules and 8 new TMs every day. Every Pokémon now has its own nature (±10% to two stats) and ability, with an effect in the run; you can see and change them on its page in the collection. TMs permanently teach moves outside its types, but only if it learns them in the games (Mewtwo can learn Shadow Ball; Psyduck cannot learn Flamethrower). Thanks to TheAdro7 for the idea and the groundwork. On this server, nature and ability count in solo runs; in co-op and in the Daily challenge the Pokémon plays as is for now.'],
    ['Mejora nueva, Segundo movimiento inicial: con Repertorio, se compra una vez por Pokémon y luego eliges gratis el segundo ataque con el que empiezas (o lo dejas al azar).',
     'New upgrade, Second starting move: with Repertoire, buy it once per Pokémon and then choose for free the second move you start with (or leave it random).'],
  ] },
  { d: '2026-10-20', title: ['Físico y especial, mando, 38 ataques nuevos y más idiomas', 'Physical and special, controller, 38 new moves and more languages'], new: [
    ['Ataques físicos y especiales, como en los juegos: cada Pokémon tiene su Ataque, Ataque Especial, Defensa y Defensa Especial. Los ataques físicos pegan con su Ataque y los especiales con su Ataque Especial: Machamp pega fuerte con Golpe Kárate y flojo con Bola Sombra. Con los de su lado bueno pega lo mismo que antes. Al subir de nivel, cada carta dice si el ataque es físico o especial y cuánto rinde con tu Pokémon, y en la colección se ven todas sus estadísticas.',
     'Physical and special moves, like in the games: every Pokémon has its Attack, Special Attack, Defense and Special Defense. Physical moves use its Attack and special moves its Special Attack: Machamp hits hard with Karate Chop and weakly with Shadow Ball. With moves on its strong side it hits as hard as before. When leveling up, each card says whether the move is physical or special and how well it works with your Pokémon, and the collection shows all its stats.'],
    ['Danza Espada y Danza Dragón suben sólo el Ataque (físico), como en los juegos, y llega Maquinación, que sube el Ataque Especial y la puede aprender cualquier Pokémon. Al subir de nivel, los ataques del lado bueno de tu Pokémon salen el doble de a menudo.',
     'Swords Dance and Dragon Dance now raise only (physical) Attack, like in the games, and Nasty Plot arrives, raising Special Attack, learnable by any Pokémon. When leveling up, moves on your Pokémon’s strong side show up twice as often.'],
    ['Resumen de la partida en la pausa: cada ataque con su categoría, el daño que lleva hecho y su daño por segundo; tus estadísticas con todo lo que has subido; y el objeto y las cartas de mejora que llevas.',
     'Run summary in the pause screen: each move with its category, the damage it has dealt and its damage per second; your stats with everything you have raised; and your item and the upgrade cards you have.'],
    ['Las defensas también cuentan (un poco): los enemigos se defienden de tus ataques físicos con su Defensa y de los especiales con su Defensa Especial, y cada enemigo te pega con su lado fuerte, que paras con tu Defensa o tu Defensa Especial.',
     'Defenses count too (a little): enemies resist your physical moves with their Defense and special moves with their Special Defense, and each enemy hits you with its strong side, which you block with your Defense or Special Defense.'],
    ['Ya se puede jugar con mando (Xbox, PlayStation, Switch y la mayoría de mandos USB o Bluetooth): moverte, cambiar de ataque, pausar, elegir cartas y manejar todos los menús, con vibración al recibir daño. Se configura en Ajustes > Controles.',
     'You can now play with a controller (Xbox, PlayStation, Switch and most USB or Bluetooth controllers): move, switch attacks, pause, pick cards and use every menu, with vibration when you take damage. Set it up in Settings > Controls.'],
    ['Colección: buscador por nombre o número, pestaña con todas las generaciones, filtros que se combinan (tengo / me faltan, varias rarezas a la vez, shiny, favoritos y tipo) y orden por número, nombre, rareza, recién conseguidos o más usados. Y favoritos: márcalos en la ficha de cada Pokémon; van con tu cuenta, en todos tus aparatos.',
     'Collection: search by name or number, a tab with every generation, filters that combine (owned / missing, several rarities at once, shiny, favorites and type) and sorting by number, name, rarity, recently caught or most played. Plus favorites: mark them on each Pokémon’s page; they go with your account, on all your devices.'],
    ['Nueva pestaña Accesibilidad en Ajustes con «Apuntar a mano»: tus ataques van hacia el ratón o hacia donde empujes el stick derecho del mando, en vez de al enemigo más cercano. Viene desactivado.',
     'New Accessibility tab in Settings with “Manual aim”: your attacks go towards the mouse or wherever you push the controller’s right stick, instead of the nearest enemy. It is off by default.'],
    ['Botón Guardar arriba a la derecha: sube tu partida a la nube al momento. Úsalo antes de cerrar el juego o de cambiar de aparato.',
     'Save button at the top right: it uploads your game to the cloud right away. Use it before closing the game or switching devices.'],
    ['38 ataques nuevos: ahora todos los tipos tienen 5 o más (Roca, Lucha, Dragón y Hada tenían sólo 2). Entre ellos Hiperrayo, Rayo Solar, Magnitud, Torbellino, Onda Trueno, Enfado, Carantoña, Golpe Bajo... cada uno con su evolución.',
     '38 new moves: every type now has 5 or more (Rock, Fighting, Dragon and Fairy had only 2). Among them Hyper Beam, Solar Beam, Magnitude, Whirlpool, Thunder Wave, Outrage, Play Rough, Sucker Punch... each with its evolution.'],
    ['Formas nuevas de atacar: disparos que persiguen al enemigo o rebotan entre ellos, rayos que se cargan, giros que golpean todo alrededor, ondas que avanzan por el suelo, remolinos que atraen a los enemigos, ondas que los apartan y zonas que los dejan aturdidos.',
     'New ways to attack: shots that chase enemies or bounce between them, beams you charge up, spins that hit everything around you, shockwaves that travel along the ground, vortexes that pull enemies in, waves that push them away and zones that stun them.'],
    ['Mejora nueva, Movimiento inicial: se compra una vez por Pokémon y luego eliges gratis con qué ataque empieza la partida (también en grupo).',
     'New upgrade, Starting move: buy it once per Pokémon and then choose for free which move it starts the run with (in co-op too).'],
    ['Idiomas nuevos: francés, italiano, portugués de Brasil, chino simplificado y chino tradicional, en Ajustes > Gráficos > Idioma. Gracias a quienes los tradujeron.',
     'New languages: French, Italian, Brazilian Portuguese, Simplified Chinese and Traditional Chinese, in Settings > Graphics > Language. Thanks to everyone who translated them.']
  ], chg: [
    ['Las cartas de nivel, de vínculo y de objeto no se pueden elegir durante un momento al aparecer (se ven apagadas): pulsar 1-4 o tocar la pantalla para cambiar de ataque en plena pelea ya no elige una carta sin querer.',
     'Level-up, bond and item cards can’t be picked for a moment after they appear (they look dimmed): pressing 1-4 or tapping to switch attacks mid-fight no longer picks a card by accident.'],
    ['Con mando ya se pueden elegir en la colección los Pokémon que aún no tienes, y en el móvil las pestañas de Ajustes caben en una fila que se desliza.',
     'With a controller you can now select the Pokémon you don’t have yet in the collection, and on mobile the Settings tabs fit in one row that scrolls sideways.'],
    ['Ranking histórico: si estás por debajo del puesto 1.000, sale «#1000+» en vez del número exacto.',
     'All-time leaderboard: if you are below rank 1,000, it shows “#1000+” instead of the exact number.'],
    ['Los Pokémon grandes (Onix, Gyarados, Wailord, Eternatus, los legendarios...) ya se pueden jugar bien: se ven algo más pequeños, aunque siguen siendo de los más grandes, y chocan como uno normal, así que caben por todos los pasillos y no reciben más golpes por su tamaño.',
     'Big Pokémon (Onix, Gyarados, Wailord, Eternatus, the legendaries...) are now properly playable: they look a bit smaller, while still being among the biggest, and collide like a normal one, so they fit through every corridor and don’t take extra hits because of their size.'],
    ['Como mucho hay 3 curanderos, 3 escuderos y 3 invocadores a la vez.',
     'There are at most 3 healers, 3 shielders and 3 summoners at a time.'],
    ['Los curanderos y escuderos ya no hacen inmatable a un jefe: lo que le curan y el escudo que le ponen van con el daño que le estás haciendo, y sólo recibe un escudo cada 6 segundos.',
     'Healers and shielders no longer make a boss unkillable: their healing and shields scale with the damage you are dealing to it, and it only gets one shield every 6 seconds.'],
    ['Sentencia de Arceus: la velocidad tiene un tope suave (lo que pase de cierto punto cuenta mucho menos) y los legendarios corren casi tanto como tú. Desde los 5 minutos de Sentencia Arceus acelera sin parar, y desde los 7 su toque quita cada vez más vida, hasta dejarte KO de un golpe hacia el minuto 40.',
     'Judgment of Arceus: speed has a soft cap (anything above a certain point counts much less) and legendaries run almost as fast as you. After 5 minutes of Judgment, Arceus keeps speeding up, and after 7 its touch takes more and more HP, until it knocks you out in one hit around minute 40.'],
    ['El veneno sigue quitando un porcentaje de la vida, pero contra enemigos con muchísima vida (los legendarios de la Sentencia) ese porcentaje es menor.',
     'Poison still takes a percentage of HP, but against enemies with huge HP (the Judgment legendaries) that percentage is smaller.'],
    ['Todos los rankings empiezan de cero (hoy, semana, mes, año e histórico): las marcas de huir de Arceus ya no se podrían alcanzar.',
     'All leaderboards start from scratch (daily, weekly, monthly, yearly and all-time): records from running away from Arceus could no longer be reached.'],
    ['Los Pokémon de un solo tipo pegan un 20 % más con los ataques de su tipo, para compensar que tienen menos variedad.',
     'Single-type Pokémon deal 20% more damage with moves of their type, to make up for having less variety.'],
    ['Al aprender un ataque nuevo ya no se cambia solo a él: sigues con el que estabas usando y cambias cuando tú quieras.',
     'Learning a new move no longer switches to it on its own: you keep the one you were using and switch whenever you want.'],
    ['El juego sólo se puede jugar en su propia web: si otra web lo mete dentro de la suya (por ejemplo, para ponerle anuncios alrededor), sale un aviso con un botón para venir aquí.',
     'The game can only be played on its own website: if another site embeds it in its own page (for example, to put ads around it), a notice appears with a button to come here.'],
    ['En el móvil ya no está la opción «Apuntar a mano» (no funcionaba con la pantalla táctil): los ataques siempre apuntan solos.',
     'On mobile the "Manual aim" option is gone (it did not work with the touch screen): moves always aim on their own.'],
    ['Ranking por Pokémon: ahora cuentan las partidas de 5 minutos o más (los demás rankings siguen desde 2 minutos).',
     'Per-Pokémon leaderboard: runs now count from 5 minutes on (the other leaderboards still from 2 minutes).']
  ], fix: [
    ['Seguridad: se ha cerrado un agujero por el que alguien podía meter código en su fila del ranking o en su perfil y hacer que se ejecutara en el navegador de quien los abría (a algunos les llevaba a un vídeo). Ahora todo lo que viene de otros jugadores se limpia, el servidor sólo deja guardar lo que debe, y el navegador no ejecuta nada que no sea del juego.',
     'Security: we closed a hole that let someone put code in their leaderboard row or profile and make it run in the browser of whoever opened them (some people were sent to a video). Now everything coming from other players is cleaned, the server only accepts what it should, and the browser runs nothing that isn’t part of the game.'],
    ['Mejoras: al cambiar de compañero, la pantalla de mejoras se abre ya con el nuevo y no con el último que habías mirado.',
     'Upgrades: after changing your partner, the upgrades screen now opens on the new one instead of the last one you had looked at.'],
    ['Bomba Ácida, Bola Voltio, Bomba Germen, Rayo Señal, Joya de Luz, Bola Neblina, Energibola, Canto Helado, Sombra Vil y Beso Drenaje: al evolucionar, los disparos salían hacia los lados y no daban a nadie. Ahora salen hacia delante, y la mejora «+1 proyectil» ya añade uno (antes no añadía ninguno).',
     'Acid Spray, Electro Ball, Seed Bomb, Signal Beam, Power Gem, Mist Ball, Energy Ball, Ice Shard, Shadow Sneak and Draining Kiss: once evolved, the shots flew off to the sides and hit nothing. Now they go forward, and the "+1 projectile" upgrade really adds one (it added none before).']
  ] },
  { d: '2026-10-18', title: ['Desafío diario', 'Daily challenge'], new: [
    ['Nuevo Desafío diario: en el menú elige «Clásico» o «Desafío diario». Cada día hay un Pokémon y una partida iguales para todo el mundo (mismo mapa y misma suerte; tus mejoras de ese Pokémon cuentan). Sólo hay un intento al día: empieza al pulsar Jugar y, si la partida se corta, se pierde. Necesita cuenta y conexión.',
     'New Daily challenge: in the menu pick “Classic” or “Daily challenge”. Every day there’s one Pokémon and one run that are the same for everyone (same map and same luck; your upgrades for that Pokémon count). You get one try per day: it starts when you press Play and, if the run gets cut off, it’s lost. Needs an account and a connection.'],
    ['El desafío tiene su propia tabla en el Ranking (pestaña «Diario», hoy y ayer) y no cuenta para el ranking normal. Da tickets por aguantar (1 a los 5 min, 2 a los 10, 3 a los 20 y 5 si llegas a Arceus) y, al día siguiente, premio por puesto: el 1.º 2 tickets ×10, 2.º y 3.º 1 ticket ×10, del 4.º al 10.º 5 tickets.',
     'The challenge has its own board in the Leaderboard (“Daily” tab, today and yesterday) and doesn’t count for the normal leaderboard. It gives tickets for surviving (1 at 5 min, 2 at 10, 3 at 20 and 5 if you reach Arceus) and, the next day, a prize by rank: 1st 2 ×10 tickets, 2nd and 3rd 1 ×10 ticket, 4th to 10th 5 tickets.'],
    ['7 logros nuevos del Desafío diario: jugar 1, 7 y 30 desafíos, rachas de 7 y 30 días, entrar en el top 10 y ganar un día. Con títulos nuevos: «Retador diario», «Constancia de hierro» y «Campeón del día».',
     '7 new Daily challenge achievements: play 1, 7 and 30 challenges, 7- and 30-day streaks, reach the top 10 and win a day. With new titles: “Daily challenger”, “Iron will” and “Champion of the day”.'],
    ['Barra de vida bajo tu Pokémon: verde, amarilla por debajo de la mitad y roja cuando queda poca. Se puede quitar en Ajustes > Gráficos > «Vida del personaje».',
     'Health bar under your Pokémon: green, yellow below half and red when it’s low. You can turn it off in Settings > Graphics > “Character health”.'],
    ['Amigos: si un amigo está en una sala, sale «En una sala» y un botón «Unirse» para entrar directamente, sin pedirle el código.',
     'Friends: if a friend is in a room, it says “In a room” and shows a “Join” button to get straight in, without asking for the code.']
  ], chg: [
    ['Cooperativo: al levantar a un compañero caído, tiene 3 s de invulnerabilidad (antes 2) para que no lo vuelvan a tumbar nada más levantarse.',
     'Co-op: when a downed teammate is revived, they get 3 s of invulnerability (was 2) so they don’t get knocked down again right away.']
  ], fix: [
    ['Cooperativo: un compañero recién levantado ya no se queda parpadeando para siempre en tu pantalla.',
     'Co-op: a teammate who was just revived no longer keeps blinking forever on your screen.']
  ] },
  { d: '2026-10-17', title: ['Actualizaciones obligatorias', 'Required updates'], new: [
    ['Cooperativo: en la sala, el líder puede cambiar las «Condiciones de partida»: cuántos enemigos aparecen (25 %–300 %), cada cuánto se abren las grietas (ninguna–300 %) y cuántas monedas y tickets sueltan (0 %–500 %). Para probar, para partidas tranquilas o para farmear en grupo. Si alguna no está al 100 %, esa partida no sube al ranking.',
     'Co-op: in the room, the leader can change the “Game settings”: how many enemies spawn (25%–300%), how often rifts open (none–300%) and how many coins and tickets drop (0%–500%). For testing, relaxed games or farming as a group. If any isn’t at 100%, that game doesn’t go on the leaderboard.'],
    ['Gacha: nueva tirada ×20 por 20 tickets o 2 tickets ×10 (trae al menos dos Épicas, una por cada 10) y botón «Saltar» (o Espacio / Enter) para ver los resultados sin esperar a la animación.',
     'Gacha: new ×20 pull for 20 tickets or 2 ×10 tickets (gives at least two Epics, one per 10) and a “Skip” button (or Space / Enter) to see the results without waiting for the animation.'],
    ['Cooperativo: al elegir carta de nivel o fusión, una barra verde abajo te enseña cuánto tiempo te queda (se pone amarilla los últimos 5 s). Si se acaba, se elige por ti.',
     'Co-op: when picking a level card or a fusion, a green bar at the bottom shows how much time you have left (it turns yellow for the last 5 s). If it runs out, one is picked for you.'],
    ['Ranking: cada marca enseña la build con la que se hizo (movimientos con su nivel, las fusiones juntas y el objeto). Toca una marca para ver el detalle: nombres, movimientos evolucionados, el objeto y las mejoras de stat que se cogieron. En grupo, la de cada jugador. Las marcas de antes no la tienen.',
     'Leaderboard: every record shows the build it was made with (moves with their level, fusions grouped together and the item). Tap a record to see the details: names, evolved moves, the item and the stat boosts picked. In co-op, each player’s. Older records don’t have it.']
  ], chg: [
    ['El ranking diario, semanal y mensual y las misiones diarias y semanales se reinician a medianoche hora de Colombia (antes, hora de España). La cuenta atrás de las misiones ya marca la hora exacta, estés donde estés.',
     'The daily, weekly and monthly leaderboards and the daily and weekly missions now reset at midnight Colombia time (was Spain time). The mission countdown now shows the exact time, wherever you are.'],
    ['Móvil: en Ajustes > Controles puedes elegir el joystick «Fijo» (siempre en el mismo sitio, abajo a la izquierda o donde lo coloques) en vez del «Flotante», que aparece donde pones el dedo.',
     'Mobile: in Settings > Controls you can pick a “Fixed” joystick (always in the same place, bottom left or wherever you put it) instead of the “Floating” one, which appears where you put your finger.'],
    ['Cuando una actualización sea obligatoria (por ejemplo, para arreglar un fallo importante), la partida en curso se termina tras un aviso de 10 s y el juego se recarga. No pierdes nada: las monedas, los tickets, los récords y el ranking de esa partida se guardan como al abandonarla.',
     'When an update is required (for example, to fix an important bug), your current run ends after a 10 s notice and the game reloads. You lose nothing: that run’s coins, tickets, records and leaderboard entry are saved as if you had quit.'],
    ['Al subir de nivel tienes 2 s de invulnerabilidad al volver a la partida tras elegir carta, también en cooperativo.',
     'When you level up you get 2 s of invulnerability on returning to the run after picking a card, in co-op too.'],
    ['Al salir de la grieta (ganes o pierdas) tienes 5 s de invulnerabilidad para que no te pillen los enemigos que esperaban en el mapa, también en cooperativo.',
     'When you leave a rift (win or lose) you get 5 s of invulnerability so the enemies waiting on the map don’t catch you, in co-op too.'],
    ['Mejora Veto: ahora sube hasta el nivel 5, así que puedes bloquear hasta 5 movimientos por Pokémon (antes 3).',
     'Ban upgrade: it now goes up to level 5, so you can block up to 5 moves per Pokémon (was 3).']
  ], fix: [
    ['Jugar en dos aparatos (PC y móvil) ya no hace perder monedas ni tickets: antes, si uno tenía la partida abierta con datos viejos y guardaba, borraba lo ganado en el otro. Ahora se suma lo de los dos. Y al volver al juego tras un rato fuera, se trae lo conseguido en el otro aparato (Pokémon, shinies...) sin recargar.',
     'Playing on two devices (PC and phone) no longer loses coins or tickets: before, if one had the game open with old data and saved, it erased what you earned on the other. Now both are added up. And when you come back to the game after a while away, it brings in what you got on the other device (Pokémon, shinies...) without reloading.'],
    ['El juego se abre en una sola pestaña a la vez: con dos pestañas del mismo navegador, lo ganado o gastado en una tapaba lo de la otra. Si lo abres en otra, te pregunta y con «Jugar aquí» la otra se para.',
     'The game now runs in one tab at a time: with two tabs in the same browser, what you earned or spent in one overwrote the other. If you open it in another tab, it asks you, and “Play here” stops the other one.'],
    ['Cooperativo: si todos os desconectáis (móvil bloqueado, recarga), la partida espera parada un minuto en vez de terminarse a los 20 s, y nadie cae mientras tanto. Si al volver ya había terminado, se cierra con aviso en vez de quedarse congelada.',
     'Co-op: if everyone disconnects (phone locked, reload), the run waits paused for a minute instead of ending after 20 s, and nobody gets knocked out meanwhile. If it had already ended when you come back, it closes with a notice instead of freezing.'],
    ['Cooperativo: si la conexión se corta sin avisar (al pasar del wifi a los datos, o con el móvil en segundo plano), el juego se da cuenta a los pocos segundos y se reconecta solo. Antes la partida se quedaba congelada varios minutos.',
     'Co-op: if the connection drops silently (switching from Wi-Fi to mobile data, or with the phone in the background), the game notices within a few seconds and reconnects by itself. Before, the run stayed frozen for several minutes.'],
    ['Cooperativo: un compañero que se desconecta deja de verse (en la lista de arriba, en las flechas y en el mapa) hasta que vuelve, y ya no cuenta para «Habéis caído todos». Antes se quedaba quieto en pantalla como si siguiera jugando.',
     'Co-op: a teammate who disconnects is no longer shown (in the list at the top, the arrows and the map) until they come back, and no longer counts for “Everyone is down”. Before, they stayed frozen on screen as if still playing.'],
    ['Tras publicar una versión, el aspecto del juego (estilos) se actualiza también: a veces se quedaba el antiguo junto al juego nuevo y algún menú se veía descolocado.',
     'After a new version is released, the game’s look (styles) updates too: sometimes the old one stayed with the new game and some menus looked out of place.'],
    ['Si tenías una actualización pendiente durante una partida larga y luego salía una obligatoria, ahora también te llega.',
     'If you had an update pending during a long run and a required one came out afterwards, it now reaches you too.']
  ] },
  { d: '2026-10-15', title: ['Salas de hasta 10 jugadores', 'Rooms for up to 10 players'], new: [
    ['Al acabar la run ves lo que hizo tu Pokémon: daño hecho, daño recibido y cofres abiertos. En cooperativo se compara al grupo: quién hizo más daño, quién recibió más, quién abrió más cofres, quién levantó más veces a los compañeros y el MVP de la partida.',
     'At the end of a run you see what your Pokémon did: damage dealt, damage taken and chests opened. In co-op the group is compared: who dealt the most damage, who took the most, who opened the most chests, who revived teammates the most and the match MVP.'],
    ['En Pokémon y al elegir el compañero inicial puedes ordenar la lista por vida, ataque, velocidad o total. La Pokédex de la web también.',
     'In Pokémon and when picking your starter you can sort the list by HP, attack, speed or total. The website Pokédex can too.'],
    ['Cooperativo: ahora caben hasta 10 jugadores en cada sala. Con más de 4 salen más Pokémon a la vez para que haya para todos.',
     'Co-op: rooms now hold up to 10 players. With more than 4, more Pokémon show up at once so there are enough for everyone.'],
    ['Cooperativo: si tu última partida en grupo sigue en marcha sin ti (cerraste el juego o se cortó más de un minuto), en el menú sale «Reconectar» para volver a ella con tu Pokémon como lo dejaste.',
     'Co-op: if your last group game is still going on without you (you closed the game or lost connection for over a minute), the menu shows “Reconnect” to jump back in with your Pokémon as you left it.']
  ], chg: [
    ['La Vidasfera ya no puede ser tu primer objeto: como te quita vida, sólo sale cuando ya llevas otro y puedes elegir con cuál quedarte.',
     'The Life Orb can no longer be your first item: since it drains your HP, it only shows up once you already carry another one and can choose which to keep.'],
    ['Cooperativo: al volver de una grieta cada uno aparece donde estaba al entrar, no todos juntos en el mismo sitio.',
     'Co-op: coming back from a rift, everyone appears where they were when they went in, not all bunched up in one spot.']
  ], fix: [
    ['Las monedas y la experiencia que suelta un Pokémon volador o un jefe derrotado encima de una pared, una roca o la lava ya no se quedan donde no se puede llegar: caen en el hueco libre más cercano.',
     'Coins and experience dropped by a flying Pokémon or a boss defeated over a wall, a rock or lava no longer end up out of reach: they land in the nearest open spot.'],
    ['Al entrar o salir de una grieta, la pantalla se tapa un momento y apareces ya en el sitio: la cámara ya no recorre el mapa.',
     'Entering or leaving a rift covers the screen for a moment and you appear already there: the camera no longer travels across the map.'],
    ['Al volver de una grieta con la ventana del vínculo o de las cartas abierta, la pantalla ya no se queda morada y parada hasta que eliges.',
     'Coming back from a rift with the bond or level-up window open, the screen no longer stays purple and frozen until you choose.'],
    ['Cooperativo: si recargas la página o se te corta la conexión en mitad de una partida en grupo, vuelves a entrar solo a la misma partida. Tienes un minuto.',
     'Co-op: if you reload the page or your connection drops in the middle of a group game, you rejoin that same game on your own. You have one minute.'],
    ['Cooperativo: en la ventana de vincular movimientos (al derrotar a un jefe) y en la de elegir objeto vuelven a funcionar las teclas de los números.',
     'Co-op: the number keys work again in the move-bond window (after beating a boss) and in the item choice window.'],
    ['Cooperativo: ya puedes cambiar las cartas de nivel también en grupo (1 vez gratis por partida más las que tengas en Mejoras).',
     'Co-op: you can reroll level-up cards in group games too (once for free per run plus the ones from Upgrades).'],
    ['Cooperativo: un altar que coge un compañero se apaga también en tu pantalla, y ya no te sale un poder que no es tuyo. Con el poder Rayo ya no te mueves a tirones.',
     'Co-op: an altar taken by a teammate now goes dark on your screen too, and you no longer see a power that isn’t yours. With the Bolt power you no longer move in jerks.'],
    ['Cooperativo: ves cómo se abre un cofre con candado aunque lo esté abriendo un compañero, y las trampas saltan igual para todos.',
     'Co-op: you can see a locked chest opening even when a teammate is opening it, and traps go off the same way for everyone.'],
    ['Cooperativo: la cámara ya no da saltos al usar una embestida, y cuando el servidor recoloca a tu Pokémon (una pared, una trampa pegajosa) se mueve suave en vez de a tirones.',
     'Co-op: the camera no longer jumps when you use a dash, and when the server repositions your Pokémon (a wall, a sticky trap) it moves smoothly instead of jerking.'],
    ['Cooperativo: al levantar a un compañero caído vuelve a verse el anillo verde que se va llenando a su alrededor.',
     'Co-op: when reviving a downed teammate you can see the green ring filling up around them again.']
  ] },
  { d: '2026-10-14', title: ['Recupera tu cuenta con Gmail', 'Recover your account with Gmail'], new: [
    ['Carta nueva «Olvidar»: con los 4 huecos llenos puede salir al subir de nivel. Eliges qué movimiento olvidar, su hueco queda libre y ese movimiento puede volver a salir en las cartas. Los movimientos de un vínculo no se olvidan.',
     'New “Forget” card: with all 4 slots full it can show up when you level up. You choose which move to forget, its slot is freed and that move can show up in the cards again. Moves in a bond cannot be forgotten.'],
    ['Cooperativo nuevo: la partida en grupo la lleva ahora un servidor, no el navegador del anfitrión. Si alguien se va o cambia de pestaña, los demás siguen jugando; si se te corta la conexión tienes 20 segundos para volver a tu sitio.',
     'New co-op: group games now run on a server instead of the host’s browser. If someone leaves or switches tabs, everyone else keeps playing; if your connection drops you have 20 seconds to get back to your spot.'],
    ['Salas con código: en Amigos > Jugar en grupo creas una sala y pasas su código de 6 letras, o escribes el de un amigo para entrar. Las invitaciones siguen funcionando.',
     'Rooms with a code: in Friends > Play in a group you create a room and share its 6-letter code, or type a friend’s code to join. Invitations still work.'],
    ['Si juegas con nombre y contraseña, puedes vincular tu Gmail: si un día olvidas la contraseña, entras con Google y es tu misma cuenta. Te lo ofrecemos al entrar.',
     'If you play with a name and password, you can link your Gmail: if you ever forget your password, sign in with Google and it is the same account. We offer it when you sign in.'],
    ['Móvil: ya puedes colocar los botones donde quieras. En Ajustes > Controles > Colocar los botones arrastras los ataques (con el objeto), la pausa y el joystick, que ahora también puede ser fijo en vez de aparecer donde pones el dedo.',
     'Mobile: you can now place the buttons wherever you want. In Settings > Controls > Place the buttons, drag the attacks (with the item), the pause button and the joystick, which can now also be fixed instead of appearing where you put your finger.']
  ], chg: [
    ['Cooperativo: tus mejoras de la tienda (vida, fuerza, Repertorio, Veto…) cuentan también en grupo, y la marca del ranking de grupo la apunta el servidor con su propio reloj. En grupo, por ahora, no se pueden cambiar las cartas de nivel.',
     'Co-op: your shop upgrades (HP, strength, Repertoire, Veto…) now also count in group games, and the group leaderboard record is written by the server with its own clock. In group games you can’t reroll level-up cards for now.'],
    ['Las tablas de la semana y del mes del ranking empiezan de cero, como el histórico: ahora sólo cuentan partidas con la Sentencia de Arceus y todas las tablas cuadran entre sí.',
     'The weekly and monthly leaderboards start from scratch, like the all-time one: now only runs with the Judgment of Arceus count, and all boards match each other.'],
    ['El juego es y será gratis. Si alguien te pide pagar por tickets, monedas o lo que sea, no somos nosotros. Lo verás también al entrar y en el Aviso legal.',
     'The game is and always will be free. If anyone asks you to pay for tickets, coins or anything else, it isn’t us. You will also see this when signing in and in the Legal notice.'],
    ['El código del juego pasa a una licencia no comercial (PolyForm Noncommercial 1.0.0): se puede seguir estudiando y modificando, pero nadie puede cobrar por él.',
     'The game’s code moves to a non-commercial license (PolyForm Noncommercial 1.0.0): you can still study and modify it, but nobody may charge for it.']
  ], fix: [
    ['Cooperativo: la partida ya no se queda parada con cada uno esperando a que el otro elija. Un objeto y las cartas de nivel ya no se tapan, y si la conexión pierde un aviso se arregla solo.',
     'Co-op: the game no longer freezes with each player waiting for the other to choose. An item and the level-up cards no longer cover each other, and if the connection drops a message it fixes itself.'],
    ['Cooperativo: al volver de una grieta, quien no era el anfitrión ya ve a todos los enemigos (antes algunos eran invisibles y sólo se veían sus ataques).',
     'Co-op: after coming back from a rift, players who are not the host can see every enemy again (some used to be invisible, with only their attacks showing).'],
    ['Amigos: si tu móvil u ordenador tiene la hora (o la zona horaria) mal puesta, tus amigos ya no salen siempre desconectados y sus invitaciones te llegan.',
     'Friends: if your phone or computer has the wrong time (or time zone), your friends no longer always show as offline and their invitations reach you.'],
    ['Los avisos grandes de la partida (un Gholdengo cerca, una marea...) ya salen siempre centrados.',
     'Big in-game announcements (a nearby Gholdengo, a swarm...) are always centered now.']
  ] },
  { d: '2026-10-13', title: ['La Sentencia de Arceus', 'The Judgment of Arceus'], new: [
    ['La Sentencia de Arceus: al llegar al minuto 30, Arceus baja del cielo y te lleva a las Ruinas del Juicio. Es invencible, te persigue cada vez más deprisa y lanza pilares de luz, rayos y ondas; si te toca, te quita casi media vida. Cada 5 segundos acude un legendario con el doble de vida y de daño que el anterior. ¿Cuánto aguantarás?',
     'The Judgment of Arceus: at minute 30, Arceus descends from the sky and takes you to the Ruins of Judgment. It is invincible, chases you faster and faster and casts pillars of light, beams and shockwaves; if it touches you, you lose almost half your HP. Every 5 seconds a legendary joins, each with twice the HP and damage of the previous one. How long can you last?'],
    ['Tres logros nuevos: La Sentencia (llega al minuto 30), Ante el Creador (aguanta 1 minuto ante Arceus) y Desafío divino (derrota a 3 legendarios ante Arceus en una partida).',
     'Three new achievements: The Judgment (reach minute 30), Before the Creator (survive 1 minute against Arceus) and Divine challenge (defeat 3 legendaries against Arceus in a single run).'],
    ['Música nueva para la pelea contra Arceus.', 'New music for the fight against Arceus.'],
    ['Botón para reportar marcas sospechosas en el ranking (la banderita de cada fila).',
     'A button to report suspicious records on the leaderboard (the little flag on each row).']
  ], chg: [
    ['El ranking histórico empieza de cero: ahora que las partidas acaban ante Arceus, las marcas de antes ya no se podrían alcanzar. Las tablas de hoy, de la semana y del mes siguen igual.',
     'The all-time leaderboard starts from scratch: now that runs end against Arceus, older records could no longer be reached. The daily, weekly and monthly boards are unchanged.'],
    ['Se quita el tiempo extra del minuto 60 (ya no se llega hasta ahí).',
     'Overtime from minute 60 is removed (runs no longer get that far).'],
    ['Desde el minuto 28 ya no se abren grietas, para que la Sentencia no te pille dentro de una.',
     'Rifts no longer open from minute 28 on, so the Judgment does not catch you inside one.'],
    ['Ranking protegido contra trampas: el servidor comprueba que cada marca se ha jugado de verdad. Nunca se pierde nada de lo que ganas jugando.',
     'Leaderboard protected against cheating: the server checks that every record was really played. You never lose anything you earn by playing.'],
    ['Se han quitado del ranking las marcas de más de 35 minutos: con la Sentencia de Arceus ya no son posibles.',
     'Records over 35 minutes have been removed from the leaderboard: with the Judgment of Arceus they are no longer possible.']
  ], fix: [
    ['Las tiradas del gacha, los Pokémon nuevos y los premios se guardan en la nube al momento. Si abriste el juego en otro aparato o navegador y te faltaba algo, vuelve a abrirlo donde lo conseguiste: se recupera solo.',
     'Gacha pulls, new Pokémon and rewards are saved to the cloud right away. If you opened the game on another device or browser and something was missing, open it again where you got it: it comes back on its own.']
  ] },
  { d: '2026-10-12', title: ['Tiempo extra y grietas con menos azar', 'Overtime and less random rifts'], new: [
    ['Tiempo extra: desde el minuto 60 los Pokémon salvajes se vuelven cada vez más fuertes (más vida y más daño), y cada vez más deprisa. Antes, con las mejoras al máximo, algunas partidas no acababan nunca; ahora las mejores rondarán la hora y media.',
     'Overtime: from minute 60 on, wild Pokémon keep getting stronger (more HP and more damage), faster and faster. Before, with maxed upgrades, some runs never ended; now the best ones will last about an hour and a half.'],
    ['El juego se actualiza solo cuando sale una versión nueva: si estás en el menú, a los 5 segundos; si estás jugando, al acabar la partida (sin perder nada).',
     'The game now updates itself when a new version is out: within 5 seconds if you are in the menu, or after your run if you are playing (without losing anything).'],
    ['Botón de Novedades (esta ventana) con todos los cambios del juego.',
     'A "What\'s new" button (this window) with every change to the game.'],
    ['Números más fáciles de leer: el 2, el 5 y el 8 ya no se confunden.',
     'Easier to read numbers: 2, 5 and 8 no longer look alike.'],
    ['Elige la versión normal o shiny de tu compañero desde el menú principal, debajo de él.',
     'Pick the normal or shiny version of your partner right from the main menu, under it.'],
    ['Mejoras nuevas para cada Pokémon: Golpe Crítico (+3 % de críticos por nivel, que hacen x1,5 de daño), Cambio de cartas (+1 cambio de las cartas de nivel por run) y Veto (bloquea movimientos para que no te salgan en las cartas; se eligen en Mejoras).',
     'New upgrades for each Pokémon: Critical Hit (+3% critical chance per level, crits deal x1.5 damage), Card reroll (+1 level-up card reroll per run) and Ban (block moves so they never show up in your cards; pick them in Upgrades).'],
    ['Atajos de movimientos (en Mejoras, para cada Pokémon): elige qué movimiento va siempre en cada hueco, por ejemplo Confusión siempre en el 1, para la memoria muscular.',
     'Move shortcuts (in Upgrades, for each Pokémon): choose which move always goes in each slot, for example Confusion always on 1, for muscle memory.']
  ], chg: [
    ['Avalancha hace menos daño (21 en vez de 26): derrotaba casi el doble que la media de los movimientos.',
     'Rock Slide deals less damage (21 instead of 26): it defeated almost twice as many as the average move.'],
    ['Los cambios de cartas de nivel ya no se ganan venciendo jefes: tienes 1 gratis por run y el resto se compra en Mejoras.',
     'Level-up card rerolls are no longer earned by defeating bosses: you get 1 free per run and can buy more in Upgrades.'],
    ['Los legendarios de grieta ya no dan siempre tickets x10: dan uno la mitad de las veces (antes daban 2 siempre y salían demasiados).',
     'Rift legendaries no longer always drop x10 tickets: they drop one half of the time (they used to always drop 2, which was too many).'],
    ['Cooperativo: si vuestras redes no consiguen conectar entre sí, la sala lo avisa y lo reintenta sola, en vez de jugar a tirones por un servidor lento.',
     'Co-op: if your networks cannot connect to each other, the room says so and keeps retrying, instead of playing laggy through a slow server.'],
    ['Hemos cambiado de servidores para que el juego siga siendo gratis: puede que tengas que volver a iniciar sesión (con la misma cuenta y contraseña, o con Google). Tu partida y tus Pokémon siguen igual.',
     'We moved to new servers so the game can stay free: you may need to sign in again (with the same account and password, or with Google). Your save and your Pokémon are unchanged.'],
    ['Gacha: los shiny ya no salen repetidos. Si te toca uno que ya tienes, sale otro de la misma rareza que te falte.',
     'Gacha: shinies no longer come out as duplicates. If you roll one you already have, you get another of the same rarity that you are missing.'],
    ['Grietas con menos azar: cada vez que no sale una, la siguiente es más probable (como mucho 2,5 minutos sin grieta).',
     'Less random rifts: every time one does not show up, the next one is more likely (at most 2.5 minutes without a rift).'],
    ['Los legendarios que aún no has vencido salen 4 veces más en las grietas.',
     'Legendaries you have not beaten yet show up 4 times as often in rifts.'],
    ['Los curanderos curan más cuanto más fuerte pegas, pero cada vez menos y con un tope (como mucho el 2,5x).',
     'Healers heal more the harder you hit, but with diminishing returns and a cap (2.5x at most).'],
    ['Ataques cuerpo a cuerpo más fuertes: mientras llevas uno activo recibes un 25 % menos de daño, llegan un 25 % más lejos y hacen un 20 % más de daño.',
     'Stronger melee attacks: while one is active you take 25% less damage, and they reach 25% further and deal 20% more damage.'],
    ['Cooperativo: al elegir con qué objeto quedarte, la partida se para para todos (antes seguía y te pegaban mientras elegías).',
     'Co-op: choosing which held item to keep now pauses the run for everyone (it used to keep going and you got hit while choosing).'],
    ['Cooperativo: mientras alguien elige una fusión, la partida se para para todos.',
     'Co-op: while someone is choosing a fusion, the run pauses for everyone.'],
    ['Cooperativo: si el anfitrión cambia de pestaña o se le para el juego, la partida se pausa para todos hasta que vuelva.',
     'Co-op: if the host switches tabs or their game stalls, the run pauses for everyone until they are back.'],
    ['Las runs de menos de 1 minuto ya no cuentan para el ranking.',
     'Runs shorter than 1 minute no longer count for the leaderboard.']
  ], fix: [
    ['Quitadas del ranking las marcas rotas por el fallo del minuto 84 (el reloj seguía corriendo con el juego parado) y alguna imposible. Si tenías una, tu próxima partida vuelve a contar.',
     'Removed broken records from the leaderboard caused by the minute 84 bug (the clock kept running while the game was frozen) and a few impossible ones. If you had one, your next run counts again.'],
    ['iPhone (Safari y Chrome): a veces no se podía cambiar de movimiento tocando los iconos, sobre todo con el otro dedo en el joystick. Además los botones quedan por encima de la barra de inicio.',
     'iPhone (Safari and Chrome): sometimes you could not switch moves by tapping the icons, especially with your other finger on the joystick. Buttons also sit above the home bar now.'],
    ['En las partidas de más de 84 minutos la pantalla se quedaba en negro, el juego se paraba o empezabas a subir de nivel sin fin. Ya puedes jugar todo lo que aguantes.',
     'In runs longer than 84 minutes the screen went black, the game froze or you kept levelling up forever. Now you can play for as long as you survive.'],
    ['Si el juego fallara, la partida se cierra sola y se guarda (tiempo, derrotados, récords y ranking) en vez de perderse.',
     'If the game ever crashes, the run ends by itself and is saved (time, defeated, records and leaderboard) instead of being lost.'],
    ['Las partidas muy largas a veces se tomaban por trampas y no contaban para el ranking.',
     'Very long runs were sometimes flagged as cheating and did not count for the leaderboard.'],
    ['Cooperativo: si el anfitrión cambiaba de pestaña, los enemigos se quedaban quietos y los demás jugaban con ventaja.',
     'Co-op: if the host switched tabs, enemies stood still and everyone else got a free advantage.'],
    ['iPhone: mantener el dedo en el joystick sacaba "Copiar / Seleccionar todo".',
     'iPhone: holding your finger on the joystick brought up "Copy / Select all".'],
    ['iPhone: a veces no salía la pantalla completa. Ahora el botón explica cómo tenerla (Compartir y "Añadir a pantalla de inicio").',
     'iPhone: fullscreen sometimes did not show up. Now the button explains how to get it (Share and "Add to Home Screen").']
  ] },
  { d: '2026-10-11', title: ['Vínculos', 'Bonds'], new: [
    ['Vínculos: al vencer a un legendario fusionas movimientos que se lanzan a la vez desde un solo hueco (hasta 4).',
     'Bonds: defeating a legendary lets you fuse moves that fire at the same time from a single slot (up to 4).'],
    ['Botón para cambiar las cartas de subir de nivel.',
     'A button to reroll the level-up cards.']
  ], chg: [
    ['Más grietas.', 'More rifts.'],
    ['Movimientos psíquicos y curanderos más flojos.', 'Weaker psychic moves and healers.'],
    ['Las mejoras de las cartas de nivel (velocidad, recarga, experiencia, imán, coraza y potencia) tienen un tope de veces.',
     'Level-up card upgrades (speed, cooldown, experience, magnet, armor and power) can only be taken a limited number of times.'],
    ['En el móvil, la ficha del Pokémon sale al lado; entrar es más rápido y el gacha x10 se puede cerrar.',
     'On mobile, the Pokémon details show alongside; logging in is faster and the x10 gacha can be closed.']
  ], fix: [
    ['Pantalla negra en partidas de más de una hora por llenarse la memoria de imágenes.',
     'Black screen in runs longer than an hour because image memory filled up.'],
    ['Los tickets se perdían si se cerraba la pestaña antes de acabar la partida: ahora se guardan al cogerlos.',
     'Tickets were lost if the tab closed before the run ended: now they are saved as soon as you pick them up.'],
    ['Una mejora comprada justo después de guardar se cobraba y no se apuntaba.',
     'An upgrade bought right after saving was charged but not applied.'],
    ['El juego se quedaba congelado para siempre si algo fallaba a mitad de partida.',
     'The game froze forever if something went wrong mid-run.']
  ] },
  { d: '2026-10-10', title: ['Más reto', 'More challenge'], new: [
    ['Jefes y legendarios con 4 ataques avisados que se enfurecen a media vida.',
     'Bosses and legendaries with 4 telegraphed attacks that get enraged at half health.'],
    ['12 movimientos nuevos y 8 formas de atacar nuevas: bumerán, cadena, minas, meteoros, torreta, embestida, rastro y abanico.',
     '12 new moves and 8 new ways to attack: boomerang, chain, mines, meteors, turret, dash, trail and spray.'],
    ['Eventos a mitad de partida (hordas de un tipo, hora dorada, Pokémon perdidos) y Meowth y Gholdengo que huyen cargados de monedas.',
     'Mid-run events (single-type hordes, golden hour, lost Pokémon) and Meowth and Gholdengo running away loaded with coins.'],
    ['Estatuas para los Pokémon grandes.', 'Statues for big Pokémon.']
  ], chg: [
    ['Más difícil: menos enemigos pero más duros.', 'Harder: fewer but tougher enemies.'],
    ['Subir de nivel es más lento, los tickets son más raros y los jefes dan ticket x10 una de cada tres veces.',
     'Levelling up is slower, tickets are rarer and bosses drop a x10 ticket one time in three.'],
    ['Carga más rápida.', 'Faster loading.']
  ], fix: [
    ['Los enemigos rezagados desaparecían delante de ti: ahora sólo fuera de la vista.',
     'Straggling enemies vanished in front of you: now only off-screen.'],
    ['Los menús y pantallas se montaban encima de la barra de arriba.',
     'Menus and screens overlapped the top bar.']
  ] },
  { d: '2026-10-09', title: ['Móvil e inglés', 'Mobile and English'], new: [
    ['Se puede jugar en móvil y tablet con joystick táctil, e instalar como app.',
     'Play on phones and tablets with a touch joystick, and install it as an app.'],
    ['El juego, en español y en inglés.', 'The game in English and Spanish.'],
    ['Pantalla de ajustes con calidad gráfica automática.', 'Settings screen with automatic graphics quality.']
  ], chg: [
    ['Menos enemigos en pantalla pero más fuertes.', 'Fewer but stronger enemies on screen.'],
    ['Gigadrenado pasa a ser Hierba Lazo (ya no cura).', 'Giga Drain becomes Grass Knot (no more healing).']
  ] },
  { d: '2026-10-08', title: ['Misiones, grietas y cooperativo', 'Missions, rifts and co-op'], new: [
    ['Misiones diarias y semanales, logros con medallas y títulos, y perfil público.',
     'Daily and weekly missions, achievements with medals and titles, and a public profile.'],
    ['Objetos equipables, evoluciones de movimientos y enemigos que curan, protegen, invocan o explotan.',
     'Held items, move evolutions and enemies that heal, shield, summon or explode.'],
    ['Grietas que llevan a 18 arenas legendarias, una por tipo, y clima que cambia la batalla.',
     'Rifts leading to 18 legendary arenas, one per type, and weather that changes the fight.'],
    ['Cooperativo con tu lista de amigos y ranking.', 'Co-op with your friends list and leaderboards.'],
    ['Mejoras para cada Pokémon, gacha tragaperras con tickets y tabla de tipos.',
     'Upgrades for each Pokémon, a slot-machine ticket gacha and a type chart.']
  ], chg: [
    ['Cámara más lejos y enemigos que rodean los obstáculos.', 'Camera further out and enemies that walk around obstacles.']
  ] },
  { d: '2026-10-07', title: ['Primera versión', 'First version'], new: [
    ['Primera versión pública de PokéSurvivor.', 'First public version of PokéSurvivor.']
  ] }
];
