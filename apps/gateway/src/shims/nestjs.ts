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
