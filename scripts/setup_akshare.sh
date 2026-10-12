#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd "$(dirname "$0")/.." && pwd)"
python3 -m venv "$project_dir/.venv-akshare"
"$project_dir/.venv-akshare/bin/python" -m pip install --upgrade pip
"$project_dir/.venv-akshare/bin/python" -m pip install -r "$project_dir/requirements-akshare.txt"
echo "AKShare runtime ready: $project_dir/.venv-akshare/bin/python"
