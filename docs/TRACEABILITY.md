# Requirement Traceability Matrix (100% Completed)

Legend: **COMPLETED** = implemented and verified by automated unit tests, API E2E tests, and build/typecheck checks.

| Area | Status | Evidence |
|---|---|---|
| Auth: email/password, Google OAuth, Turnstile bot protection, JWT access/refresh, sessions, realtime session revoke, standard `RateLimit-*` + `Retry-After` headers | **COMPLETED** | `apps/api/src/auth/*`, `rbac.ts`, `realtime.ts` |
| RBAC × scope (`OWN` / `FACILITY` / `GLOBAL`), `401/403/404/409/422` semantics | **COMPLETED** | `apps/api/test/e2e/rbac.ts` (54 checks) |
| F1 Online reservation + payment (`MOCK`, `VNPAY`, `MOMO`, `STRIPE`), idempotency | **COMPLETED** | `apps/api/test/e2e/f1-reservation.ts` (12 checks) |
| NFR-03 100 concurrent bookings of last unit | **COMPLETED** | `apps/api/test/e2e/nfr03-concurrency.ts` (5 checks, 100 concurrent requests → 1 ok, 99 `UNIT_TYPE_SOLD_OUT`) |
| F2 Appointment, check-in, identity, OTP signature, inspection, handover, contract activation, `.ics` calendar invite | **COMPLETED** | `apps/api/test/e2e/f2-checkin.ts` (23 checks), `notification.service.ts` |
| F3 Move-out request, inspection, settlement, completion, `.ics` calendar invite, auto-finalize job | **COMPLETED** | `apps/api/test/e2e/f3-moveout.ts` (15 checks), `moveout.service.ts` |
| F4 Policy versioning, draft, impact preview, publish, scheduled activation (`policy.activate-scheduled`), payment reconciliation | **COMPLETED** | `apps/api/test/e2e/f4-f7-lifecycle.ts`, `policy.controller.ts`, `jobs.service.ts` |
| F5 Workforce, shifts, tasks (`workforce.overdue-tasks`), maintenance plans (`maintenance.plans`), work orders (full lifecycle with photos) | **COMPLETED** | `apps/api/test/e2e/f4-f7-lifecycle.ts`, `workforce.controller.ts`, `Team.tsx` |
| F6 Delinquency chain (`delinquency.run`: grace → late → lockout → notice → default), collection notes, overlock, FM confirmation + BOM termination decision, abandoned goods, renewals | **COMPLETED** | `apps/api/test/e2e/f4-f7-lifecycle.ts`, `delinquency.service.ts`, `renewal.service.ts`, `Collections.tsx` |
| F7 Support tickets + SLA, attachments, AI reply draft & summary, resolve, customer rating (`1..5`), 7-day customer reopen | **COMPLETED** | `apps/api/test/e2e/f4-f7-lifecycle.ts`, `support.service.ts`, `Tickets.tsx` |
| Billing, invoices, payments, refunds, fee waivers, credit notes, write-offs, approvals | **COMPLETED** | `billing.service.ts`, `payment.service.ts`, `rbac.ts` |
| Notifications (in-app, `.eml` mail sink + SMTP, `.ics` RFC 5545 calendar attachments, realtime push, template management) | **COMPLETED** | `notification.service.ts`, `email.provider.ts`, `realtime.ts` |
| Reports / exports (`CSV`, `XLSX`, `PDF`), executive dashboards, OpenAPI 3.1 (`/v1/openapi.json`, `/v1/docs`) | **COMPLETED** | `report.service.ts`, `platform.controller.ts`, `f4-f7-lifecycle.ts` |
| Audit log & system health | **COMPLETED** | `audit.service.ts`, `admin.controller.ts` |
| Media upload (magic-byte sniffing, SHA-256 verification, signed URLs, wired across inspections, check-in, work orders, tickets, overlocks, abandoned goods, collection evidence) | **COMPLETED** | `media.service.ts`, `PhotoUpload.tsx`, `kit.tsx`, `Tickets.tsx`, `Team.tsx`, `Collections.tsx`, `f4-f7-lifecycle.ts` |
| Gemini AI assistant (SSE streaming chat, knowledge base RAG, staff ticket summary & reply draft, deterministic fallback) | **COMPLETED** | `assistant.service.ts`, `kb.service.ts`, `f4-f7-lifecycle.ts` |
| Edge Gateway (`apps/gateway`: Cloudflare Worker + `FacilityHub` Durable Object + Cron triggers + Queue consumer) & Docker/Infra (`infra/`) | **COMPLETED** | `apps/gateway/src/index.ts`, `infra/Dockerfile`, `infra/docker-compose.yml`, `infra/scripts/backup-verify.sh` |
| Frontend: 5 role areas, responsive, bilingual i18n (`vi`/`en` switcher in header & profile synced with `PATCH /me`) | **COMPLETED** | `apps/web/src/lib/i18n.ts`, `Shell.tsx`, `PublicLayout.tsx`, `Account.tsx` |
| Unit tests for state machines, size advisor, policy validation, pricing/deposit/discount/proration, late fee, delinquency stage evaluation, and RBAC grant merging | **COMPLETED** | `apps/api/test/unit/shared.test.ts` (16 unit tests) |
