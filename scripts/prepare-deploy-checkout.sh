#!/usr/bin/env bash

# Bootstrap a production checkout before the normal deployment script runs.
# This file is read from origin/main by the GitHub Actions workflow, so it can
# recover a server that is still checked out on an older feature branch.
set -Eeuo pipefail

repo_dir="${1:?Usage: prepare-deploy-checkout.sh <repo-dir> [branch]}"
deploy_branch="${2:-main}"

cd "$repo_dir"

current_branch="$(git branch --show-current)"
if [ "$current_branch" = "$deploy_branch" ]; then
  exit 0
fi

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "Refusing deployment: server repository has tracked uncommitted changes." >&2
  echo "Commit, stash, or revert those changes on the server before deploying." >&2
  exit 1
fi

echo "Restoring deployment checkout from ${current_branch:-detached HEAD} to $deploy_branch."
git switch "$deploy_branch"
