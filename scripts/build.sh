#!/usr/bin/env bash
set -euo pipefail
project_dir="$(cd "$(dirname "$0")/.." && pwd)"
cd "$project_dir/frontend"
pnpm install --frozen-lockfile
pnpm test
pnpm build
mkdir -p "$project_dir/backend/src/main/resources/static"
cp -R dist/. "$project_dir/backend/src/main/resources/static/"
cd "$project_dir/backend"
mvn -B -ntp package
printf '\nBuilt backend/target/lingua-audit-1.0.0.jar (includes React UI).\n'
