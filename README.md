# Sistema de Inventario — CI/CD, Pruebas Automatizadas y Observabilidad

Aplicación web con **Login**, **CRUD de Usuarios** y **CRUD de Productos**, desplegada automáticamente en **AWS EC2**
mediante **GitHub Actions** sólo cuando aprueban las pruebas (**Jest**, **Playwright**, **Pytest**), e instrumentada
con **OpenTelemetry** hacia **OpenObserve** (logs, métricas, trazas, infraestructura, dashboards y alertas).

## Arquitectura

```
 Desarrollador ──git push──► GitHub Actions
                              ├─ 1. Backend: Jest + Supertest (PostgreSQL de servicio)
                              ├─ 2. E2E: Docker Compose + Playwright (Front+API) + Pytest (API)
                              ├─ 3. Registro del resultado ──HTTP/JSON──► OpenObserve (stream cicd_events)
                              └─ 4. Deploy (SÓLO si 1 y 2 pasan) ──SSH──► EC2: git pull + docker compose up --build
                                                                          └─► evento deploy ──► OpenObserve

 EC2 (Docker Compose)
  ├─ frontend   (React + Nginx, puerto 80)  ──/api──►  backend (Node/Express) ──► db (PostgreSQL)
  │                                                       │ OpenTelemetry OTLP (logs, métricas, trazas)
  ├─ openobserve (puerto 5080) ◄──────────────────────────┘
  ├─ otel-collector (hostmetrics: CPU, RAM, red, disco, carga) ──OTLP──► openobserve
  └─ host-agent (CPU, RAM, ancho de banda, temperatura) ──HTTP/JSON──► openobserve (stream host_metrics)
```

| Requerimiento | Implementación |
|---|---|
| RF-01 Pruebas Front y Back | `backend/tests` (Jest, 15 pruebas), `e2e/tests` (Playwright, 12 pruebas UI + API), `tests-pytest` (Pytest, 6 pruebas) |
| RF-02 Deploy condicionado | `.github/workflows/ci-cd.yml` → job `deploy` con `needs: [backend-tests, e2e-tests]` |
| RF-03 Trazabilidad CI/CD | `scripts/notify-openobserve.sh` → stream `cicd_events` (estado, commit, rama, usuario, run_url) |
| RF-04 Logs / Métricas / Trazas | `backend/src/tracing.js`, `logger.js`, `middleware/telemetry.js` (latencia, req/s, errores, statusCode, timestamp; trazas HTTP + PostgreSQL) |
| RF-05 Infraestructura | `observability/otel-collector.yaml` + `observability/agent/agent.py` |
| RF-06 Dashboards y alertas | `scripts/setup_openobserve.py` (4 dashboards + 6 alertas, se ejecuta en cada deploy) |

## Credenciales por defecto

| Sistema | Usuario | Contraseña |
|---|---|---|
| Aplicación (admin) | `admin@demo.com` | `Admin123!` |
| OpenObserve | `admin@demo.com` | `Complexpass#123` |

> Se cambian en el archivo `.env` del servidor (`ADMIN_*`, `O2_*`). **Deben cambiarse antes de que el primer arranque cree la base de datos.**

---

## Ejecutar localmente

Requisitos: Docker Desktop, Node 22, Python 3.

```bash
# Aplicación + observabilidad (app en http://localhost:8080, OpenObserve en http://localhost:5080)
APP_PORT=8080 OTEL_ENABLED=true COMPOSE_PROFILES=observability docker compose up -d --build
python scripts/setup_openobserve.py

# Pruebas
cd backend && npm ci && DATABASE_URL=postgres://app:app@localhost:5433/app npm test   # requiere un Postgres en 5433
cd e2e && npm ci && npx playwright install chromium && BASE_URL=http://localhost:8080 npx playwright test
BASE_URL=http://localhost:8080 pytest tests-pytest -v
```

---

## Puesta en marcha (lo que debes hacer tú)

### 1. Subir el código a GitHub
1. Crea un repositorio **público** en GitHub (p. ej. `inventario-cicd`), sin README.
2. En esta carpeta:
   ```bash
   git init -b main
   git add .
   git commit -m "Proyecto parcial 2: CI/CD, pruebas y observabilidad"
   git remote add origin https://github.com/TU_USUARIO/inventario-cicd.git
   git push -u origin main
   ```
   (Este primer push ejecutará el pipeline; el deploy fallará hasta completar los pasos 2–3, es normal.)

