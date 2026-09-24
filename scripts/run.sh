#!/usr/bin/env bash
set -euo pipefail
project_dir="$(cd "$(dirname "$0")/.." && pwd)"
cd "$project_dir/backend"
exec java -jar target/lingua-audit-1.0.0.jar
