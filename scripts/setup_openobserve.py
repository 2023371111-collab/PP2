#!/usr/bin/env python3
"""
Configura OpenObserve automáticamente (idempotente): dashboards + alertas operativas.

Uso:
    python3 scripts/setup_openobserve.py            # lee credenciales de .env o variables de entorno
    O2_URL=http://IP:5080 O2_USER=... O2_PASSWORD=... python3 scripts/setup_openobserve.py

Dashboards creados:
  1. Observabilidad General  -> pipeline + trazas + CPU/RAM/ancho de banda/temperatura (criterio 3)
  2. Aplicación - Endpoints  -> latencia, peticiones/s, errores HTTP, statusCode (RF-04)
  3. Infraestructura EC2     -> CPU, RAM, red, temperatura, carga, disco (RF-05)
  4. Pipeline CI/CD          -> ejecuciones de pruebas y despliegues (RF-03)
Alertas (RF-06): errores 5xx, latencia alta, pipeline fallido, CPU alta, RAM alta, logins fallidos.
Las alertas disparadas se registran en el stream "alertas_disparadas" (visible en el dashboard 1).
"""
import base64
import json
import os
import sys
import time
import urllib.error
import urllib.request


def load_env():
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".env")
    if os.path.exists(path):
        for line in open(path, encoding="utf-8"):
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip())


load_env()
O2_URL = os.environ.get("O2_URL", "http://localhost:5080").rstrip("/")
ORG = os.environ.get("O2_ORG", "default")
USER = os.environ.get("O2_USER", "admin@demo.com")
PASSWORD = os.environ.get("O2_PASSWORD", "Complexpass#123")
AUTH = "Basic " + base64.b64encode(f"{USER}:{PASSWORD}".encode()).decode()


