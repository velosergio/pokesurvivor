# Publicar el juego en Easypanel (poke.sergioveloza.com)

El juego es una web estática que sirve nginx (`Dockerfile` + `nginx.conf`) como
servicio `web` de Easypanel, en el VPS al que apunta `poke.sergioveloza.com`
(registro A en Hostinger).

## 1. Crear el servicio (una vez)

En Easypanel → proyecto `pokesurvivor` → **+ Service → App** → nombre `web`:

- **Source**: GitHub `velosergio/pokesurvivor`, rama `main`.
- **Build**: Dockerfile (ruta `Dockerfile`).
- **Domains**: `poke.sergioveloza.com`, HTTPS activado, puerto interno 80.
- **Deploy**.

## 2. Conectar con Firebase

Si ya seguiste [FIREBASE.md](FIREBASE.md), añade `poke.sergioveloza.com` a los
**dominios autorizados** de Authentication (paso 5). La configuración va en
`js/config.js` (campo `firebase`).

## 3. Actualizar el juego más adelante

```
node tools/build.js && node tools/export_data.js && python tools/make_seo_pages.py
node tools/check_copy.js --built
git add -A
git commit -m "Qué has cambiado"
git push origin main
```

Después, en Easypanel, **Deploy** en el servicio `web` (o actívale el despliegue
automático al hacer push). Los jugadores reciben la versión nueva solos
(`js/core/updater.js`).

## Recordatorios

- **Nada de dinero**: ni anuncios, ni donaciones a cambio de nada, ni pagos.
  Lo exige la licencia de los sprites (CC BY-NC) y es lo que más reduce el
  riesgo de que Nintendo pida retirarlo.
- Si llega una reclamación de derechos al correo del aviso legal, atiéndela
  rápido: retirar lo que pidan suele cerrar el asunto.
