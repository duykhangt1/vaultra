@echo off
chcp 65001 >nul
title Vaultra Local Backend - R2 Database + Cloudflare Tunnel
cd /d "%~dp0"
if exist "%~dp0vaultra\vaultra\apps\api\start-r2-backend.cjs" cd /d "%~dp0vaultra\vaultra"

echo ======================================================================
echo   VAULTRA - KHOI DONG BACKEND TREN MAY TINH NAY - DB LUU TREN R2
echo ======================================================================
echo   Frontend Pages: https://vaultra-844.pages.dev
echo   Database      : Cloudflare R2 - bucket vaultra
echo.

where node >nul 2>nul
if errorlevel 1 echo [ERROR] Chua cai Node.js! Vui long tai Node.js 22 LTS tai https://nodejs.org/ & pause & exit /b 1

cd /d "%CD%\apps\api"
call .\node_modules\.bin\tsc -p tsconfig.build.json

echo [INFO] Dang khoi dong Backend tren cong 4000 + Cloudflare HTTPS Tunnel...
echo.
node start-r2-backend.cjs
echo.
pause
