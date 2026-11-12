import { create } from 'zustand';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';
import { tr, useI18n } from '@/lib/i18n';

type T = { id: number; kind: 'ok' | 'err' | 'info'; text: string };
const useToasts = create<{ items: T[]; push: (k: T['kind'], t: string) => void; drop: (id: number) => void }>((set) => ({
  items: [],
  push: (kind, text) => {
    const id = Date.now() + Math.random();
    set((s) => ({ items: [...s.items.slice(-3), { id, kind, text }] }));
    setTimeout(() => set((s) => ({ items: s.items.filter((x) => x.id !== id) })), kind === 'err' ? 7000 : 4000);
  },
  drop: (id) => set((s) => ({ items: s.items.filter((x) => x.id !== id) })),
}));
export const toast = {
  ok: (t: string) => useToasts.getState().push('ok', t),
  err: (t: string) => useToasts.getState().push('err', t),
  info: (t: string) => useToasts.getState().push('info', t),
};
export function Toaster() {
  const { items, drop } = useToasts();
  useI18n((s) => s.locale);
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[100] flex flex-col items-center gap-2 p-4 sm:items-end" role="status" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className="rise pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border bg-white px-4 py-3 shadow-[var(--shadow-pop)]" style={{ borderColor: t.kind === 'err' ? 'var(--color-bad-600)' : t.kind === 'ok' ? 'var(--color-ok-600)' : 'var(--color-info-600)' }}>
          {t.kind === 'ok' ? <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-ok-600" /> : t.kind === 'err' ? <AlertCircle className="mt-0.5 size-5 shrink-0 text-bad-600" /> : <Info className="mt-0.5 size-5 shrink-0 text-info-600" />}
          <p className="flex-1 text-sm leading-snug text-ink-900">{tr(t.text)}</p>
          <button onClick={() => drop(t.id)} aria-label={tr('Đóng')} className="text-steel-400 hover:text-ink-900"><X className="size-4" /></button>
        </div>
      ))}
    </div>
  );
}
