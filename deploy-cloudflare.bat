@echo off
chcp 65001 >nul
title Vaultra - Deploy 100% Serverless to Cloudflare (Workers + Pages + R2)
echo ============================================================================
echo   VAULTRA - DEPLOY 100%% SERVERLESS LEN CLOUDFLARE (KHONG CAN CHAY MAY LOCAL)
echo ============================================================================
echo.

echo [1/3] Deploying Serverless Backend + Database Engine to Cloudflare Workers...
cd /d "%~dp0apps\gateway"
call npx wrangler deploy
if errorlevel 1 (
    echo [ERROR] Deploy Cloudflare Worker that bai!
    pause
    exit /b 1
)

echo.
echo [2/3] Building Frontend (@vaultra/web)...
cd /d "%~dp0"
call pnpm --filter @vaultra/web build
if errorlevel 1 (
    echo [ERROR] Build Frontend that bai!
    pause
    exit /b 1
)

echo.
echo [3/3] Deploying Frontend to Cloudflare Pages...
cd /d "%~dp0apps\web"
call npx wrangler pages deploy dist --project-name vaultra --branch main --commit-dirty=true
if errorlevel 1 (
    echo [ERROR] Deploy Cloudflare Pages that bai!
    pause
    exit /b 1
)

echo.
echo ============================================================================
echo   HOAN TAT! HE THONG CHAY 100%% TREN CLOUDFLARE (CA FRONTEND VA BACKEND):
echo   - Frontend (Cloudflare Pages):   https://vaultra-844.pages.dev
echo   - Backend  (Cloudflare Workers): https://vaultra-gateway.zerngulon.workers.dev
echo   Ban co the tat may tinh ma website va API van hoat dong 24/7 tren Cloudflare!
echo ============================================================================
pause
