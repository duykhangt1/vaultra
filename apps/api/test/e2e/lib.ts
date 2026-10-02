import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const CACHE = join(tmpdir(), 'vaultra-e2e-tokens.json');
const loadCache = (): Record<string, { t: string; at: number }> => { try { return existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, 'utf8')) : {}; } catch { return {}; } };
export const BASE = process.env.API_URL ?? 'http://localhost:4000/v1';
