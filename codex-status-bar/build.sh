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
  <key>CFBundleVersion</key><string>0.0.2</string>
  <key>CFBundleShortVersionString</key><string>0.0.2</string>
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
  rm -rf "$STAGE" "$DMG" build/rw.dmg
  mkdir -p "$STAGE"
  cp -R "$APP" "$STAGE/"
  ln -s /Applications "$STAGE/Applications"
  hdiutil create -volname "Codex Status Bar" -srcfolder "$STAGE" -ov -format UDZO "$DMG" >/dev/null
  rm -rf "$STAGE"
  echo "Built $DMG"
fi
