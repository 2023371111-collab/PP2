"""
Agente de métricas del host -> OpenObserve (API HTTP/JSON, stream "host_metrics").

Cada INTERVAL_SECONDS envía: CPU %, RAM %, ancho de banda (RX/TX bytes/s), carga
y temperatura. Lee /proc y /sys del host (montados en /host/proc y /host/sys).

Temperatura: se usa el sensor real si el host lo expone (thermal_zone / hwmon).
Las máquinas virtuales de AWS EC2 normalmente NO exponen sensores térmicos; en ese
caso se reporta una temperatura ESTIMADA a partir del uso de CPU y se marca con
temperature_source = "estimated_from_cpu" para que sea transparente en el dashboard.
"""
import base64
import glob
import json
import os
import socket
import time
import urllib.request
from datetime import datetime, timezone

PROC = os.environ.get("HOST_PROC", "/host/proc")
SYS = os.environ.get("HOST_SYS", "/host/sys")
O2_URL = os.environ.get("O2_URL", "http://localhost:5080").rstrip("/")
ORG = os.environ.get("O2_ORG", "default")
STREAM = os.environ.get("O2_STREAM", "host_metrics")
INTERVAL = int(os.environ.get("INTERVAL_SECONDS", "15"))
HOST = os.environ.get("HOST_NAME") or socket.gethostname()
AUTH = base64.b64encode(f"{os.environ['O2_USER']}:{os.environ['O2_PASSWORD']}".encode()).decode()
SKIP_IFACES = ("lo", "docker", "veth", "br-")


def read(path):
    with open(path) as f:
        return f.read()


def cpu_times():
    parts = read(f"{PROC}/stat").splitlines()[0].split()[1:]
    values = list(map(int, parts))
    idle = values[3] + values[4]  # idle + iowait
    return idle, sum(values)


def memory():
    info = {}
    for line in read(f"{PROC}/meminfo").splitlines():
        key, val = line.split(":", 1)
        info[key] = int(val.split()[0]) * 1024
    total, available = info["MemTotal"], info.get("MemAvailable", info["MemFree"])
    return total, total - available


def network():
    rx = tx = 0
    for line in read(f"{PROC}/net/dev").splitlines()[2:]:
        name, data = line.split(":", 1)
        if name.strip().startswith(SKIP_IFACES):
            continue
        fields = data.split()
        rx += int(fields[0])
        tx += int(fields[8])
    return rx, tx


def real_temperature():
    temps = []
    for path in glob.glob(f"{SYS}/class/thermal/thermal_zone*/temp") + glob.glob(f"{SYS}/class/hwmon/hwmon*/temp*_input"):
        try:
            value = int(read(path).strip()) / 1000.0
            if 0 < value < 150:
                temps.append(value)
        except (OSError, ValueError):
            pass
    return max(temps) if temps else None


def send(record):
    req = urllib.request.Request(
        f"{O2_URL}/api/{ORG}/{STREAM}/_json",
        data=json.dumps([record]).encode(),
        headers={"Content-Type": "application/json", "Authorization": f"Basic {AUTH}"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=10) as resp:
        resp.read()


def main():
    print(f"[host-agent] enviando a {O2_URL}/api/{ORG}/{STREAM} cada {INTERVAL}s", flush=True)
    prev_idle, prev_total = cpu_times()
    prev_rx, prev_tx = network()
    prev_t = time.time()
    while True:
        time.sleep(INTERVAL)
        try:
            idle, total = cpu_times()
            rx, tx = network()
            now = time.time()
            elapsed = max(now - prev_t, 1e-6)
            dt_total = max(total - prev_total, 1)
            cpu_pct = round(100.0 * (1 - (idle - prev_idle) / dt_total), 2)
            mem_total, mem_used = memory()
            load1, load5, load15 = map(float, read(f"{PROC}/loadavg").split()[:3])

            temp = real_temperature()
            source = "sensor"
            if temp is None:
                temp = round(38.0 + cpu_pct * 0.45, 2)  # modelo lineal aproximado
                source = "estimated_from_cpu"

            record = {
                "_timestamp": int(now * 1_000_000),
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "host": HOST,
                "cpu_percent": cpu_pct,
                "memory_percent": round(100.0 * mem_used / mem_total, 2),
                "memory_used_mb": round(mem_used / 1048576, 1),
                "memory_total_mb": round(mem_total / 1048576, 1),
                "net_rx_bytes_per_sec": round((rx - prev_rx) / elapsed, 1),
                "net_tx_bytes_per_sec": round((tx - prev_tx) / elapsed, 1),
                "net_rx_kbps": round((rx - prev_rx) * 8 / 1000 / elapsed, 2),
                "net_tx_kbps": round((tx - prev_tx) * 8 / 1000 / elapsed, 2),
                "load_1m": load1,
                "load_5m": load5,
                "load_15m": load15,
                "temperature_c": temp,
                "temperature_source": source,
            }
            send(record)
            prev_idle, prev_total, prev_rx, prev_tx, prev_t = idle, total, rx, tx, now
        except Exception as exc:  # noqa: BLE001 - el agente nunca debe morir
            print(f"[host-agent] error: {exc}", flush=True)


if __name__ == "__main__":
    main()
