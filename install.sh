#!/usr/bin/env bash
# Installs the Lazygit panel into the Herdr app folder: copies (not links) its two mods, and builds the
# lazygit layout from Herdr's current main layout. Running it again updates an earlier install, and after a
# Herdr update it picks up Herdr's latest main layout.
set -euo pipefail

SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOME_DIR="${HERDR_APP_HOME:-$HOME/.config/herdr-app}"
MODS=(lazygit-panel lazygit-button)
OLD_MODS=(lazygit-tabs) # the cloned tab bar of earlier versions; removed only if we installed it
MARK=".herdr-lazygit"
LAYOUT="lazygit.json"

die() { echo "error: $*" >&2; exit 1; }

command -v herdr-app >/dev/null 2>&1 || die "herdr-app is not on PATH. Install the Herdr desktop app first."
command -v python3 >/dev/null 2>&1 || die "python3 is needed to build the layout."
command -v lazygit >/dev/null 2>&1 || echo "warning: lazygit is not on PATH. Install it (brew install lazygit); the panel will show errors until then."
[ -f "$HOME_DIR/layouts/main.json" ] || die "$HOME_DIR/layouts/main.json not found: is Herdr installed and started once?"

# Refuse before touching anything if a target exists and was not installed by this script.
for m in "${MODS[@]}"; do
  dst="$HOME_DIR/mods/$m"
  if [ -e "$dst" ] && [ ! -f "$dst/$MARK" ]; then
    die "$dst already exists and was not installed by this script. Move it aside and run again."
  fi
done
if [ -e "$HOME_DIR/layouts/$LAYOUT" ] && ! grep -q -e '"lazygit-panel"' -e '"lazygit-tabs"' "$HOME_DIR/layouts/$LAYOUT"; then
  die "$HOME_DIR/layouts/$LAYOUT already exists and was not installed by this script. Move it aside and run again."
fi

mkdir -p "$HOME_DIR/mods" "$HOME_DIR/layouts"

# New mods first, then the layout that uses them, then the old tab-bar clone: the live app never
# sees a layout that names a mod which is missing.
for m in "${MODS[@]}"; do
  rm -rf "$HOME_DIR/mods/$m"
  cp -R "$SRC/mods/$m" "$HOME_DIR/mods/$m"
  echo "installed mods/$m"
done

tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT
python3 "$SRC/scripts/make-layout.py" "$HOME_DIR/layouts/main.json" "$tmp"
chmod 644 "$tmp"
mv "$tmp" "$HOME_DIR/layouts/$LAYOUT"
echo "built layouts/$LAYOUT from layouts/main.json"

for m in "${OLD_MODS[@]}"; do
  d="$HOME_DIR/mods/$m"
  if [ -f "$d/$MARK" ]; then
    rm -rf "$d"
    echo "removed the old mods/$m: Herdr's own tab bar is used now"
  fi
done

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
echo "After a Herdr update, rerun ./install.sh to pick up Herdr's latest main layout."
