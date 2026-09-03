@echo off
chcp 65001 >nul
title Instalador Braza Talk Desktop
echo ============================================================
echo         Instalador do Braza Talk para Windows Desktop
echo ============================================================
echo.

set "DEFAULT_URL=https://ais-dev-aoa6lab54eitpbv6bjcy5s-15347438503.us-west2.run.app"
set "APP_URL=%~1"
if "%APP_URL%"=="" set "APP_URL=%DEFAULT_URL%"

echo URL do Aplicativo: %APP_URL%
echo.

set "DESKTOP_DIR=%USERPROFILE%\Desktop"
set "PROGRAMS_DIR=%APPDATA%\Microsoft\Windows\Start Menu\Programs"
set "APP_DATA_DIR=%APPDATA%\BrazaTalk"

if not exist "%APP_DATA_DIR%" mkdir "%APP_DATA_DIR%"

echo [1/3] Detectando navegador compativel (Chrome / Edge / Brave / Vivaldi)...
set "BROWSER_PATH="

if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" set "BROWSER_PATH=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not defined BROWSER_PATH if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" set "BROWSER_PATH=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if not defined BROWSER_PATH if exist "%LocalAppData%\Google\Chrome\Application\chrome.exe" set "BROWSER_PATH=%LocalAppData%\Google\Chrome\Application\chrome.exe"

if not defined BROWSER_PATH if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" set "BROWSER_PATH=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if not defined BROWSER_PATH if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" set "BROWSER_PATH=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"

if not defined BROWSER_PATH if exist "%ProgramFiles%\BraveSoftware\Brave-Browser\Application\brave.exe" set "BROWSER_PATH=%ProgramFiles%\BraveSoftware\Brave-Browser\Application\brave.exe"
if not defined BROWSER_PATH if exist "%LocalAppData%\BraveSoftware\Brave-Browser\Application\brave.exe" set "BROWSER_PATH=%LocalAppData%\BraveSoftware\Brave-Browser\Application\brave.exe"

if not defined BROWSER_PATH (
    echo [!] Nenhum navegador Chromium encontrado. Abrindo no navegador padrao do Windows...
    start "" "%APP_URL%"
    echo.
    echo Atalho simples para navegador padrao aberto.
    pause
    exit /b 0
)

echo Encontrado: %BROWSER_PATH%
echo.

echo [2/3] Baixando icone do aplicativo...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$iconPath = '%APP_DATA_DIR%\brazatalk.ico'; try { Invoke-WebRequest -Uri '%APP_URL%/icon-192.png' -OutFile '%APP_DATA_DIR%\brazatalk.png' -UseBasicParsing -TimeoutSec 5 } catch {}" >nul 2>&1

echo [3/3] Criando atalhos na Area de Trabalho e Menu Iniciar...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ws = New-Object -ComObject WScript.Shell; " ^
  "$s1 = $ws.CreateShortcut('%DESKTOP_DIR%\Braza Talk.lnk'); " ^
  "$s1.TargetPath = '%BROWSER_PATH%'; " ^
  "$s1.Arguments = '--app=%APP_URL%'; " ^
  "$s1.Description = 'Braza Talk - Voz HD & Chat em Tempo Real'; " ^
  "$s1.WindowStyle = 1; " ^
  "$s1.Save(); " ^
  "$s2 = $ws.CreateShortcut('%PROGRAMS_DIR%\Braza Talk.lnk'); " ^
  "$s2.TargetPath = '%BROWSER_PATH%'; " ^
  "$s2.Arguments = '--app=%APP_URL%'; " ^
  "$s2.Description = 'Braza Talk - Voz HD & Chat em Tempo Real'; " ^
  "$s2.WindowStyle = 1; " ^
  "$s2.Save();"

echo.
echo ============================================================
echo   ✓ Braza Talk instalado com sucesso no seu Windows!
echo   - Atalho criado na sua Área de Trabalho: 'Braza Talk'
echo   - Atalho adicionado ao Menu Iniciar
echo ============================================================
echo.

set /p OPEN_NOW="Deseja abrir o Braza Talk agora? (S/n): "
if /i "%OPEN_NOW%"=="n" goto :DONE
start "" "%BROWSER_PATH%" --app="%APP_URL%"

:DONE
echo.
echo Concluido! Pode fechar esta janela.
timeout /t 3 >nul
exit /b 0
