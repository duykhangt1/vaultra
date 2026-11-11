import { Injectable } from '@nestjs/common';
import { PrismaService, Tx } from '../common/prisma.service';
import { AppError, forbidden, notFound, validation } from '../common/errors';
import { newId, sha256 } from '../common/util';
import { StorageService } from './storage.service';
import type { AccessContext } from '../auth/access-context';
import { Prisma } from '../generated/prisma/client';

type Purpose = Prisma.MediaFileCreateInput['purpose'];

const IMAGE = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'];
const PURPOSE_RULES: Record<string, { bucket: 'PUBLIC' | 'PRIVATE'; mimes: string[]; max: number }> = {
  FACILITY_PHOTO: { bucket: 'PUBLIC', mimes: IMAGE, max: 10 * 1048576 },
  UNIT_TYPE_PHOTO: { bucket: 'PUBLIC', mimes: IMAGE, max: 10 * 1048576 },
  UNIT_PHOTO: { bucket: 'PRIVATE', mimes: IMAGE, max: 10 * 1048576 },
  FLOOR_PLAN: { bucket: 'PRIVATE', mimes: [...IMAGE, 'image/svg+xml'], max: 10 * 1048576 },
  INSPECTION_PHOTO: { bucket: 'PRIVATE', mimes: IMAGE, max: 10 * 1048576 },
  TICKET_ATTACHMENT: { bucket: 'PRIVATE', mimes: [...IMAGE, 'application/pdf', 'video/mp4'], max: 10 * 1048576 },
  WORK_ORDER_PHOTO: { bucket: 'PRIVATE', mimes: IMAGE, max: 10 * 1048576 },
  OVERLOCK_PHOTO: { bucket: 'PRIVATE', mimes: IMAGE, max: 10 * 1048576 },
  ABANDONED_GOODS_PHOTO: { bucket: 'PRIVATE', mimes: IMAGE, max: 10 * 1048576 },
  COLLECTION_EVIDENCE: { bucket: 'PRIVATE', mimes: [...IMAGE, 'application/pdf'], max: 15 * 1048576 },
  AVATAR: { bucket: 'PUBLIC', mimes: IMAGE, max: 5 * 1048576 },
  SIGNATURE: { bucket: 'PRIVATE', mimes: ['image/png'], max: 2 * 1048576 },
};

/** Magic-byte sniffing (spec §18.4): reject files whose content does not match the declared type. */
function sniff(buf: Buffer): string | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.subarray(0, 4).toString() === 'RIFF' && buf.subarray(8, 12).toString() === 'WEBP') return 'image/webp';
  if (buf.subarray(4, 12).toString().startsWith('ftyphei') || buf.subarray(4, 12).toString().startsWith('ftypmif')) return 'image/heic';
  if (buf.subarray(4, 8).toString() === 'ftyp') return 'video/mp4';
  if (buf.subarray(0, 4).toString() === '%PDF') return 'application/pdf';
  if (buf.subarray(0, 200).toString().includes('<svg')) return 'image/svg+xml';
  return null;
}

const PURPOSE_ALIASES: Record<string, Purpose> = {
  FACILITY: 'FACILITY_PHOTO',
  UNIT_TYPE: 'UNIT_TYPE_PHOTO',
  UNIT: 'UNIT_PHOTO',
  INSPECTION: 'INSPECTION_PHOTO',
  PHOTO: 'INSPECTION_PHOTO',
  IDENTITY_PHOTO: 'INSPECTION_PHOTO',
  CCCD_PHOTO: 'INSPECTION_PHOTO',
  CCCD: 'INSPECTION_PHOTO',
  ID_DOCUMENT: 'INSPECTION_PHOTO',
  IDENTITY_VERIFICATION: 'INSPECTION_PHOTO',
  DAMAGE_PHOTO: 'INSPECTION_PHOTO',
  DAMAGE: 'INSPECTION_PHOTO',
  TICKET: 'TICKET_ATTACHMENT',
  TICKET_MESSAGE: 'TICKET_ATTACHMENT',
  SUPPORT_TICKET: 'TICKET_ATTACHMENT',
  WORK_ORDER: 'WORK_ORDER_PHOTO',
  TASK: 'WORK_ORDER_PHOTO',
  OVERLOCK: 'OVERLOCK_PHOTO',
  ABANDONED_GOODS: 'ABANDONED_GOODS_PHOTO',
  EVIDENCE: 'COLLECTION_EVIDENCE',
  COLLECTION: 'COLLECTION_EVIDENCE',
  COLLECTION_NOTE: 'COLLECTION_EVIDENCE',
};

@Injectable()
export class MediaService {
  constructor(private prisma: PrismaService, private storage: StorageService) {}

