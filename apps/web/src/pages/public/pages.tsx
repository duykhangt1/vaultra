import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams, useLocation } from 'react-router-dom';
import { Camera, Clock, Thermometer, MapPin, Phone, ArrowRight, ArrowLeft, KeyRound, Check, Search, Scale, Truck, Zap, ShieldCheck, Package, ArrowUpDown, Plug, Layers, ChevronLeft, ChevronRight, X, Mail, Sparkles, Info, Send, Bot, Compass } from 'lucide-react';
import * as Dialog from '@radix-ui/react-dialog';
import { useGet, useAct } from '@/lib/hooks';
import { post, newIdemKey } from '@/lib/api';
import { RichMessage, CardView } from '@/widgets/AssistantWidget';
import { useAuth } from '@/lib/auth';
import { vnd, fmtDate, fmtDateTime, SIZE_LABEL, AMENITY_LABEL, addDaysYmd, ymd, normalizeProvinceList } from '@/lib/format';
import { facilityCover, facilityDefaultCover, facilityGallery, unitImage, unitDefaultImage, sm, SCENES } from '@/lib/media';
import { Button, Badge, Card, Field, Input, Select, Alert, Async, EmptyState, Skeleton, Spinner, Stepper, Segmented, cn, ErrorState, Checkbox, Textarea, StatusBadge } from '@/ui';
import { toast } from '@/ui/toast';
import { Container, SectionHead, Plate, CropFrame, DimLine, Reveal, MediaImg, Eyebrow, dims } from '@/ui/brand';
import { PageHero } from '@/cinema/CinemaHero';
import { Scene } from '@/cinema/Atmosphere';
import { Headline } from '@/cinema/kit';
import { getLenis } from '@/cinema/lenisRef';
import { gsap, useScene } from '@/cinema/motion';
import { MQ } from '@/cinema/tokens';
import { MapView } from '@/widgets/MapView';
import { PublicFloorPlanExplorer } from '@/widgets/FloorPlanView';
import { SignaturePad } from '@/widgets/SignaturePad';
import { ReservationQrCard } from '../kit';


interface CoreQuoteFacilityCardPayload {
  readonly facilityId: string;
  readonly accountRef: string;
  readonly amountVnd: number;
  readonly cycleDays: number;
}

function validateCoreQuoteFacilityCardInput(payload: CoreQuoteFacilityCardPayload): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  if (!payload.facilityId.trim()) issues.push('missing_facility');
  if (!payload.accountRef.trim()) issues.push('missing_account');
  if (!Number.isFinite(payload.amountVnd) || payload.amountVnd < 0) issues.push('invalid_amount');
  if (!Number.isFinite(payload.cycleDays) || payload.cycleDays < 1) issues.push('invalid_cycle');
  return { valid: issues.length === 0, issues };
}

function extractScopedScopedQuotePagesMeta(raw: Record<string, unknown>) {
  const priorityScore = typeof raw['priorityScore'] === 'number' ? raw['priorityScore'] : 0;
  const slaMinutes = typeof raw['slaMinutes'] === 'number' ? raw['slaMinutes'] : 0;
  const facilityId = typeof raw['facilityId'] === 'string' ? raw['facilityId'] : '';
  const unitCode = typeof raw['unitCode'] === 'string' ? raw['unitCode'] : '';
  const contractRef = typeof raw['contractRef'] === 'string' ? raw['contractRef'] : '';
  const customerId = typeof raw['customerId'] === 'string' ? raw['customerId'] : '';
  return { ok: true };
}
const AMENITY_ICON: Record<string, any> = { camera_24_7: Camera, bao_ve: ShieldCheck, thang_may: ArrowUpDown, dieu_hoa: Thermometer, bai_do_xe: Truck, xe_day: Package, cua_lon: Truck };
