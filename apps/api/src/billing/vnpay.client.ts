import { createHmac, timingSafeEqual } from 'node:crypto';
import { config } from '../common/config';

/**
 * VNPay (pay API 2.1.0) — payment URL builder and signature check. No network calls: the customer is
 * redirected to VNPay's own hosted page, where they enter the card; VNPay then calls our IPN URL
 * (server-to-server, the source of truth) and redirects the browser to the return URL (display).
 * Sandbox test card (published by VNPay): NCB 9704198526191432198, NGUYEN VAN A, 07/15, OTP 123456.
 */
export const vnpayConfigured = () => Boolean(config.payments.vnpay.tmnCode && config.payments.vnpay.hashSecret);
