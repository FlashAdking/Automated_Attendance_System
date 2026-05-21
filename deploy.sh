#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
#  deploy.sh  –  Runs ON your cloud server (VPS / EC2 / DO droplet)
#
#  Jenkins fires a POST to:  https://yourserver.com:9000/deploy
#  This script is invoked by a tiny webhook listener (e.g. webhook, adnanh/webhook)
#  that passes the JSON body as env vars / arguments.
#
#  Install the webhook listener:
#    curl -L https://github.com/adnanh/webhook/releases/latest/download/webhook-linux-amd64.tar.gz | tar xz
#    ./webhook -hooks hooks.json -port 9000 -verbose
#
#  hooks.json  (place next to this script on your server):
#  [
#    {
#      "id": "deploy",
#      "execute-command": "/opt/attendsnap/deploy.sh",
#      "command-working-directory": "/opt/attendsnap",
#      "trigger-rule": {
#        "match": {
#          "type": "value",
#          "value": "Bearer YOUR_DEPLOY_SECRET",
#          "parameter": { "source": "header", "name": "Authorization" }
#        }
#      },
#      "pass-arguments-to-command": [
#        { "source": "payload", "name": "image" }
#      ]
#    }
#  ]
#
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

IMAGE="${1:-yourdockerhubuser/attendsnap-backend:latest}"
COMPOSE_FILE="/opt/attendsnap/docker-compose.yml"
LOG_FILE="/var/log/attendsnap-deploy.log"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "${LOG_FILE}"; }

log "━━━━━━ Deploy triggered ━━━━━━"
log "Image : ${IMAGE}"

# 1. Pull the new image
log "Pulling ${IMAGE} ..."
docker pull "${IMAGE}"

# 2. Export the tag so docker-compose uses it
export IMAGE_TAG="${IMAGE##*:}"            # everything after the last ':'
export DOCKER_HUB_USER="${IMAGE%%/*}"     # everything before the first '/'

# 3. Gracefully restart only the backend container
log "Restarting attendsnap_backend ..."
docker compose -f "${COMPOSE_FILE}" up -d --no-build --pull never backend

# 4. Sanity check – wait up to 30 s for the container to become healthy
log "Waiting for container to be healthy..."
for i in $(seq 1 30); do
    STATUS=$(docker inspect --format='{{.State.Status}}' attendsnap_backend 2>/dev/null || echo "missing")
    if [ "${STATUS}" = "running" ]; then
        log "✅ Container is running (check ${i}/30)"
        break
    fi
    sleep 1
done

# 5. Remove dangling images to free disk space
docker image prune -f >> "${LOG_FILE}" 2>&1

log "━━━━━━ Deploy complete ━━━━━━"
