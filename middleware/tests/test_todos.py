import httpx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db import Base, get_session
from app.main import app


@pytest.fixture
def client():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    TestSession = sessionmaker(bind=engine, expire_on_commit=False)

    def override_session():
        with TestSession() as session:
            yield session

    app.dependency_overrides[get_session] = override_session
    yield TestClient(app)
    app.dependency_overrides.clear()


def test_healthz(client):
    assert client.get("/healthz").json() == {"status": "ok"}


def test_crud_flow(client):
    created = client.post("/api/todos", json={"title": "  buy milk  "})
    assert created.status_code == 201
    todo = created.json()
    assert todo["title"] == "buy milk"
    assert todo["done"] is False

    updated = client.patch(f"/api/todos/{todo['id']}", json={"done": True})
    assert updated.json()["done"] is True

    assert [t["id"] for t in client.get("/api/todos").json()] == [todo["id"]]


def test_empty_title_rejected(client):
    assert client.post("/api/todos", json={"title": ""}).status_code == 422


def test_missing_todo_returns_404(client):
    assert client.patch("/api/todos/999", json={"done": True}).status_code == 404


def test_todos_are_scoped_per_user(client):
    alice = {"X-Forwarded-Email": "alice@example.com"}
    bob = {"X-Forwarded-Email": "bob@example.com"}

    todo = client.post("/api/todos", json={"title": "alice's"}, headers=alice).json()

    assert client.get("/api/todos", headers=bob).json() == []
    patch = client.patch(f"/api/todos/{todo['id']}", json={"done": True}, headers=bob)
    assert patch.status_code == 404
    assert len(client.get("/api/todos", headers=alice).json()) == 1


def test_me_defaults_to_anonymous(client):
    assert client.get("/api/me").json() == {"user": "anonymous"}


@pytest.fixture
def worker_delete(monkeypatch):
    """Replaces the HTTP call to the Rust worker; records what was sent."""
    calls = []
    reply = {"status": 204}

    def fake_delete(url, headers, timeout):
        calls.append({"url": url, "headers": headers})
        if reply["status"] is None:
            raise httpx.ConnectError("connection refused")
        return httpx.Response(reply["status"], request=httpx.Request("DELETE", url))

    monkeypatch.setattr("app.main.httpx.delete", fake_delete)
    return calls, reply


def test_delete_is_delegated_to_worker(client, worker_delete):
    calls, _ = worker_delete
    alice = {"X-Forwarded-Email": "alice@example.com"}

    assert client.delete("/api/todos/7", headers=alice).status_code == 204
    assert calls == [
        {
            "url": "http://localhost:8080/todos/7",
            "headers": {"X-User-Id": "alice@example.com"},
        }
    ]


@pytest.mark.parametrize(
    ("worker_status", "expected"),
    [(404, 404), (500, 502), (503, 502), (None, 502)],
)
def test_delete_maps_worker_errors(client, worker_delete, worker_status, expected):
    _, reply = worker_delete
    reply["status"] = worker_status

    assert client.delete("/api/todos/7").status_code == expected


def test_delete_requires_auth_before_calling_worker(client, worker_delete, monkeypatch):
    calls, _ = worker_delete
    monkeypatch.setattr("app.main.REQUIRE_AUTH", True)

    assert client.delete("/api/todos/7").status_code == 401
    assert calls == []


def test_hello_proxies_worker_response(client, monkeypatch):
    def fake_get(url, timeout):
        assert url.endswith("/hello")
        return httpx.Response(
            200, text="hello world from Rust", request=httpx.Request("GET", url)
        )

    monkeypatch.setattr("app.main.httpx.get", fake_get)

    assert client.get("/api/hello").json() == {
        "message": "hello world from Rust",
        "source": "rust-worker",
    }


def test_hello_returns_502_when_worker_down(client, monkeypatch):
    def fake_get(url, timeout):
        raise httpx.ConnectError("connection refused")

    monkeypatch.setattr("app.main.httpx.get", fake_get)

    res = client.get("/api/hello")
    assert res.status_code == 502
    assert res.json() == {"detail": "Worker unavailable"}


def test_require_auth_rejects_missing_identity(client, monkeypatch):
    monkeypatch.setattr("app.main.REQUIRE_AUTH", True)

    assert client.get("/api/todos").status_code == 401
    me = client.get("/api/me", headers={"X-Forwarded-Email": "a@example.com"})
    assert me.json() == {"user": "a@example.com"}
