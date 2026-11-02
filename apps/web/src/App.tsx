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
const Public = lazy(loadPublic);
const Customer = lazy(() => import('@/pages/app/routes'));
const Staff = lazy(() => import('@/pages/staff/routes'));
const Manage = lazy(() => import('@/pages/manage/routes'));
const Ops = lazy(() => import('@/pages/ops/routes'));
const Admin = lazy(() => import('@/pages/admin/routes'));

function Guard({ workspace }: { workspace: string }) {
  const { status, roles } = useAuth();
  const loc = useLocation();
  if (status === 'loading') return <ShellSkeleton />;
  if (status === 'anon') return <Navigate to={`/login?returnTo=${encodeURIComponent(loc.pathname + loc.search)}`} replace />;
  if (!allowedWorkspaces(roles).includes(workspace)) return <Navigate to={topWorkspace(roles)} replace />;
  return <Outlet />;
}

export function App() {
  useRealtime();
  const bootstrap = useAuth((s) => s.bootstrap);
  useEffect(() => { void bootstrap(); }, [bootstrap]);
  const { pathname } = useLocation();
  const internal = /^\/(staff|manage|ops|admin)/.test(pathname);
  return (
    <>
      <DomTranslator />
      <ScrollManager />
      {INTRO && <Suspense fallback={<div className="fixed inset-0 z-[100]" style={{ background: "#7a6e64" }} aria-hidden />}><SignatureLoader waitFor={loadPublic} /></Suspense>}
      <Suspense fallback={internal || /^\/app(\/|$)/.test(pathname) ? <ShellSkeleton /> : <PageLoader />}>
        <Routes>
          <Route element={<Guard workspace="/app" />}><Route path="/app/*" element={<Customer />} /></Route>
          <Route element={<Guard workspace="/staff" />}><Route path="/staff/*" element={<Staff />} /></Route>
          <Route element={<Guard workspace="/manage" />}><Route path="/manage/*" element={<Manage />} /></Route>
          <Route element={<Guard workspace="/ops" />}><Route path="/ops/*" element={<Ops />} /></Route>
          <Route element={<Guard workspace="/admin" />}><Route path="/admin/*" element={<Admin />} /></Route>
          <Route path="/*" element={<Public />} />
        </Routes>
      </Suspense>
      {pathname === '/' && <AssistantWidget />}
      <Toaster />
    </>
  );
}
