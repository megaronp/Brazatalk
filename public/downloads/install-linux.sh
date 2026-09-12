#!/bin/bash
# ==============================================================================
# Braza Talk - Instalador Universal para Linux (Espaço de Usuário - Sem sudo)
# ==============================================================================
set -e

APP_URL="${1:-${BRAZATALK_URL:-https://ais-dev-aoa6lab54eitpbv6bjcy5s-15347438503.us-west2.run.app}}"

echo "============================================================"
echo "    Instalando Braza Talk no seu usuário Linux..."
echo "    URL do Aplicativo: $APP_URL"
echo "============================================================"

# Cria pastas do usuário padrão XDG
mkdir -p ~/.local/bin
mkdir -p ~/.local/share/applications
mkdir -p ~/.local/share/pixmaps
mkdir -p ~/.local/share/icons/hicolor/512x512/apps
mkdir -p ~/.local/share/icons/hicolor/scalable/apps
mkdir -p ~/.config/brazatalk
echo "$APP_URL" > ~/.config/brazatalk/url.conf

# 1. Baixar o ícone de alta resolução do aplicativo
ICON_PNG="$HOME/.local/share/icons/hicolor/512x512/apps/brazatalk.png"
PIXMAP_PNG="$HOME/.local/share/pixmaps/brazatalk.png"
echo "-> Baixando ícone do aplicativo..."
if command -v curl >/dev/null 2>&1; then
    curl -fsSL "$APP_URL/icon-512.png" -o "$ICON_PNG" 2>/dev/null || true
    cp "$ICON_PNG" "$PIXMAP_PNG" 2>/dev/null || true
elif command -v wget >/dev/null 2>&1; then
    wget -q "$APP_URL/icon-512.png" -O "$ICON_PNG" 2>/dev/null || true
    cp "$ICON_PNG" "$PIXMAP_PNG" 2>/dev/null || true
fi

# 2. Criar o script lançador executável
echo "-> Criando lançador em ~/.local/bin/brazatalk..."
cat << LAUNCHER > ~/.local/bin/brazatalk
#!/bin/bash
APP_URL="\${1:-\${BRAZATALK_URL:-$APP_URL}}"

BROWSERS=(
    "google-chrome"
    "google-chrome-stable"
    "chromium"
    "chromium-browser"
    "brave-browser"
    "microsoft-edge"
    "microsoft-edge-stable"
    "vivaldi"
    "opera"
)

for browser in "\${BROWSERS[@]}"; do
    if command -v "\$browser" >/dev/null 2>&1; then
        exec "\$browser" --app="\$APP_URL" --class="brazatalk" --name="Braza Talk" "\$@"
    fi
done

if command -v firefox >/dev/null 2>&1; then
    exec firefox --new-window "\$APP_URL" "\$@"
fi

if command -v xdg-open >/dev/null 2>&1; then
    exec xdg-open "\$APP_URL"
    exit 0
fi

echo "Nenhum navegador encontrado. Acesse manualmente: \$APP_URL"
exit 1
LAUNCHER

chmod +x ~/.local/bin/brazatalk

# 3. Criar a entrada de menu (.desktop)
echo "-> Registrando atalho no menu de aplicativos..."
cat << DESKTOP > ~/.local/share/applications/brazatalk.desktop
[Desktop Entry]
Version=1.0
Type=Application
Name=Braza Talk
GenericName=Voz HD, Chat & Comunidade
Comment=Plataforma de voz HD, vídeo e chat em tempo real
Exec=$HOME/.local/bin/brazatalk %u
Icon=brazatalk
Terminal=false
Categories=Network;Chat;InstantMessaging;AudioVideo;
StartupWMClass=brazatalk
MimeType=x-scheme-handler/brazatalk;
DESKTOP

chmod +x ~/.local/share/applications/brazatalk.desktop

# 4. Atualizar o banco de dados do desktop se a ferramenta estiver presente
if command -v update-desktop-database >/dev/null 2>&1; then
    update-desktop-database ~/.local/share/applications 2>/dev/null || true
fi

if command -v gtk-update-icon-cache >/dev/null 2>&1; then
    gtk-update-icon-cache -q -t -f ~/.local/share/icons/hicolor 2>/dev/null || true
fi

echo ""
echo "============================================================"
echo " ✓ Braza Talk instalado com sucesso!"
echo "   - Atalho adicionado ao menu de aplicativos do sistema."
echo "   - Comando disponível: brazatalk (garanta que ~/.local/bin esteja no seu PATH)"
echo "============================================================"
echo ""
