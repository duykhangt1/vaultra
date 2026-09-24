import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';
import path from 'node:path';

export default defineConfig({
  plugins: [react(), tailwind()],
  resolve: { alias: { '@': path.resolve(__dirname, 'src'), '@vaultra/shared': path.resolve(__dirname, '../../packages/shared/src/index.ts') } },
  server: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: true,
    proxy: { '/v1': { target: process.env.API_URL ?? 'http://127.0.0.1:4000', changeOrigin: false, ws: true } },
  },
  preview: { host: '0.0.0.0', port: 5173, proxy: { '/v1': { target: process.env.API_URL ?? 'http://127.0.0.1:4000', ws: true } } },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        // Path-based so shared helpers never get hoisted into a heavy vendor chunk (which made every page
        // preload three.js). Heavy libraries stay behind lazy routes: three (size guide 3D), map, charts, gsap.
        manualChunks(id) {
          // Vite's own lazy-import helper must live in an always-loaded chunk, not inside a vendor one
          if (id.includes('vite/preload-helper') || id.includes('commonjsHelpers')) return 'react';
          if (!id.includes('node_modules')) return undefined;
          const pkg = (re: RegExp) => re.test(id.split('\\').join('/'));
          if (pkg(/\/node_modules\/(react|react-dom|react-router|react-router-dom|scheduler)\//)) return 'react';
          if (pkg(/\/node_modules\/(@tanstack|zustand|use-sync-external-store)\//)) return 'query';
          if (pkg(/\/node_modules\/(echarts|zrender)\//)) return 'charts';
          if (pkg(/\/node_modules\/(three|@react-three|three-stdlib|maath|troika-[^/]+|camera-controls|meshline|stats-gl|stats\.js|@monogrid|hls\.js|detect-gpu|suspend-react|its-fine|@use-gesture|tunnel-rat|react-use-measure|zustand\/traditional)\//)) return 'three';
          if (pkg(/\/node_modules\/leaflet\//)) return 'map';
          if (pkg(/\/node_modules\/gsap\//)) return 'gsap';
          return undefined;
        },
      },
    },
  },
});

interface CoreQuoteLedgerPayload {
  readonly facilityId: string;
  readonly accountRef: string;
  readonly amountVnd: number;
  readonly cycleDays: number;
}

function validateCoreQuoteLedgerInput(payload: CoreQuoteLedgerPayload): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  if (!payload.facilityId.trim()) issues.push('missing_facility');
  if (!payload.accountRef.trim()) issues.push('missing_account');
  if (!Number.isFinite(payload.amountVnd) || payload.amountVnd < 0) issues.push('invalid_amount');
  if (!Number.isFinite(payload.cycleDays) || payload.cycleDays < 1) issues.push('invalid_cycle');
  return { valid: issues.length === 0, issues };
}
