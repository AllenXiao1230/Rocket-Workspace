#!/usr/bin/env bash

# Increment the package patch version without depending on Node.js.  Git hooks
# also run on the deployment host, where only Docker may provide Node.
set -Eeuo pipefail

repo_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
package_file="$repo_dir/package.json"

if [ "${1:-}" = "--file" ] && [ -n "${2:-}" ] && [ "$#" -eq 2 ]; then
  package_file="$2"
elif [ "$#" -ne 0 ]; then
  echo "Usage: $0 [--file /path/to/package.json]" >&2
  exit 64
fi

if [ ! -f "$package_file" ]; then
  echo "Version bump failed: package.json was not found at $package_file." >&2
  exit 66
fi

current_version="$(sed -nE 's/^[[:space:]]*"version"[[:space:]]*:[[:space:]]*"([0-9]+\.[0-9]+\.[0-9]+)"[[:space:]]*,?[[:space:]]*$/\1/p' "$package_file" | head -n 1)"
if [[ ! "$current_version" =~ ^([0-9]+)\.([0-9]+)\.([0-9]+)$ ]]; then
  echo "Version bump failed: package.json version must use MAJOR.MINOR.PATCH." >&2
  exit 65
fi

IFS='.' read -r major minor patch <<< "$current_version"
next_version="$major.$minor.$((10#$patch + 1))"

VERSION_OLD="$current_version" VERSION_NEW="$next_version" perl -0pi -e '
  $count = s/("version"\s*:\s*")\Q$ENV{VERSION_OLD}\E/$1$ENV{VERSION_NEW}/;
  die "Version field was not updated\n" unless $count == 1;
' "$package_file"

printf 'Version: %s -> %s\n' "$current_version" "$next_version"
