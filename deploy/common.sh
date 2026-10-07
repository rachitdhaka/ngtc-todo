# Shared settings for the CodeDeploy hook scripts (sourced, not executed).

APP_DIR=/opt/ngtc-todo/app
ENV_FILE=/opt/ngtc-todo/.env
SSM_PATH=/ngtc-todo

# The AWS CLI is installed as a snap on Ubuntu.
export PATH="$PATH:/snap/bin:/usr/local/bin"

compose() {
  docker compose \
    --project-directory "$APP_DIR" \
    -f "$APP_DIR/docker-compose.yml" \
    -f "$APP_DIR/docker-compose.prod.yml" \
    --env-file "$ENV_FILE" \
    "$@"
}

log() { echo "[$(date -u +%H:%M:%S)] $*"; }
