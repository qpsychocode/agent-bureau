#!/bin/zsh

set -e

SCRIPT_DIR="${0:A:h}"
cd "$SCRIPT_DIR"

if command -v node >/dev/null 2>&1; then
  BUREAU_NODE="$(command -v node)"
elif [[ -x "$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node" ]]; then
  BUREAU_NODE="$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node"
else
  echo "Не найден Node.js. Открой проект в Codex и попроси запустить Agent Bureau Office."
  read -r "?Нажми Enter, чтобы закрыть окно."
  exit 1
fi

echo "Агентское бюро запускается…"
echo "Через несколько секунд открой http://localhost:3000"
echo "Чтобы остановить офис, нажми Control-C."

exec "$BUREAU_NODE" scripts/office.mjs
