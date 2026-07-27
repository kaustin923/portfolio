#!/bin/sh
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
BROWSER="$SCRIPT_DIR/../node_modules/.remotion/chrome-headless-shell/mac-arm64/chrome-headless-shell-mac-arm64/chrome-headless-shell"

if [ ! -x "$BROWSER" ]; then
  echo "Remotion headless shell is missing. Run npm install while online." >&2
  exit 1
fi

exec "$BROWSER" --single-process "$@"
