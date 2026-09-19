$ErrorActionPreference = "Stop"
$rootDir = Split-Path -Parent $PSScriptRoot
Set-Location $rootDir

Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "   VAULTRA - CLOUDFLARE FULL-STACK DEPLOYMENT           " -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Cyan

# 1. Ensure Backend API is running on port 4000
$apiRunning = Test-NetConnection -ComputerName 127.0.0.1 -Port 4000 -InformationLevel Quiet
if (-not $apiRunning) {
  Write-Host "[1/4] Starting local Backend API on port 4000..." -ForegroundColor Yellow
  Start-Process -FilePath "cmd.exe" -ArgumentList "/c pnpm --filter @vaultra/api run dev" -WorkingDirectory $rootDir -WindowStyle Minimized
  for ($i = 0; $i -lt 20; $i++) {
    Start-Sleep -Seconds 1
    if (Test-NetConnection -ComputerName 127.0.0.1 -Port 4000 -InformationLevel Quiet) { break }
  }
} else {
  Write-Host "[1/4] Local Backend API is already running on port 4000." -ForegroundColor Green
}

# 2. Ensure Cloudflare Tunnel is running and get URL
$logFile = "$env:TEMP\vaultra_cloudflared.log"
$tunnelUrl = $null
if ((Get-Process cloudflared -ErrorAction SilentlyContinue) -and (Test-Path $logFile)) {
  $raw = Get-Content $logFile -Raw
  $m = [regex]::Match($raw, 'https://[a-z0-9-]+\.trycloudflare\.com')
  if ($m.Success) { $tunnelUrl = $m.Value }
}

if (-not $tunnelUrl) {
  Write-Host "[2/4] Starting Cloudflare Tunnel for Backend (port 4000)..." -ForegroundColor Yellow
  Get-Process cloudflared -ErrorAction SilentlyContinue | Stop-Process -Force
  if (Test-Path $logFile) { Remove-Item $logFile -Force }
  $cfExe = "C:\Users\ADMIN\AppData\Local\cloudflared\cloudflared.exe"
  if (-not (Test-Path $cfExe)) { $cfExe = "cloudflared.exe" }
  $cmd = "$cfExe tunnel --url http://127.0.0.1:4000 --protocol http2 --no-prechecks --edge-ip-version 4 --no-autoupdate --logfile `"$logFile`""
  Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{ CommandLine = $cmd } | Out-Null
  for ($i = 0; $i -lt 20; $i++) {
    Start-Sleep -Seconds 1
    if (Test-Path $logFile) {
      $raw = Get-Content $logFile -Raw
      $m = [regex]::Match($raw, 'https://[a-z0-9-]+\.trycloudflare\.com')
      if ($m.Success -and $raw -match 'Registered tunnel connection') {
        $tunnelUrl = $m.Value
        break
      }
    }
  }
}

if (-not $tunnelUrl) {
  throw "Could not obtain Cloudflare Tunnel URL. Check $logFile"
}
Write-Host "[2/4] Backend Tunnel active: $tunnelUrl" -ForegroundColor Green

# 3. Update Tunnel URL in Gateway & Pages Function and deploy Worker Gateway
Write-Host "[3/4] Updating & Deploying Backend Gateway to Cloudflare Workers..." -ForegroundColor Yellow
$wranglerPath = Join-Path $rootDir "apps\gateway\wrangler.toml"
$wranglerTxt = Get-Content $wranglerPath -Raw
$wranglerTxt = [regex]::Replace($wranglerTxt, 'API_ORIGIN\s*=\s*"[^"]+"', "API_ORIGIN = `"$tunnelUrl`"")
Set-Content -Path $wranglerPath -Value $wranglerTxt -Encoding UTF8

$fnPath = Join-Path $rootDir "apps\web\functions\v1\[[path]].ts"
$fnTxt = Get-Content $fnPath -Raw
$fnTxt = [regex]::Replace($fnTxt, "https://[a-z0-9-]+\.trycloudflare\.com", $tunnelUrl)
Set-Content -Path $fnPath -Value $fnTxt -Encoding UTF8

Push-Location (Join-Path $rootDir "apps\gateway")
npx wrangler deploy
Pop-Location

# 4. Build & Deploy Frontend to Cloudflare Pages
Write-Host "[4/4] Building & Deploying Frontend to Cloudflare Pages (vaultra)..." -ForegroundColor Yellow
Push-Location (Join-Path $rootDir "apps\web")
pnpm run build
npx wrangler pages deploy dist --project-name vaultra --branch main --commit-dirty=true
Pop-Location

Write-Host ""
Write-Host "========================================================" -ForegroundColor Green
Write-Host "   DEPLOY CLOUDFLARE HOAN TAT!                          " -ForegroundColor Green
Write-Host "   Frontend (Cloudflare Pages): https://vaultra-844.pages.dev" -ForegroundColor Cyan
Write-Host "   Backend Gateway (Workers)  : https://vaultra-gateway.zerngulon.workers.dev" -ForegroundColor Cyan
Write-Host "   Backend Tunnel (Edge)      : $tunnelUrl" -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Green

