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
