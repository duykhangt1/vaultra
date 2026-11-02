import { spawnSync } from 'node:child_process';
const files = ['vnpay', 'f1-reservation', 'f2-checkin', 'f3-moveout', 'f4-f7-lifecycle', 'nfr03-concurrency', 'rbac', 'realtime'];
let failed = 0;
for (const f of files) {
  console.log(`\n=== ${f} ===`);
  const r = spawnSync('npx', ['tsx', `test/e2e/${f}.ts`], { stdio: 'inherit', shell: process.platform === 'win32' });
  if (r.status !== 0) { failed++; console.log(`!! ${f} FAILED`); }
}
console.log(failed ? `\n${failed} suite(s) failed` : '\nall e2e suites passed');
process.exit(failed ? 1 : 0);
