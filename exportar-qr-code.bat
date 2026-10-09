@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0windows\Launcher.ps1" -OnlyQr
if errorlevel 1 (
  echo.
  echo Nao foi possivel exportar o QR Code. Confira a mensagem acima.
  pause
  exit /b 1
)
