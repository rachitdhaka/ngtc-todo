#!/usr/bin/env bash
# CodeDeploy ApplicationStart: rebuild images and recreate changed containers.
set -euo pipefail
source "$(dirname "$0")/common.sh"

log "building and starting $(git -C "$REPO_DIR" log -1 --format=%h)"
compose up -d --build --remove-orphans
