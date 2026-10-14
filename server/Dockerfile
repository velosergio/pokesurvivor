# Servicio `game` de Easypanel: el servidor del cooperativo (Node 20).
#
# Se construye desde la RAÍZ del repositorio (necesita dev.html y js/, que es
# lo que carga server/sim.js con path.join(__dirname, '..')):
#   docker build -f server/Dockerfile -t ps-game .
# Las exclusiones están en server/Dockerfile.dockerignore (BuildKit la usa en
# vez del .dockerignore de la raíz, que es el de la web y deja fuera server/).
# Hace falta BuildKit (lo normal desde Docker 23; no usar DOCKER_BUILDKIT=0):
# el constructor antiguo usaría el .dockerignore de la raíz y no encontraría server/.
#
# En Easypanel: puerto 8787, dominio del juego con ruta /ws, y el TIEMPO DE
# PARADA del servicio a 45 min (al redesplegar, SIGTERM espera a que acaben las
# partidas en marcha, 40 min como mucho; si Easypanel mata antes, se cortan).
# Variables: PORT, ALLOWED_ORIGINS (obligatoria en producción: el dominio de la
# web), MAX_ROOMS, FIREBASE_SERVICE_ACCOUNT (secreta) y PROTO (opcional: sólo se
# comprueba; si no coincide con el protocolo del código, avisa en el registro).
# DEV_AUTH nunca en Easypanel (sólo local).
FROM node:20-alpine

ENV NODE_ENV=production
WORKDIR /app

# Dependencias primero (se reaprovechan entre builds si no cambian).
COPY server/package.json server/package-lock.json server/
RUN cd server && npm ci --omit=dev && npm cache clean --force

# El servidor y lo que lee la simulación, con la misma estructura que el repo:
# /app/server, /app/js, /app/dev.html.
COPY server/ server/
COPY dev.html ./
COPY js/ js/

USER node
EXPOSE 8787
STOPSIGNAL SIGTERM
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT:-8787}/health" >/dev/null || exit 1
CMD ["node", "server/index.js"]
