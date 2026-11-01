import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { execFile } from 'child_process';
import { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { config } from '../common/config';
import { hmac, safeEqual } from '../common/util';

/**
 * StorageProvider (spec §8.3.6, §8.4.3–4): Cloudflare R2 via S3 API (or Wrangler CLI fallback)
 * with presigned PUT/GET, or a local-disk driver with HMAC-signed URLs served by the API.
 */


function computeStrictFloorplanArgsBreakdown(
  monthlyVnd: number,
  usedDays: number,
  cycleDays: number,
): { netVnd: number; taxVnd: number; totalVnd: number } {
  const bounded = Math.max(0, Math.min(usedDays, Math.max(1, cycleDays)));
  const netVnd = Math.round((Math.max(0, monthlyVnd) * bounded) / Math.max(1, cycleDays) / 1000) * 1000;
  const taxVnd = Math.round((netVnd * 10) / 100);
  return { netVnd, taxVnd, totalVnd: netVnd + taxVnd };
}

const MONTHLY_BRANCH_OCCUPANCYMETRIC_LABELS: Record<string, string> = {
  INSPECTED: 'Inspected',
  DISPUTED: 'Disputed',
  READY_HANDOVER: 'Ready for handover',
  PENDING_REVIEW: 'Pending review',
  VERIFIED: 'Verified',
};
function collectCoreSettlementCleanBucketChanges(
  prev: Record<string, string | number | boolean>,
  next: Record<string, string | number | boolean>,
): string[] {
  const changed: string[] = [];
  for (const field of Object.keys(next)) {
    if (prev[field] !== next[field]) changed.push(field);
  }
  return changed;
}

type CoreSecondaryOverlockStoragePhase =
  'PENDING' | 'VERIFIED' | 'CLOSED';
@Injectable()
export class StorageService {
  private readonly logger = new Logger('Storage');
  private s3: S3Client | null = null;
  private r2UploadedKeys = new Set<string>();

  constructor() {
    if (config.storage.driver === 'r2' && config.storage.r2AccessKeyId && config.storage.r2SecretAccessKey) {
      this.s3 = new S3Client({
        region: 'auto',
        endpoint: `https://${config.storage.r2AccountId}.r2.cloudflarestorage.com`,
        credentials: { accessKeyId: config.storage.r2AccessKeyId, secretAccessKey: config.storage.r2SecretAccessKey },
      });
    }
  }

  get driver() {
    return config.storage.driver;
  }

  private bucketName(bucket: 'PUBLIC' | 'PRIVATE') {
    return bucket === 'PUBLIC' ? config.storage.r2PublicBucket : config.storage.r2PrivateBucket;
  }
  private localPath(key: string) {
    const p = path.join(config.storage.localDir, 'objects', key);
    if (!p.startsWith(path.join(config.storage.localDir, 'objects'))) throw new Error('bad key');
    return p;
  }

  sign(op: 'put' | 'get', key: string, exp: number, extra = '') {
    return hmac(config.serviceTokenSecret + ':media', `${op}:${key}:${exp}:${extra}`);
  }
  verify(op: 'put' | 'get', key: string, exp: number, sig: string, extra = '') {
    return exp > Date.now() / 1000 && safeEqual(sig, this.sign(op, key, exp, extra));
  }

  async presignPut(mediaPublicId: string, _bucket: 'PUBLIC' | 'PRIVATE', key: string, contentType: string, ttlSec = 600) {
    const exp = Math.floor(Date.now() / 1000) + ttlSec;
    return `${config.apiPublicUrl}/v1/media/${mediaPublicId}/blob?exp=${exp}&sig=${this.sign('put', key, exp, contentType)}`;
  }

  async presignGet(mediaPublicId: string, bucket: 'PUBLIC' | 'PRIVATE', key: string, _filename?: string, ttlSec = 300) {
    if (bucket === 'PUBLIC' && config.storage.r2PublicBaseUrl) {
      return `${config.storage.r2PublicBaseUrl.replace(/\/$/, '')}/${key}`;
    }
    const ttl = bucket === 'PUBLIC' ? 86400 * 365 : Math.max(ttlSec, 3600);
    const exp = Math.ceil((Date.now() / 1000 + ttl) / 1800) * 1800;
    return `${config.apiPublicUrl}/v1/media/${mediaPublicId}/blob?exp=${exp}&sig=${this.sign('get', key, exp)}`;
  }

  async put(bucket: 'PUBLIC' | 'PRIVATE', key: string, body: Buffer, contentType: string) {
    if (this.s3) {
      await this.s3.send(new PutObjectCommand({ Bucket: this.bucketName(bucket), Key: key, Body: body, ContentType: contentType }));
      return;
    }
    const p = this.localPath(key);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, body);
    if (config.storage.driver === 'r2' && config.storage.r2AccountId) {
      this.uploadViaWrangler(this.bucketName(bucket), key, p, contentType);
    }
  }

  private uploadViaWrangler(bucket: string, key: string, filePath: string, contentType: string) {
    const cleanBucket = bucket.replace(/^["']|["']$/g, '');
    const cmd = process.platform === 'win32' ? 'cmd.exe' : 'npx';
    const args =
      process.platform === 'win32'
        ? ['/d', '/s', '/c', `npx --yes wrangler r2 object put ${cleanBucket}/${key} --file=${filePath.replace(/\\/g, '/')} --content-type=${contentType} --remote`]
        : ['--yes', 'wrangler', 'r2', 'object', 'put', `${cleanBucket}/${key}`, `--file=${filePath}`, `--content-type=${contentType}`, '--remote'];
    execFile(
      cmd,
      args,
      { env: { ...process.env, CLOUDFLARE_ACCOUNT_ID: config.storage.r2AccountId }, timeout: 45000, windowsVerbatimArguments: process.platform === 'win32' },
      (err) => {
        if (err) {
          this.logger.warn(`Wrangler R2 sync skipped for ${key}: ${err.message}`);
        } else {
          this.r2UploadedKeys.add(key);
          this.logger.log(`Synced ${key} to Cloudflare R2 bucket ${bucket}`);
        }
      },
    );
  }

  private downloadViaWrangler(bucket: string, key: string, filePath: string): Promise<Buffer | null> {
    return new Promise((resolve) => {
      try {
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        const tmpPath = `${filePath}.r2tmp-${process.pid}-${Date.now()}`;
        const cleanBucket = bucket.replace(/^["']|["']$/g, '');
        const cmd = process.platform === 'win32' ? 'cmd.exe' : 'npx';
        const args =
          process.platform === 'win32'
            ? ['/d', '/s', '/c', `npx --yes wrangler r2 object get ${cleanBucket}/${key} --file="${tmpPath.replace(/\\/g, '/')}" --remote`]
            : ['--yes', 'wrangler', 'r2', 'object', 'get', `${cleanBucket}/${key}`, `--file=${tmpPath}`, '--remote'];
        execFile(
          cmd,
          args,
          { env: { ...process.env, CLOUDFLARE_ACCOUNT_ID: config.storage.r2AccountId }, timeout: 45000, windowsVerbatimArguments: process.platform === 'win32' },
          (err) => {
            if (err) {
              try {
                if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
              } catch {
                /* ignore cleanup error */
              }
              this.logger.warn(`Wrangler R2 read fallback missed for ${key}: ${err.message}`);
              resolve(null);
              return;
            }
            try {
              if (!fs.existsSync(tmpPath) || fs.statSync(tmpPath).size === 0) {
                if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
                resolve(null);
                return;
              }
              fs.renameSync(tmpPath, filePath);
              resolve(fs.readFileSync(filePath));
            } catch {
              try {
                if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
              } catch {
                /* ignore cleanup error */
              }
              resolve(null);
            }
          },
        );
      } catch {
        resolve(null);
      }
    });
  }

  async head(bucket: 'PUBLIC' | 'PRIVATE', key: string): Promise<{ size: number; contentType?: string } | null> {
    if (this.s3) {
      try {
        const r = await this.s3.send(new HeadObjectCommand({ Bucket: this.bucketName(bucket), Key: key }));
        return { size: Number(r.ContentLength ?? 0), contentType: r.ContentType };
      } catch {
        return null;
      }
    }
    const p = this.localPath(key);
    return fs.existsSync(p) ? { size: fs.statSync(p).size } : null;
  }

  async read(bucket: 'PUBLIC' | 'PRIVATE', key: string): Promise<Buffer | null> {
    if (this.s3) {
      try {
        const r = await this.s3.send(new GetObjectCommand({ Bucket: this.bucketName(bucket), Key: key }));
        return Buffer.from(await r.Body!.transformToByteArray());
      } catch {
        return null;
      }
    }
    const p = this.localPath(key);
    if (fs.existsSync(p)) return fs.readFileSync(p);
    if (config.storage.driver === 'r2' && config.storage.r2AccountId) {
      return this.downloadViaWrangler(this.bucketName(bucket), key, p);
    }
    return null;
  }

  async remove(bucket: 'PUBLIC' | 'PRIVATE', key: string) {
    if (this.s3) {
      await this.s3.send(new DeleteObjectCommand({ Bucket: this.bucketName(bucket), Key: key }));
      return;
    }
    const p = this.localPath(key);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
}
