import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { MessageCircle, X, Send, ThumbsUp, ThumbsDown, Sparkles, Trash2, ArrowUpRight, UserCheck } from 'lucide-react';
import { post, del, get, sse, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { getLocale } from '@/lib/i18n';
import { vnd, fmtDate, SIZE_LABEL, CATEGORY_LABEL } from '@/lib/format';
import { Button, Badge, cn } from '@/ui';
import { toast } from '@/ui/toast';

type Card = { type: string; [k: string]: any };
type Msg = {
  id?: string;
  role: 'USER' | 'ASSISTANT';
  content: string;
  cards?: Card[];
  fallback?: boolean;
  feedback?: 'UP' | 'DOWN' | null;
  streaming?: boolean;
};

const SUGGEST = [
  'Bảng giá các loại kho tự quản hiện tại?',
  'Cơ sở Vaultra ở đâu và giờ mở cửa?',
  'Kho nào hợp với đồ căn hộ 1 phòng ngủ?',
  'Chính sách đặt cọc, hủy và hoàn tiền?',
];
const SUGGEST_ACCOUNT = [
  'Hợp đồng của tôi hết hạn khi nào?',
  'Tôi đang nợ hóa đơn nào?',
  'Tôi quên mã PIN ra vào kho thì làm gì?',
  'Thủ tục trả kho và hoàn cọc thế nào?',
];

export function AssistantWidget() {
  const { pathname } = useLocation();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [conv, setConv] = useState<string | null>(() => sessionStorage.getItem('vaultra.conv'));
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const user = useAuth((s) => s.user);
  const status = useAuth((s) => s.status);
  const end = useRef<HTMLDivElement>(null);
  const abort = useRef<AbortController | null>(null);
  const isCustomer = !!user?.customerId;

  // history for an existing conversation
  useEffect(() => {
    if (!open || !conv || msgs.length) return;
    get(`/assistant/conversations/${conv}`)
      .then((d) =>
        setMsgs(
          d.messages.map((m: any) => ({
            id: m.id,
            role: m.role,
            content: m.content,
            cards: m.cards,
            fallback: m.isFallback,
            feedback: m.feedback,
          })),
        ),
      )
      .catch(() => {
        sessionStorage.removeItem('vaultra.conv');
        setConv(null);
      });
  }, [open, conv]); // eslint-disable-line

  // a new login/logout starts a fresh conversation (ownership differs)
  useEffect(() => {
    setConv(null);
    setMsgs([]);
    sessionStorage.removeItem('vaultra.conv');
  }, [user?.id]);

  useEffect(() => {
    end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [msgs, open]);

  async function ensureConv() {
    if (conv) return conv;
    const c = await post('/assistant/conversations', { locale: getLocale() });
    sessionStorage.setItem('vaultra.conv', c.id);
    setConv(c.id);
    return c.id as string;
  }

  async function send(content: string) {
    const t = content.trim();
    if (!t || busy) return;
    setText('');
    setBusy(true);
    setMsgs((m) => [...m, { role: 'USER', content: t }, { role: 'ASSISTANT', content: '', cards: [], streaming: true }]);
    const patchLast = (fn: (m: Msg) => Msg) => setMsgs((arr) => arr.map((m, i) => (i === arr.length - 1 ? fn(m) : m)));
    try {
      const id = await ensureConv();
      abort.current = new AbortController();
      await sse(
        `/assistant/conversations/${id}/messages`,
        { content: t },
        (ev, d) => {
          if (ev === 'token') patchLast((m) => ({ ...m, content: m.content + d }));
          else if (ev === 'card') patchLast((m) => ({ ...m, cards: [...(m.cards ?? []), d] }));
          else if (ev === 'done') patchLast((m) => ({ ...m, id: d.messageId, fallback: d.fallback, streaming: false, cards: d.cards ?? m.cards }));
          else if (ev === 'error') patchLast((m) => ({ ...m, content: m.content || d.message, streaming: false }));
        },
        abort.current.signal,
      );
    } catch (e) {
      const msg =
        e instanceof ApiError && e.status === 429
          ? 'Bạn gửi hơi nhanh, vui lòng thử lại sau ít phút.'
          : e instanceof ApiError
            ? e.message
            : 'Không gửi được tin nhắn. Vui lòng thử lại.';
      patchLast((m) => ({ ...m, content: m.content || msg, streaming: false }));
    } finally {
      setBusy(false);
      patchLast((m) => ({ ...m, streaming: false }));
    }
  }

  async function rate(m: Msg, rating: 'UP' | 'DOWN') {
    if (!m.id) return;
    try {
      await post(`/assistant/messages/${m.id}/feedback`, { rating, reason: rating === 'DOWN' ? 'WRONG' : undefined });
      setMsgs((a) => a.map((x) => (x === m ? { ...x, feedback: rating } : x)));
    } catch (e) {
      toast.err((e as Error).message);
    }
  }

  async function reset() {
    abort.current?.abort();
    if (conv) await del(`/assistant/conversations/${conv}`).catch(() => undefined);
    sessionStorage.removeItem('vaultra.conv');
    setConv(null);
    setMsgs([]);
  }

  if (status === 'loading' || pathname !== '/') return null;
  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          aria-label="Mở trợ lý AI"
          className="group fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-full bg-ink-900 py-3 pl-4 pr-5 text-sm font-semibold text-white shadow-[var(--shadow-pop)] transition hover:-translate-y-0.5 hover:bg-ink-800"
        >
          <span className="grid size-7 place-items-center rounded-full bg-brass-500 text-ink-950">
            <Sparkles className="size-4" />
          </span>
          <span className="hidden sm:inline">Trợ lý AI Vaultra</span>
          <MessageCircle className="size-5 sm:hidden" />
        </button>
      )}
      {open && (
        <section
          aria-label="Trợ lý Vaultra"
          className="fixed inset-x-0 bottom-0 z-50 flex h-[88dvh] flex-col overflow-hidden rounded-t-3xl bg-white shadow-[var(--shadow-pop)] sm:inset-x-auto sm:bottom-5 sm:right-5 sm:h-[650px] sm:max-h-[86dvh] sm:w-[410px] sm:rounded-3xl"
        >
          <header className="grain flex items-center gap-3 bg-ink-900 px-4 py-3.5 text-white">
            <span className="grid size-9 place-items-center rounded-full bg-brass-500 text-ink-950">
              <Sparkles className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-bold leading-tight">Trợ lý AI Vaultra</p>
              <p className="flex items-center gap-1.5 text-xs text-steel-300">
                <span className="inline-block size-2 rounded-full bg-ok-500" />
                RAG AI · Dữ liệu kho & bảng giá trực tiếp
              </p>
            </div>
            <button onClick={reset} aria-label="Cuộc trò chuyện mới" title="Xóa & bắt đầu lại" className="rounded-lg p-2 text-steel-300 hover:bg-white/10">
              <Trash2 className="size-4" />
            </button>
            <button onClick={() => setOpen(false)} aria-label="Đóng" className="rounded-lg p-2 text-steel-300 hover:bg-white/10">
              <X className="size-5" />
            </button>
          </header>

          <div className="flex-1 space-y-4 overflow-y-auto bg-paper px-4 py-4" aria-live="polite">
            {!msgs.length && (
              <div className="space-y-3">
                <div className="rounded-2xl rounded-tl-sm bg-white p-3.5 text-sm leading-relaxed shadow-sm">
                  Xin chào{user ? ` ${user.fullName.split(' ').slice(-1)[0]}` : ''}! 👋 Mình là <b>Trợ lý AI Vaultra</b>. Mình có thể tư vấn kích thước kho, báo giá thời gian thực, tìm cơ sở còn trống, giải thích chính sách{isCustomer ? ' và tra cứu hợp đồng, hóa đơn của bạn' : ''}. Bạn cần hỗ trợ gì ạ?
                </div>
                <div className="flex flex-wrap gap-2">
                  {(isCustomer ? SUGGEST_ACCOUNT : SUGGEST).map((s) => (
                    <button
                      key={s}
                      onClick={() => send(s)}
                      className="rounded-full border border-steel-300 bg-white px-3 py-1.5 text-left text-[13px] font-medium transition hover:border-ink-900 hover:bg-brass-50"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {msgs.map((m, i) => (
              <div key={i} className={cn('flex flex-col gap-2', m.role === 'USER' ? 'items-end' : 'items-start')}>
                {(m.content || m.streaming) && (
                  <div
                    className={cn(
                      'max-w-[90%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed',
                      m.role === 'USER' ? 'rounded-br-sm bg-ink-900 text-white' : 'rounded-tl-sm bg-white shadow-sm',
                    )}
                  >
                    {m.role === 'USER' ? (
                      m.content
                    ) : (
                      <RichMessage text={m.content} onNavigate={() => setOpen(false)} />
                    )}
                    {m.streaming && !m.content && (
                      <span className="inline-flex gap-1">
                        <i className="size-1.5 animate-bounce rounded-full bg-steel-400" />
                        <i className="size-1.5 animate-bounce rounded-full bg-steel-400 [animation-delay:120ms]" />
                        <i className="size-1.5 animate-bounce rounded-full bg-steel-400 [animation-delay:240ms]" />
                      </span>
                    )}
                  </div>
                )}
                {m.cards?.filter((c) => c.type !== 'handoff').map((c, j) => (
                  <CardView key={j} c={c} onNavigate={() => setOpen(false)} />
                ))}
                {m.role === 'ASSISTANT' && m.id && !m.streaming && (
                  <div className="flex items-center gap-1 text-steel-400">
                    <button
                      onClick={() => rate(m, 'UP')}
                      aria-label="Hữu ích"
                      className={cn('rounded p-1 hover:text-ok-600', m.feedback === 'UP' && 'text-ok-600')}
                    >
                      <ThumbsUp className="size-4" />
                    </button>
                    <button
                      onClick={() => rate(m, 'DOWN')}
                      aria-label="Chưa đúng"
                      className={cn('rounded p-1 hover:text-bad-600', m.feedback === 'DOWN' && 'text-bad-600')}
                    >
                      <ThumbsDown className="size-4" />
                    </button>
                  </div>
                )}
              </div>
            ))}
            <div ref={end} />
          </div>

          <footer className="border-t hairline bg-white p-3">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                send(text);
              }}
              className="flex items-end gap-2"
            >
              <textarea
                value={text}
                maxLength={1000}
                rows={1}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    send(text);
                  }
                }}
                placeholder="Nhập câu hỏi về kho, giá, chính sách…"
                aria-label="Tin nhắn"
                className="max-h-28 min-h-10 flex-1 resize-none rounded-xl border border-steel-300 px-3 py-2 text-sm focus:border-ink-700 focus:outline-none focus:ring-2 focus:ring-brass-400/50"
              />
              <Button type="submit" variant="primary" disabled={busy || !text.trim()} aria-label="Gửi" className="size-10 shrink-0 !px-0">
                <Send className="size-4" />
              </Button>
            </form>
            <div className="mt-2 flex items-center justify-between text-[11px] text-steel-500">
              <span>Powered by Vaultra RAG AI · Dữ liệu trực tiếp</span>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  nav('/contact');
                }}
                className="inline-flex items-center gap-1 font-semibold text-ink-900 hover:text-brass-700"
              >
                <UserCheck className="size-3.5" />
                Liên hệ với chúng tôi
              </button>
            </div>
          </footer>
        </section>
      )}
    </>
  );
}

