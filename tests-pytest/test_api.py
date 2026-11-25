"""Pruebas de humo de la API con Pytest (contra la app levantada con Docker Compose).

Uso:  BASE_URL=http://localhost:8080 pytest tests-pytest -v
"""
import json
import os
import time
import urllib.error
import urllib.request

import pytest

BASE_URL = os.environ.get("BASE_URL", "http://localhost:8080").rstrip("/")
ADMIN = {
    "email": os.environ.get("ADMIN_EMAIL", "admin@demo.com"),
    "password": os.environ.get("ADMIN_PASSWORD", "Admin123!"),
}


def call(method, path, body=None, token=None):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(f"{BASE_URL}{path}", data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            raw = resp.read()
            return resp.status, (json.loads(raw) if raw else None)
    except urllib.error.HTTPError as err:
        raw = err.read()
        return err.code, (json.loads(raw) if raw else None)


@pytest.fixture(scope="session")
def token():
    status, body = call("POST", "/api/auth/login", ADMIN)
    assert status == 200, body
    return body["token"]


def test_health():
    status, body = call("GET", "/api/health")
    assert status == 200
    assert body["status"] == "ok"


def test_login_incorrecto():
    status, body = call("POST", "/api/auth/login", {"email": ADMIN["email"], "password": "mala"})
    assert status == 401
    assert body["error"] == "Credenciales inválidas"


def test_sin_token_es_401():
    assert call("GET", "/api/products")[0] == 401
    assert call("GET", "/api/users")[0] == 401


def test_crud_productos(token):
    name = f"Pytest-{int(time.time() * 1000)}"
    status, created = call("POST", "/api/products", {"name": name, "price": 99.5, "stock": 3}, token)
    assert status == 201 and created["name"] == name
    pid = created["id"]

    status, updated = call("PUT", f"/api/products/{pid}", {"name": name, "price": 120, "stock": 7}, token)
    assert status == 200 and updated["price"] == 120 and updated["stock"] == 7

    assert call("DELETE", f"/api/products/{pid}", token=token)[0] == 204
    assert call("GET", f"/api/products/{pid}", token=token)[0] == 404


def test_crud_usuarios(token):
    email = f"pytest-{int(time.time() * 1000)}@test.com"
    status, created = call("POST", "/api/users", {"name": "Py", "email": email, "password": "secreto1"}, token)
    assert status == 201
    uid = created["id"]

    status, updated = call("PUT", f"/api/users/{uid}", {"name": "Py Editado", "email": email}, token)
    assert status == 200 and updated["name"] == "Py Editado"

    assert call("DELETE", f"/api/users/{uid}", token=token)[0] == 204


def test_validacion_producto(token):
    status, body = call("POST", "/api/products", {"name": "", "price": -5}, token)
    assert status == 400
    assert "precio" in body["error"]
