import { useEffect, useState } from 'react';
import { get, patch, post, put } from '@/lib/api';
import { normalizeProvinceInfo } from '@/lib/format';
import { useAct } from '@/lib/hooks';
import { Button, Drawer, Field, Input, Textarea, Skeleton } from '@/ui';
import { toast } from '@/ui/toast';
import { LocationPicker, type PickedPlace } from '@/widgets/LocationPicker';
import { PhotoUpload, type Photo } from '@/widgets/PhotoUpload';
import { WeekHours, hoursError, type Hours } from '@/widgets/WeekHours';

export const slugify = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const DEFAULT_OFFICE: Hours = Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat'].map((d) => [d, ['08:00', '18:00']])) as Hours;
const DEFAULT_ACCESS: Hours = Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((d) => [d, ['06:00', '22:00']])) as Hours;

type Form = { code: string; name: string; addressLine: string; ward: string; district: string; province: string; latitude: number | null; longitude: number | null; phone: string; hotline: string; email: string; description: string; amenities: string; officeHours: Hours; accessHours: Hours; photos: Photo[] };

const blank = (): Form => ({ code: '', name: '', addressLine: '', ward: '', district: '', province: '', latitude: null, longitude: null, phone: '', hotline: '', email: '', description: '', amenities: '', officeHours: DEFAULT_OFFICE, accessHours: DEFAULT_ACCESS, photos: [] });

const fromFacility = (f: any): Form => ({
  code: f.code, name: f.name, addressLine: f.address_line ?? '', ward: f.ward ?? '', district: f.district ?? '', province: f.province ?? '',
  latitude: f.latitude == null ? null : Number(f.latitude), longitude: f.longitude == null ? null : Number(f.longitude),
  phone: f.phone ?? '', hotline: f.hotline ?? '', email: f.email ?? '', description: f.description ?? '', amenities: Array.isArray(f.amenities) ? f.amenities.join(', ') : '',
  officeHours: (f.office_hours && typeof f.office_hours === 'object' ? f.office_hours : {}) as Hours, accessHours: (f.access_hours && typeof f.access_hours === 'object' ? f.access_hours : {}) as Hours,
  photos: (f.photos ?? []).map((p: any) => ({ id: p.id ?? p.public_id, name: p.original_name ?? 'Ảnh cơ sở', url: p.url })),
});
