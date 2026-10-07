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

    assert client.delete(f"/api/todos/{todo['id']}").status_code == 204
    assert client.get("/api/todos").json() == []


def test_empty_title_rejected(client):
    assert client.post("/api/todos", json={"title": ""}).status_code == 422


def test_missing_todo_returns_404(client):
    assert client.patch("/api/todos/999", json={"done": True}).status_code == 404


def test_todos_are_scoped_per_user(client):
    alice = {"X-Forwarded-Email": "alice@example.com"}
    bob = {"X-Forwarded-Email": "bob@example.com"}

    todo = client.post("/api/todos", json={"title": "alice's"}, headers=alice).json()

    assert client.get("/api/todos", headers=bob).json() == []
    assert client.delete(f"/api/todos/{todo['id']}", headers=bob).status_code == 404
    assert len(client.get("/api/todos", headers=alice).json()) == 1


def test_me_defaults_to_anonymous(client):
    assert client.get("/api/me").json() == {"user": "anonymous"}


def test_require_auth_rejects_missing_identity(client, monkeypatch):
    monkeypatch.setattr("app.main.REQUIRE_AUTH", True)

    assert client.get("/api/todos").status_code == 401
    me = client.get("/api/me", headers={"X-Forwarded-Email": "a@example.com"})
    assert me.json() == {"user": "a@example.com"}
