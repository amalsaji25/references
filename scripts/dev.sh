#!/usr/bin/env bash
set -euo pipefail
project_dir="$(cd "$(dirname "$0")/.." && pwd)"
(cd "$project_dir/backend" && exec mvn spring-boot:run) &
backend_pid=$!
trap 'kill "$backend_pid" 2>/dev/null || true' EXIT INT TERM
cd "$project_dir/frontend"
pnpm install --frozen-lockfile
pnpm dev
