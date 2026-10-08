# Shared settings for the CodeDeploy hook scripts (sourced, not executed).

# The git clone the app runs from, and the release marker CodeDeploy copies.
REPO_DIR=/home/ubuntu/ngtc-todo
RELEASE_FILE=/opt/ngtc-todo/RELEASE

compose() { docker compose --project-directory "$REPO_DIR" "$@"; }

log() { echo "[$(date -u +%H:%M:%S)] $*"; }
