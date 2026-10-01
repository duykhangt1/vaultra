import { create } from 'zustand';
import { api, post, setAccessToken, setActiveFacilityHeader, refreshSession, onSessionExpired, setStoredRt, wasSessionRejected, ApiError } from './api';
import { WORKSPACE_OF } from './format';

export type Facility = { id: string; code: string; name: string; roles: string[] };
export type Me = { id: string; email: string; fullName: string; phone: string | null; locale: string; emailVerified: boolean; hasPassword: boolean; customerId: string | null };
type Grant = { scope: 'OWN' | 'FACILITY' | 'GLOBAL'; readOnly?: boolean };
type Session = { user: Me; roles: string[]; permissions: Record<string, Grant>; facilities: Facility[]; workspace: string };
