//! Worker process: a small HTTP service called by the FastAPI middleware.
//!
//! GET    /hello       -> "hello world from Rust"
//! GET    /healthz     -> "ok"
//! DELETE /todos/{id}  -> deletes the todo owned by the `X-User-Id` header's user
//!                        204 deleted, 404 not found / not owned, 400 no user
//!
//! FastAPI handles create/list/update and authenticates the user; deleting a
//! todo is delegated here. The worker is only reachable on the internal network.
//!
//! `worker healthcheck` probes /healthz and exits 0/1, so the distroless
//! image (no shell, no curl) can still have a Docker healthcheck.

use std::io::{Read, Write};
use std::net::TcpStream;
use std::time::Duration;

use axum::{
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    routing::{delete, get},
    Router,
};
use deadpool_postgres::{tokio_postgres, Manager, ManagerConfig, Pool, RecyclingMethod};

pub const GREETING: &str = "hello world from Rust";
const USER_HEADER: &str = "x-user-id";

#[derive(Clone)]
struct AppState {
    pool: Pool,
}

fn app(state: AppState) -> Router {
    Router::new()
        .route("/hello", get(hello))
        .route("/healthz", get(|| async { "ok" }))
        .route("/todos/{id}", delete(delete_todo))
        .with_state(state)
}

async fn hello() -> &'static str {
    GREETING
}

async fn delete_todo(
    State(state): State<AppState>,
    Path(id): Path<i32>,
    headers: HeaderMap,
) -> StatusCode {
    let Some(user) = headers
        .get(USER_HEADER)
        .and_then(|v| v.to_str().ok())
        .filter(|u| !u.is_empty())
    else {
        return StatusCode::BAD_REQUEST;
    };

    let client = match state.pool.get().await {
        Ok(client) => client,
        Err(err) => {
            eprintln!("database unavailable: {err}");
            return StatusCode::SERVICE_UNAVAILABLE;
        }
    };

    // Scoping by user_id means a user can never delete someone else's todo.
    match client
        .execute(
            "DELETE FROM todos WHERE id = $1 AND user_id = $2",
            &[&id, &user],
        )
        .await
    {
        Ok(0) => StatusCode::NOT_FOUND,
        Ok(_) => StatusCode::NO_CONTENT,
        Err(err) => {
            eprintln!("delete failed: {err}");
            StatusCode::INTERNAL_SERVER_ERROR
        }
    }
}

fn database_pool() -> Pool {
    let url = std::env::var("DATABASE_URL")
        .unwrap_or_else(|_| "postgres://todo:todo@localhost:5432/todo".to_string());
    let config: tokio_postgres::Config = url.parse().expect("invalid DATABASE_URL");
    let manager = Manager::from_config(
        config,
        tokio_postgres::NoTls,
        ManagerConfig {
            recycling_method: RecyclingMethod::Fast,
        },
    );
    // Connections are opened lazily, so the worker starts even if the DB is not up yet.
    Pool::builder(manager)
        .max_size(8)
        .build()
        .expect("build database pool")
}

fn port() -> u16 {
    std::env::var("PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(8080)
}

fn healthcheck() -> bool {
    let probe = || -> std::io::Result<bool> {
        let mut stream = TcpStream::connect(("127.0.0.1", port()))?;
        stream.set_read_timeout(Some(Duration::from_secs(2)))?;
        stream.write_all(
            b"GET /healthz HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n",
        )?;
        let mut response = String::new();
        stream.read_to_string(&mut response)?;
        Ok(response.starts_with("HTTP/1.1 200"))
    };
    probe().unwrap_or(false)
}

async fn shutdown_signal() {
    let ctrl_c = async {
        tokio::signal::ctrl_c().await.ok();
    };
    let terminate = async {
        tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
            .expect("install SIGTERM handler")
            .recv()
            .await;
    };
    tokio::select! {
        _ = ctrl_c => {},
        _ = terminate => {},
    }
}

#[tokio::main]
async fn main() {
    if std::env::args().nth(1).as_deref() == Some("healthcheck") {
        std::process::exit(if healthcheck() { 0 } else { 1 });
    }

    let state = AppState {
        pool: database_pool(),
    };

    let listener = tokio::net::TcpListener::bind(("0.0.0.0", port()))
        .await
        .expect("bind listener");
    println!("worker listening on {}", listener.local_addr().unwrap());

    axum::serve(listener, app(state))
        .with_graceful_shutdown(shutdown_signal())
        .await
        .expect("server error");
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::body::Body;
    use axum::http::Request;
    use http_body_util::BodyExt;
    use tower::ServiceExt;

    fn test_app() -> Router {
        // Points at a closed port: these tests never reach the database.
        std::env::set_var("DATABASE_URL", "postgres://u:p@127.0.0.1:1/none");
        app(AppState {
            pool: database_pool(),
        })
    }

    async fn send(request: Request<Body>) -> (StatusCode, String) {
        let response = test_app().oneshot(request).await.unwrap();
        let status = response.status();
        let body = response.into_body().collect().await.unwrap().to_bytes();
        (status, String::from_utf8(body.to_vec()).unwrap())
    }

    fn get(path: &str) -> Request<Body> {
        Request::get(path).body(Body::empty()).unwrap()
    }

    #[tokio::test]
    async fn hello_returns_greeting() {
        assert_eq!(
            send(get("/hello")).await,
            (StatusCode::OK, GREETING.to_string())
        );
    }

    #[tokio::test]
    async fn healthz_returns_ok() {
        assert_eq!(
            send(get("/healthz")).await,
            (StatusCode::OK, "ok".to_string())
        );
    }

    #[tokio::test]
    async fn unknown_route_is_404() {
        assert_eq!(send(get("/nope")).await.0, StatusCode::NOT_FOUND);
    }

    #[tokio::test]
    async fn delete_without_user_is_400() {
        let req = Request::delete("/todos/1").body(Body::empty()).unwrap();
        assert_eq!(send(req).await.0, StatusCode::BAD_REQUEST);
    }

    #[tokio::test]
    async fn delete_with_non_numeric_id_is_400() {
        let req = Request::delete("/todos/abc")
            .header(USER_HEADER, "a@example.com")
            .body(Body::empty())
            .unwrap();
        assert_eq!(send(req).await.0, StatusCode::BAD_REQUEST);
    }

    #[tokio::test]
    async fn delete_when_database_down_is_503() {
        let req = Request::delete("/todos/1")
            .header(USER_HEADER, "a@example.com")
            .body(Body::empty())
            .unwrap();
        assert_eq!(send(req).await.0, StatusCode::SERVICE_UNAVAILABLE);
    }
}
