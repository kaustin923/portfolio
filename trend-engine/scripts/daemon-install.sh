#!/bin/bash
set -euo pipefail

# launchd is the scheduler: each fire runs one `npm start` pipeline pass, while
# data/run.lock prevents overlap and state.ts steals stale locks. Deliberately
# do not use `npm run daemon`, whose internal loop would schedule a second time.

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$REPO_ROOT"/.env
DATA_DIR="$REPO_ROOT"/data
LOG_PATH="$DATA_DIR"/daemon.log
PLIST_DIR="$HOME/Library/LaunchAgents"
PLIST="$PLIST_DIR/com.trendengine.daemon.plist"
LABEL="com.trendengine.daemon"
PLIST_REPO_ROOT="$REPO_ROOT"

requested_runs="${RUNS_PER_DAY:-}"
if [[ -z "$requested_runs" && -f "$ENV_FILE" ]]; then
  requested_runs="$(grep -m 1 '^RUNS_PER_DAY=' "$ENV_FILE" || true)"
  requested_runs="${requested_runs#RUNS_PER_DAY=}"
fi
requested_runs="${requested_runs:-3}"

if ! [[ "$requested_runs" =~ ^[0-9]+$ ]]; then
  echo "Error: RUNS_PER_DAY must be an integer; received '$requested_runs'." >&2
  exit 1
fi

normalized_runs="$requested_runs"
while [[ "$normalized_runs" == 0* && ${#normalized_runs} -gt 1 ]]; do
  normalized_runs="${normalized_runs#0}"
done

if [[ "$normalized_runs" == "0" ]]; then
  RUNS_PER_DAY=1
elif [[ ${#normalized_runs} -gt 2 ]] || ((10#$normalized_runs > 24)); then
  RUNS_PER_DAY=24
else
  RUNS_PER_DAY=$((10#$normalized_runs))
fi
STARTINTERVAL=$((86400 / RUNS_PER_DAY))

if ! NPM_BIN="$(command -v npm)" || [[ -z "$NPM_BIN" ]]; then
  echo "Error: npm was not found on PATH. Install Node.js and npm before installing the daemon." >&2
  exit 1
fi

if ! command -v launchctl >/dev/null 2>&1; then
  echo "Error: launchctl was not found on PATH. This installer requires macOS launchd." >&2
  exit 1
fi

mkdir -p "$PLIST_DIR" "$DATA_DIR"

cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/sh</string>
    <string>-c</string>
    <string>cd "$PLIST_REPO_ROOT" &amp;&amp; exec "$NPM_BIN" start</string>
  </array>
  <key>WorkingDirectory</key>
  <string>$PLIST_REPO_ROOT</string>
  <key>RunAtLoad</key>
  <true/>
  <key>StartInterval</key>
  <integer>$STARTINTERVAL</integer>
  <key>StandardOutPath</key>
  <string>$LOG_PATH</string>
  <key>StandardErrorPath</key>
  <string>$LOG_PATH</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
  </dict>
</dict>
</plist>
EOF

USER_ID="$(id -u)"
launchctl bootout "gui/$USER_ID" "$PLIST" 2>/dev/null || true
if launchctl help bootstrap >/dev/null 2>&1; then
  launchctl bootstrap "gui/$USER_ID" "$PLIST"
else
  launchctl load -w "$PLIST"
fi

dry_run_status="${DRY_RUN:-}"
if [[ -z "$dry_run_status" && -f "$ENV_FILE" ]]; then
  dry_run_status="$(grep -m 1 '^DRY_RUN=' "$ENV_FILE" || true)"
  dry_run_status="${dry_run_status#DRY_RUN=}"
fi

echo "Installed $LABEL."
echo "Interval: $STARTINTERVAL seconds ($RUNS_PER_DAY runs per day)."
echo "Log: $LOG_PATH"
printf 'Uninstall with: bash "%s/scripts/daemon-uninstall.sh"\n' "$PLIST_REPO_ROOT"
if [[ -n "$dry_run_status" ]]; then
  echo "DRY_RUN is currently set to '$dry_run_status'; .env controls live mode and was not changed."
else
  echo "DRY_RUN is not currently set; .env controls live mode and the application defaults to DRY_RUN=true."
fi
