#!/usr/bin/env bash
# Installs the Lazygit panel into the Herdr app folder by copying (not linking) its files.
# Running it again updates an earlier install of this same mod; anything else in the way is left alone.
set -euo pipefail

SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOME_DIR="${HERDR_APP_HOME:-$HOME/.config/herdr-app}"
MODS=(lazygit-tabs lazygit-panel)
MARK=".herdr-lazygit"
LAYOUT="lazygit.json"

die() { echo "error: $*" >&2; exit 1; }

command -v herdr-app >/dev/null 2>&1 || die "herdr-app is not on PATH. Install the Herdr desktop app first."
command -v lazygit >/dev/null 2>&1 || echo "warning: lazygit is not on PATH. Install it (brew install lazygit); the panel will show errors until then."

# Refuse before touching anything if a target exists and was not installed by this script.
for m in "${MODS[@]}"; do
  dst="$HOME_DIR/mods/$m"
  if [ -e "$dst" ] && [ ! -f "$dst/$MARK" ]; then
    die "$dst already exists and was not installed by this script. Move it aside and run again."
  fi
done
if [ -e "$HOME_DIR/layouts/$LAYOUT" ] && ! grep -q '"lazygit-tabs"' "$HOME_DIR/layouts/$LAYOUT"; then
  die "$HOME_DIR/layouts/$LAYOUT already exists and was not installed by this script. Move it aside and run again."
fi

mkdir -p "$HOME_DIR/mods" "$HOME_DIR/layouts"
for m in "${MODS[@]}"; do
  rm -rf "$HOME_DIR/mods/$m"
  cp -R "$SRC/mods/$m" "$HOME_DIR/mods/$m"
  echo "installed mods/$m"
done
cp "$SRC/layouts/$LAYOUT" "$HOME_DIR/layouts/$LAYOUT"
echo "installed layouts/$LAYOUT"

for m in "${MODS[@]}"; do
  herdr-app check "$HOME_DIR/mods/$m" || die "herdr-app check failed for mods/$m (see above)"
done

if herdr-app do layout.switch --name lazygit >/dev/null 2>&1; then
  echo "Herdr is now on the lazygit layout."
  if [ -e "$HOME_DIR/layouts/lazygit.error" ]; then
    echo "warning: layouts/lazygit.error says: $(cat "$HOME_DIR/layouts/lazygit.error")" >&2
  fi
else
  echo "Herdr is not running, so the layout was not switched. Open Herdr and press ctrl-shift-l to reach the lazygit layout."
fi
echo "Switch back any time with ctrl-shift-l."
