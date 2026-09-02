@echo off
title Instalador Braza Talk Desktop
echo ================================================
echo      Instalador do Braza Talk para Windows
echo ================================================
echo.
set "APP_URL=https://ais-dev-aoa6lab54eitpbv6bjcy5s-15347438503.us-west2.run.app"
set "DESKTOP_DIR=%USERPROFILE%\Desktop"
set "PROGRAMS_DIR=%APPDATA%\Microsoft\Windows\Start Menu\Programs"

echo Detectando navegador compativel (Chrome / Edge / Brave)...
set "BROWSER_PATH="
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" set "BROWSER_PATH=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not defined BROWSER_PATH if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" set "BROWSER_PATH=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if not defined BROWSER_PATH if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" set "BROWSER_PATH=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if not defined BROWSER_PATH if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" set "BROWSER_PATH=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"

if not defined BROWSER_PATH (
    echo Nenhum navegador baseado em Chromium detectado, abrindo no navegador padrao...
    start "" "%APP_URL%"
    pause
    exit /b 0
)

echo Criando atalhos nativos na Area de Trabalho e Menu Iniciar...
powershell -NoProfile -Command "$ws = New-Object -ComObject WScript.Shell; $s1 = $ws.CreateShortcut('%DESKTOP_DIR%\Braza Talk.lnk'); $s1.TargetPath = '%BROWSER_PATH%'; $s1.Arguments = '--app=%APP_URL%'; $s1.Description = 'Braza Talk - Voz HD & Chat'; $s1.Save(); $s2 = $ws.CreateShortcut('%PROGRAMS_DIR%\Braza Talk.lnk'); $s2.TargetPath = '%BROWSER_PATH%'; $s2.Arguments = '--app=%APP_URL%'; $s2.Description = 'Braza Talk - Voz HD & Chat'; $s2.Save();"

echo.
echo ================================================
echo  Braza Talk instalado com sucesso no seu Windows!
echo  Atalho criado na sua Area de Trabalho e Menu Iniciar.
echo ================================================
echo.
pause
