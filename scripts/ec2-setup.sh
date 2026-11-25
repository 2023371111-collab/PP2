#!/usr/bin/env bash
# Configuración inicial del servidor EC2 (Ubuntu 22.04/24.04). Ejecutar UNA sola vez:
#   curl -fsSL https://raw.githubusercontent.com/<usuario>/<repo>/main/scripts/ec2-setup.sh | bash -s -- https://github.com/<usuario>/<repo>.git
set -euo pipefail

REPO_URL="${1:?Uso: ec2-setup.sh <url-del-repositorio>}"
APP_DIR="$HOME/app"

echo ">> Instalando Docker"
if ! command -v docker >/dev/null; then
  curl -fsSL https://get.docker.com | sudo sh
  sudo usermod -aG docker "$USER"
fi
sudo apt-get install -y git curl jq >/dev/null

echo ">> Creando swap de 2GB (evita falta de memoria al construir imágenes)"
if ! sudo swapon --show | grep -q swapfile; then
  sudo fallocate -l 2G /swapfile
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile
  sudo swapon /swapfile
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
fi

echo ">> Clonando repositorio"
if [ ! -d "$APP_DIR/.git" ]; then
  git clone "$REPO_URL" "$APP_DIR"
fi

if [ ! -f "$APP_DIR/.env" ]; then
  cp "$APP_DIR/.env.example" "$APP_DIR/.env"
  sed -i "s/^JWT_SECRET=.*/JWT_SECRET=$(openssl rand -hex 32)/" "$APP_DIR/.env"
  sed -i "s/^POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=$(openssl rand -hex 12)/" "$APP_DIR/.env"
  echo ">> Se creó $APP_DIR/.env (revisa las credenciales de OpenObserve/admin)"
fi

echo ">> Primer despliegue"
cd "$APP_DIR"
sg docker -c "bash scripts/deploy.sh"

echo
echo "Listo. App: http://<IP-PUBLICA>/   OpenObserve: http://<IP-PUBLICA>:5080/"
