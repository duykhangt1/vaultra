import 'reflect-metadata';
import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA, ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import { IDEMPOTENT, INTERNAL, IS_PUBLIC, PERMISSION, RATE_LIMIT } from '../auth/decorators';

type Op = Record<string, unknown>;
const VERBS: Record<number, string> = { [RequestMethod.GET]: 'get', [RequestMethod.POST]: 'post', [RequestMethod.PUT]: 'put', [RequestMethod.DELETE]: 'delete', [RequestMethod.PATCH]: 'patch' };
/** Nest's RouteParamtypes: 3 = @Body(), 4 = @Query(), 6 = @Headers(). */
const BODY = 3;
const QUERY = 4;
const HEADERS = 6;

const joinPath = (...parts: (string | undefined)[]) => '/' + parts.map((p) => (p ?? '').replace(/^\/+|\/+$/g, '')).filter(Boolean).join('/');
const asList = (v: unknown): string[] => (Array.isArray(v) ? (v as string[]) : [typeof v === 'string' ? v : '']);

const GENERIC_ERRORS = {
  '401': { description: 'Chưa đăng nhập hoặc access token hết hạn' },
  '403': { description: 'Không đủ quyền' },
  '404': { description: 'Không tìm thấy hoặc ngoài phạm vi truy cập' },
  '422': { description: 'Dữ liệu không hợp lệ' },
};

/**
 * Builds the OpenAPI `paths` object from the real controllers: every route, its path parameters, the named query parameters it reads,
 * whether it takes a JSON body, whether it is public, which permission it needs and its rate limit. Hand-written summaries
 * (`summaries`, keyed "get /path") replace the generated ones.
 */
export function buildOpenApiPaths(controllers: Function[], summaries: Record<string, string> = {}) {
  const paths: Record<string, Record<string, Op>> = {};
  for (const ctor of controllers) {
    const prefixes = asList(Reflect.getMetadata(PATH_METADATA, ctor));
    const tag = ctor.name.replace(/Controller$/, '');
    for (const name of Object.getOwnPropertyNames(ctor.prototype)) {
      if (name === 'constructor') continue;
      // read the descriptor, not the property: some controllers have getters, which must not run on the prototype
      const handler = Object.getOwnPropertyDescriptor(ctor.prototype, name)?.value;
      if (typeof handler !== 'function') continue;
      const method = Reflect.getMetadata(METHOD_METADATA, handler) as number | undefined;
      if (method === undefined || !(method in VERBS)) continue;
      const routes = asList(Reflect.getMetadata(PATH_METADATA, handler));
      const perm = Reflect.getMetadata(PERMISSION, handler) as { code: string; write: boolean } | undefined;
      const isPublic = !!Reflect.getMetadata(IS_PUBLIC, handler);
      const internal = !!Reflect.getMetadata(INTERNAL, handler);
      const limit = Reflect.getMetadata(RATE_LIMIT, handler) as { limit: number; windowSec: number } | undefined;
      const idem = !!Reflect.getMetadata(IDEMPOTENT, handler);
      const args = (Reflect.getMetadata(ROUTE_ARGS_METADATA, ctor, name) ?? {}) as Record<string, { index: number; data?: unknown }>;
      const queryNames = new Set<string>();
      let freeQuery = false;
      let hasBody = false;
      for (const [key, a] of Object.entries(args)) {
        const type = Number(key.split(':')[0]);
        if (type === QUERY) (typeof a.data === 'string' ? queryNames.add(a.data) : (freeQuery = true));
        if (type === BODY) hasBody = true;
        if (type === HEADERS && typeof a.data === 'string') queryNames.delete(a.data);
      }
      for (const prefix of prefixes) {
        for (const route of routes) {
          const full = joinPath('', prefix, route).replace(/:([A-Za-z0-9_]+)/g, '{$1}');
          const verb = VERBS[method];
          const params: Op[] = [...full.matchAll(/\{([A-Za-z0-9_]+)\}/g)].map((m) => ({ name: m[1], in: 'path', required: true, schema: { type: 'string' } }));
          for (const q of queryNames) params.push({ name: q, in: 'query', required: false, schema: { type: 'string' } });
          if (freeQuery) params.push({ name: 'page[size]', in: 'query', required: false, description: 'Số dòng mỗi trang (danh sách), tối đa 100', schema: { type: 'integer' } }, { name: 'page[cursor]', in: 'query', required: false, description: 'Con trỏ trang kế tiếp (lấy từ page.nextCursor)', schema: { type: 'string' } });
          if (idem) params.push({ name: 'Idempotency-Key', in: 'header', required: true, description: 'Khóa duy nhất cho mỗi thao tác, gửi lại cùng khóa sẽ trả kết quả cũ', schema: { type: 'string' } });
          const notes = [
            isPublic ? 'Công khai, không cần đăng nhập.' : internal ? 'Nội bộ: dùng service token, không dùng token người dùng.' : 'Cần đăng nhập (Bearer access token).',
            perm ? `Quyền cần có: \`${perm.code}\`${perm.write ? '' : ' (chỉ cần quyền xem)'}.` : '',
            limit ? `Giới hạn tần suất: ${limit.limit} lần / ${limit.windowSec} giây.` : '',
            freeQuery ? 'Nhận thêm các tham số lọc trong query tùy màn hình (ví dụ `q`, `status`, `from`, `to`).' : '',
          ].filter(Boolean);
          const op: Op = {
            tags: [tag],
            summary: summaries[`${verb} ${full}`] ?? `${verb.toUpperCase()} ${full}`,
            description: notes.join('\n\n'),
            operationId: `${tag}_${name}`,
            ...(params.length ? { parameters: params } : {}),
            ...(hasBody ? { requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', additionalProperties: true } } } } } : {}),
            ...(isPublic ? { security: [] } : {}),
            responses: { '200': { description: 'Thành công' }, ...(isPublic ? {} : GENERIC_ERRORS) },
          };
          (paths[full] ??= {})[verb] = op;
        }
      }
    }
  }
  return paths;
}
