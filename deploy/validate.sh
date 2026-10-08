#!/usr/bin/env bash
# CodeDeploy ValidateService: the release must become healthy within ~3 minutes.
# A non-zero exit marks the deployment (and the pipeline run) as failed.
set -euo pipefail
source "$(dirname "$0")/common.sh"

BASE=http://localhost:4180

all_healthy() {
  # Every container must be running, and healthy where it has a healthcheck.
  local states
  states=$(compose ps -a --format '{{.Service}} {{.State}} {{.Health}}')
  [ -n "$states" ] || return 1
  ! grep -vE ' running (healthy)?$' <<< "$states"
}

status_of() { curl -s -o /dev/null -w '%{http_code}' --max-time 5 "$BASE$1"; }

for attempt in $(seq 1 36); do
  if all_healthy \
    && [ "$(status_of /ping)" = 200 ] \
    && [ "$(status_of /)" = 200 ] \
    && [ "$(status_of /api/todos)" = 401 ]; then
    log "release is healthy (attempt $attempt)"
    docker image prune -f >/dev/null
    exit 0
  fi
  sleep 5
done

log "ERROR: release did not become healthy"
compose ps -a
compose logs --tail 30
exit 1
