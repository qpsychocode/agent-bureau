#!/bin/zsh

set -e

SCRIPT_DIR="${0:A:h}"
cd "$SCRIPT_DIR"

if command -v node >/dev/null 2>&1; then
  BUREAU_NODE="$(command -v node)"
elif [[ -x "$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node" ]]; then
  BUREAU_NODE="$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node"
else
  echo "Node.js was not found. Open the project in Codex and ask it to start Agent Bureau Office."
  read -r "?Press Enter to close this window."
  exit 1
fi

echo "Agent Bureau is starting…"
echo "Open http://localhost:3000 in a few seconds."
echo "Press Control-C to stop the office."

exec "$BUREAU_NODE" scripts/office.mjs
