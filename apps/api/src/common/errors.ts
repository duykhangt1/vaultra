import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';
import { ZodError } from 'zod';
import type { ErrorCode } from '@vaultra/shared';

const STATUS: Partial<Record<ErrorCode, number>> = {
  VALIDATION_FAILED: 400,
  UNAUTHENTICATED: 401,
  TOKEN_EXPIRED: 401,
  FORBIDDEN: 403,
  EMAIL_NOT_VERIFIED: 403,
  ACCOUNT_LOCKED: 403,
  NOT_FOUND: 404,
  PROMO_INVALID: 422,
  PRICE_OUT_OF_BAND: 422,
  BOOKING_BLOCKED: 422,
  POLICY_INVALID: 422,
  RATE_LIMITED: 429,
  PAYMENT_PROVIDER_ERROR: 502,
};

export class AppError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
    public details?: unknown,
    public status: number = STATUS[code] ?? 409,
  ) {
    super(message);
  }
}

export const notFound = (what = 'Bản ghi') => new AppError('NOT_FOUND', `${what} không tồn tại hoặc ngoài phạm vi truy cập`);
export const forbidden = (msg = 'Bạn không có quyền thực hiện thao tác này') => new AppError('FORBIDDEN', msg);
export const invalidTransition = (entity: string, from: string, to: string) =>
  new AppError('INVALID_STATUS_TRANSITION', `Không thể chuyển ${entity} từ ${from} sang ${to}`, { entity, from, to });
export const validation = (message: string, details?: unknown) => new AppError('VALIDATION_FAILED', message, details);
export const conflict = (message: string, details?: unknown) => new AppError('CONFLICT', message, details);

function formatZodIssues(issues: { path?: PropertyKey[]; message: string; minimum?: unknown }[]) {
  if (!issues?.length) return 'Dữ liệu không hợp lệ';
  const msgs = issues.map((i) => {
    const field = (i.path ?? []).map(String).join('.');
    const m = i.message || '';
    const minMatch = m.match(/(?:>=|at least )(\d+) character/i);
    if (minMatch) {
      return field === 'reason'
        ? `Vui lòng nhập lý do (tối thiểu ${minMatch[1]} ký tự)`
        : `Trường ${field || 'dữ liệu'} cần tối thiểu ${minMatch[1]} ký tự`;
    }
    if (/Required|expected .* received undefined/i.test(m)) {
      return field ? `Vui lòng nhập thông tin bắt buộc (${field})` : 'Vui lòng nhập đầy đủ thông tin bắt buộc';
    }
    return m;
  });
  return msgs[0] || 'Dữ liệu không hợp lệ';
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Error');
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request & { requestId?: string }>();
    const requestId = req.requestId;
    let status = 500;
    let body: { code: string; message: string; details?: unknown };
    if (exception instanceof AppError) {
      status = exception.status;
      body = { code: exception.code, message: exception.message, details: exception.details };
    } else if (exception instanceof ZodError) {
      status = 400;
      body = {
        code: 'VALIDATION_FAILED',
        message: formatZodIssues(exception.issues as any),
        details: exception.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      };
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const code = status === 404 ? 'NOT_FOUND' : status === 401 ? 'UNAUTHENTICATED' : status === 403 ? 'FORBIDDEN' : status === 429 ? 'RATE_LIMITED' : 'VALIDATION_FAILED';
      body = { code, message: exception.message };
    } else if (isPrismaKnown(exception)) {
      const e = exception as { code: string; meta?: Record<string, unknown>; message: string };
      if (e.code === 'P2002') {
        status = 409;
        const targetStr = JSON.stringify(e.meta ?? '') + ' ' + String(e.message ?? '');
        const msg = targetStr.includes('code')
          ? 'Mã này đã tồn tại trong hệ thống, vui lòng nhập mã khác'
          : targetStr.includes('slug')
            ? 'Đường dẫn (slug) đã tồn tại, vui lòng chọn tên khác'
            : targetStr.includes('email')
              ? 'Địa chỉ email đã được sử dụng'
              : 'Dữ liệu bị trùng (vi phạm ràng buộc duy nhất)';
        body = { code: 'CONFLICT', message: msg, details: e.meta };
      } else if (e.code === 'P2025') {
        status = 404;
        body = { code: 'NOT_FOUND', message: 'Bản ghi không tồn tại' };
      } else if (e.code === 'P2003') {
        status = 409;
        body = { code: 'CONFLICT', message: 'Vi phạm ràng buộc khóa ngoại', details: e.meta };
      } else if (e.code === 'P2039' || e.message.includes('pool failed to retrieve a connection')) {
        this.logger.error(e.message);
        body = { code: 'INTERNAL', message: 'Không thể kết nối cơ sở dữ liệu (MySQL/MariaDB chưa khởi động hoặc sai cấu hình DATABASE_URL)' };
      } else {
        this.logger.error(e.message);
        body = { code: 'INTERNAL', message: 'Lỗi hệ thống' };
      }
    } else {
      this.logger.error((exception as Error)?.stack ?? String(exception));
      body = { code: 'INTERNAL', message: 'Lỗi hệ thống, vui lòng thử lại' };
    }
    if (status === 429) {
      const det = (body.details ?? {}) as { retryAfter?: number; limit?: number; reset?: number };
      const retry = det.retryAfter ?? 60;
      res.setHeader('Retry-After', String(retry));
      if (det.limit) res.setHeader('RateLimit-Limit', String(det.limit));
      res.setHeader('RateLimit-Remaining', '0');
      res.setHeader('RateLimit-Reset', String(det.reset ?? retry));
    }
    if (status >= 500) this.logger.error(JSON.stringify({ requestId, path: req.url, body }));
    res.status(status).json({ error: { ...body, requestId } });
  }
}

function isPrismaKnown(e: unknown) {
  if (typeof e !== 'object' || e === null) return false;
  const obj = e as { name?: string; code?: unknown };
  return obj.name === 'PrismaClientKnownRequestError' || (typeof obj.code === 'string' && /^P2\d{3}$/.test(obj.code));
}

export function isUniqueViolation(e: unknown, field?: string): boolean {
  const err = e as { code?: string; meta?: { target?: unknown; driverAdapterError?: { cause?: { constraint?: unknown } } }; message?: string };
  if (err?.code !== 'P2002') return false;
  if (!field) return true;
  return JSON.stringify(err.meta ?? '').includes(field) || String(err.message ?? '').includes(field);
}