/**
 * Strips any remaining markdown symbols (**, ###, raw [Label](url)) so bot messages
 * display as clean, natural plain text.
 */
export function RichMessage({ text }: { text: string; onNavigate?: () => void }) {
  if (!text) return null;

  const cleanBody = text
    // Remove lines that consist of pipe-separated markdown links like: [Đặt kho ngay](/book) | [Xem Cơ sở](/locations)
    .replace(/^[ \t]*(?:\[[^\]]+\]\([^)]+\)[ \t]*\|?[ \t]*)+$/gm, '')
    // Remove trailing pipe-separated markdown links
    .replace(/(?:\s*\[[^\]]+\]\([^)]+\)\s*\|?){2,}\s*$/gm, '')
    // Replace any inline [Label](url) with just Label
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
    // Remove all ** and __
    .replace(/\*\*+/g, '')
    .replace(/__+/g, '')
    // Remove ### headings
    .replace(/^[ \t]*#{1,6}[ \t]+/gm, '')
    // Convert leading "* " bullet to "• "
    .replace(/^[ \t]*\*[ \t]+/gm, '• ')
    // Remove horizontal rules
    .replace(/^[ \t]*-{3,}[ \t]*$/gm, '')
    // Collapse 3+ newlines into 2
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return <div>{cleanBody}</div>;
}

