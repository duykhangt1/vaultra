import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { Menu, X, Phone, Mail, MapPin, ArrowRight, Clock, Globe } from 'lucide-react';
import { AtmosphereLayer, useAtmos, usePageEnv, Scene } from '@/cinema/Atmosphere';
import { RouteCurtain } from '@/cinema/Transition';
import { SmoothScroll } from '@/cinema/smooth';
import { Headline, Magnetic } from '@/cinema/kit';
import { ENV } from '@/cinema/tokens';
import { Logo } from '@/layouts/Logo';
import { useAuth, topWorkspace } from '@/lib/auth';
import { useI18n, tr } from '@/lib/i18n';
import { useGet } from '@/lib/hooks';
import { Button, cn } from '@/ui';
import { Container } from '@/ui/brand';

export const LINKS: [string, string][] = [['/locations', 'Cơ sở'], ['/size-guide', 'Chọn kích thước'], ['/business', 'Doanh nghiệp'], ['/pricing-policy', 'Bảng giá & chính sách'], ['/about', 'Về Vaultra']];
/** Compact labels for the desktop bar (the full names stay on the mobile menu and the page transition). */
const SHORT: Record<string, string> = { '/size-guide': 'Kích thước', '/pricing-policy': 'Bảng giá' };
/** Pages without a dark media hero get a solid header and top padding. */
const SOLID = /^\/(login|register|verify-email|forgot-password|reset-password|accept-invite|link-google|book|payment|sign-contract)/;
