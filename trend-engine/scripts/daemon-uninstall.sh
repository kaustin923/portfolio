#!/bin/bash
set -euo pipefail

PLIST="$HOME/Library/LaunchAgents/com.trendengine.daemon.plist"

launchctl bootout "gui/$(id -u)" "$PLIST" 2>/dev/null || \
  launchctl unload -w "$PLIST" 2>/dev/null || true
rm -f "$PLIST"

echo "Uninstalled com.trendengine.daemon."