export function CardView({ c, onNavigate }: { c: Card; onNavigate: () => void }) {
  const nav = useNavigate();
  const wrap = 'w-[92%] rounded-xl border border-steel-200 bg-white p-3 text-sm shadow-sm';
  if (c.type === 'unit_type')
    return (
      <div className={wrap}>
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="font-bold">{c.name}</p>
            <p className="text-xs text-steel-500">
              {c.facility} · {c.area} m² · {SIZE_LABEL[c.size] ?? c.size}
              {c.climate ? ' · điều hòa' : ''}
            </p>
          </div>
          <p className="text-right font-bold num">
            {vnd(c.price)}
            <span className="block text-[11px] font-medium text-steel-500">/tháng</span>
          </p>
        </div>
        <div className="mt-2 flex items-center justify-between">
          <Badge tone={c.available > 0 ? 'ok' : 'bad'}>{c.available > 0 ? `Còn ${c.available} kho` : 'Hết chỗ'}</Badge>
          {c.available > 0 && (
            <Button
              size="sm"
              variant="primary"
              onClick={() => {
                onNavigate();
                nav(c.bookUrl);
              }}
            >
              Đặt ngay
            </Button>
          )}
        </div>
      </div>
    );
  if (c.type === 'facility')
    return (
      <div className={wrap}>
        <p className="font-bold">{c.name}</p>
        <p className="text-xs text-steel-500">{c.address}</p>
        <div className="mt-2 flex items-center justify-between">
          <span className="text-xs">
            Từ <b className="num">{vnd(c.priceFrom)}</b>/tháng
          </span>
          <Link onClick={onNavigate} className="inline-flex items-center gap-1 text-xs font-bold text-info-600" to={`/locations/${c.slug}`}>
            Xem cơ sở
            <ArrowUpRight className="size-3.5" />
          </Link>
        </div>
      </div>
    );
  if (c.type === 'size_recommendation')
    return (
      <div className={wrap}>
        <p className="text-xs text-steel-500">Thể tích ước tính (đã cộng 25% dự phòng)</p>
        <p className="text-lg font-bold num">
          {c.volume} m³ → <span className="text-brass-700">{SIZE_LABEL[c.category] ?? c.category}</span>
        </p>
        <p className="text-xs text-steel-500">{c.label}</p>
        <Link onClick={onNavigate} className="mt-1 inline-block text-xs font-bold text-info-600" to={`/book?size=${c.category}`}>
          Đặt kho cỡ này →
        </Link>
      </div>
    );
  if (c.type === 'price_preview')
    return (
      <div className={wrap}>
        <p className="font-bold">{c.unitType}</p>
        <dl className="mt-1 space-y-0.5 text-[13px]">
          <div className="flex justify-between">
            <dt>Tiền thuê/tháng</dt>
            <dd className="num">{vnd(c.monthlyRent)}</dd>
          </div>
          <div className="flex justify-between">
            <dt>Giảm giá</dt>
            <dd className="num">−{vnd(c.discountTotal)}</dd>
          </div>
          <div className="flex justify-between">
            <dt>Tiền cọc</dt>
            <dd className="num">{vnd(c.depositAmount)}</dd>
          </div>
          <div className="flex justify-between border-t pt-1 font-bold">
            <dt>Thanh toán lần đầu</dt>
            <dd className="num">{vnd(c.dueNowTotal)}</dd>
          </div>
        </dl>
      </div>
    );
  if (c.type === 'policy')
    return (
      <div className={wrap}>
        <div className="mb-1 flex items-center gap-2">
          <Badge tone="info">Chính sách v{c.version}</Badge>
        </div>
        <p className="whitespace-pre-line text-[13px] leading-relaxed">{c.text}</p>
      </div>
    );
  if (c.type === 'contract')
    return (
      <div className={wrap}>
        <div className="flex items-center justify-between">
          <p className="font-bold code">{c.code}</p>
          <Badge tone={c.status === 'ACTIVE' ? 'ok' : 'warn'}>{c.status}</Badge>
        </div>
        <p className="text-xs text-steel-500">
          Kho {c.unit} · {c.facility}
        </p>
        <p className="mt-1 text-[13px]">
          Hết hạn <b>{fmtDate(c.endDate)}</b> · {vnd(c.monthlyRent)}/tháng
        </p>
        <Link onClick={onNavigate} className="mt-1 inline-block text-xs font-bold text-info-600" to={c.link}>
          Mở hợp đồng →
        </Link>
      </div>
    );
  if (c.type === 'invoice')
    return (
      <div className={wrap}>
        <div className="flex items-center justify-between">
          <p className="font-bold code">{c.code}</p>
          <Badge tone={c.status === 'PAID' ? 'ok' : c.status === 'OVERDUE' ? 'bad' : 'warn'}>{c.status}</Badge>
        </div>
        <p className="text-[13px]">
          Tổng <b className="num">{vnd(c.total)}</b> · còn nợ <b className="num">{vnd(c.balance)}</b> · hạn {fmtDate(c.dueDate)}
        </p>
        {c.payLink && (
          <Button
            size="sm"
            variant="primary"
            className="mt-2"
            onClick={() => {
              onNavigate();
              nav(c.payLink);
            }}
          >
            Thanh toán
          </Button>
        )}
      </div>
    );
  if (c.type === 'action_link')
    return (
      <div className={wrap}>
        <Button
          size="sm"
          variant="primary"
          onClick={() => {
            onNavigate();
            nav(c.link);
          }}
        >
          Đi tới màn hình thao tác
        </Button>
      </div>
    );
  if (c.type === 'ticket_draft') return <TicketDraft c={c} />;
  return null;
}

