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
  admins: ['MufTp04DgIR02OExhPau6TopYzo2'],   // uids con acceso a Moderación (y en firestore.rules)
  kofi: '',                 // usuario de Ko-fi ('' = sin botón "Apoyar")
  sponsors: '',             // usuario de GitHub Sponsors ('' = sin enlace)
  repo: 'https://github.com/velosergio/pokesurvivor',   // código de esta copia; el contacto (aviso legal,
                            // privacidad, retirada de contenido) es abrir un aviso en <repo>/issues
  firebase: {
    apiKey: 'AIzaSyCPhjZhBbJ1t81PhLVjO4D2K17-q6CrScw',
    authDomain: 'pokesurvivor-662eb.firebaseapp.com',
    projectId: 'pokesurvivor-662eb',
    storageBucket: 'pokesurvivor-662eb.firebasestorage.app',
    messagingSenderId: '990249623043',
    appId: '1:990249623043:web:fda2688f2478aaac2c7836',
    // Realtime Database: sólo para las salas del cooperativo antiguo (hasta el servidor de partidas).
    databaseURL: 'https://pokesurvivor-662eb-default-rtdb.firebaseio.com'
  }
};
G.FIREBASE_CONFIG = G.Config.firebase;
