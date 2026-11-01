import { test } from 'node:test';
import assert from 'node:assert/strict';
import 'reflect-metadata';
import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA, ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import { buildOpenApiPaths } from '../../src/platform/openapi';
import { IDEMPOTENT, IS_PUBLIC, PERMISSION, RATE_LIMIT } from '../../src/auth/decorators';
import { AppModule } from '../../src/app.module';

// the test files are not compiled with experimental decorators, so the controller's metadata is written by hand, exactly as the decorators would
class DemoController {
  login() { return 1; }
  one() { return 1; }
  create() { return 1; }
}
const mark = (name: 'login' | 'one' | 'create', method: number, route: string, extra: Record<string, unknown> = {}, args: Record<string, unknown> = {}) => {
  const h = (DemoController.prototype as any)[name];
  Reflect.defineMetadata(PATH_METADATA, route, h);
  Reflect.defineMetadata(METHOD_METADATA, method, h);
  for (const [k, v] of Object.entries(extra)) Reflect.defineMetadata(k, v, h);
  Reflect.defineMetadata(ROUTE_ARGS_METADATA, args, DemoController, name);
};
Reflect.defineMetadata(PATH_METADATA, 'demo', DemoController);
mark('login', RequestMethod.POST, 'login', { [IS_PUBLIC]: true, [RATE_LIMIT]: { limit: 5, windowSec: 60 } }, { '3:0': { index: 0 } });
mark('one', RequestMethod.GET, 'things/:id/parts/:partId', { [PERMISSION]: { code: 'thing.manage', write: false } }, { '5:0': { index: 0, data: 'id' }, '4:1': { index: 1, data: 'verbose' }, '4:2': { index: 2 } });