### 2. Crear la instancia EC2
1. AWS Console → EC2 → **Launch instance**:
   - AMI: **Ubuntu Server 24.04 LTS**
   - Tipo: **t3.small** (2 GB RAM, recomendado). `t2.micro`/`t3.micro` funciona gracias al swap, pero es lento al construir.
   - Key pair: crea uno nuevo (`.pem`) y guárdalo.
   - Almacenamiento: **20 GB** gp3.
   - Security Group, reglas de entrada:
     | Puerto | Origen | Uso |
     |---|---|---|
     | 22 | 0.0.0.0/0 | SSH (GitHub Actions) |
     | 80 | 0.0.0.0/0 | Aplicación web |
     | 5080 | 0.0.0.0/0 | OpenObserve (UI + ingesta del pipeline) |
2. (Recomendado) EC2 → **Elastic IPs** → asigna una IP fija y asóciala a la instancia.
3. Conéctate y ejecuta el script de instalación (reemplaza la URL de tu repo):
   ```bash
   ssh -i tu-llave.pem ubuntu@IP_PUBLICA
   curl -fsSL https://raw.githubusercontent.com/TU_USUARIO/inventario-cicd/main/scripts/ec2-setup.sh -o setup.sh
   bash setup.sh https://github.com/TU_USUARIO/inventario-cicd.git
   ```
   Esto instala Docker, crea swap, clona el repo, genera `~/app/.env`, levanta todo y crea los dashboards/alertas.
4. Verifica: `http://IP_PUBLICA` (app) y `http://IP_PUBLICA:5080` (OpenObserve).

### 3. Configurar los *secrets* en GitHub
Repositorio → **Settings → Secrets and variables → Actions → New repository secret**:

| Secret | Valor |
|---|---|
| `EC2_HOST` | IP pública (o Elastic IP) de la instancia |
| `EC2_USER` | `ubuntu` |
| `EC2_SSH_KEY` | Contenido completo del archivo `.pem` (incluye `-----BEGIN…` y `-----END…`) |
| `O2_URL` | `http://IP_PUBLICA:5080` |
| `O2_USER` | `admin@demo.com` |
| `O2_PASSWORD` | `Complexpass#123` |

Luego: **Actions → CI-CD → Run workflow** (o haz un commit) y verifica que los 4 jobs terminen en verde.

---

## Demostración de los criterios de aceptación

**Criterio 1 — commit con error ⇒ se bloquea el deploy**
1. Introduce un error intencional, por ejemplo en `backend/src/routes/products.js` cambia `res.status(201)` por `res.status(200)`,
   o en `frontend/src/pages/Login.jsx` cambia el texto `Iniciar sesión`.
2. `git commit -am "error intencional" && git push`
3. En GitHub Actions: fallan las pruebas, el job **Desplegar en AWS EC2** aparece **omitido (skipped)** → no hay conexión SSH.
4. En OpenObserve → Dashboard **4. Pipeline CI/CD**: aparece `test_run / failure` y `deploy / blocked`; la alerta `pipeline_fallido` se dispara.
5. Revierte: `git revert HEAD && git push`.

**Criterio 2 — commit válido ⇒ deploy**
Las pruebas pasan, el job de deploy actualiza los contenedores en EC2 y aparece `deploy / success` en OpenObserve.

**Criterio 3 — vista simultánea**
OpenObserve → Dashboards → **1. Observabilidad General**: ejecuciones del pipeline, trazas HTTP, CPU, RAM, ancho de banda,
temperatura y alertas disparadas en una sola pantalla. Las trazas completas (HTTP → Express → PostgreSQL) se ven en el menú **Traces**.

> **Nota sobre la temperatura:** las instancias EC2 son máquinas virtuales y AWS no expone los sensores térmicos del hardware
> físico. El agente usa el sensor real si existe (`/sys/class/thermal`, `hwmon`); si no, reporta una temperatura **estimada**
> a partir del uso de CPU y lo indica en el campo `temperature_source = estimated_from_cpu`.

## Estructura

```
backend/            API Node/Express + PostgreSQL + OpenTelemetry, pruebas Jest
frontend/           React (Vite) servido por Nginx
e2e/                Pruebas Playwright (UI + API) y script de capturas para el reporte
tests-pytest/       Pruebas Pytest de la API
observability/      Config. OTel Collector y agente de métricas del host
scripts/            deploy.sh, ec2-setup.sh, notify-openobserve.sh, setup_openobserve.py
.github/workflows/  Pipeline CI/CD
```
