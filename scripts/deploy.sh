#!/usr/bin/env bash
# Se ejecuta EN el servidor EC2 (lo invoca GitHub Actions por SSH).
# Actualiza el código, reconstruye/reinicia los contenedores y verifica la salud de la app.
set -euo pipefail

APP_DIR="${APP_DIR:-$HOME/app}"
cd "$APP_DIR"

echo ">> Actualizando código (origin/main)"
git fetch --prune origin main
git reset --hard origin/main

export APP_VERSION="${APP_VERSION:-$(git rev-parse --short HEAD)}"
echo ">> Desplegando versión $APP_VERSION"

docker compose up -d --build --remove-orphans
docker image prune -f >/dev/null

echo ">> Verificando salud de la aplicación"
PORT=$(grep -E '^APP_PORT=' .env 2>/dev/null | cut -d= -f2 || true)
for i in $(seq 1 40); do
  if curl -fsS "http://localhost:${PORT:-80}/api/health"; then
    echo
    echo ">> Despliegue OK"
    docker compose ps
    echo ">> Configurando dashboards y alertas de OpenObserve"
    python3 scripts/setup_openobserve.py || echo "(aviso) no se pudo configurar OpenObserve"
    exit 0
  fi
  sleep 3
done

echo ">> ERROR: la aplicación no respondió al health check"
docker compose logs --tail 50 backend
exit 1
