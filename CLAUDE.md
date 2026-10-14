# PokéSurvivor (copia propia) — cómo se trabaja y se publica

Normas fijas del dueño de esta copia. Se aplican SIEMPRE.

Copia propia del juego de JPTER78 (github.com/JPTER78/pokesurvivor, código MIT; sprites
CC BY-NC: sin uso comercial). Los datos de esta instalación (dominio `site`, Firebase, moderadores,
apoyo, contacto) están en `js/config.js` y en ningún otro sitio: el resto de archivos
los citan (`G.Config.site`, `{{SITE}}` en `dev.html`), no los repiten.

## Publicar una versión
1. Se edita `dev.html` (nunca `index.html`, que se genera).
2. `node tools/build.js && node tools/export_data.js && python tools/make_seo_pages.py`
   - `build.js` genera `index.html`, `js/app.min.js` y **`version.json`** (la huella de esta versión).
   - `node tools/check_copy.js --built` debe dar `ok` (sin restos del original, el dominio sólo en
     `js/config.js`, sin datos personales y sin líneas en blanco de más en `index.html`).
   - `node --test server/test/sim.test.js` debe pasar (la lógica del juego sigue funcionando sin
     navegador; la usará el servidor del cooperativo). Si falla con `document`/`Image`/`location is
     not defined`, algo de lógica está tocando la pantalla: muévelo a la parte de dibujo.
   - Si cambian los moderadores (`admins` en `js/config.js`) o los logros, `export_data.js` reescribe
     `firestore.rules`: desplegarlas con `firebase deploy --only firestore` o la Moderación dará
     "permiso denegado".
3. Commit (sin "Co-Authored-By" ni ninguna firma de IA) y `git push origin main` sólo cuando el dueño lo pida.
4. Easypanel redespliega el servicio `web` desde `origin/main` (`Dockerfile` + `nginx.conf`).

## Actualización automática de los jugadores (obligatorio)
Al publicar, todos los jugadores deben pasar a la versión nueva sin perder nada
(`js/core/updater.js`, mira `version.json` cada 5 min):
- **Fuera de partida** (menú, sala de cooperativo incluida): aviso de 5 s y la página se recarga.
  Si está en el gacha, la tienda de mejoras, los ajustes o escribiendo en un campo, espera a que termine.
- **En partida**: no se toca. Al acabar, la run se guarda como siempre y, al volver al menú, se recarga.
- Antes de recargar se sube a la nube lo pendiente.
No quitar `updater.js` ni la escritura de `version.json` en `tools/build.js`.

## Novedades (changelog)
Cada cambio de juego o arreglo de fallos va también en `js/data/changelog.js`
(español e inglés, en `new` / `chg` / `fix` de la fecha de hoy). Los cambios de
servidores, base de datos o costes NO van ahí.

## Servidores
- Firebase: proyecto **pokesurvivor-662eb** (plan Spark, autenticación normal: cuentas gratis sin
  límite; Firestore en nam5, Realtime Database en us-central1).
  **Nunca** activar "Identity Platform" ni nada que lo active (funciones de bloqueo, MFA,
  "Actualizar para habilitar"): cobra por usuario. Desplegar sólo con
  `firebase deploy --only firestore,database` (nunca `firebase deploy` a secas).
- VPS con Easypanel (82.29.197.223): servicio `web` en el dominio de `site` (js/config.js).
- DNS en Hostinger: el dominio de `site` → 82.29.197.223 (registro A).
- Mantenimiento: `MAINTENANCE` en `js/main.js` (con `?dev` se puede entrar para probar).
