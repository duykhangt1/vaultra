/**
 * AUDIT REPRODUCTION SUITE (see /AUDIT_REPORT.md).
 *
 * Every check asserts the EXPECTED (correct) behaviour. A check that prints ✘ means the defect named in its label is
 * reproduced against the running API; after the fix the same check must turn ✔. Run against an isolated database:
 *
 *   API_URL=http://localhost:4100/v1 SERVICE_TOKEN_SECRET=<same as the API> npx tsx test/audit/audit-findings.ts
 *
 * The suite creates its own users / customers / reservations (unique e-mails per run) and never touches existing rows.
 * It advances the API's fake clock for the time-based checks and resets it at the end.
 */
import { createHmac } from 'node:crypto';
import { Client, BASE, check, section, idem, inDays, sleep, summary, payOnVnpay } from '../e2e/lib';

const RUN = Date.now().toString(36);
const ROOT = BASE.replace(/\/v1$/, '');
const PNG = 'data:image/png;base64,' + Buffer.alloc(400, 7).toString('base64');
const SECRET = process.env.SERVICE_TOKEN_SECRET ?? 'dev-service-token-secret-change-me';
