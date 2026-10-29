import { useEffect, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { api, ApiError } from './api';
import { toast } from '@/ui/toast';

export function useDebounced<T>(v: T, ms = 300) {
  const [d, setD] = useState(v);
  useEffect(() => {
    const t = setTimeout(() => setD(v), ms);
    return () => clearTimeout(t);
  }, [v, ms]);
  return d;
}

export function useGet<T = any>(path: string | null, query?: Record<string, any>, opts: { refetchInterval?: number; enabled?: boolean; keepPrevious?: boolean; staleTime?: number } = {}) {
  const enabled = !!path && opts.enabled !== false;
  const q = useQuery<T, ApiError>({
    queryKey: [path, query],
    queryFn: ({ signal }) => api<T>(path!, { query, signal }),
    enabled,
    refetchInterval: opts.refetchInterval,
    placeholderData: opts.keepPrevious ? keepPreviousData : undefined,
    staleTime: opts.staleTime ?? 15_000,
  });
  // "Loading" means: wanted, and neither data nor an error yet. Plain isLoading is false for paused/idle queries, which made screens flash "empty".
  return { ...q, isLoading: enabled && q.isPending } as typeof q;
}

export function errMsg(e: unknown) {
  return e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Có lỗi xảy ra';
}

/** Mutation with toast feedback and cache invalidation by key prefix(es). */
export function useAct<TVars = any, TOut = any>(fn: (v: TVars) => Promise<TOut>, o: { ok?: string | ((r: TOut) => string); invalidate?: (string | RegExp)[]; onSuccess?: (r: TOut, v: TVars) => void; silentError?: boolean; onError?: (e: ApiError) => void } = {}) {
  const qc = useQueryClient();
  return useMutation<TOut, ApiError, TVars>({
    mutationFn: fn,
    onSuccess: (r, v) => {
      if (o.ok) toast.ok(typeof o.ok === 'function' ? o.ok(r) : o.ok);
      const pats = o.invalidate ?? [];
      qc.invalidateQueries({ predicate: (q: { queryKey: QueryKey }) => { const k = String(q.queryKey[0] ?? ''); return pats.length === 0 ? true : pats.some((p) => (typeof p === 'string' ? k.startsWith(p) : p.test(k))); } });
      o.onSuccess?.(r, v);
    },
    onError: (e) => { if (!o.silentError) toast.err(e.message); o.onError?.(e); },
  });
}
