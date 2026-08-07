#!/usr/bin/env bash

# Runs on the production server, invoked by the GitHub Actions SSH workflow.
# It intentionally refuses to overwrite server-side tracked edits.
set -Eeuo pipefail

deploy_branch="${DEPLOY_BRANCH:-main}"
repo_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"

cd "$repo_dir"

if [ "$(git branch --show-current)" != "$deploy_branch" ]; then
  echo "Refusing deployment: checked out branch is not $deploy_branch." >&2
  exit 1
fi

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "Refusing deployment: server repository has tracked uncommitted changes." >&2
  echo "Commit, stash, or revert those changes on the server before deploying." >&2
  exit 1
fi

git fetch --prune origin "$deploy_branch"
git pull --ff-only origin "$deploy_branch"

# Rebuild application services only. PostgreSQL, Redis and MinIO volumes remain intact.
docker compose up -d --build app collab scheduler backup

for _attempt in $(seq 1 20); do
  if curl --fail --silent --show-error http://127.0.0.1:3000/api/health; then
    echo
    echo "Deployment complete: $(git rev-parse --short HEAD)"
    exit 0
  fi
  sleep 3
done

echo "Deployment finished, but the application health endpoint did not become ready." >&2
docker compose ps app
docker compose logs --tail=100 app
exit 1
