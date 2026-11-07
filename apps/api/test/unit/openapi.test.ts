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
mark('create', RequestMethod.POST, 'things', { [IDEMPOTENT]: true, [PERMISSION]: { code: 'thing.manage', write: true } }, { '3:0': { index: 0 } });

test('generated spec carries path parameters, query names, body, auth and limits', () => {
  const p = buildOpenApiPaths([DemoController], { 'post /demo/login': 'Đăng nhập thử' }) as Record<string, Record<string, any>>;
  const login = p['/demo/login'].post;
  assert.equal(login.summary, 'Đăng nhập thử');
  assert.deepEqual(login.security, []);
  assert.ok(login.requestBody);
  assert.match(login.description, /5 lần \/ 60 giây/);
  const one = p['/demo/things/{id}/parts/{partId}'].get;
  assert.deepEqual(one.parameters.filter((x: any) => x.in === 'path').map((x: any) => x.name), ['id', 'partId']);
  assert.ok(one.parameters.some((x: any) => x.in === 'query' && x.name === 'verbose'));
  assert.ok(one.parameters.some((x: any) => x.name === 'page[size]'), 'a free-form @Query() documents paging');
  assert.match(one.description, /thing\.manage/);
  assert.match(one.description, /chỉ cần quyền xem/);
  assert.equal(one.summary, 'GET /demo/things/{id}/parts/{partId}');
  const create = p['/demo/things'].post;
  assert.ok(create.parameters.some((x: any) => x.in === 'header' && x.name === 'Idempotency-Key' && x.required));
  assert.ok(create.responses['403'] && !login.responses['403']);
});

test('the real API is described route by route', () => {
  const controllers: Function[] = Reflect.getMetadata('controllers', AppModule);
  const p = buildOpenApiPaths(controllers) as Record<string, Record<string, any>>;
  const ops = Object.entries(p).flatMap(([path, v]) => Object.keys(v).map((m) => `${m} ${path}`));
  assert.ok(ops.length > 200, `only ${ops.length} operations described`);
  for (const [path, v] of Object.entries(p)) {
    assert.ok(path.startsWith('/') && !path.includes(':') && !path.includes('//'), path);
    for (const op of Object.values(v)) assert.ok(op.responses?.['200'] && op.tags?.length, path);
  }
  for (const want of ['post /auth/login', 'get /admin/users', 'post /facility-accounts/{id}/lock', 'get /reports/{code}', 'get /facility-accounts/lookup', 'get /health/ready', 'get /openapi.json']) assert.ok(ops.includes(want), `missing ${want}`);
  assert.equal(p['/auth/login'].post.security.length, 0, 'login needs no token');
  assert.match(p['/facility-accounts/{id}/lock'].post.description, /facility_account\.manage/);
  assert.ok(p['/facility-accounts/lookup'].get.parameters.some((x: any) => x.name === 'email'));
});
