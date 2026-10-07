#!/usr/bin/env bash
# CodeDeploy ApplicationStart: (re)create containers whose image or config changed.
set -euo pipefail
source "$(dirname "$0")/common.sh"

log "starting release $(grep '^RELEASE=' "$ENV_FILE" | cut -d= -f2)"
compose up -d --remove-orphans
