import os
from typing import Annotated

from fastapi import Depends, FastAPI, Header, HTTPException, Response, status
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from .db import get_session
from .models import Todo
from .schemas import TodoCreate, TodoOut, TodoUpdate, UserOut

REQUIRE_AUTH = os.getenv("REQUIRE_AUTH", "false").lower() == "true"

app = FastAPI(title="Todo API", version="1.0.0")

SessionDep = Annotated[Session, Depends(get_session)]


def current_user(
    x_forwarded_email: Annotated[str | None, Header()] = None,
) -> str:
    # oauth2-proxy authenticates the user and sets X-Forwarded-Email.
    # With REQUIRE_AUTH off (local dev / tests) requests fall back to "anonymous".
    if x_forwarded_email:
        return x_forwarded_email
    if REQUIRE_AUTH:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not authenticated")
    return "anonymous"


UserDep = Annotated[str, Depends(current_user)]


def get_owned_todo(session: Session, todo_id: int, user: str) -> Todo:
    todo = session.get(Todo, todo_id)
    if todo is None or todo.user_id != user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Todo not found")
    return todo


@app.get("/healthz")
def healthz(session: SessionDep) -> dict[str, str]:
    session.execute(text("SELECT 1"))
    return {"status": "ok"}


@app.get("/api/me", response_model=UserOut)
def me(user: UserDep) -> UserOut:
    return UserOut(user=user)


@app.get("/api/todos", response_model=list[TodoOut])
def list_todos(session: SessionDep, user: UserDep) -> list[Todo]:
    stmt = select(Todo).where(Todo.user_id == user).order_by(Todo.id)
    return list(session.scalars(stmt))


@app.post("/api/todos", response_model=TodoOut, status_code=status.HTTP_201_CREATED)
def create_todo(body: TodoCreate, session: SessionDep, user: UserDep) -> Todo:
    todo = Todo(user_id=user, title=body.title.strip())
    session.add(todo)
    session.commit()
    session.refresh(todo)
    return todo


@app.patch("/api/todos/{todo_id}", response_model=TodoOut)
def update_todo(
    todo_id: int, body: TodoUpdate, session: SessionDep, user: UserDep
) -> Todo:
    todo = get_owned_todo(session, todo_id, user)
    if body.title is not None:
        todo.title = body.title.strip()
    if body.done is not None:
        todo.done = body.done
    session.commit()
    session.refresh(todo)
    return todo


@app.delete("/api/todos/{todo_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_todo(todo_id: int, session: SessionDep, user: UserDep) -> Response:
    todo = get_owned_todo(session, todo_id, user)
    session.delete(todo)
    session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
