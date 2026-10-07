"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

import { SIGN_IN_URL } from "../lib/session";

type Todo = {
  id: number;
  title: string;
  done: boolean;
  created_at: string;
};

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...init?.headers },
  });
  if (res.status === 401) {
    // Session expired: oauth2-proxy restarts the login flow and returns here.
    window.location.href = SIGN_IN_URL;
    throw new Error("Redirecting to sign in…");
  }
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.detail ?? `Request failed (${res.status})`);
  }
  return (res.status === 204 ? null : await res.json()) as T;
}

export default function Home() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [workerReply, setWorkerReply] = useState<string | null>(null);
  const [callingWorker, setCallingWorker] = useState(false);

  const run = useCallback(async (action: () => Promise<void>) => {
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    run(async () => {
      setTodos(await api<Todo[]>("/todos"));
    }).finally(() => setLoading(false));
  }, [run]);

  const addTodo = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return;
    run(async () => {
      const todo = await api<Todo>("/todos", {
        method: "POST",
        body: JSON.stringify({ title: trimmed }),
      });
      setTodos((prev) => [...prev, todo]);
      setTitle("");
    });
  };

  const toggleTodo = (todo: Todo) =>
    run(async () => {
      const updated = await api<Todo>(`/todos/${todo.id}`, {
        method: "PATCH",
        body: JSON.stringify({ done: !todo.done }),
      });
      setTodos((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
    });

  const deleteTodo = (todo: Todo) =>
    run(async () => {
      await api<null>(`/todos/${todo.id}`, { method: "DELETE" });
      setTodos((prev) => prev.filter((t) => t.id !== todo.id));
    });

  const callWorker = () => {
    setCallingWorker(true);
    run(async () => {
      const res = await api<{ message: string }>("/hello");
      setWorkerReply(res.message);
    }).finally(() => setCallingWorker(false));
  };

  const remaining = todos.filter((t) => !t.done).length;

  return (
    <main className="container">
      <header className="header">
        <h1>My todos</h1>
        <button className="btn-secondary" onClick={callWorker} disabled={callingWorker}>
          {callingWorker ? "Calling…" : "Call Rust worker"}
        </button>
      </header>

      {workerReply && (
        <p className="worker-reply">
          <span className="muted">Rust worker says:</span> {workerReply}
        </p>
      )}

      <form className="add-form" onSubmit={addTodo}>
        <input
          aria-label="New todo"
          placeholder="What needs to be done?"
          value={title}
          maxLength={500}
          onChange={(e) => setTitle(e.target.value)}
        />
        <button type="submit" disabled={!title.trim()}>
          Add
        </button>
      </form>

      {error && <p className="error">{error}</p>}

      {loading ? (
        <p className="muted">Loading…</p>
      ) : todos.length === 0 ? (
        <p className="muted">Nothing to do yet. Add your first todo above.</p>
      ) : (
        <ul className="list">
          {todos.map((todo) => (
            <li key={todo.id} className={todo.done ? "done" : ""}>
              <label>
                <input
                  type="checkbox"
                  checked={todo.done}
                  onChange={() => toggleTodo(todo)}
                />
                <span>{todo.title}</span>
              </label>
              <button
                className="delete"
                aria-label={`Delete ${todo.title}`}
                onClick={() => deleteTodo(todo)}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      {todos.length > 0 && (
        <p className="muted footer">
          {remaining} of {todos.length} remaining
        </p>
      )}
    </main>
  );
}