  async requestUpload(ctx: AccessContext, d: { purpose: string; relatedType?: string; relatedId?: string; mimeType: string; sizeBytes: number; sha256?: string; facilityId?: string; takenAt?: string; caption?: string }) {
    const rawPurpose = d.purpose.trim().toUpperCase();
    const purpose = (PURPOSE_RULES[rawPurpose] ? rawPurpose : PURPOSE_ALIASES[rawPurpose]) as Purpose | undefined;
    const rule = purpose ? PURPOSE_RULES[purpose] : undefined;
    if (!purpose || !rule) throw validation('Mục đích tải lên không hợp lệ');
    if (!rule.mimes.includes(d.mimeType)) throw validation(`Định dạng ${d.mimeType} không được phép`);
    // Public-bucket and floor-plan uploads are staff tools: a customer must not be able to host files on the company's public bucket.
    const STAFF_ONLY: Record<string, string[]> = {
      FACILITY_PHOTO: ['facility.manage'],
      UNIT_TYPE_PHOTO: ['unit_type.manage', 'unit.manage', 'facility.manage'],
      FLOOR_PLAN: ['facility.manage', 'unit.manage'],
      UNIT_PHOTO: ['unit.manage', 'unit_type.manage'],
    };
    if (STAFF_ONLY[purpose] && !STAFF_ONLY[purpose].some((p) => ctx.can(p, true))) throw forbidden('Bạn không có quyền tải loại tệp này');
    if (d.sizeBytes <= 0 || d.sizeBytes > rule.max) throw validation(`Tệp vượt quá ${Math.round(rule.max / 1048576)} MB`);
    let facilityId: bigint | null = null;
    if (d.facilityId) {
      const f = await this.prisma.facility.findUnique({ where: { public_id: d.facilityId } });
      facilityId = f?.id ?? null;
    }
    const id = newId();
    const ext = d.mimeType.split('/')[1].replace('svg+xml', 'svg').replace('jpeg', 'jpg');
    const key = `${rule.bucket.toLowerCase()}/${facilityId ? `facilities/${facilityId}/` : ''}${purpose.toLowerCase()}/${id}.${ext}`;
    const media = await this.prisma.mediaFile.create({
      data: {
        public_id: id,
        bucket: rule.bucket,
        object_key: key,
        purpose,
        related_type: d.relatedType ?? null,
        related_id: null,
        facility_id: facilityId,
        mime_type: d.mimeType,
        size_bytes: d.sizeBytes,
        sha256: d.sha256 ?? null,
        taken_at: d.takenAt ? new Date(d.takenAt) : null,
        uploaded_by: ctx.userId,
        caption: d.caption?.slice(0, 255),
        status: 'PENDING',
      },
    });
    const uploadUrl = await this.storage.presignPut(id, rule.bucket, key, d.mimeType);
    return { id: media.public_id, uploadUrl, method: 'PUT', headers: { 'Content-Type': d.mimeType }, expiresInSeconds: 600 };
  }

  async complete(ctx: AccessContext, publicId: string) {
    const m = await this.prisma.mediaFile.findUnique({ where: { public_id: publicId } });
    if (!m || m.uploaded_by !== ctx.userId) throw notFound('Tệp');
    if (m.status !== 'PENDING') return m;
    const head = await this.storage.head(m.bucket, m.object_key);
    if (!head) throw validation('Chưa nhận được tệp, vui lòng tải lại');
    const buf = await this.storage.read(m.bucket, m.object_key);
    const detected = buf ? sniff(buf) : null;
    if (!buf || detected !== m.mime_type || head.size > PURPOSE_RULES[m.purpose].max) {
      await this.prisma.mediaFile.update({ where: { id: m.id }, data: { status: 'REJECTED' } });
      await this.storage.remove(m.bucket, m.object_key).catch(() => undefined);
      throw validation('Nội dung tệp không khớp định dạng khai báo');
    }
    const hash = sha256(buf);
    if (m.sha256 && m.sha256 !== hash) throw validation('Mã băm SHA-256 không khớp');
    return this.prisma.mediaFile.update({ where: { id: m.id }, data: { status: 'READY', size_bytes: head.size, sha256: hash } });
  }

  /** Stores a server-generated file (PDF, signature, export) directly. */
  async storeServerFile(tx: Tx | PrismaService, d: { purpose: Purpose; buffer: Buffer; mime: string; ext: string; relatedType?: string; relatedId?: bigint; facilityId?: bigint | null; uploadedBy?: bigint | null; caption?: string; locked?: boolean }) {
    const id = newId();
    const bucket = d.purpose === 'FACILITY_PHOTO' || d.purpose === 'UNIT_TYPE_PHOTO' ? 'PUBLIC' : 'PRIVATE';
    const key = `${bucket.toLowerCase()}/${d.facilityId ? `facilities/${d.facilityId}/` : ''}${String(d.purpose).toLowerCase()}/${id}.${d.ext}`;
    await this.storage.put(bucket, key, d.buffer, d.mime);
    return tx.mediaFile.create({
      data: {
        public_id: id, bucket, object_key: key, purpose: d.purpose, related_type: d.relatedType ?? null, related_id: d.relatedId ?? null,
        facility_id: d.facilityId ?? null, mime_type: d.mime, size_bytes: d.buffer.length, sha256: sha256(d.buffer), status: 'READY',
        uploaded_by: d.uploadedBy ?? null, is_locked: d.locked ?? false, caption: d.caption,
      },
    });
  }

