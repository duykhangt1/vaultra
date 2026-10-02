import { lazy, Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, KeyRound, Camera, Thermometer, Truck, Smartphone, ShieldCheck, CalendarCheck, Boxes, RefreshCw, MapPin, Check, Plus, Minus, Building2, GraduationCap, Home as HomeIcon, Car, ArrowDown } from 'lucide-react';
import { useGet } from '@/lib/hooks';
import { vnd, addDaysYmd, ymd, normalizeProvinceList } from '@/lib/format';
import { FILM, SCENES, STEP_IMAGES, SIZE_GUIDE, facilityCover, facilityDefaultCover, unitImageBySize, sm } from '@/lib/media';
import { Button, cn } from '@/ui';
import { Container, Plate, CropFrame, DimLine, Marquee, MediaImg, Eyebrow, dims } from '@/ui/brand';
import { Scene } from '@/cinema/Atmosphere';
import { CinemaVideo } from '@/cinema/CinemaVideo';
import { CountUp, Headline, Magnetic, useChoreography, usePointerDepth } from '@/cinema/kit';
import { afterIntro, gsap, lowPower, prefersReduced, scheduleRefresh, ScrollTrigger, useScene } from '@/cinema/motion';
import { MQ } from '@/cinema/tokens';
import { AMENITY_LABEL } from '@/lib/format';
import { PublicFloorPlanExplorer } from '@/widgets/FloorPlanView';

const Blueprint3D = lazy(() => import('@/cinema/Blueprint3D'));
const WIDE = MQ.wide;
const MOTION_OK = MQ.any;
