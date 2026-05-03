@echo off
setlocal
cd /d "%~dp0"
if exist "%~dp0dist\KaramonLauncher.jar" (
  java -jar "%~dp0dist\KaramonLauncher.jar"
) else (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\run.ps1"
)
endlocal
