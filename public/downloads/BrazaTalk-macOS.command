#!/bin/bash
# Braza Talk macOS App Bundle Creator
APP_URL="${BRAZATALK_URL:-https://ais-dev-aoa6lab54eitpbv6bjcy5s-15347438503.us-west2.run.app}"
APP_DIR="$HOME/Applications/Braza Talk.app"
mkdir -p "$APP_DIR/Contents/MacOS" "$APP_DIR/Contents/Resources"

cat << PLIST > "$APP_DIR/Contents/Info.plist"
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleExecutable</key>
    <string>BrazaTalk</string>
    <key>CFBundleIdentifier</key>
    <string>app.brazatalk.client</string>
    <key>CFBundleName</key>
    <string>Braza Talk</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>CFBundleShortVersionString</key>
    <string>2.6.0</string>
</dict>
</plist>
PLIST

cat << 'SCRIPT' > "$APP_DIR/Contents/MacOS/BrazaTalk"
#!/bin/bash
APP_URL="https://ais-dev-aoa6lab54eitpbv6bjcy5s-15347438503.us-west2.run.app"
if [ -d "/Applications/Google Chrome.app" ]; then
    open -na "Google Chrome" --args --app="$APP_URL"
elif [ -d "/Applications/Microsoft Edge.app" ]; then
    open -na "Microsoft Edge" --args --app="$APP_URL"
elif [ -d "/Applications/Brave Browser.app" ]; then
    open -na "Brave Browser" --args --app="$APP_URL"
else
    open "$APP_URL"
fi
SCRIPT

chmod +x "$APP_DIR/Contents/MacOS/BrazaTalk"
echo "Braza Talk instalado em $APP_DIR!"
open "$APP_DIR"
