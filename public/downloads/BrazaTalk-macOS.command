#!/bin/bash
# ==============================================================================
# Braza Talk - Criador de Aplicativo Nativo para macOS (.app Bundle)
# ==============================================================================
set -e

APP_URL="${1:-${BRAZATALK_URL:-https://ais-dev-aoa6lab54eitpbv6bjcy5s-15347438503.us-west2.run.app}}"
APP_DIR="$HOME/Applications/Braza Talk.app"

echo "============================================================"
echo "    Instalador do Braza Talk para macOS"
echo "    Criando bundle nativo em: $APP_DIR"
echo "============================================================"

mkdir -p "$HOME/Applications"
mkdir -p "$APP_DIR/Contents/MacOS"
mkdir -p "$APP_DIR/Contents/Resources"

# 1. Criar Info.plist
cat << 'PLIST' > "$APP_DIR/Contents/Info.plist"
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleExecutable</key>
    <string>BrazaTalk</string>
    <key>CFBundleIconFile</key>
    <string>AppIcon</string>
    <key>CFBundleIdentifier</key>
    <string>app.brazatalk.client</string>
    <key>CFBundleName</key>
    <string>Braza Talk</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>CFBundleShortVersionString</key>
    <string>2.6.0</string>
    <key>CFBundleVersion</key>
    <string>2.6.0</string>
    <key>LSMinimumSystemVersion</key>
    <string>10.13</string>
    <key>NSHighResolutionCapable</key>
    <true/>
</dict>
</plist>
PLIST

# 2. Baixar ícone
echo "-> Baixando ícone oficial..."
curl -fsSL "$APP_URL/icon-512.png" -o "$APP_DIR/Contents/Resources/AppIcon.png" 2>/dev/null || true

# 3. Criar executável principal
cat << SCRIPT > "$APP_DIR/Contents/MacOS/BrazaTalk"
#!/bin/bash
APP_URL="${APP_URL}"

if [ -d "/Applications/Google Chrome.app" ]; then
    open -na "Google Chrome" --args --app="\$APP_URL"
elif [ -d "/Applications/Microsoft Edge.app" ]; then
    open -na "Microsoft Edge" --args --app="\$APP_URL"
elif [ -d "/Applications/Brave Browser.app" ]; then
    open -na "Brave Browser" --args --app="\$APP_URL"
elif [ -d "/Applications/Arc.app" ]; then
    open -na "Arc" --args "\$APP_URL"
else
    open "\$APP_URL"
fi
SCRIPT

chmod +x "$APP_DIR/Contents/MacOS/BrazaTalk"
touch "$APP_DIR"

echo ""
echo "============================================================"
echo " ✓ Braza Talk instalado com sucesso em:"
echo "   $APP_DIR"
echo "   Você pode arrastá-lo para o Dock ou iniciar pelo Spotlight!"
echo "============================================================"
echo ""

open "$APP_DIR" 2>/dev/null || true
