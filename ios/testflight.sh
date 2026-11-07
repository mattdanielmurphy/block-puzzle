#!/bin/sh
# One-command TestFlight upload, mirrors Mattinee's ipad/testflight.sh (same team, no Xcode account setup).
# Log: ios/tmp/testflight.log
set -e
cd "$(dirname "$0")/.."
TEAM=457ZKWNUB2
mkdir -p ios/tmp; exec >>ios/tmp/testflight.log 2>&1
echo "== $(date)"
CAP=1 bun x vite build
bun x cap sync ios
BUILD=$(date +%Y%m%d%H%M)
cd ios/App
rm -rf ../tmp/B.xcarchive ../tmp/exp
xcodebuild -project App.xcodeproj -scheme App -configuration Release -sdk iphoneos -destination 'generic/platform=iOS' \
  -archivePath ../tmp/B.xcarchive DEVELOPMENT_TEAM=$TEAM CURRENT_PROJECT_VERSION=$BUILD -allowProvisioningUpdates -quiet archive
cat > ../tmp/export.plist <<P
<?xml version="1.0" encoding="UTF-8"?><plist version="1.0"><dict><key>method</key><string>app-store-connect</string><key>destination</key><string>upload</string><key>teamID</key><string>$TEAM</string><key>signingStyle</key><string>automatic</string></dict></plist>
P
xcodebuild -exportArchive -archivePath ../tmp/B.xcarchive -exportOptionsPlist ../tmp/export.plist -exportPath ../tmp/exp -allowProvisioningUpdates
echo uploaded
