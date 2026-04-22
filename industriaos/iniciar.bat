@echo off
title IndustriaOS - Servidor
color 0A
echo.
echo  ============================================
echo   IndustriaOS - Sistema de Gestao Industrial
echo  ============================================
echo.

cd /d "%~dp0backend"

IF NOT EXIST "node_modules" (
  echo  Instalando dependencias pela primeira vez...
  echo  (isso pode levar alguns minutos)
  echo.
  npm install
  echo.
)

echo  Iniciando servidor...
echo.
echo  Acesse no navegador: http://localhost:3000
echo  Admin: admin@industriaos.com / admin123
echo.
echo  Para parar o servidor: feche esta janela ou pressione Ctrl+C
echo.

node server.js

pause
