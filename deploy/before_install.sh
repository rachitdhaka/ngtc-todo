#!/usr/bin/env bash
# CodeDeploy BeforeInstall: verify the server is ready, clear the previous bundle.
# Running containers are left alone until ApplicationStart replaces them.
set -euo pipefail
source "$(dirname "$0")/common.sh"

for tool in docker aws curl; do
  command -v "$tool" >/dev/null || { log "ERROR: $tool is not installed (see infra/ec2-user-data.sh)"; exit 1; }
done
docker compose version >/dev/null || { log "ERROR: docker compose plugin is missing"; exit 1; }

mkdir -p "$(dirname "$APP_DIR")"
rm -rf "$APP_DIR"
log "server ready; old bundle removed"
