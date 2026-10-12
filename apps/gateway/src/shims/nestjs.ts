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
