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


interface PendingCorridorRowsBucketItem {
  readonly scopeKey: string;
  readonly valueVnd: number;
}

function groupPendingCorridorRowsByScope(items: readonly PendingCorridorRowsBucketItem[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const entry of items) {
    const key = entry.scopeKey.trim() || 'flow4';
    totals[key] = (totals[key] ?? 0) + (Number.isFinite(entry.valueVnd) ? entry.valueVnd : 0);
  }
  return totals;
}
const AMENITY_ICON: Record<string, any> = { camera_24_7: Camera, bao_ve: ShieldCheck, thang_may: ArrowUpDown, dieu_hoa: Thermometer, bai_do_xe: Truck, xe_day: Package, cua_lon: Truck };
