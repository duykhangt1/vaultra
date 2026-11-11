import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { from, lastValueFrom } from 'rxjs';
import { IDEMPOTENT } from '../auth/decorators';
import { AppError } from './errors';
import { Req } from './http';
import { PrismaService } from './prisma.service';
import { serialize } from './serialize.interceptor';
import { sha256 } from './util';

/**
 * Idempotency-Key (spec §7.2.5, §10.5 idempotency_keys): same key + same body returns the first
 * successful response for 24 h; same key + different body -> 409 IDEMPOTENCY_CONFLICT.
 * A placeholder row is inserted first, so concurrent duplicates cannot both execute.
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(private reflector: Reflector, private prisma: PrismaService) {}

  intercept(ec: ExecutionContext, next: CallHandler) {
    if (!this.reflector.get<boolean>(IDEMPOTENT, ec.getHandler())) return next.handle();
    return from(this.run(ec, next));
  }

  private async run(ec: ExecutionContext, next: CallHandler) {
    const req = ec.switchToHttp().getRequest<Req>();
    const res = ec.switchToHttp().getResponse();
    const key = req.headers['idempotency-key'];
    if (typeof key !== 'string' || key.length < 8 || key.length > 64) {
      throw new AppError('VALIDATION_FAILED', 'Thiếu header Idempotency-Key (8–64 ký tự)');
    }
    if (!req.ctx) throw new AppError('UNAUTHENTICATED', 'Vui lòng đăng nhập', undefined, 401);
    const userId = req.ctx.userId;
    const endpoint = `${req.method} ${req.route?.path ?? req.path}`.slice(0, 100);
    const requestHash = sha256(JSON.stringify({ endpoint, params: req.params, body: req.body ?? {} }));
    const existing = await this.prisma.idempotencyKey.findUnique({ where: { user_id_key: { user_id: userId, key } } });
    if (existing && existing.expires_at > new Date()) {
      if (existing.request_hash !== requestHash) throw new AppError('IDEMPOTENCY_CONFLICT', 'Idempotency-Key đã được dùng cho một yêu cầu khác');
      if (existing.response_status === 0) throw new AppError('IDEMPOTENCY_CONFLICT', 'Yêu cầu trùng đang được xử lý, vui lòng đợi');
      res.status(existing.response_status);
      res.setHeader('Idempotent-Replayed', 'true');
      return existing.response_body;
    }
    if (existing) await this.prisma.idempotencyKey.delete({ where: { user_id_key: { user_id: userId, key } } });
    try {
      await this.prisma.idempotencyKey.create({
        data: { key, user_id: userId, endpoint, request_hash: requestHash, response_status: 0, response_body: {}, expires_at: new Date(Date.now() + 86400000) },
      });
    } catch {
      throw new AppError('IDEMPOTENCY_CONFLICT', 'Yêu cầu trùng đang được xử lý, vui lòng đợi');
    }
    try {
      const result = await lastValueFrom(next.handle(), { defaultValue: null });
      const body = serialize(result) as object;
      await this.prisma.idempotencyKey.update({
        where: { user_id_key: { user_id: userId, key } },
        data: { response_status: res.statusCode || 201, response_body: (body ?? {}) as object },
      });
      return body;
    } catch (e) {
      await this.prisma.idempotencyKey.delete({ where: { user_id_key: { user_id: userId, key } } }).catch(() => undefined);
      throw e;
    }
  }
}
