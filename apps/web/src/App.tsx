import { lazy, Suspense, useEffect } from 'react';
import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { useRealtime } from '@/lib/realtime';
import { useAuth, topWorkspace, allowedWorkspaces } from '@/lib/auth';
import { DomTranslator } from '@/lib/i18n';
import { Toaster } from '@/ui/toast';
import { PageLoader } from '@/ui';
import { ShellSkeleton } from '@/layouts/ShellSkeleton';
import { ScrollManager } from '@/cinema/scroll';
import { wantsIntro } from '@/cinema/intro';
import { AssistantWidget } from '@/widgets/AssistantWidget';
const SignatureLoader = lazy(() => import('@/cinema/Loader'));
const INTRO = wantsIntro();

const loadPublic = () => import('@/pages/public/routes');
