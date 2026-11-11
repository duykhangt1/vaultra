const metaStore = new WeakMap<object, Map<string | symbol, Map<string | symbol | undefined, any>>>();

function setMeta(key: string | symbol, val: any, target: object, prop?: string | symbol) {
  let tm = metaStore.get(target);
  if (!tm) {
    tm = new Map();
    metaStore.set(target, tm);
  }
  let pm = tm.get(prop as any);
  if (!pm) {
    pm = new Map();
    tm.set(prop as any, pm);
  }
  pm.set(key, val);
}

function getMeta(key: string | symbol, target: object, prop?: string | symbol): any {
  return metaStore.get(target)?.get(prop as any)?.get(key);
}

// Polyfill global Reflect.defineMetadata & Reflect.getMetadata
(globalThis as any).Reflect = (globalThis as any).Reflect || {};
(globalThis as any).Reflect.defineMetadata = (k: any, v: any, t: any, p?: any) => setMeta(k, v, t, p);
(globalThis as any).Reflect.getMetadata = (k: any, t: any, p?: any) => getMeta(k, t, p);

export function Injectable(): ClassDecorator {
  return () => {};
}
export function Global(): ClassDecorator {
  return () => {};
}
export function Module(_opts?: any): ClassDecorator {
  return () => {};
}
export function Catch(..._exceptions: any[]): ClassDecorator {
  return () => {};
}

export function Controller(prefix?: string | string[]): ClassDecorator {
  return (target: any) => {
    const p = Array.isArray(prefix) ? prefix[0] : prefix ?? '';
    setMeta('path', p, target);
  };
}

function createMethodDecorator(methodNum: number) {
  return (path: string | string[] = ''): MethodDecorator => {
    return (_target: any, _key: string | symbol, descriptor: PropertyDescriptor) => {
      if (descriptor?.value) {
        setMeta('path', path, descriptor.value);
        setMeta('method', methodNum, descriptor.value);
      }
      return descriptor;
    };
  };
}

export const Get = createMethodDecorator(0);
export const Post = createMethodDecorator(1);
export const Put = createMethodDecorator(2);
export const Delete = createMethodDecorator(3);
export const Patch = createMethodDecorator(4);

export function HttpCode(code: number): MethodDecorator {
  return (_target: any, _key: string | symbol, descriptor: PropertyDescriptor) => {
    if (descriptor?.value) {
      setMeta('__httpCode__', code, descriptor.value);
    }
    return descriptor;
  };
}

export function SetMetadata<K = string, V = any>(metadataKey: K, metadataValue: V): any {
  const fn = (target: object, key?: any, descriptor?: any) => {
    if (descriptor) {
      setMeta(metadataKey as any, metadataValue, descriptor.value);
      return descriptor;
    }
    setMeta(metadataKey as any, metadataValue, target);
    return target;
  };
  fn.KEY = metadataKey;
  return fn;
}

function addRouteArg(target: object, key: string | symbol | undefined, paramType: string | number, index: number, data?: any, factory?: any) {
  const cls = typeof target === 'function' ? target : target.constructor;
  const existing = getMeta('__routeArguments__', cls, key) ?? {};
  existing[`${paramType}:${index}`] = { index, data, factory, pipes: [] };
  setMeta('__routeArguments__', existing, cls, key);
}

export function Req(): ParameterDecorator {
  return (target, key, index) => addRouteArg(target, key, 0, index);
}
export function Res(opts?: { passthrough?: boolean }): ParameterDecorator {
  return (target, key, index) => {
    const cls = typeof target === 'function' ? target : target.constructor;
    if (opts?.passthrough) setMeta('__responsePassthrough__', true, cls, key);
    addRouteArg(target, key, 1, index);
  };
}
export function Body(data?: string): ParameterDecorator {
  return (target, key, index) => addRouteArg(target, key, 3, index, data);
}
export function Query(data?: string): ParameterDecorator {
  return (target, key, index) => addRouteArg(target, key, 4, index, data);
}
export function Param(data?: string): ParameterDecorator {
  return (target, key, index) => addRouteArg(target, key, 5, index, data);
}
export function Headers(data?: string): ParameterDecorator {
  return (target, key, index) => addRouteArg(target, key, 6, index, data);
}
export function Ip(): ParameterDecorator {
  return (target, key, index) => addRouteArg(target, key, 7, index);
}

let customCounter = 0;
export function createParamDecorator(factory: (data: any, ctx: any) => any) {
  const uid = `custom_${++customCounter}__customRouteArgs__`;
  return (data?: any): ParameterDecorator => {
    return (target, key, index) => addRouteArg(target, key, uid, index, data, factory);
  };
}

export class Logger {
  constructor(private context = 'App') {}
  log(msg: any) {}
  warn(msg: any) {}
  error(msg: any, _trace?: any) {}
  debug(msg: any) {}
}

export class HttpException extends Error {
  constructor(private response: string | Record<string, any>, private status: number) {
    super(typeof response === 'string' ? response : JSON.stringify(response));
  }
  getStatus() {
    return this.status;
  }
  getResponse() {
    return this.response;
  }
}

export class Reflector {
  getAllAndOverride<T = any>(metadataKey: any, targets: any[]): T | undefined {
    for (const t of targets) {
      if (!t) continue;
      const v = getMeta(metadataKey, t);
      if (v !== undefined) return v;
    }
    return undefined;
  }
}

export const APP_FILTER = 'APP_FILTER';
export const APP_GUARD = 'APP_GUARD';
export const APP_INTERCEPTOR = 'APP_INTERCEPTOR';
export const NestFactory = { create: async () => ({}) };

export type CanActivate = any;
export type ExecutionContext = any;
export type ArgumentsHost = any;
export type ExceptionFilter = any;
export type CallHandler = any;
export type NestInterceptor = any;
export type OnModuleInit = any;
export type OnModuleDestroy = any;
export type OnApplicationBootstrap = any;

