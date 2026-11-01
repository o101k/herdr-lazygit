#!/usr/bin/env bash
# Removes the Lazygit panel: switches Herdr back to main, ends the lazygit terminals this mod started,
# and removes its mods and its layout. Only files this install put there are removed.
set -uo pipefail

HOME_DIR="${HERDR_APP_HOME:-$HOME/.config/herdr-app}"
MODS=(lazygit-panel lazygit-button lazygit-tabs) # lazygit-tabs: the clone from earlier versions
MARK=".herdr-lazygit"
LAYOUT="$HOME_DIR/layouts/lazygit.json"

# Prints the address of every terminal (finished ones too) labelled herdr-lazygit.space.
labelled_addresses() {
  local addr
  for addr in $(hc ls --all --json 2>/dev/null | jq -r '.terminals[].address' 2>/dev/null); do
    if hc get "$addr" --json 2>/dev/null | jq -e '.labels["herdr-lazygit.space"] != null' >/dev/null 2>&1; then
      echo "$addr"
    fi
  done
}

if herdr-app do layout.switch --name main >/dev/null 2>&1; then
  echo "Herdr is back on the main layout."
fi

if command -v hc >/dev/null 2>&1 && command -v jq >/dev/null 2>&1; then
  for addr in $(labelled_addresses); do
    hc kill "$addr" >/dev/null 2>&1
    hc rm "$addr" >/dev/null 2>&1
    echo "ended lazygit terminal $addr"
  done
else
  echo "warning: hc or jq not found, so lazygit terminals were not ended. End them with: hc ls --all" >&2
fi

for m in "${MODS[@]}"; do
  d="$HOME_DIR/mods/$m"
  if [ -f "$d/$MARK" ]; then
    rm -rf "$d"
    echo "removed mods/$m"
  elif [ -e "$d" ]; then
    echo "skipped mods/$m (not installed by this script)"
  fi
done

if [ -f "$LAYOUT" ] && grep -q -e '"lazygit-panel"' -e '"lazygit-tabs"' "$LAYOUT"; then
  rm -f "$LAYOUT"
  echo "removed layouts/lazygit.json"
elif [ -e "$LAYOUT" ]; then
  echo "skipped layouts/lazygit.json (not installed by this script)"
fi

echo "Lazygit panel removed."
