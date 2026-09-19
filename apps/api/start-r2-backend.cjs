/**
 * Vaultra Local R2-Backed Backend + Cloudflare Tunnel Launcher
 * - Frees port 4000 if a previous instance is still running
 * - Automatically downloads tools/cloudflared.exe if not present
 * - Runs the compiled NestJS API (`dist/main.js`) on port 4000, using in-memory RAM + Cloudflare R2 (`_db/vaultra-diff-v1.json`)
 * - Launches `cloudflared tunnel --url http://127.0.0.1:4000`
 * - Automatically publishes the live HTTPS tunnel URL to R2 (`_config/backend-origin.js` & `_config/backend-origin.json`)
 *   so https://vaultra-844.pages.dev and all other computers immediately connect to this machine's backend!
 */
const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

// Load .env
const envPath = path.join(__dirname, '.env');
function loadDotEnv() {
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
      if (m) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
      }
    }
  }
}
loadDotEnv();
process.env.TRUST_PROXY_HEADERS = 'true';
if (!process.env.GOOGLE_REDIRECT_URI || process.env.GOOGLE_REDIRECT_URI.includes('localhost') || process.env.GOOGLE_REDIRECT_URI.includes('workers.dev')) {
  process.env.GOOGLE_REDIRECT_URI = 'https://vaultra-844.pages.dev/auth/callback';
}

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID || '0e057a93c13437ab7a9f464e23cd9b48';
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID || '';
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY || '';
const R2_BUCKET = process.env.R2_PUBLIC_BUCKET || 'vaultra';
const PORT = Number(process.env.PORT || 4000);
try {
  fs.unlinkSync(path.join(__dirname, '.active-tunnel-url.txt'));
} catch {
  // ignore if not present
}

// Automatically free port 4000, duplicate launcher processes, and old cloudflared processes if already running
if (process.platform === 'win32') {
  try {
    execSync(
      `powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \\"Name = 'node.exe'\\" | Where-Object { $_.ProcessId -ne ${process.pid} -and ($_.CommandLine -match 'start-r2-backend' -or $_.CommandLine -match 'dist[\\\\/]main\\.js') } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }; Get-NetTCPConnection -LocalPort ${PORT} -State Listen -ErrorAction SilentlyContinue | ForEach-Object { if ($_.OwningProcess -ne ${process.pid}) { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue } }; Get-Process cloudflared -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue"`,
      { stdio: 'ignore' },
    );
  } catch {
    // ignore
  }
} else {
  try {
    execSync(`fuser -k ${PORT}/tcp 2>/dev/null || true`, { stdio: 'ignore' });
  } catch {
    // ignore
  }
  try {
    execSync(`pkill -f "cloudflared tunnel --url http://127.0.0.1:${PORT}" 2>/dev/null || true`, { stdio: 'ignore' });
  } catch {
    // ignore
  }
}

const s3 =
  R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY
    ? new S3Client({
        region: 'auto',
        endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
        credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
      })
    : null;

async function publishOriginToR2(tunnelOrigin) {
  const clean = tunnelOrigin.replace(/\/+$/, '');
  process.env.API_PUBLIC_URL = clean;
  const jsBody = `window.__VAULTRA_BACKEND_ORIGIN__ = ${JSON.stringify(clean)};\n`;
  const jsonBody = JSON.stringify({ origin: clean, updatedAt: new Date().toISOString() }, null, 2);

  try {
    fs.writeFileSync(path.join(__dirname, '.active-tunnel-url.txt'), clean, 'utf8');
  } catch {
    // ignore
  }

  if (!s3) {
    console.warn('[Launcher] Missing R2 credentials, skipping R2 _config/backend-origin.js publish.');
    return;
  }

  try {
    await Promise.all([
      s3.send(
        new PutObjectCommand({
          Bucket: R2_BUCKET,
          Key: '_config/backend-origin.js',
          Body: jsBody,
          ContentType: 'application/javascript; charset=utf-8',
          CacheControl: 'no-store, no-cache, must-revalidate, max-age=0',
        }),
      ),
      s3.send(
        new PutObjectCommand({
          Bucket: R2_BUCKET,
          Key: '_config/backend-origin.json',
          Body: jsonBody,
          ContentType: 'application/json; charset=utf-8',
          CacheControl: 'no-store, no-cache, must-revalidate, max-age=0',
        }),
      ),
    ]);
    console.log(`[Launcher] Published active backend tunnel URL to R2: ${clean}`);
  } catch (e) {
    console.error(`[Launcher] Failed to publish tunnel URL to R2:`, e.message);
  }
}

