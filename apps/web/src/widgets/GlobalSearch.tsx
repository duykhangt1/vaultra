import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as Dialog from '@radix-ui/react-dialog';
import { Search, CornerDownLeft, Loader2 } from 'lucide-react';
import { useDebounced, useGet } from '@/lib/hooks';
import { Badge } from '@/ui';

type Hit = { type: string; id: string; title: string; sub?: string; link: string };

/** Ctrl/⌘+K palette: scoped search over reservations, contracts, customers, units, tickets, invoices (server enforces scope). */
export function GlobalSearch({ open, onClose, workspace }: { open: boolean; onClose: () => void; workspace: string }) {
  const [q, setQ] = useState('');
  const [idx, setIdx] = useState(0);
  const dq = useDebounced(q, 250);
  const nav = useNavigate();
  const { data, isFetching } = useGet<{ data: Hit[] }>(open && dq.trim().length >= 2 ? '/search' : null, { q: dq.trim() });
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (open) { setQ(''); setIdx(0); setTimeout(() => ref.current?.focus(), 30); } }, [open]);
  const hits = data?.data ?? [];
  const go = (h: Hit) => { onClose(); nav(h.link); };
  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[80] bg-ink-950/55 backdrop-blur-[2px]" />
        <Dialog.Content className="fixed left-1/2 top-[12vh] z-[80] w-[calc(100vw-1.5rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-2xl bg-white shadow-[var(--shadow-pop)] focus:outline-none">
          <Dialog.Title className="sr-only">Tìm kiếm nhanh</Dialog.Title>
          <Dialog.Description className="sr-only">Tìm mã đơn, hợp đồng, khách hàng, kho, ticket trong phạm vi quyền của bạn ({workspace}).</Dialog.Description>
          <div className="flex items-center gap-3 border-b hairline px-4">
            <Search className="size-5 text-steel-400" />
            <input ref={ref} value={q} onChange={(e) => { setQ(e.target.value); setIdx(0); }} placeholder="Mã đơn, hợp đồng, tên khách, mã kho, ticket…" className="h-14 flex-1 bg-transparent text-base outline-none placeholder:text-steel-400"
              onKeyDown={(e) => { if (e.key === 'ArrowDown') { e.preventDefault(); setIdx((i) => Math.min(hits.length - 1, i + 1)); } if (e.key === 'ArrowUp') { e.preventDefault(); setIdx((i) => Math.max(0, i - 1)); } if (e.key === 'Enter' && hits[idx]) go(hits[idx]); }} />
            {isFetching && <Loader2 className="size-4 animate-spin text-steel-400" />}
          </div>
          <ul className="max-h-[50vh] overflow-y-auto p-2" role="listbox">
            {dq.trim().length < 2 && <li className="px-3 py-8 text-center text-sm text-steel-500">Nhập ít nhất 2 ký tự để tìm.</li>}
            {dq.trim().length >= 2 && !isFetching && !hits.length && <li className="px-3 py-8 text-center text-sm text-steel-500">Không tìm thấy kết quả trong phạm vi của bạn.</li>}
            {hits.map((h, i) => (
              <li key={h.type + h.id} role="option" aria-selected={i === idx}>
                <button onMouseEnter={() => setIdx(i)} onClick={() => go(h)} className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left ${i === idx ? 'bg-steel-100' : ''}`}>
                  <Badge tone="brass">{h.type}</Badge>
                  <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{h.title}</span>{h.sub && <span className="block truncate text-xs text-steel-500">{h.sub}</span>}</span>
                  {i === idx && <CornerDownLeft className="size-4 text-steel-400" />}
                </button>
              </li>
            ))}
          </ul>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
