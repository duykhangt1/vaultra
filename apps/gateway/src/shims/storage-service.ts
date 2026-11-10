import { Injectable } from './nestjs';
import { config } from './config';
import { hmac, safeEqual } from '../../../api/src/common/util';

type Bucket = 'PUBLIC' | 'PRIVATE';
type R2Like = {
  put(key: string, value: ArrayBuffer | Uint8Array, opts?: unknown): Promise<unknown>;
  get(key: string): Promise<{ arrayBuffer(): Promise<ArrayBuffer>; size?: number; httpMetadata?: { contentType?: string } } | null>;
  head?(key: string): Promise<{ size: number; httpMetadata?: { contentType?: string } } | null>;
  delete?(key: string): Promise<unknown>;
};

/**
 * Worker flavour of api/src/media/storage.service.ts (same method names, same signed-URL scheme so MediaService and the
 * /media/:id/blob routes work unchanged). Objects live in the R2 binding when present (index.ts publishes it as globalThis.__R2),
 * with an in-isolate Map as fallback.
 */
@Injectable()
export class StorageService {
  private mem = new Map<string, { bytes: Buffer; mime: string }>();
  private r2(): R2Like | undefined {
    return (globalThis as unknown as { __R2?: R2Like }).__R2;
  }
  private id(bucket: Bucket, key: string) {
    return bucket === 'PUBLIC' ? key : key; // keys are already prefixed public/… or private/…, so r2.dev URLs resolve directly
  }

  sign(op: 'put' | 'get', key: string, exp: number, extra = '') {
    return hmac(config.serviceTokenSecret + ':media', `${op}:${key}:${exp}:${extra}`);
  }
  verify(op: 'put' | 'get', key: string, exp: number, sig: string, extra = '') {
    return exp > Date.now() / 1000 && safeEqual(sig, this.sign(op, key, exp, extra));
  }

  async presignPut(mediaPublicId: string, _bucket: Bucket, key: string, contentType: string, ttlSec = 600) {
    const exp = Math.floor(Date.now() / 1000) + ttlSec;
    return `${config.apiPublicUrl}/v1/media/${mediaPublicId}/blob?exp=${exp}&sig=${this.sign('put', key, exp, contentType)}`;
  }

  async presignGet(mediaPublicId: string, bucket: Bucket, key: string, _filename?: string, ttlSec = 300) {
    if (bucket === 'PUBLIC' && config.storage.r2PublicBaseUrl) return `${config.storage.r2PublicBaseUrl.replace(/\/$/, '')}/${key}`;
    const ttl = bucket === 'PUBLIC' ? 86400 * 365 : Math.max(ttlSec, 3600);
    const exp = Math.ceil((Date.now() / 1000 + ttl) / 1800) * 1800;
    return `${config.apiPublicUrl}/v1/media/${mediaPublicId}/blob?exp=${exp}&sig=${this.sign('get', key, exp)}`;
  }

  async put(bucket: Bucket, key: string, body: Buffer, contentType: string) {
    const r2 = this.r2();
    if (r2) await r2.put(this.id(bucket, key), new Uint8Array(body), { httpMetadata: { contentType } });
    else this.mem.set(this.id(bucket, key), { bytes: body, mime: contentType });
  }

  async head(bucket: Bucket, key: string): Promise<{ size: number; contentType?: string } | null> {
    const r2 = this.r2();
    if (r2) {
      const o = r2.head ? await r2.head(this.id(bucket, key)) : await r2.get(this.id(bucket, key));
      return o ? { size: Number(o.size ?? 0), contentType: o.httpMetadata?.contentType } : null;
    }
    const m = this.mem.get(this.id(bucket, key));
    return m ? { size: m.bytes.length, contentType: m.mime } : null;
  }

  async read(bucket: Bucket, key: string): Promise<Buffer | null> {
    const r2 = this.r2();
    if (r2) {
      const o = await r2.get(this.id(bucket, key));
      return o ? Buffer.from(await o.arrayBuffer()) : null;
    }
    return this.mem.get(this.id(bucket, key))?.bytes ?? null;
  }

  async remove(bucket: Bucket, key: string) {
    const r2 = this.r2();
    if (r2?.delete) await r2.delete(this.id(bucket, key));
    this.mem.delete(this.id(bucket, key));
  }
}
