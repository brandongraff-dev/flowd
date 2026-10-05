#!/usr/bin/env bash
# Boots an iPhone simulator, installs the freshly built Flowd.app and captures one screenshot per
# (screen, appearance). Run from the repo root on a macOS runner after `xcodebuild build`.
#
#   scripts/ci/ios-screenshots.sh <simulator-udid> <path-to-Flowd.app> <output-dir> [screens-file]
#
# The app reads two launch arguments (see apps/ios/Flowd/App):
#   -FlowdDemo YES          skip onboarding and sign in as the demo user of the persona
#   -FlowdPersona <p>       creator | brand | admin (taken from the screen key prefix)
#   -FlowdAppearance <a>    dark | light
#   -FlowdScreen <key>      open this screen directly (keys are listed in apps/ios/Scripts/screenshot-screens.txt)
# A build that does not know the arguments simply shows its default screen, so this script never fails on them.
set -euo pipefail

UDID="${1:?simulator udid}"
APP="${2:?path to Flowd.app}"
OUT="${3:?output dir}"
SCREENS_FILE="${4:-apps/ios/Scripts/screenshot-screens.txt}"
BUNDLE_ID="app.flowd.creator"
APPEARANCES="${APPEARANCES:-dark light}"
SETTLE_SECONDS="${SETTLE_SECONDS:-5}"

mkdir -p "$OUT"

echo "Booting simulator $UDID"
xcrun simctl boot "$UDID" 2>/dev/null || true
xcrun simctl bootstatus "$UDID" -b

# A clean, App-Store-style status bar so screenshots look the same every run.
xcrun simctl status_bar "$UDID" override \
  --time "9:41" --batteryState charged --batteryLevel 100 --cellularMode active --cellularBars 4 --wifiBars 3 || true

echo "Installing $APP"
xcrun simctl install "$UDID" "$APP"

capture() {
  local screen="$1" appearance="$2"
  xcrun simctl terminate "$UDID" "$BUNDLE_ID" 2>/dev/null || true
  local persona="${screen%%-*}"
  case "$persona" in creator|brand|admin) ;; *) persona="creator" ;; esac
  xcrun simctl launch "$UDID" "$BUNDLE_ID" -FlowdDemo YES -FlowdPersona "$persona" -FlowdScreen "$screen" -FlowdAppearance "$appearance" >/dev/null
  sleep "$SETTLE_SECONDS"
  xcrun simctl io "$UDID" screenshot --type=png "$OUT/${screen}-${appearance}.png"
  echo "  captured ${screen}-${appearance}.png"
}

for appearance in $APPEARANCES; do
  echo "Appearance: $appearance"
  xcrun simctl ui "$UDID" appearance "$appearance"
  sleep 1
  while IFS= read -r line || [ -n "$line" ]; do
    screen="$(echo "${line%%#*}" | xargs)"   # strip comments and whitespace
    [ -z "$screen" ] && continue
    capture "$screen" "$appearance"
  done < "$SCREENS_FILE"
done

xcrun simctl status_bar "$UDID" clear || true
echo "Done: $(ls "$OUT" | wc -l | xargs) screenshots in $OUT"
