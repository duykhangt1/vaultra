import { create } from 'zustand';
import { api, post, setAccessToken, setActiveFacilityHeader, refreshSession, onSessionExpired, setStoredRt, wasSessionRejected, ApiError } from './api';
import { WORKSPACE_OF } from './format';

export type Facility = { id: string; code: string; name: string; roles: string[] };
export type Me = { id: string; email: string; fullName: string; phone: string | null; locale: string; emailVerified: boolean; hasPassword: boolean; customerId: string | null };
type Grant = { scope: 'OWN' | 'FACILITY' | 'GLOBAL'; readOnly?: boolean };
type Session = { user: Me; roles: string[]; permissions: Record<string, Grant>; facilities: Facility[]; workspace: string };

interface AuthState extends Partial<Session> {
  status: 'loading' | 'anon' | 'authed';
  activeFacilityId: string | null;
  bootstrap: () => Promise<void>;
  login: (email: string, password: string) => Promise<Session>;
  applySession: (s: Session & { accessToken?: string }) => void;
  logout: () => Promise<void>;
  setFacility: (id: string | null) => void;
  can: (code: string, write?: boolean) => boolean;
  hasRole: (r: string) => boolean;
  reload: () => Promise<void>;
}

const FKEY = 'vaultra.facility';

export const useAuth = create<AuthState>((set, get) => ({
  status: 'loading',
  activeFacilityId: null,
  can: (code, write = false) => {
    const g = get().permissions?.[code];
    return !!g && (!write || !g.readOnly);
  },
  hasRole: (r) => !!get().roles?.includes(r),
  applySession: (s) => {
    if (s.accessToken) setAccessToken(s.accessToken);
    const saved = localStorage.getItem(FKEY);
    const fac = s.facilities ?? [];
    const active = fac.find((f) => f.id === saved)?.id ?? fac[0]?.id ?? null;
    setActiveFacilityHeader(active);
    set({ status: 'authed', user: s.user, roles: s.roles, permissions: s.permissions, facilities: fac, workspace: s.workspace, activeFacilityId: active });
  },
  bootstrap: async () => {
    // Only a definite 401/403 means "signed out". A slow or unreachable server must not throw the user to /login: retry first.
    for (let attempt = 0; attempt < 4; attempt++) {
      const t = await refreshSession();
      if (!t) {
        if (wasSessionRejected()) return set({ status: 'anon' });
        await new Promise((res) => setTimeout(res, 1200 * (attempt + 1)));
        continue;
      }
      try {
        const s = await api<Session>('/me/permissions');
        get().applySession(s);
        return;
      } catch (e) {
        if (e instanceof ApiError && (e.status === 401 || e.status === 403)) return set({ status: 'anon' });
        await new Promise((res) => setTimeout(res, 1200 * (attempt + 1)));
      }
    }
    set({ status: 'anon' });
  },
  reload: async () => {
    const s = await api<Session>('/me/permissions');
    get().applySession(s);
  },
  login: async (email, password) => {
    const s = await post('/auth/login', { email, password });
    get().applySession(s);
    return s;
  },
  logout: async () => {
    // Sign out on screen at once; the server revokes the refresh token in the background (a slow server must not block or undo the logout).
    const done = post('/auth/logout').catch(() => undefined);
    await Promise.race([done, new Promise((res) => setTimeout(res, 2500))]);
    setStoredRt(null);
    setAccessToken(null);
    setActiveFacilityHeader(null);
    set({ status: 'anon', user: undefined, roles: undefined, permissions: undefined, facilities: undefined });
  },
  setFacility: (id) => {
    if (id) localStorage.setItem(FKEY, id); else localStorage.removeItem(FKEY);
    setActiveFacilityHeader(id);
    set({ activeFacilityId: id });
    window.dispatchEvent(new CustomEvent('vaultra:facility', { detail: id }));
  },
}));

onSessionExpired(() => {
  if (useAuth.getState().status === 'authed') {
    setAccessToken(null);
    useAuth.setState({ status: 'anon' });
  }
});
window.addEventListener('vaultra:session', ((e: CustomEvent) => {
  const st = useAuth.getState();
  if (st.status === 'authed') setAccessToken(e.detail.accessToken);
}) as EventListener);

export const topWorkspace = (roles?: string[]) => {
  const order = ['SYSTEM_ADMIN', 'BUSINESS_OPS_MANAGER', 'FACILITY_MANAGER', 'FACILITY_STAFF', 'CUSTOMER'];
  const top = order.find((r) => roles?.includes(r)) ?? 'CUSTOMER';
  return WORKSPACE_OF[top];
};
export const allowedWorkspaces = (roles?: string[]) => (roles ?? []).map((r) => WORKSPACE_OF[r]).filter(Boolean);
