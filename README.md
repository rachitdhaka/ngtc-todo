# Todo App

A simple todo application split into five containers, protected by OAuth.

```
Browser ──► oauth2-proxy :4180 ──► frontend (Next.js) ──► middleware (FastAPI) ──► db (PostgreSQL)
                 │                  /api/* proxied        reads X-Forwarded-Email
                 ▼                                              │ GET /api/hello
        GitHub / Google (OAuth provider)                        │ DELETE /api/todos/{id}
                                                                ▼
                                                        worker (Rust, axum) ──► db
                                                        "hello world from Rust"
```

| Route      | Access  | What |
|------------|---------|------|
| `/`        | public  | Landing page with "Sign in with GitHub" |
| `/todos`   | login   | The todo list |
| `/api/*`   | login   | FastAPI, proxied by Next.js (401 when not signed in) |
| `/oauth2/*`| —       | oauth2-proxy: `start`, `callback`, `sign_out`, `userinfo` |

The navbar reads `/oauth2/userinfo` to show the signed-in GitHub user in the
profile menu.

Only oauth2-proxy is published to the host. Everything behind it is on the
internal Docker network, so the login cannot be bypassed.

| Service      | Tech                         | Folder         | Exposed on host |
|--------------|------------------------------|----------------|-----------------|
| `oauth2-proxy` | oauth2-proxy v7.15         | (compose only) | `localhost:4180` |
| `frontend`   | Next.js 16 / React 19        | `frontend/`    | no |
| `middleware` | Python 3.12, FastAPI, SQLAlchemy | `middleware/` | no |
| `worker`     | Rust, axum (distroless image) | `worker-rust/` | no |
| `db`         | PostgreSQL 16                | `db/init.sql`  | no |

## OAuth setup (one time)

1. Register an OAuth app with your provider:
   - **GitHub:** Settings → Developer settings → OAuth Apps → New OAuth App
   - **Google:** Cloud Console → APIs & Services → Credentials → OAuth client ID (Web application)
2. Use these values:
   - Homepage URL: `http://localhost:4180`
   - Authorization callback / redirect URI: `http://localhost:4180/oauth2/callback`
3. `cp .env.example .env` and fill in `OAUTH2_PROVIDER`, `OAUTH2_CLIENT_ID`,
   `OAUTH2_CLIENT_SECRET`, and a generated `OAUTH2_COOKIE_SECRET` (command in the file).

## Run it

```bash
docker compose up -d --build
open http://localhost:4180      # redirects to the provider to sign in
```

Stop with `docker compose down` (add `-v` to also wipe the database volume).

## API (middleware)

| Method | Path               | Body                         |
|--------|--------------------|------------------------------|
| GET    | `/healthz`         | —                            |
| GET    | `/api/me`          | —                            |
| GET    | `/api/hello`       | — (calls the Rust worker; 502 if it is down) |
| GET    | `/api/todos`       | —                            |
| POST   | `/api/todos`       | `{"title": "..."}`           |
| PATCH  | `/api/todos/{id}`  | `{"title"?: "...", "done"?: bool}` |
| DELETE | `/api/todos/{id}`  | — (**handled by the Rust worker**) |

FastAPI creates, lists and updates todos. Deleting is delegated to the Rust
worker: FastAPI authenticates the user, then calls `DELETE /todos/{id}` on the
worker with an `X-User-Id` header, and the worker runs
`DELETE FROM todos WHERE id = $1 AND user_id = $2` (204 deleted, 404 not found
or not yours, 502 from FastAPI if the worker or DB is down).

Todos are scoped by user, taken from the `X-Forwarded-Email` header that
oauth2-proxy sets after login. In compose `REQUIRE_AUTH=true`, so a request with
no identity gets `401`. With it unset (local dev, tests) the user is `anonymous`.

## Local development

```bash
# middleware
cd middleware
python3 -m venv .venv && .venv/bin/pip install -r requirements-dev.txt
.venv/bin/pytest -q && .venv/bin/ruff check .

# worker (or use the rust:1-slim Docker image if cargo isn't installed)
cd worker-rust
cargo test

# frontend (expects the API on localhost:8000, or set API_URL)
cd frontend
npm install && npm run dev
```

## Roadmap

- [x] Frontend, middleware, database as separate containers
- [x] OAuth: oauth2-proxy in front of the app, GitHub/Google as provider
- [x] Rust worker process behind `GET /api/hello`
- [ ] CI/CD pipeline (GitHub Actions → GHCR)