  /** Attach READY uploads (by public id) to an owner record; returns internal ids. */
  async attach(tx: Tx, ctx: AccessContext | null, publicIds: string[], relatedType: string, relatedId: bigint, facilityId?: bigint | null, lock = false) {
    if (!publicIds.length) return [];
    const files = await tx.mediaFile.findMany({ where: { public_id: { in: publicIds } } });
    if (files.length !== publicIds.length) throw validation('Có tệp đính kèm không tồn tại');
    for (const f of files) {
      if (f.status !== 'READY') throw validation('Tệp chưa tải lên xong');
      if (ctx && f.uploaded_by !== ctx.userId) throw validation('Tệp không thuộc về bạn');
      if (f.related_id && (f.related_type !== relatedType || f.related_id !== relatedId)) throw validation('Tệp đã được gắn vào bản ghi khác');
    }
    await tx.mediaFile.updateMany({ where: { id: { in: files.map((f) => f.id) } }, data: { related_type: relatedType, related_id: relatedId, facility_id: facilityId ?? undefined, is_locked: lock || undefined } });
    return files.map((f) => f.id);
  }

  /**
   * Makes the READY photos of one owner record equal to `orderedIds` (public ids, in display order): new uploads are
   * attached, photos that are no longer listed are deleted from storage, the rest keep their place. Returns the rows in order.
   */
  async syncOwnerFiles(tx: Tx, ctx: AccessContext, relatedType: string, relatedId: bigint, facilityId: bigint | null, orderedIds: string[]) {
    const current = await tx.mediaFile.findMany({ where: { related_type: relatedType, related_id: relatedId, status: 'READY' } });
    const keep = new Set(orderedIds);
    const removed = current.filter((m) => !keep.has(m.public_id));
    const fresh = orderedIds.filter((id) => !current.some((m) => m.public_id === id));
    if (fresh.length) await this.attach(tx, ctx, fresh, relatedType, relatedId, facilityId);
    if (removed.length) {
      await tx.mediaFile.updateMany({ where: { id: { in: removed.map((m) => m.id) } }, data: { status: 'DELETED' } });
      for (const m of removed) await this.storage.remove(m.bucket, m.object_key).catch(() => undefined);
    }
    const rows = await tx.mediaFile.findMany({ where: { public_id: { in: orderedIds }, status: 'READY' } });
    const ordered = orderedIds.map((id) => rows.find((r) => r.public_id === id)).filter((r): r is NonNullable<typeof r> => !!r);
    for (const [i, r] of ordered.entries()) await tx.mediaFile.update({ where: { id: r.id }, data: { sort_order: i } });
    return ordered;
  }

  async urlFor(m: { public_id: string; bucket: 'PUBLIC' | 'PRIVATE'; object_key: string; mime_type: string }, filename?: string) {
    return this.storage.presignGet(m.public_id, m.bucket, m.object_key, filename);
  }

  async exists(m: { bucket: 'PUBLIC' | 'PRIVATE'; object_key: string }): Promise<boolean> {
    const h = await this.storage.head(m.bucket, m.object_key);
    return !!h && h.size > 0;
  }

  async putRaw(bucket: 'PUBLIC' | 'PRIVATE', key: string, buf: Buffer, mime: string) {
    await this.storage.put(bucket, key, buf, mime);
  }

  async listFor(relatedType: string, relatedIds: bigint[]) {
    if (!relatedIds.length) return [];
    const rows = await this.prisma.mediaFile.findMany({ where: { related_type: relatedType, related_id: { in: relatedIds }, status: 'READY' }, orderBy: [{ sort_order: 'asc' }, { id: 'asc' }] });
    return Promise.all(rows.map(async (r) => ({ ...r, url: await this.urlFor(r) })));
  }

  async remove(ctx: AccessContext, publicId: string) {
    const m = await this.prisma.mediaFile.findUnique({ where: { public_id: publicId } });
    if (!m) throw notFound('Tệp');
    const isFm = m.facility_id ? ctx.facilitiesFor('unit.manage').includes(m.facility_id) : false;
    if (m.uploaded_by !== ctx.userId && !isFm) throw notFound('Tệp');
    if (m.is_locked) throw new AppError('CONFLICT', 'Tệp đã gắn vào biên bản đã ký, không thể xóa (chỉ bổ sung)');
    await this.prisma.mediaFile.update({ where: { id: m.id }, data: { status: 'DELETED' } });
    await this.storage.remove(m.bucket, m.object_key).catch(() => undefined);
    return { message: 'Đã xóa tệp' };
  }
}
