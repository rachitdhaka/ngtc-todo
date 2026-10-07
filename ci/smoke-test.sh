#!/usr/bin/env bash
# Builds and starts the full stack, runs end-to-end checks, always tears down.
# Used by the pipeline's Test stage; also runnable locally:
#   SMOKE_PORT=4181 bash ci/smoke-test.sh
set -euo pipefail

cd "$(dirname "$0")/.."

PORT="${SMOKE_PORT:-4180}"
PROJECT="ngtc-todo-smoke"

# Dummy OAuth settings: oauth2-proxy starts and redirects, but no real login happens.
export OAUTH2_CLIENT_ID=ci-dummy-client
export OAUTH2_CLIENT_SECRET=ci-dummy-secret
export OAUTH2_COOKIE_SECRET=0123456789abcdef0123456789abcdef
export APP_PORT="$PORT"
export PUBLIC_URL="http://localhost:$PORT"

compose() { docker compose -p "$PROJECT" --env-file /dev/null "$@"; }

cleanup() {
  status=$?
  if [ "$status" -ne 0 ]; then
    echo "== smoke test failed; container status and recent logs:"
    compose ps -a || true
    compose logs --tail 50 || true
  fi
  compose down -v --remove-orphans >/dev/null 2>&1 || true
  exit "$status"
}
trap cleanup EXIT

echo "== building and starting the stack"
compose up -d --build --wait --wait-timeout 300

echo "== API checks (frontend -> FastAPI -> Rust -> Postgres)"
compose exec -T frontend node --input-type=module - < ci/smoke.mjs

echo "== oauth2-proxy checks"
expect_status() {
  local path=$1 expected=$2 actual
  actual=$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:$PORT$path")
  if [ "$actual" = "$expected" ]; then
    echo "ok   - GET $path -> $actual"
  else
    echo "FAIL - GET $path -> $actual (expected $expected)"
    return 1
  fi
}
expect_status /ping 200
expect_status / 200              # public landing page
expect_status /todos 302         # protected page redirects to GitHub login
expect_status /api/todos 401     # protected API rejects anonymous calls

echo "== smoke test passed"
