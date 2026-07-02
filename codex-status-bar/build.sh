#!/bin/bash
# Builds CodexStatusBar.app (and optionally a .dmg with: ./build.sh --dmg).
set -euo pipefail
cd "$(dirname "$0")"

APP="build/CodexStatusBar.app"
BIN="$APP/Contents/MacOS/CodexStatusBar"

rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS"

echo "Compiling…"
# Pin the deployment target, else swiftc stamps the binary with the build
# machine's OS, making it refuse to launch on older systems.
swiftc -O -target arm64-apple-macos12.0 Sources/*.swift -o "$BIN" -framework Cocoa

cat > "$APP/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>CodexStatusBar</string>
  <key>CFBundleDisplayName</key><string>Codex Status Bar</string>
  <key>CFBundleIdentifier</key><string>com.local.codexstatusbar</string>
  <key>CFBundleExecutable</key><string>CodexStatusBar</string>
  <key>CFBundleVersion</key><string>0.0.3</string>
  <key>CFBundleShortVersionString</key><string>0.0.3</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>LSMinimumSystemVersion</key><string>12.0</string>
  <key>LSUIElement</key><true/>
  <key>CFBundleIconFile</key><string>AppIcon</string>
</dict>
</plist>
PLIST

# Bundle the hook scripts (so first-launch self-install works) and resources.
mkdir -p "$APP/Contents/Resources"
cp hooks/update.js hooks/lifecycle.js hooks/install.js hooks/uninstall.js "$APP/Contents/Resources/"
cp public/assets/icon/AppIcon.icns "$APP/Contents/Resources/AppIcon.icns"
cp public/assets/sound/completion.wav "$APP/Contents/Resources/completion.wav"
cp public/assets/sound/pending.wav "$APP/Contents/Resources/pending.wav"

# Bundle character animation frames (flat bundle layout for IconRenderer.swift).
mkdir -p "$APP/Contents/Resources/character" "$APP/Contents/Resources/character-bw"
cp public/assets/character/bp/*.png "$APP/Contents/Resources/character/"
cp public/assets/character/bw/*.png "$APP/Contents/Resources/character-bw/"
mkdir -p "$APP/Contents/Resources/character-worldcup" "$APP/Contents/Resources/character-worldcup-bw"
cp public/assets/character-worldcup/bp/*.png "$APP/Contents/Resources/character-worldcup/"
cp public/assets/character-worldcup/bw/*.png "$APP/Contents/Resources/character-worldcup-bw/"
mkdir -p "$APP/Contents/Resources/sleeping-character" "$APP/Contents/Resources/sleeping-character-bw"
cp public/assets/sleeping-character/bp/*.png "$APP/Contents/Resources/sleeping-character/"
cp public/assets/sleeping-character/bw/*.png "$APP/Contents/Resources/sleeping-character-bw/"

# Bundle the preview dashboard and its character assets (relative paths).
cp dashboard.html "$APP/Contents/Resources/dashboard.html"
mkdir -p "$APP/Contents/Resources/public/assets/character/bp" "$APP/Contents/Resources/public/assets/character/bw"
mkdir -p "$APP/Contents/Resources/public/assets/character-worldcup/bp" "$APP/Contents/Resources/public/assets/character-worldcup/bw"
mkdir -p "$APP/Contents/Resources/public/assets/sleeping-character/bp" "$APP/Contents/Resources/public/assets/sleeping-character/bw"
cp public/assets/character/bp/*.png "$APP/Contents/Resources/public/assets/character/bp/"
cp public/assets/character/bw/*.png "$APP/Contents/Resources/public/assets/character/bw/"
cp public/assets/character-worldcup/bp/*.png "$APP/Contents/Resources/public/assets/character-worldcup/bp/"
cp public/assets/character-worldcup/bw/*.png "$APP/Contents/Resources/public/assets/character-worldcup/bw/"
cp public/assets/sleeping-character/bp/*.png "$APP/Contents/Resources/public/assets/sleeping-character/bp/"
cp public/assets/sleeping-character/bw/*.png "$APP/Contents/Resources/public/assets/sleeping-character/bw/"

# Strip extended attributes that codesign rejects.
xattr -cr "$APP"

# Ad-hoc sign for local dev (no Developer ID cert required to run locally).
codesign --force --sign - "$APP" >/dev/null 2>&1 || true
echo "Built $APP"

if [[ "${1:-}" == "--dmg" ]]; then
  echo "Packaging DMG…"
  DMG="build/CodexStatusBar.dmg"
  STAGE="build/dmg-stage"
  RWDMG="build/rw.dmg"
  VOLNAME="Codex Status Bar"
  BG="public/assets/dmg/dmg-background.png"
  # Window geometry mirrors the mac-whisper installer: a 660x440 Finder
  # icon-view window with 80px icons, the app on the left and the
  # Applications alias on the right, sitting on top of the background arrow.
  WIN_W=660; WIN_H=440
  APP_X=160; APP_Y=220
  APPS_X=500; APPS_Y=220
  rm -rf "$STAGE" "$DMG" "$RWDMG"
  mkdir -p "$STAGE/.background"
  cp -R "$APP" "$STAGE/"
  ln -s /Applications "$STAGE/Applications"
  cp "$BG" "$STAGE/.background/background.png"

  # Build a read-write DMG first so Finder view options can be persisted.
  hdiutil create -volname "$VOLNAME" -srcfolder "$STAGE" -ov -format UDRW "$RWDMG" >/dev/null
  rm -rf "$STAGE"

  # Mount it (silent, no Finder, no browsing) and style the window.
  hdiutil attach -readwrite -nobrowse "$RWDMG" >/dev/null 2>&1
  VOL="/Volumes/$VOLNAME"
  osascript \
    -e "tell application \"Finder\"" \
    -e "set dmg to disk \"$VOLNAME\"" \
    -e "open dmg" \
    -e "set current view of container window of dmg to icon view" \
    -e "set toolbar visible of container window of dmg to false" \
    -e "set statusbar visible of container window of dmg to false" \
    -e "set the bounds of container window of dmg to {100, 100, $((WIN_W + 100)), $((WIN_H + 100))}" \
    -e "set theViewOptions to the icon view options of container window of dmg" \
    -e "set arrangement of theViewOptions to not arranged" \
    -e "set icon size of theViewOptions to 80" \
    -e "set background picture of theViewOptions to POSIX file \"$VOL/.background/background.png\" as alias" \
    -e "set position of item \"CodexStatusBar\" of dmg to {$APP_X, $APP_Y}" \
    -e "set position of item \"Applications\" of dmg to {$APPS_X, $APPS_Y}" \
    -e "set the bounds of container window of dmg to {100, 100, $((WIN_W + 100)), $((WIN_H + 100))}" \
    -e "close dmg" \
    -e "end tell"

  # Give Finder a moment to flush, then detach and convert to compressed RO.
  sleep 1
  hdiutil detach "$VOL" -force >/dev/null
  hdiutil convert "$RWDMG" -format UDZO -ov -o "$DMG" >/dev/null
  rm -f "$RWDMG"
  echo "Built $DMG"
fi
