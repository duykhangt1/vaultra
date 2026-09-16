// Minimal .env loader (no dependency): loads apps/api/.env then repo-root .env if present.
const fs = require('fs');
const path = require('path');
for (const file of [path.join(__dirname, '..', '..', '.env'), path.join(__dirname, '..', '..', '..', '..', '.env')]) {
  if (!fs.existsSync(file)) continue;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m || process.env[m[1]] !== undefined) continue;
    process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1');
  }
}
