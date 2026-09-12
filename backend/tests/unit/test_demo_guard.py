"""Tests for the read-only demo guard.

The middleware is exercised on a throwaway app rather than on app.main, because
main wires the guard in at import time from settings. Testing it in isolation
keeps these tests independent of import order and of the ambient DEMO_MODE value.
"""

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.core.demo_guard import (
    ALLOWED_WRITE_PATHS,
    DEMO_MESSAGE,
    SAFE_METHODS,
    ReadOnlyDemoMiddleware,
)


@pytest.fixture
def client() -> TestClient:
    app = FastAPI()
    app.add_middleware(ReadOnlyDemoMiddleware)

    # Mirrors the real surface: a read route, a write route, and the one write
    # the demo must keep working.
    @app.get("/api/results/")
    async def list_results():
        return {"ok": True}

    @app.post("/api/experiments/1/start")
    async def start_experiment():
        return {"started": True}

    @app.delete("/api/experiments/1")
    async def delete_experiment():
        return {"deleted": True}

    @app.post("/api/auth/login")
    async def login():
        return {"token": "t"}

    @app.post("/api/auth/register")
    async def register():
        return {"created": True}

    return TestClient(app)


def test_get_is_allowed(client):
    response = client.get("/api/results/")
    assert response.status_code == 200
    assert response.json() == {"ok": True}


@pytest.mark.parametrize(
    "method,path",
    [
        ("post", "/api/experiments/1/start"),
        ("delete", "/api/experiments/1"),
    ],
)
def test_mutating_requests_are_refused(client, method, path):
    response = getattr(client, method)(path)
    assert response.status_code == 403
    assert response.json()["detail"] == DEMO_MESSAGE


def test_login_is_still_allowed(client):
    # Without this the SPA cannot obtain a token and the demo shows nothing.
    response = client.post("/api/auth/login")
    assert response.status_code == 200


def test_registration_is_refused(client):
    # Deliberately absent from the allow-list: the demo must not accrue accounts.
    response = client.post("/api/auth/register")
    assert response.status_code == 403


def test_refusal_body_matches_api_error_shape(client):
    # The frontend renders error.response.data.detail in its snackbar, so the
    # refusal has to use the same envelope as every other API error.
    body = client.post("/api/experiments/1/start").json()
    assert set(body) == {"detail"}
    assert isinstance(body["detail"], str)


def test_safe_methods_do_not_include_mutating_verbs():
    assert SAFE_METHODS.isdisjoint({"POST", "PUT", "PATCH", "DELETE"})


def test_allowed_write_paths_are_auth_only():
    # A non-auth path slipping into this set would silently open a write hole.
    assert all(path.startswith("/api/auth/") for path in ALLOWED_WRITE_PATHS)
