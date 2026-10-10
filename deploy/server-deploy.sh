#!/bin/bash
# Production deploy for Daily Verse Studio. Install on the server as
# /opt/word-daily/deploy.sh (chmod 700). It runs only through the GitHub
# Actions deploy key's forced command in /root/.ssh/authorized_keys, and lives
# outside src/ so that pushing to the repo cannot change what runs as root.
set -euo pipefail
exec 9>/tmp/word-daily-deploy.lock
flock 9
cd /opt/word-daily
git -C src fetch -q origin main
git -C src reset -q --hard origin/main
echo "Deploying $(git -C src log --oneline -1)"
docker compose up -d --build 2>&1 | grep -vE '^#[0-9]+ ' || true
docker image prune -f >/dev/null
docker builder prune -af >/dev/null
for i in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:4319/api/health; then
    echo
    echo "Healthy."
    exit 0
  fi
  sleep 2
done
echo "Health check failed." >&2
docker logs --tail 40 word-daily >&2
exit 1