function TicketDraft({ c }: { c: Card }) {
  const [state, setState] = useState<'idle' | 'busy' | 'sent'>('idle');
  const [code, setCode] = useState('');
  async function submit() {
    setState('busy');
    try {
      const t = await post(`/assistant/drafts/${c.draftRef}/confirm`, {});
      setCode(t.code);
      setState('sent');
    } catch (e) {
      toast.err((e as Error).message);
      setState('idle');
    }
  }
  return (
    <div className="w-[92%] rounded-xl border-2 border-dashed border-brass-500 bg-brass-100/50 p-3 text-sm">
      <p className="text-[11px] font-bold uppercase tracking-wider text-brass-700">Bản nháp yêu cầu hỗ trợ — chưa gửi</p>
      <p className="mt-1 font-semibold">{c.draft.subject}</p>
      <p className="text-xs text-steel-500">{CATEGORY_LABEL[c.draft.category] ?? c.draft.category}</p>
      <p className="mt-1 whitespace-pre-wrap text-[13px]">{c.draft.description}</p>
      {state === 'sent' ? (
        <p className="mt-2 font-bold text-ok-600">Đã gửi — mã {code}</p>
      ) : (
        <Button size="sm" variant="primary" className="mt-2" loading={state === 'busy'} disabled={!c.draftRef} onClick={submit}>
          Gửi yêu cầu
        </Button>
      )}
    </div>
  );
}
