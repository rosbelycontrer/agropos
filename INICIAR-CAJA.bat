@echo off
chcp 65001 >nul
title AgroPOS - Caja
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  Node.js no esta instalado.
  echo  Descargalo de https://nodejs.org  ^(boton "LTS"^), instalalo y vuelve a abrir este archivo.
  echo.
  pause
  exit /b 1
)

if not exist node_modules (
  echo Instalando AgroPOS por primera vez. Esto tarda un par de minutos y necesita internet...
  call npm install
  if errorlevel 1 (
    echo.
    echo  No se pudo instalar. Revisa tu conexion a internet y vuelve a intentarlo.
    pause
    exit /b 1
  )
)

start "" cmd /c "timeout /t 3 >nul & start http://localhost:3000"
call npm start
pause
