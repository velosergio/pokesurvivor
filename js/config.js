/* ============ config.js — los datos de ESTA copia del juego ============
 * Todo lo que cambia de una instalación a otra está aquí (y en ningún otro
 * sitio): dominio, proyecto de Firebase, moderadores y apoyo.
 * Lo leen el juego, tools/export_data.js (-> páginas web y reglas) y
 * tools/make_rules.js. Tras cambiarlo: node tools/export_data.js, desplegar
 * las reglas (firebase deploy --only firestore) y publicar.
 *
 * firebase: la configuración de la app web de Firebase (no es secreta: lo que
 * protege las partidas son las reglas). null = el juego guarda sólo en el
 * navegador (sin cuentas, amigos ni ranking).
 */
G.Config = {
  site: 'https://poke.sergioveloza.com/',
  turn: '',                 // Worker de claves TURN para el cooperativo ('' = sin TURN)
  admins: [],               // uids con acceso a Moderación (y en firestore.rules)
  kofi: '',                 // usuario de Ko-fi ('' = sin botón "Apoyar")
  sponsors: '',             // usuario de GitHub Sponsors ('' = sin enlace)
  firebase: null
};
G.FIREBASE_CONFIG = G.Config.firebase;
