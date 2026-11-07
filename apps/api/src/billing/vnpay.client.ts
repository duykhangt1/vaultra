import { createHmac, timingSafeEqual } from 'node:crypto';
import { config } from '../common/config';

/**
 * VNPay (pay API 2.1.0) — payment URL builder and signature check. No network calls: the customer is
 * redirected to VNPay's own hosted page, where they enter the card; VNPay then calls our IPN URL
 * (server-to-server, the source of truth) and redirects the browser to the return URL (display).
 * Sandbox test card (published by VNPay): NCB 9704198526191432198, NGUYEN VAN A, 07/15, OTP 123456.
 */
export const vnpayConfigured = () => Boolean(config.payments.vnpay.tmnCode && config.payments.vnpay.hashSecret);

/** Keys sorted A→Z, values URL-encoded with "+" for spaces — the exact canonical form VNPay signs. */
function canonical(params: Record<string, string>) {
  return Object.keys(params)
    .filter((k) => params[k] !== '' && params[k] !== undefined && params[k] !== null)
    .sort()
    .map((k) => `${k}=${encodeURIComponent(params[k]).replace(/%20/g, '+')}`)
    .join('&');
}

const sign = (data: string) => createHmac('sha512', config.payments.vnpay.hashSecret).update(Buffer.from(data, 'utf-8')).digest('hex');

/** yyyyMMddHHmmss in Vietnam time (GMT+7), the format VNPay expects. */
export function vnTime(d: Date) {
  const t = new Date(d.getTime() + 7 * 3600_000);
  const p = (n: number, l = 2) => String(n).padStart(l, '0');
  return `${t.getUTCFullYear()}${p(t.getUTCMonth() + 1)}${p(t.getUTCDate())}${p(t.getUTCHours())}${p(t.getUTCMinutes())}${p(t.getUTCSeconds())}`;
}

/** VNPay rejects accents and special characters in order info. */
const ascii = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').replace(/[^A-Za-z0-9 ._-]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200);

export function buildPaymentUrl(o: { txnRef: string; amountVnd: number; orderInfo: string; returnUrl: string; ip?: string; createdAt: Date; expiresAt?: Date | null; locale?: 'vn' | 'en' }) {
  const ip = o.ip && /^\d{1,3}(\.\d{1,3}){3}$/.test(o.ip) ? o.ip : '127.0.0.1'; // IPv6 / proxies fall back
  const params: Record<string, string> = {
    vnp_Version: '2.1.0',
    vnp_Command: 'pay',
    vnp_TmnCode: config.payments.vnpay.tmnCode,
    vnp_Amount: String(Math.round(o.amountVnd) * 100), // VNPay wants the amount × 100
    vnp_CurrCode: 'VND',
    vnp_TxnRef: o.txnRef,
    vnp_OrderInfo: ascii(o.orderInfo),
    vnp_OrderType: 'other',
    vnp_Locale: o.locale ?? 'vn',
    vnp_ReturnUrl: o.returnUrl,
    vnp_IpAddr: ip,
    vnp_CreateDate: vnTime(o.createdAt),
  };
  if (o.expiresAt && o.expiresAt.getTime() - o.createdAt.getTime() > 60_000) params.vnp_ExpireDate = vnTime(o.expiresAt);
  const data = canonical(params);
  return `${config.payments.vnpay.payUrl}?${data}&vnp_SecureHash=${sign(data)}`;
}

export interface VnpayResult {
  valid: boolean;
  txnRef: string;
  amountVnd: number;
  responseCode: string;
  transactionStatus: string;
  txnNo: string;
  success: boolean;
}

/** Verifies the signature of a VNPay return / IPN query string and extracts the outcome. */
export function verifyQuery(query: Record<string, unknown>): VnpayResult {
  const params: Record<string, string> = {};
  for (const [k, v] of Object.entries(query)) if (k.startsWith('vnp_') && k !== 'vnp_SecureHash' && k !== 'vnp_SecureHashType') params[k] = String(Array.isArray(v) ? v[0] : v ?? '');
  const given = String(query.vnp_SecureHash ?? '');
  const expected = vnpayConfigured() ? sign(canonical(params)) : '';
  const a = Buffer.from(given.toLowerCase());
  const b = Buffer.from(expected);
  const valid = a.length > 0 && a.length === b.length && timingSafeEqual(a, b);
  const responseCode = params.vnp_ResponseCode ?? '';
  const transactionStatus = params.vnp_TransactionStatus ?? '';
  return {
    valid,
    txnRef: params.vnp_TxnRef ?? '',
    amountVnd: Number(params.vnp_Amount ?? 0) / 100,
    responseCode,
    transactionStatus,
    txnNo: params.vnp_TransactionNo ?? '',
    success: valid && responseCode === '00' && transactionStatus === '00', // never trust the codes of an unsigned/forged query
  };
}

export interface VnpayTxnInfo { found: boolean; success: boolean; amountVnd: number; txnNo: string; responseCode: string; transactionStatus: string }

/**
 * VNPay "querydr": asks the gateway what it recorded for one of our order references. `transactionDate` must be the
 * vnp_CreateDate we sent with the payment URL (yyyyMMddHHmmss, GMT+7). Used by reconciliation so "Theo cổng" comes from VNPay itself.
 */
export async function queryTransaction(o: { txnRef: string; transactionDate: string; orderInfo: string; ip?: string }): Promise<VnpayTxnInfo> {
  const v = config.payments.vnpay;
  const requestId = `${Date.now()}${Math.floor(Math.random() * 1000)}`.slice(0, 32);
  const createDate = vnTime(new Date());
  const ip = o.ip && /^\d{1,3}(\.\d{1,3}){3}$/.test(o.ip) ? o.ip : '127.0.0.1';
  const orderInfo = ascii(o.orderInfo);
  const body = { vnp_RequestId: requestId, vnp_Version: '2.1.0', vnp_Command: 'querydr', vnp_TmnCode: v.tmnCode, vnp_TxnRef: o.txnRef, vnp_OrderInfo: orderInfo, vnp_TransactionDate: o.transactionDate, vnp_CreateDate: createDate, vnp_IpAddr: ip, vnp_SecureHash: '' };
  body.vnp_SecureHash = sign([requestId, '2.1.0', 'querydr', v.tmnCode, o.txnRef, o.transactionDate, createDate, ip, orderInfo].join('|'));
  const res = await fetch(v.apiUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(4000) });
  if (!res.ok) throw new Error(`VNPay querydr HTTP ${res.status}`);
  const j = (await res.json()) as Record<string, string>;
  const responseCode = j.vnp_ResponseCode ?? '';
  const transactionStatus = j.vnp_TransactionStatus ?? '';
  return { found: responseCode === '00', success: responseCode === '00' && transactionStatus === '00', amountVnd: Number(j.vnp_Amount ?? 0) / 100, txnNo: j.vnp_TransactionNo ?? '', responseCode, transactionStatus };
}
