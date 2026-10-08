#!/usr/bin/env bash
# CodeDeploy AfterInstall: move the server's git clone to the tested commit.
# Refuses to touch the clone if it has uncommitted or unpushed work.
set -euo pipefail
source "$(dirname "$0")/common.sh"

release=$(tr -d '[:space:]' < "$RELEASE_FILE")
if ! [[ "$release" =~ ^[0-9a-f]{7,40}$ ]]; then
  log "ERROR: invalid release '$release' in $RELEASE_FILE"
  exit 1
fi

cd "$REPO_DIR"

if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  log "ERROR: $REPO_DIR has uncommitted changes; commit and push them, then re-run the pipeline:"
  git status --short --untracked-files=no
  exit 1
fi

log "fetching from GitHub"
git fetch --quiet origin main
git checkout --quiet main

if ! git merge --ff-only --quiet "$release"; then
  log "ERROR: local main has commits that are not on GitHub; push them first"
  exit 1
fi

if [ "$(git rev-parse HEAD)" != "$(git rev-parse "$release")" ]; then
  log "ERROR: local main is ahead of the tested commit $release; push local commits first"
  exit 1
fi

log "clone is at tested commit $(git log -1 --format='%h %s')"
