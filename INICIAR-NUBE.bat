@echo off
chcp 65001 >nul
title AgroPOS - Nube
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo  Node.js no esta instalado. Descargalo de https://nodejs.org  ^(boton "LTS"^).
  pause
  exit /b 1
)

if not exist node_modules (
  echo Instalando AgroPOS por primera vez...
  call npm install
  if errorlevel 1 (
    pause
    exit /b 1
  )
)

start "" cmd /c "timeout /t 3 >nul & start http://localhost:4000"
call npm run start:nube
pause
