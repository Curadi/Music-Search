@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0windows\Launcher.ps1" -RestoreYouTube
if errorlevel 1 (
  echo.
  echo Nao foi possivel restaurar. Confira a mensagem acima.
  pause
  exit /b 1
)
