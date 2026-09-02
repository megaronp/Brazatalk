#!/bin/bash
# Braza Talk User-space Installer (No sudo required)
set -e
mkdir -p ~/.local/bin ~/.local/share/applications ~/.local/share/icons/hicolor/512x512/apps

APP_URL="${BRAZATALK_URL:-https://ais-dev-aoa6lab54eitpbv6bjcy5s-15347438503.us-west2.run.app}"

cat << 'LAUNCHER' > ~/.local/bin/brazatalk
#!/bin/bash
APP_URL="${BRAZATALK_URL:-https://ais-dev-aoa6lab54eitpbv6bjcy5s-15347438503.us-west2.run.app}"
for browser in google-chrome google-chrome-stable chromium chromium-browser brave-browser microsoft-edge; do
    if command -v "$browser" >/dev/null 2>&1; then
        exec "$browser" --app="$APP_URL" --class="brazatalk" --name="Braza Talk" "$@"
    fi
done
if command -v firefox >/dev/null 2>&1; then
    exec firefox --new-window "$APP_URL" "$@"
fi
if command -v xdg-open >/dev/null 2>&1; then
    exec xdg-open "$APP_URL"
    exit 0
fi
LAUNCHER

chmod +x ~/.local/bin/brazatalk

cat << 'DESKTOP' > ~/.local/share/applications/brazatalk.desktop
[Desktop Entry]
Version=1.0
Name=Braza Talk
GenericName=Voz, Chat & Comunidade
Comment=Plataforma de voz HD e chat em tempo real
Exec=brazatalk %u
Icon=brazatalk
Terminal=false
Type=Application
Categories=Network;InstantMessaging;Chat;AudioVideo;
StartupWMClass=brazatalk
DESKTOP

chmod +x ~/.local/share/applications/brazatalk.desktop

echo "✓ Braza Talk instalado com sucesso no seu usuário Linux (~/.local/bin/brazatalk)!"
echo "Você pode abrir pelo menu de aplicativos ou digitando 'brazatalk'."
