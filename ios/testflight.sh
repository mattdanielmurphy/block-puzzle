#!/bin/sh
# One-command TestFlight upload, mirrors Mattinee's ipad/testflight.sh (same team, no Xcode account setup).
# Log: ios/tmp/testflight.log. `--export-only` re-uses the last archive.
# Exit 3 + "NEEDS_ASC_APP" line = App Store Connect has no app record yet: an agent runs
# ~/projects/ai-os/scripts/asc/ensure_app.js in Chrome (see README there), then reruns with --export-only.
set -e
cd "$(dirname "$0")/.."
TEAM=457ZKWNUB2
BUNDLE=ca.mattmurphy.blockdoku
mkdir -p ios/tmp
LOG=$PWD/ios/tmp/testflight.log
exec >>"$LOG" 2>&1
echo "== $(date) $*"
cd ios/App
if [ "$1" != "--export-only" ]; then
  (cd ../.. && CAP=1 bun x vite build && bun x cap sync ios)
  BUILD=$(date +%Y%m%d%H%M)
  rm -rf ../tmp/B.xcarchive
  xcodebuild -project App.xcodeproj -scheme App -configuration Release -sdk iphoneos -destination 'generic/platform=iOS' \
    -archivePath ../tmp/B.xcarchive DEVELOPMENT_TEAM=$TEAM CURRENT_PROJECT_VERSION=$BUILD -allowProvisioningUpdates -quiet archive
fi
rm -rf ../tmp/exp
cat > ../tmp/export.plist <<P
<?xml version="1.0" encoding="UTF-8"?><plist version="1.0"><dict><key>method</key><string>app-store-connect</string><key>destination</key><string>upload</string><key>teamID</key><string>$TEAM</string><key>signingStyle</key><string>automatic</string></dict></plist>
P
if xcodebuild -exportArchive -archivePath ../tmp/B.xcarchive -exportOptionsPlist ../tmp/export.plist -exportPath ../tmp/exp -allowProvisioningUpdates > ../tmp/export.out 2>&1; then
  cat ../tmp/export.out; echo uploaded; exit 0
fi
cat ../tmp/export.out
if grep -q "Error Downloading App Information" ../tmp/export.out; then
  echo "NEEDS_ASC_APP bundle=$BUNDLE"; exit 3
fi
exit 1
