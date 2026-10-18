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
