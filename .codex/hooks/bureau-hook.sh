#!/bin/zsh

set -e

if command -v node >/dev/null 2>&1; then
  BUREAU_HOOK_NODE="$(command -v node)"
elif [[ -x "$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node" ]]; then
  BUREAU_HOOK_NODE="$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node"
else
  # Telemetry is advisory: a missing runtime must never block Codex.
  exit 0
fi

REPOSITORY_ROOT="$(git rev-parse --show-toplevel)"
exec "$BUREAU_HOOK_NODE" "$REPOSITORY_ROOT/scripts/codex-hook.mjs"
