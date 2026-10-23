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