def api(method, path, body=None):
    req = urllib.request.Request(
        f"{O2_URL}{path}",
        data=json.dumps(body).encode() if body is not None else None,
        headers={"Content-Type": "application/json", "Authorization": AUTH},
        method=method,
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            raw = resp.read()
            return resp.status, json.loads(raw) if raw else {}
    except urllib.error.HTTPError as err:
        raw = err.read()
        try:
            return err.code, json.loads(raw)
        except ValueError:
            return err.code, {"message": raw.decode(errors="replace")}


def wait_ready():
    for _ in range(60):
        try:
            status, _ = api("GET", f"/api/{ORG}/streams")
            if status == 200:
                return
        except (urllib.error.URLError, OSError):
            pass
        time.sleep(3)
    sys.exit("OpenObserve no responde en " + O2_URL)


# ------------------------------------------------------------------ paneles
_panel_seq = [0]


def panel(title, ptype, sql, stream, x, y, layout, stream_type="logs", unit=None, description="", decimals=2):
    """x / y: listas de alias de columnas devueltas por la consulta SQL."""
    _panel_seq[0] += 1
    pid = f"Panel_ID{_panel_seq[0]}"
    colors = ["#2457d6", "#e5484d", "#30a46c", "#f5a524", "#8e4ec6", "#0091ff"]
    config = {"show_legends": True, "decimals": 0 if ptype == "table" else decimals}
    if unit:
        config["unit"] = unit
    return {
        "id": pid,
        "type": ptype,
        "title": title,
        "description": description,
        "config": config,
        "queryType": "sql",
        "queries": [
            {
                "query": sql,
                "customQuery": True,
                "fields": {
                    "stream": stream,
                    "stream_type": stream_type,
                    "x": [{"label": a, "alias": a, "column": a, "color": None} for a in x],
                    "y": [{"label": a, "alias": a, "column": a, "color": colors[i % len(colors)]} for i, a in enumerate(y)],
                    "z": [],
                    "filter": {"filterType": "group", "logicalOperator": "AND", "conditions": []},
                },
                "config": {"promql_legend": "", "limit": 0},
            }
        ],
        "layout": {"x": layout[0], "y": layout[1], "w": layout[2], "h": layout[3], "i": _panel_seq[0]},
    }


def dashboard(title, description, panels, period="1h"):
    return {
        "version": 5,
        "title": title,
        "description": description,
        "tabs": [{"tabId": "default", "name": "Default", "panels": panels}],
        "variables": {"list": []},
        "defaultDatetimeDuration": {"type": "relative", "relativeTimePeriod": period, "startTime": 0, "endTime": 0},
    }


H = "histogram(_timestamp, '1 minute')"
HTTP = "FROM app_logs WHERE event = 'http_request'"
TRACES = 'FROM "default"'

# ---- piezas reutilizables
def cpu(layout):
    return panel("CPU (%)", "area", f"SELECT {H} AS tiempo, avg(cpu_percent) AS cpu_pct FROM host_metrics GROUP BY tiempo ORDER BY tiempo",
                 "host_metrics", ["tiempo"], ["cpu_pct"], layout, unit="percent")


def ram(layout):
    return panel("Memoria RAM (%)", "area", f"SELECT {H} AS tiempo, avg(memory_percent) AS ram_pct FROM host_metrics GROUP BY tiempo ORDER BY tiempo",
                 "host_metrics", ["tiempo"], ["ram_pct"], layout, unit="percent")


def net(layout):
    return panel("Ancho de banda (kbps)", "line",
                 f"SELECT {H} AS tiempo, avg(net_rx_kbps) AS entrada_rx_kbps, avg(net_tx_kbps) AS salida_tx_kbps FROM host_metrics GROUP BY tiempo ORDER BY tiempo",
                 "host_metrics", ["tiempo"], ["entrada_rx_kbps", "salida_tx_kbps"], layout)


def temp(layout):
    return panel("Temperatura (°C)", "line",
                 f"SELECT {H} AS tiempo, avg(temperature_c) AS temperatura_c FROM host_metrics GROUP BY tiempo ORDER BY tiempo",
                 "host_metrics", ["tiempo"], ["temperatura_c"], layout,
                 description="Sensor real si el host lo expone; en EC2 (virtualizado) se estima a partir del uso de CPU (campo temperature_source).")


def pipeline_table(layout):
    return panel("Ejecuciones del pipeline CI/CD", "table",
                 "SELECT timestamp AS fecha, event_type AS evento, status AS estado, branch AS rama, actor AS usuario, "
                 "commit_short AS commit, detail AS detalle, run_url FROM cicd_events WHERE event_type != 'setup' ORDER BY _timestamp DESC LIMIT 100",
                 "cicd_events", ["fecha", "evento", "estado", "rama", "usuario", "commit", "detalle", "run_url"], [], layout)


def traces_table(layout):
    return panel("Trazas de peticiones HTTP", "table",
                 f"SELECT _timestamp AS fecha, trace_id, operation_name AS operacion, http_response_status_code AS status, "
                 f"round(duration / 1000.0, 2) AS duracion_ms {TRACES} WHERE span_kind = '2' ORDER BY _timestamp DESC LIMIT 100",
                 "default", ["fecha", "trace_id", "operacion", "status", "duracion_ms"], [], layout, stream_type="traces")


def alerts_table(layout):
    return panel("Alertas disparadas", "table",
                 "SELECT triggered_at AS fecha, alert_name AS alerta, stream, alert_count AS registros FROM alertas_disparadas "
                 "WHERE alert_name != 'setup' ORDER BY _timestamp DESC LIMIT 50",
                 "alertas_disparadas", ["fecha", "alerta", "stream", "registros"], [], layout)


def build_dashboards():
    general = dashboard(
        "1. Observabilidad General",
        "Vista simultánea: pipeline CI/CD, trazas HTTP y recursos de la instancia EC2",
        [
            cpu([0, 0, 12, 8]), ram([12, 0, 12, 8]), net([24, 0, 12, 8]), temp([36, 0, 12, 8]),
            pipeline_table([0, 8, 48, 9]),
            traces_table([0, 17, 30, 10]),
            alerts_table([30, 17, 18, 10]),
        ],
    )

    app = dashboard(
        "2. Aplicación - Endpoints",
        "Métricas OpenTelemetry por endpoint: latencia, volumen, errores y statusCode",
        [
            panel("Peticiones totales", "metric", f"SELECT count(*) AS total {HTTP}", "app_logs", [], ["total"], [0, 0, 12, 5], decimals=0),
            panel("Latencia promedio (ms)", "metric", f"SELECT round(avg(duration_ms), 2) AS ms {HTTP}", "app_logs", [], ["ms"], [12, 0, 12, 5]),
            panel("Tasa de error (%)", "metric",
                  f"SELECT round(100.0 * sum(CASE WHEN status_code >= 400 THEN 1 ELSE 0 END) / count(*), 2) AS error_pct {HTTP}",
                  "app_logs", [], ["error_pct"], [24, 0, 12, 5]),
            panel("Errores 5xx", "metric", f"SELECT count(*) AS errores_5xx {HTTP} AND status_code >= 500",
                  "app_logs", [], ["errores_5xx"], [36, 0, 12, 5], decimals=0),
            panel("Peticiones por segundo", "line",
                  f"SELECT {H} AS tiempo, round(count(*) / 60.0, 3) AS req_por_seg {HTTP} GROUP BY tiempo ORDER BY tiempo",
                  "app_logs", ["tiempo"], ["req_por_seg"], [0, 5, 24, 8]),
            panel("Tasa de error HTTP (%) en el tiempo", "line",
                  f"SELECT {H} AS tiempo, round(100.0 * sum(CASE WHEN status_code >= 400 THEN 1 ELSE 0 END) / count(*), 2) AS error_pct "
                  f"{HTTP} GROUP BY tiempo ORDER BY tiempo",
                  "app_logs", ["tiempo"], ["error_pct"], [24, 5, 24, 8]),
            panel("Latencia promedio y p95 por endpoint (ms)", "bar",
                  f"SELECT method || ' ' || route AS endpoint, round(avg(duration_ms), 2) AS promedio_ms, "
                  f"round(approx_percentile_cont(duration_ms, 0.95), 2) AS p95_ms {HTTP} GROUP BY endpoint ORDER BY promedio_ms DESC",
                  "app_logs", ["endpoint"], ["promedio_ms", "p95_ms"], [0, 13, 24, 9]),
            panel("Peticiones por endpoint", "bar",
                  f"SELECT method || ' ' || route AS endpoint, count(*) AS peticiones {HTTP} GROUP BY endpoint ORDER BY peticiones DESC",
                  "app_logs", ["endpoint"], ["peticiones"], [24, 13, 24, 9]),
            panel("Distribución de statusCode", "pie",
                  f"SELECT CAST(status_code AS VARCHAR) AS status, count(*) AS total {HTTP} GROUP BY status",
                  "app_logs", ["status"], ["total"], [0, 22, 16, 9]),
            panel("Latencia de consultas a PostgreSQL (trazas, ms)", "line",
                  f"SELECT {H} AS tiempo, round(avg(duration) / 1000.0, 3) AS db_ms {TRACES} "
                  f"WHERE operation_name LIKE 'pg.query%' GROUP BY tiempo ORDER BY tiempo",
                  "default", ["tiempo"], ["db_ms"], [16, 22, 32, 9], stream_type="traces"),
            panel("Últimas peticiones (endpoint, statusCode, latencia, timestamp)", "table",
                  f"SELECT request_timestamp AS timestamp, method AS metodo, route AS endpoint, status_code, duration_ms AS latencia_ms, trace_id "
                  f"{HTTP} ORDER BY _timestamp DESC LIMIT 100",
                  "app_logs", ["timestamp", "metodo", "endpoint", "status_code", "latencia_ms", "trace_id"], [], [0, 31, 48, 10]),
            panel("Errores y advertencias de la aplicación (4xx / 5xx / excepciones)", "table",
                  "SELECT _timestamp AS fecha, level AS nivel, body AS mensaje, path FROM app_logs "
                  "WHERE level IN ('error', 'warn') ORDER BY _timestamp DESC LIMIT 50",
                  "app_logs", ["fecha", "nivel", "mensaje", "path"], [], [0, 41, 48, 8]),
        ],
    )

    infra = dashboard(
        "3. Infraestructura EC2",
        "Recursos del servidor: CPU, RAM, ancho de banda, temperatura, carga y disco",
        [
            panel("CPU actual (%)", "metric", "SELECT round(avg(cpu_percent), 1) AS cpu FROM host_metrics WHERE host != 'setup'", "host_metrics", [], ["cpu"], [0, 0, 12, 5]),
            panel("RAM actual (%)", "metric", "SELECT round(avg(memory_percent), 1) AS ram FROM host_metrics", "host_metrics", [], ["ram"], [12, 0, 12, 5]),
            panel("Temperatura (°C)", "metric", "SELECT round(avg(temperature_c), 1) AS temp FROM host_metrics", "host_metrics", [], ["temp"], [24, 0, 12, 5]),
            panel("Tráfico de red promedio (kbps)", "metric", "SELECT round(avg(net_rx_kbps + net_tx_kbps), 1) AS kbps FROM host_metrics",
                  "host_metrics", [], ["kbps"], [36, 0, 12, 5]),
            cpu([0, 5, 24, 8]), ram([24, 5, 24, 8]), net([0, 13, 24, 8]), temp([24, 13, 24, 8]),
            panel("Memoria usada (MB)", "area",
                  f"SELECT {H} AS tiempo, avg(memory_used_mb) AS usada_mb, max(memory_total_mb) AS total_mb FROM host_metrics GROUP BY tiempo ORDER BY tiempo",
                  "host_metrics", ["tiempo"], ["usada_mb", "total_mb"], [0, 21, 24, 8]),
            panel("Carga del sistema (load average)", "line",
                  f"SELECT {H} AS tiempo, avg(load_1m) AS load_1m, avg(load_5m) AS load_5m, avg(load_15m) AS load_15m FROM host_metrics GROUP BY tiempo ORDER BY tiempo",
                  "host_metrics", ["tiempo"], ["load_1m", "load_5m", "load_15m"], [24, 21, 24, 8]),
            panel("CPU (%) - OTel Collector hostmetrics", "line",
                  f"SELECT {H} AS tiempo, round(100 - avg(value) * 100, 2) AS cpu_pct FROM system_cpu_utilization WHERE state = 'idle' GROUP BY tiempo ORDER BY tiempo",
                  "system_cpu_utilization", ["tiempo"], ["cpu_pct"], [0, 29, 16, 8], stream_type="metrics"),
            panel("RAM (%) - OTel Collector hostmetrics", "line",
                  f"SELECT {H} AS tiempo, round(avg(value) * 100, 2) AS ram_pct FROM system_memory_utilization WHERE state = 'used' GROUP BY tiempo ORDER BY tiempo",
                  "system_memory_utilization", ["tiempo"], ["ram_pct"], [16, 29, 16, 8], stream_type="metrics"),
            panel("Uso de disco (%) - OTel Collector", "line",
                  f"SELECT {H} AS tiempo, round(max(value) * 100, 2) AS disco_pct FROM system_filesystem_utilization GROUP BY tiempo ORDER BY tiempo",
                  "system_filesystem_utilization", ["tiempo"], ["disco_pct"], [32, 29, 16, 8], stream_type="metrics"),
        ],
    )

    cicd = dashboard(
        "4. Pipeline CI/CD",
        "Resultados de pruebas y despliegues registrados desde GitHub Actions",
        [
            panel("Ejecuciones de pruebas", "metric", "SELECT count(*) AS total FROM cicd_events WHERE event_type = 'test_run'",
                  "cicd_events", [], ["total"], [0, 0, 12, 5], decimals=0),
            panel("Pruebas fallidas", "metric", "SELECT count(*) AS fallidas FROM cicd_events WHERE event_type = 'test_run' AND status = 'failure'",
                  "cicd_events", [], ["fallidas"], [12, 0, 12, 5], decimals=0),
            panel("Despliegues exitosos", "metric", "SELECT count(*) AS despliegues FROM cicd_events WHERE event_type = 'deploy' AND status = 'success'",
                  "cicd_events", [], ["despliegues"], [24, 0, 12, 5], decimals=0),
            panel("Despliegues bloqueados", "metric", "SELECT count(*) AS bloqueados FROM cicd_events WHERE event_type = 'deploy' AND status = 'blocked'",
                  "cicd_events", [], ["bloqueados"], [36, 0, 12, 5], decimals=0),
            panel("Resultado por tipo de evento", "bar",
                  "SELECT event_type || ' / ' || status AS evento, count(*) AS total FROM cicd_events WHERE event_type != 'setup' GROUP BY evento ORDER BY total DESC",
                  "cicd_events", ["evento"], ["total"], [0, 5, 24, 8]),
            panel("Ejecuciones por usuario", "pie", "SELECT actor AS usuario, count(*) AS total FROM cicd_events WHERE event_type != 'setup' GROUP BY usuario",
                  "cicd_events", ["usuario"], ["total"], [24, 5, 24, 8]),
            pipeline_table([0, 13, 48, 12]),
        ],
        period="7d",
    )
    return [general, app, infra, cicd]


# ------------------------------------------------------------------ alertas
def build_alerts():
    def alert(name, stream, sql, description, period=5, frequency=1, silence=10):
        return {
            "name": name,
            "description": description,
            "stream_type": "logs",
            "stream_name": stream,
            "is_real_time": False,
            "query_condition": {"type": "sql", "sql": sql},
            "trigger_condition": {"period": period, "operator": ">=", "threshold": 1, "frequency": frequency, "silence": silence},
            "destinations": ["registro_alertas"],
            "enabled": True,
        }

    return [
        alert("api_errores_5xx", "app_logs",
              "SELECT count(*) AS errores FROM app_logs WHERE event = 'http_request' AND status_code >= 500 HAVING count(*) >= 1",
              "Se registró al menos un error HTTP 5xx en los últimos 5 minutos"),
        alert("api_latencia_alta", "app_logs",
              "SELECT avg(duration_ms) AS latencia FROM app_logs WHERE event = 'http_request' HAVING avg(duration_ms) > 1000",
              "La latencia promedio de la API superó 1000 ms en los últimos 5 minutos"),
        alert("api_logins_fallidos", "app_logs",
              "SELECT count(*) AS intentos FROM app_logs WHERE event = 'login_failed' HAVING count(*) >= 5",
              "5 o más intentos de login fallidos en 5 minutos"),
        alert("pipeline_fallido", "cicd_events",
              "SELECT count(*) AS fallos FROM cicd_events WHERE status IN ('failure', 'blocked') HAVING count(*) >= 1",
              "Falló una ejecución del pipeline o se bloqueó un despliegue", silence=1),
        alert("ec2_cpu_alta", "host_metrics",
              "SELECT avg(cpu_percent) AS cpu FROM host_metrics HAVING avg(cpu_percent) > 80",
              "Uso de CPU promedio > 80% en los últimos 5 minutos"),
        alert("ec2_ram_alta", "host_metrics",
              "SELECT avg(memory_percent) AS ram FROM host_metrics HAVING avg(memory_percent) > 85",
              "Uso de memoria RAM promedio > 85% en los últimos 5 minutos"),
    ]


def ensure_stream(name, sample):
    """Las alertas requieren que el stream exista: se crea con un registro inicial si hace falta."""
    status, data = api("GET", f"/api/{ORG}/streams?type=logs")
    names = {s["name"] for s in data.get("list", [])} if status == 200 else set()
    if name not in names:
        api("POST", f"/api/{ORG}/{name}/_json", [sample])


def find_ids(obj, key_id, key_name, name):
    """Busca recursivamente objetos con key_name == name y devuelve su key_id."""
    found = []
    if isinstance(obj, dict):
        if obj.get(key_name) == name and obj.get(key_id):
            found.append(obj[key_id])
        for v in obj.values():
            found += find_ids(v, key_id, key_name, name)
    elif isinstance(obj, list):
        for v in obj:
            found += find_ids(v, key_id, key_name, name)
    return found


def main():
    print(f"Configurando OpenObserve en {O2_URL} ...")
    wait_ready()

    # Streams necesarios para las alertas
    now = int(time.time() * 1_000_000)
    ensure_stream("cicd_events", {"_timestamp": now, "event_type": "setup", "status": "info", "detail": "Inicialización del stream"})
    ensure_stream("alertas_disparadas", {"_timestamp": now, "alert_name": "setup", "stream": "-", "alert_count": "0", "triggered_at": "-"})
    ensure_stream("app_logs", {"_timestamp": now, "event": "setup", "level": "info", "body": "Inicialización del stream"})
    ensure_stream("host_metrics", {"_timestamp": now, "host": "setup"})

    # Plantilla + destino (webhook hacia el propio OpenObserve)
    template = {
        "name": "alerta_json",
        "type": "http",
        "title": "",
        "body": json.dumps([{
            "alert_name": "{alert_name}", "stream": "{stream_name}", "status": "{alert_status}",
            "alert_count": "{alert_count}", "triggered_at": "{alert_trigger_time_str}",
            "period_min": "{alert_period}", "operator": "{alert_operator}", "threshold": "{alert_threshold}",
        }]),
    }
    status, res = api("POST", f"/api/{ORG}/alerts/templates", template)
    if status != 200:
        status, res = api("PUT", f"/api/{ORG}/alerts/templates/alerta_json", template)
    print("  plantilla alerta_json:", status, res.get("message", ""))

    destination = {
        "name": "registro_alertas",
        "type": "http",
        "url": f"http://localhost:5080/api/{ORG}/alertas_disparadas/_json",
        "method": "post",
        "skip_tls_verify": True,
        "template": "alerta_json",
        "headers": {"Authorization": AUTH},
    }
    status, res = api("POST", f"/api/{ORG}/alerts/destinations", destination)
    if status != 200:
        status, res = api("PUT", f"/api/{ORG}/alerts/destinations/registro_alertas", destination)
    print("  destino registro_alertas:", status, res.get("message", ""))

    # Alertas (se reemplazan si ya existen)
    _, existing = api("GET", f"/api/v2/{ORG}/alerts")
    for alert in build_alerts():
        for aid in find_ids(existing, "alert_id", "name", alert["name"]) + find_ids(existing, "id", "name", alert["name"]):
            api("DELETE", f"/api/v2/{ORG}/alerts/{aid}")
        status, res = api("POST", f"/api/v2/{ORG}/alerts", alert)
        print(f"  alerta {alert['name']}:", status, res.get("message", ""))

    # Dashboards (se reemplazan si ya existen)
    _, existing = api("GET", f"/api/{ORG}/dashboards")
    for dash in build_dashboards():
        for did in set(find_ids(existing, "dashboardId", "title", dash["title"])):
            api("DELETE", f"/api/{ORG}/dashboards/{did}")
        status, res = api("POST", f"/api/{ORG}/dashboards", dash)
        print(f"  dashboard '{dash['title']}':", status, "" if status == 200 else res)

    print("Listo. Abre", O2_URL, "-> Dashboards / Alerts")


if __name__ == "__main__":
    main()