async function ensureCloudflared() {
  const isWin = process.platform === 'win32';
  const binName = isWin ? 'cloudflared.exe' : 'cloudflared';
  const candidates = [
    path.resolve(__dirname, 'tools', binName),
    path.resolve(__dirname, '../../tools', binName),
    path.resolve(__dirname, '../../../tools', binName),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) {
      if (!isWin) {
        try { fs.chmodSync(c, 0o755); } catch { /* ignore */ }
      }
      return c;
    }
  }
  if (!isWin) {
    try {
      const sysBin = execSync('command -v cloudflared', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
      if (sysBin) return sysBin;
    } catch {
      // not installed globally, will download below
    }
  }
  const dest = path.resolve(__dirname, 'tools', binName);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const arch = process.arch === 'arm64' ? 'arm64' : 'amd64';
  const dlUrl = isWin
    ? 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe'
    : `https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${arch}`;
  console.log(`[Launcher] Downloading Cloudflare Tunnel binary (${binName}) ...`);
  try {
    const res = await fetch(dlUrl);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(dest, buf);
    if (!isWin) fs.chmodSync(dest, 0o755);
    console.log(`[Launcher] Downloaded ${binName} (${(buf.length / 1024 / 1024).toFixed(1)} MB)`);
    return dest;
  } catch (e) {
    console.error(`[Launcher] Failed to download ${binName}:`, e.message);
    return null;
  }
}

async function detectPublicIp() {
  try {
    const res = await fetch('https://www.cloudflare.com/cdn-cgi/trace', { signal: AbortSignal.timeout(2500) });
    const txt = await res.text();
    const m = /^ip=(.+)$/m.exec(txt);
    if (m && m[1].trim()) {
      process.env.PUBLIC_CLIENT_IP_FALLBACK = m[1].trim();
      console.log(`[Launcher] Detected host public IP: ${process.env.PUBLIC_CLIENT_IP_FALLBACK}`);
    }
  } catch {
    // ignore
  }
}

// 1. Start the Node API Server (auto-restarts if reloaded)
let apiProc = null;
let shuttingDown = false;
function startApiServer() {
  if (shuttingDown) return;
  loadDotEnv();
  console.log(`[Launcher] Starting Vaultra Local R2 Backend on http://127.0.0.1:${PORT} ...`);
  apiProc = spawn(process.execPath, ['--enable-source-maps', path.join(__dirname, 'dist/main.js')], {
    cwd: __dirname,
    env: { ...process.env, PORT: String(PORT) },
    stdio: 'inherit',
  });

  apiProc.on('exit', (code) => {
    if (shuttingDown) process.exit(code ?? 0);
    console.log(`[Launcher] API process exited (code ${code}), restarting in 1s...`);
    setTimeout(startApiServer, 1000);
  });
}
detectPublicIp().finally(() => startApiServer());

// 2. Start Cloudflare Tunnel
let tunnelProc = null;
async function startTunnel() {
  const cloudflaredBin = await ensureCloudflared();
  if (!cloudflaredBin) {
    console.warn('[Launcher] Running local-only on port ' + PORT);
    return;
  }
  console.log(`[Launcher] Starting Cloudflare HTTPS Tunnel -> http://127.0.0.1:${PORT} ...`);
  tunnelProc = spawn(cloudflaredBin, ['tunnel', '--url', `http://127.0.0.1:${PORT}`, '--no-autoupdate'], {
    cwd: __dirname,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let published = false;
  const onChunk = (buf) => {
    const text = buf.toString('utf8');
    const match = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/i.exec(text);
    if (match && !published) {
      published = true;
      const origin = match[0];
      console.log(`\n========================================================================`);
      console.log(`  PUBLIC BACKEND URL: ${origin}`);
      console.log(`  LOCAL BACKEND URL : http://127.0.0.1:${PORT}`);
      console.log(`  CLOUDFLARE PAGES  : https://vaultra-844.pages.dev`);
      console.log(`========================================================================\n`);
      void publishOriginToR2(origin);
    }
  };

  tunnelProc.stdout.on('data', onChunk);
  tunnelProc.stderr.on('data', onChunk);
  tunnelProc.on('error', (err) => {
    console.error(`[Launcher] cloudflared error: ${err.message}`);
  });
  tunnelProc.on('exit', (code) => {
    console.warn(`[Launcher] cloudflared exited (code ${code}), restarting in 3s...`);
    setTimeout(startTunnel, 3000);
  });
}

void startTunnel();

function shutdown() {
  shuttingDown = true;
  if (tunnelProc) {
    try { tunnelProc.kill(); } catch { /* ignore */ }
  }
  if (apiProc) {
    try { apiProc.kill('SIGINT'); } catch { /* ignore */ }
  }
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
