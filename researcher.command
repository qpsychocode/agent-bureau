#!/bin/zsh

set -e

SCRIPT_DIR="${0:A:h}"
cd "$SCRIPT_DIR"

if command -v node >/dev/null 2>&1; then
  BUREAU_NODE="$(command -v node)"
elif [[ -x "$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node" ]]; then
  BUREAU_NODE="$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node"
else
  echo "Не найден Node.js. Открой проект в Codex и попроси запустить Researcher."
  exit 1
fi

if [[ $# -eq 0 ]]; then
  exec "$BUREAU_NODE" skills/agent-bureau/scripts/cursor-researcher.mjs --check
fi

exec "$BUREAU_NODE" skills/agent-bureau/scripts/cursor-researcher.mjs "$@"
