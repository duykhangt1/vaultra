import 'reflect-metadata';
import './common/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from '@nestjs/common';
import * as express from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { AppModule } from './app.module';
import { config } from './common/config';
import { PrismaService } from './common/prisma.service';
import { RealtimeHub } from './realtime/realtime.hub';
import { KbService } from './assistant/kb.service';
import { isAllowedOrigin } from './common/origin';

const tunnelFile = path.resolve(__dirname, '..', '.active-tunnel-url.txt');

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true, logger: ['error', 'warn', 'log'] });
  app.setGlobalPrefix('v1');
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' }, contentSecurityPolicy: false, frameguard: false }));
  app.use(cookieParser());
  app.use((req: any, res: express.Response, next: express.NextFunction) => {
    req.requestId = (req.headers['x-request-id'] as string) || randomUUID();
    res.setHeader('X-Request-Id', req.requestId);
    res.setHeader('Access-Control-Allow-Private-Network', 'true');
    const fwdHost = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
    if (fwdHost.endsWith('.trycloudflare.com')) {
      config.apiPublicUrl = `https://${fwdHost}`;
    } else if (/^https?:\/\/(localhost|127\.0\.0\.1)\b/i.test(config.apiPublicUrl) && fs.existsSync(tunnelFile)) {
      try {
        const saved = fs.readFileSync(tunnelFile, 'utf8').trim();
        if (saved.startsWith('https://')) config.apiPublicUrl = saved;
      } catch {
        // ignore
      }
    }
    next();
  });
  // Raw bytes for local-storage presigned PUT uploads.
  app.use('/v1/media', (req: express.Request, res: express.Response, next: express.NextFunction) => (req.method === 'PUT' ? express.raw({ type: () => true, limit: '26mb' })(req, res, next) : next()));
  app.use(express.urlencoded({ extended: false }));
  app.enableCors({
    origin: (origin: string | undefined, cb: (err: Error | null, allow?: boolean) => void) => cb(null, isAllowedOrigin(origin)),
    credentials: true,
    exposedHeaders: ['X-Request-Id', 'Retry-After', 'X-Refresh-Token'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key', 'X-Active-Facility', 'X-Request-Id', 'X-Turnstile-Token', 'If-Match', 'X-Refresh-Token'],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });
  app.enableShutdownHooks();
  await app.listen(config.port, '0.0.0.0');
  const hub = app.get(RealtimeHub);
  hub.attach(app.getHttpServer());
  const prisma = app.get(PrismaService);
  prisma.onRealtimeMutate = () => hub.broadcastAll({ type: 'data.changed', at: new Date().toISOString() });
  void app.get(KbService).syncPolicyArticle().catch((e) => new Logger('KB').warn(`policy KB sync skipped: ${e.message}`));
  new Logger('Bootstrap').log(`Vaultra API listening on :${config.port} (/v1)`);
}

bootstrap().catch((e) => {
  console.error(e);
  process.exit(1);
});
