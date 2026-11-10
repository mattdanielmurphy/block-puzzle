#!/bin/sh
# Local "Designed for iPad" Mac test build (bundle ca.mattmurphy.blockdoku.dev), wrapped like an App Store install.
# Usage: ios/macdev.sh [shots]   (shots = scripted screenshot tour; then: open -g ios/tmp/BlockdokuDev.app)
set -e
cd "$(dirname "$0")/.."
if [ "$1" = shots ]; then CAP=1 VITE_SHOTS=1 bun x vite build >/dev/null; else CAP=1 bun x vite build >/dev/null; fi
bun x cap copy ios >/dev/null
cd ios/App
xcodebuild -project App.xcodeproj -scheme App -configuration Debug -destination 'platform=macOS,arch=arm64,variant=Designed for iPad' \
  -derivedDataPath ../tmp/dd-mac PRODUCT_BUNDLE_IDENTIFIER=ca.mattmurphy.blockdoku.dev DEVELOPMENT_TEAM=457ZKWNUB2 -allowProvisioningUpdates -quiet build 2>&1 | grep -E "error|BUILD" || true
cd ../tmp
rm -rf BlockdokuDev.app && mkdir -p BlockdokuDev.app/Wrapper
cp -R dd-mac/Build/Products/Debug-iphoneos/App.app BlockdokuDev.app/Wrapper/
ln -s Wrapper/App.app BlockdokuDev.app/WrappedBundle
echo built
