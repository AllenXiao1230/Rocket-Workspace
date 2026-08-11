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

# Embed the exact deployed commit so the web UI can compare it to the remote repository.
export APP_COMMIT="$(git rev-parse HEAD)"
export APP_VERSION="$(sed -nE 's/^[[:space:]]*"version"[[:space:]]*:[[:space:]]*"([0-9]+\.[0-9]+\.[0-9]+)"[[:space:]]*,?[[:space:]]*$/\1/p' package.json | head -n 1)"
if [ -z "$APP_VERSION" ]; then
  echo "Deployment failed: package.json version must use MAJOR.MINOR.PATCH." >&2
  exit 1
fi

# Build each application image before switching containers. Building the three
# Next.js images together can exhaust memory on small production hosts.
for service in app collab scheduler backup; do
  docker compose build "$service"
done
docker compose up --detach app collab scheduler backup

wait_for_app_health() {
  local deadline=$((SECONDS + 300))
  while (( SECONDS < deadline )); do
    if curl --fail --silent --show-error http://127.0.0.1:3000/api/health; then
      return 0
    fi
    sleep 2
  done

  curl --fail --silent --show-error http://127.0.0.1:3000/api/health
}

if wait_for_app_health; then
  echo
  echo "Deployment complete: $(git rev-parse --short HEAD)"
  exit 0
fi

echo "Deployment finished, but the application health endpoint did not become ready." >&2
docker compose ps app
docker compose logs --tail=100 app
exit 1
