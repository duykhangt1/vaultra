import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  Search,
  Download,
  KeyRound,
  ShieldAlert,
  RefreshCw,
  LogOut as OutIcon,
  Unlock,
  Lock,
  FileText,
  Eye,
  EyeOff,
  Camera,
  Copy,
  Check,
  Compass,
  CalendarClock,
  ShieldCheck,
  Plus,
  CreditCard,
  MapPin,
  ArrowLeft,
} from 'lucide-react';
import { useGet, useAct, useDebounced } from '@/lib/hooks';
import { post, patch, newIdemKey, API_ORIGIN } from '@/lib/api';
import {
  Async,
  Card,
  CardHead,
  PagedTable,
  StatusBadge,
  Button,
  Alert,
  Tabs,
  Field,
  Input,
  Modal,
  Badge,
  EmptyState,
  Timeline,
  Switch,
  cn,
} from '@/ui';
import { vnd, fmtDate, fmtEndDate, fmtDateTime, addDaysYmd, statusOf } from '@/lib/format';
import { PublicFloorPlanExplorer } from '@/widgets/FloorPlanView';
import { ActBtn, Info, REASON, Money, PhotoGallery } from '../kit';

const CT_TABS: { value: string; label: string; status: string; empty: [string, string] }[] = [
  {
    value: 'live',
    label: 'Đang thuê',
    status: 'ACTIVE,MOVE_OUT_SCHEDULED,EXPIRED',
    empty: [
      'Chưa có kho đang thuê',
      'Kho xuất hiện ở đây sau khi bạn ký hợp đồng và nhận bàn giao kho tại cơ sở.',
    ],
  },
  {
    value: 'ended',
    label: 'Đã kết thúc',
    status: 'ENDED,TERMINATED,CANCELLED',
    empty: [
      'Chưa có hợp đồng nào đã kết thúc',
      'Lịch sử hợp đồng cũ sẽ lưu ở đây.',
    ],
  },
  {
    value: 'all',
    label: 'Tất cả',
    status: '',
    empty: [
      'Chưa có hợp đồng',
      'Hợp đồng chỉ có sau khi bạn ký và nhận bàn giao kho tại cơ sở.',
    ],
  },
];

const DOC_TYPE_LABELS: Record<string, string> = {
  CONTRACT: 'Hợp đồng thuê kho điện tử (Bản khách đã ký)',
  HANDOVER_MOVE_IN: 'Biên bản bàn giao nhận kho (Đã ký)',
  HANDOVER_MOVE_OUT: 'Biên bản kiểm tra & bàn giao trả kho (Đã ký)',
  RENEWAL_ADDENDUM: 'Phụ lục gia hạn hợp đồng (Đã ký)',
  TRANSFER_ADDENDUM: 'Phụ lục đổi kho (Đã ký)',
  FINAL_NOTICE: 'Thông báo quá hạn lần cuối',
  TERMINATION_NOTICE: 'Thông báo chấm dứt hợp đồng',
};

function normalizeContractDocs(docs: any[] = [], contractStatus?: string) {
  const isContractSigned =
    (contractStatus &&
      contractStatus !== 'PENDING_SIGNATURE' &&
      contractStatus !== 'CANCELLED') ||
    docs.some((d) => d.type === 'CONTRACT' && d.signed);
  let seenSignedContract = false;
  const result: any[] = [];
  for (const d of docs) {
    if (d.type === 'CONTRACT' && isContractSigned) {
      if (seenSignedContract) continue; // Bỏ bản nháp cũ trước khi ký, chỉ giữ bản PDF mới nhất có chữ ký của khách
      seenSignedContract = true;
    }
    const isNotice = d.type === 'FINAL_NOTICE' || d.type === 'TERMINATION_NOTICE';
    const isSigned =
      Boolean(d.signed) ||
      (d.type === 'CONTRACT' && isContractSigned) ||
      d.type === 'HANDOVER_MOVE_IN' ||
      d.type === 'HANDOVER_MOVE_OUT' ||
      d.type === 'RENEWAL_ADDENDUM' ||
      d.type === 'TRANSFER_ADDENDUM';
    const rawUrl = typeof d.url === 'string' ? d.url : '';
    const liveUrl = rawUrl.replace(/^https?:\/\/[^/]+\/v1\//, `${API_ORIGIN}/v1/`);
    result.push({
      ...d,
      url: liveUrl || rawUrl,
      isSigned,
      isNotice,
      title: DOC_TYPE_LABELS[d.type] ?? d.type,
    });
  }
  const orderRank: Record<string, number> = {
    CONTRACT: 1,
    HANDOVER_MOVE_IN: 2,
    RENEWAL_ADDENDUM: 3,
    TRANSFER_ADDENDUM: 4,
    HANDOVER_MOVE_OUT: 5,
    FINAL_NOTICE: 6,
    TERMINATION_NOTICE: 7,
  };
  result.sort((a, b) => (orderRank[a.type] ?? 99) - (orderRank[b.type] ?? 99));
  return result;
}

const pdfBlobCache = new Map<string, string>();

function PdfPreviewFrame({
  url,
  title,
  docId,
  sha256,
}: {
  url: string;
  title: string;
  docId?: string;
  sha256?: string;
}) {
  const baseUrl = url.split('?')[0];
  const stableKey = `${docId ?? ''}:${sha256 ?? ''}:${baseUrl}`;
  const [blobUrl, setBlobUrl] = useState<string | null>(
    () => pdfBlobCache.get(stableKey) ?? null,
  );
  const [loading, setLoading] = useState<boolean>(
    () => !pdfBlobCache.has(stableKey),
  );
  const latestUrlRef = { current: url };
  latestUrlRef.current = url;

  useEffect(() => {
    const cached = pdfBlobCache.get(stableKey);
    if (cached) {
      setBlobUrl(cached);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    fetch(latestUrlRef.current)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.blob();
      })
      .then((b) => {
        if (cancelled) return;
        const pdfBlob =
          b.type === 'application/pdf'
            ? b
            : new Blob([b], { type: 'application/pdf' });
        const objUrl = URL.createObjectURL(pdfBlob);
        pdfBlobCache.set(stableKey, objUrl);
        setBlobUrl(objUrl);
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) {
          setBlobUrl(latestUrlRef.current);
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [stableKey]);

  if (loading && !blobUrl) {
    return (
      <div className="grid h-[620px] w-full place-items-center rounded-xl border hairline bg-white text-sm text-steel-500">
        Đang tải bản xem trước PDF…
      </div>
    );
  }

  return (
    <iframe
      src={blobUrl ?? url}
      title={title}
      className="h-[620px] w-full rounded-xl border hairline bg-white"
    />
  );
}

export function SignedContractDocsCard({
  contractId,
  contractCode,
  contractStatus,
  autoPreview = false,
}: {
  contractId: string;
  contractCode?: string;
  contractStatus?: string;
  autoPreview?: boolean;
}) {
  const q = useGet<any[]>(`/contracts/${contractId}/documents`, undefined, {
    staleTime: 60_000,
  });
  const [previewId, setPreviewId] = useState<string | null>(null);

  return (
    <Async q={q}>
      {(rawDocs) => {
        const docs = normalizeContractDocs(rawDocs, contractStatus);
        const activeDoc =
          docs.find((d) => d.id === previewId) ??
          (autoPreview ? docs[0] ?? null : null);

        return (
          <Card className="overflow-hidden">
            <CardHead
              title="Hợp đồng & Biên bản PDF khách đã ký"
              sub={
                contractCode
                  ? `Tài liệu điện tử có chữ ký khách hàng và mã băm SHA-256 của hợp đồng ${contractCode}`
                  : 'Tài liệu điện tử có chữ ký khách hàng và mã băm SHA-256'
              }
              action={
                <Badge tone="brass" dot>
                  SHA-256 Verified
                </Badge>
              }
            />
            {docs.length ? (
              <div className="divide-y divide-steel-100">
                {docs.map((x) => {
                  const isPreviewing =
                    activeDoc?.id === x.id && previewId !== '__NONE__';
                  return (
                    <div
                      key={x.id}
                      className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 transition hover:bg-paper/40"
                    >
                      <div className="flex min-w-[240px] flex-1 items-start gap-3.5">
                        <span className="mt-0.5 grid size-10 shrink-0 place-items-center rounded-xl border border-brass-500/35 bg-[#091320] text-brass-400">
                          <FileText className="size-5" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="font-bold leading-snug text-ink-950">
                            {x.title}
                          </p>
                          <p className="mt-0.5 text-xs text-steel-500">
                            Mẫu {x.templateVersion} ·{' '}
                            {x.isNotice ? 'Phát hành' : 'Ký lúc'}{' '}
                            {fmtDateTime(x.signedAt ?? x.generatedAt)} · SHA-256{' '}
                            <span className="code rounded bg-paper-2 px-1.5 py-0.5 text-ink-900">
                              {x.sha256?.slice(0, 12)}…
                            </span>
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge
                          tone={
                            x.isSigned ? 'ok' : x.isNotice ? 'info' : 'warn'
                          }
                          dot
                        >
                          {x.isSigned
                            ? 'Khách đã ký'
                            : x.isNotice
                              ? 'Thông báo'
                              : 'Chưa ký'}
                        </Badge>
                        <Button
                          size="sm"
                          variant={isPreviewing ? 'dark' : 'outline'}
                          icon={<Eye className="size-4" />}
                          onClick={() =>
                            setPreviewId(isPreviewing ? '__NONE__' : x.id)
                          }
                        >
                          {isPreviewing ? 'Ẩn xem trước' : 'Xem PDF'}
                        </Button>
                        <a href={x.url} target="_blank" rel="noreferrer">
                          <Button
                            size="sm"
                            variant="primary"
                            icon={<Download className="size-4" />}
                          >
                            Tải PDF
                          </Button>
                        </a>
                      </div>
                    </div>
                  );
                })}
                {activeDoc && previewId !== '__NONE__' && (
                  <div className="bg-paper p-4 sm:p-5">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs text-steel-600">
                      <span className="font-bold text-ink-950">
                        Đang xem trực tiếp: {activeDoc.title}
                      </span>
                      <a
                        href={activeDoc.url}
                        target="_blank"
                        rel="noreferrer"
                        className="font-semibold text-info-600 hover:underline"
                      >
                        Mở toàn màn hình trong tab mới ↗
                      </a>
                    </div>
                    <PdfPreviewFrame
                      url={activeDoc.url}
                      title={activeDoc.title}
                      docId={activeDoc.id}
                      sha256={activeDoc.sha256}
                    />
                  </div>
                )}
              </div>
            ) : (
              <EmptyState title="Chưa có tài liệu PDF" />
            )}
          </Card>
        );
      }}
    </Async>
  );
}

const INSPECTION_TYPE_LABELS: Record<string, string> = {
  MOVE_IN: 'Biên bản & Ảnh chụp hiện trạng lúc Nhận kho (Check-in)',
  MOVE_OUT: 'Biên bản & Ảnh chụp hiện trạng lúc Trả kho (Move-out)',
  ROUTINE: 'Kiểm tra kho định kỳ',
  POST_MAINTENANCE: 'Kiểm tra sau bảo trì',
};

const OVERALL_COND_LABELS: Record<string, [string, 'ok' | 'warn' | 'bad']> = {
  GOOD: ['Tốt — Đạt chuẩn bàn giao', 'ok'],
  FAIR: ['Có lỗi nhỏ đã ghi nhận', 'warn'],
  DAMAGED: ['Có hư hại', 'bad'],
};

const ITEM_COND_LABELS: Record<
  string,
  [string, 'ok' | 'warn' | 'bad' | 'neutral']
> = {
  OK: ['Tốt', 'ok'],
  MINOR_ISSUE: ['Lỗi nhỏ', 'warn'],
  DAMAGED: ['Hư hại', 'bad'],
  NOT_APPLICABLE: ['Không áp dụng', 'neutral'],
};

export function ContractInspectionsCard({ contractId }: { contractId: string }) {
  const q = useGet<any[]>(
    contractId ? `/contracts/${contractId}/inspections` : null,
  );
  const [zoomPhoto, setZoomPhoto] = useState<{
    url: string;
    title: string;
    sub?: string;
  } | null>(null);

  return (
    <Async q={q}>
      {(list) => {
        const rows: any[] = Array.isArray(list) ? list : [];
        return (
          <>
            <Card className="overflow-hidden">
              <CardHead
                title="Biên bản hiện trạng & Ảnh chụp kho (Check-in / Trả kho)"
                sub="Hình ảnh thực tế và tình trạng từng hạng mục kho do nhân viên cơ sở chụp khi bàn giao nhận kho và khi kiểm tra trả kho"
              />
              {rows.length ? (
                <div className="divide-y divide-steel-100">
                  {rows.map((insp: any) => {
                    const [ovLabel, ovTone] = OVERALL_COND_LABELS[
                      insp.overall_condition
                    ] ?? [insp.overall_condition, 'neutral'];
                    const items: any[] = insp.items ?? [];
                    const normalizeUrl = (u?: string) =>
                      typeof u === 'string'
                        ? u.replace(
                            /^https?:\/\/[^/]+\/v1\//,
                            `${API_ORIGIN}/v1/`,
                          )
                        : '';

                    return (
                      <div key={insp.id} className="space-y-4 p-5">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="inline-flex items-center gap-1.5 font-bold text-ink-950">
                                <Camera className="size-4 text-brass-700" />
                                {INSPECTION_TYPE_LABELS[insp.type] ?? insp.type}
                              </span>
                              <Badge tone={ovTone} dot>
                                {ovLabel}
                              </Badge>
                            </div>
                            <p className="mt-1 text-xs text-steel-500">
                              Thực hiện lúc:{' '}
                              <b>
                                {fmtDateTime(
                                  insp.completed_at ?? insp.created_at,
                                )}
                              </b>
                              {insp.performer?.full_name ? (
                                <>
                                  {' · '}Nhân viên kiểm tra:{' '}
                                  <b>{insp.performer.full_name}</b>
                                </>
                              ) : null}
                            </p>
                          </div>
                        </div>

                        {insp.identity_verification && (
                          <div className="rounded-xl border border-brass-500/35 bg-brass-100/25 p-4">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <p className="text-xs font-bold uppercase tracking-wider text-brass-700">
                                Giấy tờ tùy thân (CCCD / Hộ chiếu) đã xác minh lúc Check-in
                              </p>
                              <Badge tone="ok" dot>
                                {insp.identity_verification.document_type ??
                                  'CCCD'}{' '}
                                · ••••
                                {insp.identity_verification.document_last4 ??
                                  ''}
                              </Badge>
                            </div>
                            {insp.identity_verification.photos?.length > 0 ? (
                              <div className="mt-2.5">
                                <PhotoGallery
                                  photos={insp.identity_verification.photos.map(
                                    (p: any, idx: number) => ({
                                      ...p,
                                      label:
                                        p.caption ||
                                        `Ảnh ${insp.identity_verification.document_type ?? 'CCCD'} #${idx + 1}`,
                                    }),
                                  )}
                                  size="md"
                                />
                              </div>
                            ) : (
                              <p className="mt-1.5 text-xs text-steel-500">
                                Đã đối chiếu trực tiếp tại quầy khi check-in.
                              </p>
                            )}
                          </div>
                        )}

                        {insp.notes && (
                          <div className="rounded-lg bg-paper px-3 py-2 text-xs text-steel-700">
                            <b>Ghi chú chung:</b> {insp.notes}
                          </div>
                        )}

                        {items.length > 0 && (
                          <div className="grid gap-3 sm:grid-cols-2">
                            {items.map((it: any) => {
                              const [cLabel, cTone] = ITEM_COND_LABELS[
                                it.condition
                              ] ?? [it.condition, 'neutral'];
                              const photos: any[] = (it.photos ?? []).map(
                                (p: any) => ({
                                  ...p,
                                  url: normalizeUrl(p.url),
                                }),
                              );
                              return (
                                <div
                                  key={it.id ?? it.item_code}
                                  className="rounded-xl border hairline bg-paper p-3.5"
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="text-sm font-semibold text-ink-950">
                                      {it.label ?? it.item_code}
                                    </span>
                                    <Badge tone={cTone}>{cLabel}</Badge>
                                  </div>
                                  {it.note && (
                                    <p className="mt-1.5 text-xs text-steel-600">
                                      Ghi chú: {it.note}
                                    </p>
                                  )}
                                  {photos.length > 0 ? (
                                    <div className="mt-2.5 flex flex-wrap gap-2">
                                      {photos.map((p: any, idx: number) => (
                                        <button
                                          key={p.id ?? idx}
                                          type="button"
                                          onClick={() =>
                                            setZoomPhoto({
                                              url: p.url,
                                              title: `${INSPECTION_TYPE_LABELS[insp.type] ?? insp.type} · ${it.label ?? it.item_code}`,
                                              sub: `Tình trạng: ${cLabel}${it.note ? ` · ${it.note}` : ''}`,
                                            })
                                          }
                                          className="group relative overflow-hidden rounded-lg border border-steel-200 bg-white shadow-sm transition hover:border-brass-600"
                                        >
                                          <img
                                            src={p.url}
                                            alt={it.label ?? it.item_code}
                                            className="h-20 w-24 object-cover transition group-hover:scale-105"
                                            loading="lazy"
                                          />
                                        </button>
                                      ))}
                                    </div>
                                  ) : (
                                    <p className="mt-2 text-[11px] text-steel-400">
                                      Không đính kèm ảnh ở hạng mục này
                                    </p>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {insp.damage_items?.length > 0 && (
                          <div className="rounded-xl border border-bad-600/30 bg-bad-100/20 p-3.5">
                            <p className="mb-2 text-xs font-bold uppercase tracking-wider text-bad-600">
                              Khoản hư hại ghi nhận &amp; Ảnh chụp bằng chứng
                            </p>
                            <div className="space-y-2.5">
                              {insp.damage_items.map((dm: any) => (
                                <div
                                  key={dm.id}
                                  className="rounded-lg border hairline bg-white p-3 text-xs"
                                >
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <span className="font-semibold text-ink-950">
                                      {dm.description}
                                    </span>
                                    <b className="num text-sm text-bad-600">
                                      {vnd(dm.amount)}
                                    </b>
                                  </div>
                                  {dm.photos?.length > 0 && (
                                    <div className="mt-2">
                                      <PhotoGallery
                                        photos={dm.photos}
                                        size="sm"
                                      />
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <EmptyState
                  title="Chưa có biên bản kiểm tra & ảnh hiện trạng kho"
                  hint="Ảnh chụp kho và trạng thái từng hạng mục sẽ hiển thị tại đây ngay khi nhân viên lưu biên bản hiện trạng lúc bàn giao (Check-in)."
                />
              )}
            </Card>

            <Modal
              open={!!zoomPhoto}
              onClose={() => setZoomPhoto(null)}
              size="lg"
              title={zoomPhoto?.title ?? 'Ảnh hiện trạng kho'}
              description={zoomPhoto?.sub}
              footer={
                <div className="flex w-full items-center justify-between">
                  {zoomPhoto?.url ? (
                    <a
                      href={zoomPhoto.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs font-semibold text-info-600 hover:underline"
                    >
                      Mở ảnh gốc trong tab mới ↗
                    </a>
                  ) : (
                    <span />
                  )}
                  <Button variant="ghost" onClick={() => setZoomPhoto(null)}>
                    Đóng
                  </Button>
                </div>
              }
            >
              {zoomPhoto && (
                <div className="flex justify-center rounded-xl bg-paper p-2">
                  <img
                    src={zoomPhoto.url}
                    alt={zoomPhoto.title}
                    className="max-h-[70vh] w-auto rounded-lg object-contain"
                  />
                </div>
              )}
            </Modal>
          </>
        );
      }}
    </Async>
  );
}

export function SignedContractDocsModal({
  contract,
  onClose,
}: {
  contract: any | null;
  onClose: () => void;
}) {
  return (
    <Modal
      open={!!contract}
      onClose={onClose}
      size="xl"
      title={
        contract
          ? `Hồ sơ PDF & Ảnh hiện trạng · ${contract.code}`
          : 'Hồ sơ hợp đồng'
      }
      description={
        contract
          ? `${contract.customer?.full_name ?? ''} · Kho ${contract.unit?.code ?? ''} · ${contract.facility?.name ?? ''}`
          : undefined
      }
      footer={
        <Button variant="ghost" onClick={onClose}>
          Đóng
        </Button>
      }
    >
      {contract && (
        <div className="space-y-6">
          <SignedContractDocsCard
            contractId={contract.id}
            contractCode={contract.code}
            contractStatus={contract.status}
            autoPreview
          />
          <ContractInspectionsCard contractId={contract.id} />
        </div>
      )}
    </Modal>
  );
}

export function Contracts() {
  const nav = useNavigate();
  const [sp, setSp] = useSearchParams();
  const tab = CT_TABS.find((t) => t.value === sp.get('tab')) ?? CT_TABS[0];
  const [text, setText] = useState(sp.get('q') ?? '');
  const [pdfModalContract, setPdfModalContract] = useState<any | null>(null);
  const q = useDebounced(text.trim(), 350);

  useEffect(() => {
    setSp(
      (p) => {
        const n = new URLSearchParams(p);
        q ? n.set('q', q) : n.delete('q');
        return n;
      },
      { replace: true },
    );
  }, [q, setSp]);

  const setTab = (v: string) =>
    setSp(
      (p) => {
        const n = new URLSearchParams(p);
        v === 'live' ? n.delete('tab') : n.set('tab', v);
        return n;
      },
      { replace: true },
    );

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-[var(--radius-media)] border border-brass-500/25 bg-[#091320] p-6 text-white shadow-[var(--shadow-card)] sm:p-7">
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-brass-500 via-brass-400 to-transparent" />
        <div
          className="blueprint-dark pointer-events-none absolute inset-0 opacity-55"
          aria-hidden
        />
        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-2xl">
            <h1 className="display text-[28px] text-white sm:text-[34px]">
              Hợp đồng thuê kho
            </h1>
            <p className="mt-1.5 text-sm text-steel-300">
              Xem hợp đồng điện tử đã ký, điều khiển khóa kho từ xa, tra cứu mã PIN và lối đi đến kho.
            </p>
          </div>
          <Link to="/book">
            <Button variant="primary" icon={<Plus className="size-4" />}>
              Thuê thêm kho mới
            </Button>
          </Link>
        </div>
      </section>

      <Card className="overflow-hidden">
        <PagedTable
          path="/contracts"
          query={{ status: tab.status || undefined, q: q || undefined }}
          onRow={(r: any) => nav(`/app/contracts/${r.id}`)}
          toolbar={
            <div className="flex flex-wrap items-center gap-3 border-b hairline bg-paper/50 px-4 py-3">
              <div className="overflow-x-auto">
                <Tabs
                  value={tab.value}
                  onChange={setTab}
                  tabs={CT_TABS.map((t) => ({ value: t.value, label: t.label }))}
                />
              </div>
              <div className="relative ml-auto w-full max-w-[18rem]">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-steel-400" />
                <Input
                  className="pl-9"
                  placeholder="Tìm mã hợp đồng, mã kho…"
                  aria-label="Tìm hợp đồng"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                />
              </div>
            </div>
          }
          cols={[
            {
              key: 'c',
              header: 'Hợp đồng & Cơ sở',
              cell: (r: any) => (
                <div>
                  <span className="code font-bold text-ink-950">{r.code}</span>
                  <span className="mt-0.5 flex items-center gap-1 text-xs text-steel-500">
                    <MapPin className="size-3 text-brass-600" />
                    {r.facility?.name}
                  </span>
                </div>
              ),
            },
            {
              key: 'u',
              header: 'Kho lưu trữ',
              cell: (r: any) => (
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 rounded-md bg-[#091320] px-2.5 py-1 font-mono text-xs font-bold tracking-wider text-brass-400">
                    <KeyRound className="size-3" />
                    {r.unit?.code ?? '—'}
                  </span>
                  <span className="text-xs font-medium text-steel-600">
                    {r.unit_type?.name}
                  </span>
                </div>
              ),
            },
            {
              key: 'e',
              header: 'Ngày hết hạn',
              hideBelow: 'sm',
              cell: (r: any) => (
                <span className="font-medium text-ink-900 num">
                  {fmtEndDate(r.effective_end_date)}
                </span>
              ),
            },
            {
              key: 'r',
              header: 'Tiền thuê / tháng',
              hideBelow: 'md',
              cell: (r: any) => <Money v={r.monthly_rent} strong />,
            },
            {
              key: 'd',
              header: 'Công nợ',
              hideBelow: 'md',
              cell: (r: any) =>
                ['ACTIVE', 'MOVE_OUT_SCHEDULED', 'EXPIRED'].includes(
                  r.status,
                ) ? (
                  <StatusBadge
                    kind="delinquency"
                    value={r.delinquency_status}
                  />
                ) : (
                  <span className="text-steel-400">—</span>
                ),
            },
            {
              key: 's',
              header: 'Trạng thái',
              cell: (r: any) => (
                <StatusBadge kind="contract" value={r.status} />
              ),
            },
            {
              key: 'pdf',
              header: 'Hồ sơ PDF',
              cell: (r: any) => (
                <Button
                  size="sm"
                  variant="outline"
                  icon={<FileText className="size-3.5 text-brass-700" />}
                  onClick={(e) => {
                    e.stopPropagation();
                    setPdfModalContract(r);
                  }}
                >
                  Hồ sơ đã ký
                </Button>
              ),
            },
          ]}
          empty={
            q ? (
              <EmptyState
                title="Không tìm thấy hợp đồng phù hợp"
                hint="Thử mã hợp đồng / mã kho khác hoặc xóa bộ lọc tìm kiếm."
                action={
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setText('')}
                  >
                    Xóa từ khóa
                  </Button>
                }
              />
            ) : (
              <EmptyState
                icon={<KeyRound className="size-6" />}
                title={tab.empty[0]}
                hint={tab.empty[1]}
                action={
                  tab.value === 'live' || tab.value === 'all' ? (
                    <Link to="/book">
                      <Button variant="primary" size="sm">
                        Đặt thuê kho mới
                      </Button>
                    </Link>
                  ) : undefined
                }
              />
            )
          }
        />
      </Card>

      <SignedContractDocsModal
        contract={pdfModalContract}
        onClose={() => setPdfModalContract(null)}
      />
    </div>
  );
}

function ContractWayfindingCard({ c }: { c: any }) {
  const facilitySlug = c.facility?.slug || c.facility?.id;
  const unitCode = c.unit?.code;
  if (!facilitySlug) return null;
  return (
    <Card className="overflow-hidden border-brass-500/30">
      <CardHead
        title="Sơ đồ kiến trúc 3D & Lối đi tới kho của bạn"
        sub={
          unitCode
            ? `Lộ trình đi bộ trực quan từ Lối vào chính & Quầy lễ tân tới thẳng cửa kho ${unitCode}${c.unit?.zone?.name ? ` (${c.unit.zone.name})` : ''} tại ${c.facility?.name ?? 'cơ sở'}`
            : `Sơ đồ mặt bằng 3D và hướng dẫn lối đi bên trong ${c.facility?.name ?? 'cơ sở'}`
        }
        action={
          unitCode ? (
            <Badge tone="brass" dot>
              Kho {unitCode}
            </Badge>
          ) : undefined
        }
      />
      <div className="p-4 sm:p-5">
        <PublicFloorPlanExplorer
          facilitySlug={facilitySlug}
          initialUnitCode={unitCode}
        />
      </div>
    </Card>
  );
}

function calcContractLeasePct(startDate?: string, endDate?: string, daysLeft?: number | null): number {
  if (startDate && endDate) {
    const s = new Date(startDate).getTime();
    const e = new Date(endDate).getTime();
    const now = Date.now();
    if (e > s) {
      return Math.max(6, Math.min(100, Math.round(((now - s) / (e - s)) * 100)));
    }
  }
  if (typeof daysLeft === 'number') {
    if (daysLeft <= 0) return 100;
    return Math.max(10, Math.min(95, Math.round(((180 - Math.min(180, daysLeft)) / 180) * 100)));
  }
  return 50;
}

export function ContractDetail() {
  const nav = useNavigate();
  const { id } = useParams();
  const [sp, setSp] = useSearchParams();
  const tab = sp.get('tab') || 'overview';
  const setTab = (v: string) =>
    setSp(
      (p) => {
        const n = new URLSearchParams(p);
        v === 'overview' ? n.delete('tab') : n.set('tab', v);
        return n;
      },
      { replace: true },
    );
  const q = useGet<any>(`/contracts/${id}`);
  const toggle = useAct(
    (enabled: boolean) => patch(`/contracts/${id}/auto-renew`, { enabled }),
    { ok: 'Đã cập nhật tự động gia hạn', invalidate: ['/contracts'] },
  );

  return (
    <Async q={q}>
      {(c) => {
        const live = [
          'ACTIVE',
          'MOVE_OUT_SCHEDULED',
          'EXPIRED',
          'DELINQUENT',
        ].includes(c.status);
        const daysLeft = c.termsSummary?.daysLeft;
        const pctElapsed = calcContractLeasePct(
          c.start_date,
          c.termsSummary?.endDate,
          daysLeft,
        );

        return (
          <div className="space-y-6">
            <div>
              <Link
                to="/app/contracts"
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-steel-500 transition hover:text-ink-950"
              >
                <ArrowLeft className="size-4" />
                Danh sách hợp đồng
              </Link>
            </div>

            {/* Executive Vault Summary Hero Header */}
            <section className="relative overflow-hidden rounded-[var(--radius-media)] border border-brass-500/35 bg-[#091320] text-white shadow-[var(--shadow-pop)]">
              <div className="h-1 w-full bg-gradient-to-r from-brass-500 via-brass-400 to-brass-600/20" />
              <div
                className="door-lines pointer-events-none absolute inset-0 opacity-35"
                aria-hidden
              />
              <div
                className="blueprint-dark pointer-events-none absolute inset-0 opacity-50"
                aria-hidden
              />
              <div
                className="pointer-events-none absolute -right-24 -top-24 size-72 rounded-full bg-brass-500/15 blur-3xl"
                aria-hidden
              />

              <div className="relative p-6 sm:p-7">
                <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-start">
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <span className="inline-flex items-center gap-2 rounded-xl border border-brass-400/50 bg-brass-500/18 px-3.5 py-1.5 font-mono text-sm font-extrabold tracking-[0.18em] text-brass-400 shadow-xs">
                        <KeyRound className="size-4" />
                        KHO {c.unit?.code ?? '—'}
                      </span>
                      <span className="rounded-lg border border-white/15 bg-white/[0.06] px-2.5 py-1 font-mono text-xs text-steel-200">
                        {c.code}
                      </span>
                      <StatusBadge
                        kind="delinquency"
                        value={c.delinquency_status}
                      />
                      <StatusBadge kind="contract" value={c.status} />
                    </div>

                    <div>
                      <h1 className="display text-[26px] text-white sm:text-[34px]">
                        {c.unit_type?.name ?? 'Kho tự quản tiêu chuẩn'}
                      </h1>
                      <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-steel-300">
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="size-4 text-brass-400" />
                          {c.facility?.name}
                        </span>
                        {c.unit?.zone?.name && (
                          <>
                            <span className="text-steel-500">·</span>
                            <span>{c.unit.zone.name}</span>
                          </>
                        )}
                      </p>
                    </div>
                  </div>

                  {/* Monthly Rent & Quick Action Buttons */}
                  <div className="flex flex-col items-start gap-3 lg:items-end">
                    <div className="lg:text-right">
                      <p className="text-xs text-steel-400">
                        Tiền thuê hàng tháng
                      </p>
                      <p className="mt-0.5 font-mono text-2xl font-extrabold text-white num sm:text-3xl">
                        {vnd(c.monthly_rent)}
                        <span className="text-xs font-normal text-steel-400">
                          {' '}
                          / tháng
                        </span>
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant={tab === 'access' ? 'primary' : 'glass'}
                        icon={<Unlock className="size-4" />}
                        onClick={() => setTab('access')}
                      >
                        Mở khóa &amp; Mã PIN
                      </Button>
                      <Button
                        size="sm"
                        variant={tab === 'docs' ? 'primary' : 'glass'}
                        icon={<FileText className="size-4" />}
                        onClick={() => setTab('docs')}
                      >
                        PDF đã ký
                      </Button>
                      {live && (
                        <Button
                          size="sm"
                          variant={tab === 'renew' ? 'primary' : 'glass'}
                          icon={<CalendarClock className="size-4" />}
                          onClick={() => setTab('renew')}
                        >
                          Gia hạn
                        </Button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Lease Term Progress Bar */}
                <div className="mt-6 rounded-xl border border-white/10 bg-white/[0.04] p-4 backdrop-blur">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="text-steel-300">
                      Hiệu lực từ <b className="text-white num">{fmtDate(c.start_date)}</b>{' '}
                      đến{' '}
                      <b className="text-white num">
                        {fmtDate(c.termsSummary?.endDate)}
                      </b>
                    </span>
                    <span
                      className={cn(
                        'font-mono font-bold num',
                        c.is_holdover || (typeof daysLeft === 'number' && daysLeft < 0)
                          ? 'text-bad-100'
                          : typeof daysLeft === 'number' && daysLeft <= 30
                            ? 'text-brass-400'
                            : 'text-brass-400',
                      )}
                    >
                      {c.is_holdover
                        ? 'Đang quá hạn lưu kho (Holdover)'
                        : typeof daysLeft === 'number'
                          ? daysLeft < 0
                            ? `Đã quá hạn ${Math.abs(daysLeft)} ngày`
                            : `Còn lại ${daysLeft} ngày hiệu lực`
                          : '—'}
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-white/10">
                    <div
                      className={cn(
                        'h-full rounded-full transition-all',
                        c.is_holdover
                          ? 'bg-bad-600'
                          : typeof daysLeft === 'number' && daysLeft <= 14
                            ? 'bg-warn-600'
                            : 'bg-gradient-to-r from-brass-600 via-brass-500 to-brass-400',
                      )}
                      style={{ width: `${pctElapsed}%` }}
                    />
                  </div>
                </div>
              </div>
            </section>

            {c.is_holdover && (
              <Alert tone="warn" title="Hợp đồng đang quá hạn (Holdover)">
                Vui lòng thực hiện gia hạn kỳ thuê mới hoặc đăng ký lịch trả kho để tránh phát sinh phí lưu kho quá hạn.
              </Alert>
            )}

            <Card className="px-4 pt-1">
              <Tabs
                className="!border-b-0"
                value={tab}
                onChange={setTab}
                tabs={[
                  { value: 'overview', label: 'Tổng quan' },
                  { value: 'access', label: 'Truy cập & Khóa thông minh' },
                  { value: 'inspections', label: 'Hiện trạng & Ảnh kho' },
                  {
                    value: 'billing',
                    label: 'Hóa đơn',
                    count: c.openInvoices || undefined,
                  },
                  { value: 'docs', label: 'Tài liệu PDF đã ký' },
                  { value: 'renew', label: 'Gia hạn' },
                  { value: 'moveout', label: 'Trả kho' },
                ]}
              />
            </Card>

            {tab === 'overview' && (
              <div className="space-y-6">
                <div className="grid gap-6 lg:grid-cols-[1fr_350px]">
                  <Card className="overflow-hidden">
                    <CardHead
                      title="Điều khoản & Thông số hợp đồng"
                      sub="Thông tin pháp lý và cấu hình thanh toán của kho lưu trữ"
                    />
                    <div className="p-5">
                      <Info
                        rows={[
                          ['Ngày bắt đầu', fmtDate(c.start_date)],
                          ['Ngày hết hạn hiện tại', fmtDate(c.termsSummary?.endDate)],
                          [
                            'Thời gian còn lại',
                            `${c.termsSummary?.daysLeft ?? '—'} ngày`,
                          ],
                          ['Tiền thuê / tháng', vnd(c.monthly_rent)],
                          [
                            'Chu kỳ thanh toán',
                            c.billing_mode === 'MONTHLY'
                              ? `Hàng tháng (ngày ${c.billing_day})`
                              : 'Trả trước cả kỳ',
                          ],
                          ['Tiền đặt cọc bảo đảm', vnd(c.snapshot?.price?.deposit)],
                          ['Khu vực / Tầng kho', c.unit?.zone?.name],
                          [
                            'Liên hệ quản lý cơ sở',
                            c.snapshot?.facility?.phone &&
                              `Hotline ${c.snapshot.facility.phone}`,
                          ],
                          [
                            'Công nợ chưa thanh toán',
                            c.debt > 0 ? vnd(c.debt) : undefined,
                          ],
                        ]}
                      />
                    </div>
                  </Card>

                  <div className="space-y-4">
                    {live && c.status !== 'MOVE_OUT_SCHEDULED' && (
                      <Card className="border-brass-500/30 bg-gradient-to-br from-white to-paper p-5">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2 font-bold text-ink-950">
                            <RefreshCw className="size-4 text-brass-600" />
                            <span>Tự động gia hạn</span>
                          </div>
                          <Switch
                            checked={!!c.auto_renew}
                            onChange={(v) => toggle.mutate(v)}
                          />
                        </div>
                        <p className="mt-2 text-xs leading-relaxed text-steel-600">
                          Hợp đồng tự động nối tiếp kỳ thuê khi đến hạn nếu không có công nợ quá hạn, đảm bảo mã PIN ra vào kho luôn liên tục.
                        </p>
                      </Card>
                    )}

                    <Card className="overflow-hidden">
                      <CardHead title="Nhật ký trạng thái hợp đồng" />
                      <div className="max-h-72 overflow-y-auto p-5">
                        <Timeline
                          items={
                            c.history?.map((h: any) => ({
                              title: h.from_status ? (
                                <>
                                  {statusOf('contract', h.from_status)[0]}{' '}
                                  <span className="text-steel-400">→</span>{' '}
                                  <b>{statusOf('contract', h.to_status)[0]}</b>
                                </>
                              ) : (
                                <>
                                  Khởi tạo hợp đồng ·{' '}
                                  <b>{statusOf('contract', h.to_status)[0]}</b>
                                </>
                              ),
                              sub: h.reason,
                              at: fmtDateTime(h.created_at),
                            })) ?? []
                          }
                        />
                      </div>
                    </Card>
                  </div>
                </div>

                <ContractWayfindingCard c={c} />
                <ContractInspectionsCard contractId={c.id} />
                <SignedContractDocsCard
                  contractId={c.id}
                  contractCode={c.code}
                  contractStatus={c.status}
                />
              </div>
            )}

            {tab === 'access' && (
              <div className="space-y-6">
                <AccessTab id={c.id} status={c.status} unitCode={c.unit?.code} />
                <ContractWayfindingCard c={c} />
              </div>
            )}

            {tab === 'inspections' && (
              <ContractInspectionsCard contractId={c.id} />
            )}

            {tab === 'billing' && (
              <Card className="overflow-hidden">
                <CardHead
                  title="Hóa đơn thuộc hợp đồng này"
                  sub="Chạm vào từng hóa đơn để xem bảng kê VAT chi tiết và thanh toán trực tuyến"
                />
                <PagedTable
                  path="/invoices"
                  query={{ contractId: c.id }}
                  onRow={(r: any) => nav(`/app/billing/invoices/${r.id}`)}
                  cols={[
                    {
                      key: 'c',
                      header: 'Mã hóa đơn',
                      cell: (r: any) => (
                        <span className="code font-bold text-ink-950">
                          {r.code}
                        </span>
                      ),
                    },
                    {
                      key: 'd',
                      header: 'Hạn thanh toán',
                      cell: (r: any) => (
                        <span className="num">{fmtDate(r.due_date)}</span>
                      ),
                    },
                    {
                      key: 't',
                      header: 'Tổng cộng',
                      cell: (r: any) => <Money v={r.total} />,
                    },
                    {
                      key: 'b',
                      header: 'Còn phải trả',
                      cell: (r: any) => <Money v={r.balance_due} strong />,
                    },
                    {
                      key: 's',
                      header: 'Trạng thái',
                      cell: (r: any) => (
                        <StatusBadge kind="invoice" value={r.status} />
                      ),
                    },
                  ]}
                />
              </Card>
            )}

            {tab === 'docs' && (
              <SignedContractDocsCard
                contractId={c.id}
                contractCode={c.code}
                contractStatus={c.status}
                autoPreview
              />
            )}

            {tab === 'renew' && <RenewTab c={c} />}
            {tab === 'moveout' && <MoveOutTab c={c} />}
          </div>
        );
      }}
    </Async>
  );
}

function AccessTab({
  id,
  status,
  unitCode,
}: {
  id: string;
  status: string;
  unitCode?: string;
}) {
  const q = useGet<any>(`/contracts/${id}/access`);
  const [pin, setPin] = useState<string | null>(null);
  const [hidePin, setHidePin] = useState(false);
  const [copied, setCopied] = useState(false);

  const rotate = useAct(() => post(`/contracts/${id}/access/pin/rotate`), {
    ok: 'Đã đổi mã PIN mới thành công',
    invalidate: ['/contracts'],
    onSuccess: (r) => setPin(r.pin ?? null),
  });
  const unlock = useAct(
    () => post<{ unit: string }>(`/contracts/${id}/access/remote-unlock`),
    { ok: (r) => `Đã mở khóa kho ${r.unit}`, invalidate: ['/contracts'] },
  );
  const lock = useAct(
    () => post<{ unit: string }>(`/contracts/${id}/access/remote-lock`),
    { ok: (r) => `Đã khóa kho ${r.unit}`, invalidate: ['/contracts'] },
  );

  return (
    <Async q={q}>
      {(a) => {
        const activePinCred = a.credentials?.find(
          (c: any) => c.type === 'PIN_CODE' && c.status === 'ACTIVE' && c.pin,
        );
        const displayPin: string | null = pin ?? activePinCred?.pin ?? null;
        const pinChars = displayPin ? String(displayPin).split('') : [];
        const open = a.lock?.state === 'OPEN';

        const copyPin = () => {
          if (!displayPin) return;
          void navigator.clipboard?.writeText(String(displayPin));
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        };

        return (
          <div className="space-y-6">
            {a.suspended && (
              <Alert
                tone="bad"
                title="Quyền truy cập kho đang bị tạm khóa tự động"
                action={
                  <Link to="/app/billing">
                    <Button size="sm" variant="danger">
                      Thanh toán ngay
                    </Button>
                  </Link>
                }
              >
                Hợp đồng có hóa đơn quá hạn chưa thanh toán. Hệ thống sẽ khôi phục mã PIN và khóa thông minh ngay lập tức sau khi thanh toán hoàn tất.
              </Alert>
            )}

            {/* Smart Vault Control Panel Grid */}
            <div className="grid gap-6 lg:grid-cols-2">
              {/* 1. Smart Digital Lock Status & Remote Control Card */}
              {status === 'ACTIVE' && (
                <Card className="relative flex flex-col justify-between overflow-hidden border-brass-500/35 p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="text-lg font-extrabold text-ink-950">
                        Khóa cửa kho từ xa
                      </h3>
                    </div>
                    <Badge tone={open ? 'warn' : 'ok'} dot>
                      {open ? 'Cửa đang mở khóa' : 'Đã khóa an toàn'}
                    </Badge>
                  </div>

                  {/* Visual Vault Lock Indicator */}
                  <div className="my-6 flex items-center gap-5 rounded-2xl border hairline bg-paper p-5">
                    <div
                      className={cn(
                        'relative grid size-16 shrink-0 place-items-center rounded-2xl border-2 transition-all',
                        open
                          ? 'border-brass-500 bg-brass-100 text-brass-700 shadow-[0_0_24px_rgb(200_150_62/0.35)]'
                          : 'border-[#091320] bg-[#091320] text-brass-400 shadow-sm',
                      )}
                    >
                      {open ? (
                        <Unlock className="size-7" />
                      ) : (
                        <Lock className="size-7" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-mono text-xs font-bold uppercase tracking-wider text-steel-500">
                        Trạng thái chốt điện tử {unitCode ? `· Kho ${unitCode}` : ''}
                      </p>
                      <p className="mt-0.5 text-base font-extrabold text-ink-950">
                        {open
                          ? 'Chốt khóa thông minh đang MỞ'
                          : 'Chốt khóa thông minh đang ĐÓNG'}
                      </p>
                      <p className="mt-1 text-xs leading-relaxed text-steel-600">
                        {open
                          ? 'Kho đang mở để xếp dỡ đồ đạc. Hãy nhấn Đóng khóa ngay khi rời đi.'
                          : 'Bạn có thể mở khóa trực tiếp trên điện thoại khi đứng trước cửa kho.'}
                      </p>
                      {a.lock?.at && (
                        <p className="mt-1.5 font-mono text-[11px] text-steel-400">
                          Cập nhật lần cuối: {fmtDateTime(a.lock.at)}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3 border-t hairline pt-4">
                    <span className="inline-flex items-center gap-1.5 text-xs text-steel-500">
                      <ShieldCheck className="size-4 text-ok-600" />
                      Kết nối bảo mật thời gian thực
                    </span>
                    {open ? (
                      <Button
                        variant="dark"
                        size="md"
                        icon={<Lock className="size-4" />}
                        loading={lock.isPending}
                        onClick={() => lock.mutate(undefined)}
                      >
                        Đóng khóa kho ngay
                      </Button>
                    ) : (
                      <Button
                        variant="primary"
                        size="md"
                        icon={<Unlock className="size-4" />}
                        loading={unlock.isPending}
                        onClick={() => unlock.mutate(undefined)}
                      >
                        Mở khóa kho từ xa
                      </Button>
                    )}
                  </div>
                </Card>
              )}

              {/* 2. Luxury Brushed-Brass / Navy Digital Keycard for 6-Digit PIN */}
              <div
                className={cn(
                  'relative flex flex-col justify-between overflow-hidden rounded-2xl border border-brass-500/50 bg-gradient-to-br from-[#091320] via-[#0e1b2c] to-[#162b46] p-6 text-white shadow-[var(--shadow-pop)]',
                  status !== 'ACTIVE' && 'lg:col-span-2',
                )}
              >
                <div
                  className="door-lines pointer-events-none absolute inset-0 opacity-30"
                  aria-hidden
                />
                <div className="relative flex flex-wrap items-start justify-between gap-3">
                  <h3 className="text-lg font-bold text-white">
                    Mã PIN mở cổng chính &amp; cửa kho
                  </h3>
                </div>

                {displayPin ? (
                  <div className="relative my-6">
                    <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-2.5">
                      {pinChars.map((digit, i) => (
                        <span
                          key={i}
                          className="grid h-14 w-11 place-items-center rounded-xl border border-brass-400/45 bg-white/[0.08] font-mono text-2xl font-extrabold text-brass-400 shadow-inner backdrop-blur sm:h-16 sm:w-12 sm:text-3xl num"
                        >
                          {hidePin ? '•' : digit}
                        </span>
                      ))}
                    </div>
                    <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                      <Button
                        size="xs"
                        variant="glass"
                        icon={
                          copied ? (
                            <Check className="size-3.5 text-brass-400" />
                          ) : (
                            <Copy className="size-3.5" />
                          )
                        }
                        onClick={copyPin}
                      >
                        {copied ? 'Đã sao chép PIN' : 'Sao chép mã PIN'}
                      </Button>
                      <Button
                        size="xs"
                        variant="glass"
                        icon={
                          hidePin ? (
                            <Eye className="size-3.5" />
                          ) : (
                            <EyeOff className="size-3.5" />
                          )
                        }
                        onClick={() => setHidePin((v) => !v)}
                      >
                        {hidePin ? 'Hiện số PIN' : 'Ẩn số PIN'}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="relative my-6 rounded-xl border border-white/12 bg-white/[0.05] p-5 text-center text-sm text-steel-300">
                    Mã PIN 6 chữ số sẽ được kích hoạt ngay khi nhân viên hoàn tất bàn giao kho.
                  </div>
                )}

                <div className="relative flex flex-wrap items-center justify-between gap-3 border-t border-white/12 pt-4">
                  <p className="max-w-xs text-[11px] leading-relaxed text-steel-300">
                    Bảo mật tuyệt đối: Mã PIN chỉ hiển thị trực tiếp tại đây, không bao giờ gửi qua Email/SMS.
                  </p>
                  {status === 'ACTIVE' && (
                    <ActBtn
                      label="Đổi mã PIN"
                      variant="primary"
                      size="sm"
                      icon={<RefreshCw className="size-3.5" />}
                      danger
                      title="Cấp lại mã PIN mở kho mới"
                      description="Mã PIN 6 số cũ sẽ bị vô hiệu hóa ngay lập tức và thay bằng mã PIN ngẫu nhiên mới."
                      run={() => rotate.mutateAsync(undefined)}
                    />
                  )}
                </div>
              </div>
            </div>

            {/* 3. Clean Credentials List Card */}
            <Card className="overflow-hidden">
              <CardHead
                title="Danh sách phương thức định danh & khóa"
                sub="Toàn bộ mã PIN, thẻ từ ra vào và ổ khóa vật lý đang liên kết với kho của bạn"
              />
              <ul className="divide-y divide-steel-100">
                {a.credentials.length ? (
                  a.credentials.map((cr: any) => (
                    <li
                      key={cr.id}
                      className="flex flex-wrap items-center gap-3.5 px-5 py-4 transition hover:bg-paper/40"
                    >
                      <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-brass-500/30 bg-brass-100/40 text-brass-700">
                        <KeyRound className="size-5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="font-bold text-ink-950">
                          {({
                            PIN_CODE: 'Mã PIN mở cổng & kho (Web)',
                            ACCESS_CARD: 'Thẻ từ ra vào cơ sở',
                            FACILITY_LOCK: 'Ổ khóa tiêu chuẩn cơ sở',
                            CUSTOMER_LOCK: 'Ổ khóa riêng của khách thuê',
                          } as any)[cr.type] ?? cr.type}
                        </p>
                        <p className="code mt-0.5 text-xs text-steel-500">
                          {cr.type === 'PIN_CODE'
                            ? hidePin
                              ? '••••••'
                              : cr.pin ?? cr.masked
                            : cr.identifier}
                        </p>
                      </div>
                      <Badge
                        tone={cr.status === 'ACTIVE' ? 'ok' : 'neutral'}
                        dot
                      >
                        {cr.status === 'ACTIVE' ? 'Đang kích hoạt' : cr.status}
                      </Badge>
                      {cr.status === 'ACTIVE' && cr.type !== 'PIN_CODE' && (
                        <ActBtn
                          label={
                            <span className="inline-flex items-center gap-1">
                              <ShieldAlert className="size-4" />
                              Báo mất thẻ/khóa
                            </span>
                          }
                          danger
                          title="Báo mất / thu hồi phương thức truy cập"
                          description="Thẻ hoặc khóa sẽ bị thu hồi quyền ra vào ngay lập tức để bảo vệ tài sản. Phí cấp lại có thể áp dụng."
                          fields={[
                            {
                              name: 'reason',
                              label: 'Mô tả sự việc',
                              type: 'textarea',
                            },
                          ]}
                          run={(v) =>
                            post(`/access-credentials/${cr.id}/report-lost`, v)
                          }
                          ok="Đã khóa và thu hồi phương thức truy cập"
                          invalidate={['/contracts']}
                        />
                      )}
                    </li>
                  ))
                ) : (
                  <li className="px-5 py-8 text-center text-sm text-steel-500">
                    Phương thức mở kho sẽ được kích hoạt ngay khi bạn hoàn tất nhận bàn giao kho cùng nhân viên.
                  </li>
                )}
              </ul>
            </Card>
          </div>
        );
      }}
    </Async>
  );
}

function RenewTab({ c }: { c: any }) {
  const nav = useNavigate();
  const q = useGet<any>(`/contracts/${c.id}/renewal-offer`);
  const [term, setTerm] = useState<number | null>(null);
  const renew = useAct(
    (t: number) =>
      post<{ invoice?: { id: string }; applied?: boolean }>(
        `/contracts/${c.id}/renew`,
        { termMonths: t },
        newIdemKey(),
      ),
    {
      ok: (r) =>
        r?.applied
          ? 'Đã gia hạn hợp đồng thành công!'
          : 'Đã tạo hóa đơn gia hạn — vui lòng thanh toán để hoàn tất gia hạn',
      invalidate: ['/contracts', '/invoices', '/dashboard'],
      onSuccess: (r) => {
        if (r?.invoice?.id) nav(`/app/billing/invoices/${r.invoice.id}`);
      },
    },
  );
  const BL: Record<string, string> = {
    RENEWAL_BLOCKED_OUTSTANDING_BALANCE:
      'Còn hóa đơn quá hạn — vui lòng thanh toán hóa đơn quá hạn trước khi gia hạn',
    DELINQUENT: 'Hợp đồng đang quá hạn thanh toán',
    BLOCKED_BY_MANAGER:
      'Quản lý cơ sở đã chặn gia hạn kho này — liên hệ cơ sở để chuyển kho khác cùng loại',
    MOVE_OUT_SCHEDULED:
      'Bạn đã đặt lịch trả kho (hủy lịch trả kho nếu muốn tiếp tục gia hạn)',
    STATUS_PENDING_SIGNATURE: 'Hợp đồng chưa ký',
    STATUS_ENDED: 'Hợp đồng đã kết thúc',
    STATUS_TERMINATED: 'Hợp đồng đã chấm dứt',
  };
  return (
    <Async q={q}>
      {(o) => {
        const quotes: { termMonths: number; newEnd: string; dueNow: number }[] =
          o.quotes ?? [];
        const terms = quotes.map((x) => x.termMonths);
        const defaultTerm =
          o.offer?.accepted_term_months &&
          terms.includes(o.offer.accepted_term_months)
            ? o.offer.accepted_term_months
            : terms[0] ?? null;
        const sel = term ?? defaultTerm;
        const quote = quotes.find((x) => x.termMonths === sel);
        const newRent = o.offer ? Number(o.offer.offered_monthly_rent) : null;
        const renewalFee = o.offer ? Number(o.offer.renewal_fee ?? 0) : 0;
        const pct =
          newRent && o.currentRent
            ? Math.round(((newRent - o.currentRent) / o.currentRent) * 1000) /
              10
            : 0;
        const pendingSameTerm =
          o.pendingInvoice && o.offer?.accepted_term_months === sel;
        return (
          <Card className="overflow-hidden">
            <CardHead
              title="Gia hạn kỳ thuê hợp đồng"
              sub="Giữ nguyên kho đang sử dụng, mã PIN mở cổng và tự động xuất Phụ lục gia hạn điện tử"
            />
            <div className="p-5">
              <div className="rounded-xl border hairline bg-paper/60 p-4">
                <Info
                  rows={[
                    ['Tiền thuê hiện tại', `${vnd(o.currentRent)} / tháng`],
                    ['Ngày hết hạn hiện tại', fmtDate(o.currentEnd)],
                    [
                      'Giá thuê kỳ gia hạn',
                      newRent !== null
                        ? `${vnd(newRent)} / tháng${pct > 0 ? ` (+${pct}%)` : ''}`
                        : '—',
                    ],
                    ...(renewalFee > 0
                      ? ([['Phí gia hạn', vnd(renewalFee)]] as [string, string][])
                      : []),
                  ]}
                />
              </div>

              {o.pendingInvoice && (
                <div className="mt-4">
                  <Alert
                    tone="warn"
                    title={`Hóa đơn gia hạn ${o.pendingInvoice.code} (${o.offer?.accepted_term_months ?? ''} tháng) đang chờ thanh toán: ${vnd(o.pendingInvoice.balance_due ?? o.pendingInvoice.total)}`}
                  >
                    Sau khi bạn thanh toán hóa đơn này, ngày hết hạn mới của hợp đồng và mã PIN truy cập kho sẽ tự động được gia hạn, đồng thời hệ thống sẽ xuất Phụ lục gia hạn PDF.
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Link to={`/app/billing/invoices/${o.pendingInvoice.id}`}>
                        <Button
                          size="sm"
                          variant="primary"
                          icon={<CreditCard className="size-4" />}
                        >
                          Thanh toán ngay ·{' '}
                          {vnd(
                            o.pendingInvoice.balance_due ??
                              o.pendingInvoice.total,
                          )}
                        </Button>
                      </Link>
                    </div>
                  </Alert>
                </div>
              )}

              {o.blockers?.list?.length > 0 ? (
                <div className="mt-4">
                  <Alert tone="warn" title="Chưa thể gia hạn lúc này">
                    <ul className="list-disc pl-5">
                      {o.blockers.list.map((b: string) => (
                        <li key={b}>{BL[b] ?? b}</li>
                      ))}
                    </ul>
                    {o.blockers.overdueInvoices?.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {o.blockers.overdueInvoices.map((i: any) => (
                          <Link key={i.id} to={`/app/billing/invoices/${i.id}`}>
                            <Button size="sm" variant="primary">
                              Thanh toán {i.code} · {vnd(i.balance)}
                            </Button>
                          </Link>
                        ))}
                      </div>
                    )}
                  </Alert>
                </div>
              ) : !o.offer ? (
                <div className="mt-4">
                  <Alert tone="info" title="Chưa mở cửa sổ gia hạn">
                    Bạn có thể thực hiện gia hạn bắt đầu từ ngày {fmtDate(o.opensOn)}.
                  </Alert>
                </div>
              ) : (
                <div className="mt-6 space-y-5 border-t hairline pt-5">
                  <div>
                    <p className="font-bold text-ink-950">
                      Chọn thời hạn gia hạn thêm
                    </p>
                    <p className="text-xs text-steel-500">
                      Chọn số tháng muốn gia hạn. Hệ thống sẽ tạo hóa đơn tương ứng và tự động cộng thêm thời hạn sau khi thanh toán.
                    </p>
                  </div>
                  <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
                    {quotes.map((qItem) => {
                      const active = sel === qItem.termMonths;
                      return (
                        <button
                          key={qItem.termMonths}
                          type="button"
                          onClick={() => setTerm(qItem.termMonths)}
                          className={cn(
                            'flex flex-col justify-between rounded-2xl border p-4 text-left transition',
                            active
                              ? 'border-brass-500 bg-[#091320] text-white shadow-md'
                              : 'border-steel-200 bg-paper/60 text-ink-950 hover:border-brass-500 hover:bg-white',
                          )}
                        >
                          <div>
                            <div className="flex items-center justify-between">
                              <span
                                className={cn(
                                  'text-lg font-extrabold',
                                  active ? 'text-brass-400' : 'text-ink-950',
                                )}
                              >
                                +{qItem.termMonths} tháng
                              </span>
                              {active && <Badge tone="brass">Đang chọn</Badge>}
                            </div>
                            <p
                              className={cn(
                                'mt-1 text-xs',
                                active ? 'text-steel-300' : 'text-steel-500',
                              )}
                            >
                              Hết hạn mới: <b>{fmtDate(qItem.newEnd)}</b>
                            </p>
                          </div>
                          <div
                            className={cn(
                              'mt-4 border-t pt-3',
                              active
                                ? 'border-white/15'
                                : 'border-steel-200/70',
                            )}
                          >
                            <span
                              className={cn(
                                'block text-[11px] uppercase tracking-wider',
                                active ? 'text-steel-300' : 'text-steel-500',
                              )}
                            >
                              Tổng thanh toán
                            </span>
                            <span className="font-mono text-base font-extrabold num">
                              {vnd(qItem.dueNow)}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  {quote && (
                    <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-brass-500/35 bg-brass-100/25 p-4 sm:p-5">
                      <div className="text-sm">
                        <p className="font-bold text-ink-950">
                          Gia hạn thêm {quote.termMonths} tháng (đến hết ngày{' '}
                          {fmtDate(quote.newEnd)})
                        </p>
                        <p className="mt-0.5 text-xs text-steel-600">
                          Đơn giá: {vnd(newRent)}/tháng × {quote.termMonths}{' '}
                          tháng
                          {renewalFee > 0
                            ? ` + Phí gia hạn ${vnd(renewalFee)}`
                            : ''}{' '}
                          ={' '}
                          <b className="font-mono text-ink-950 num">
                            {vnd(quote.dueNow)}
                          </b>
                        </p>
                      </div>
                      {pendingSameTerm ? (
                        <Link
                          to={`/app/billing/invoices/${o.pendingInvoice.id}`}
                        >
                          <Button variant="primary">
                            Thanh toán hóa đơn gia hạn ·{' '}
                            {vnd(
                              o.pendingInvoice.balance_due ??
                                o.pendingInvoice.total,
                            )}
                          </Button>
                        </Link>
                      ) : (
                        <Button
                          variant="primary"
                          loading={renew.isPending}
                          disabled={!sel}
                          onClick={() => renew.mutate(sel!)}
                        >
                          {o.pendingInvoice
                            ? `Đổi sang ${quote.termMonths} tháng & Thanh toán · ${vnd(quote.dueNow)}`
                            : `Xác nhận gia hạn & Thanh toán · ${vnd(quote.dueNow)}`}
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </Card>
        );
      }}
    </Async>
  );
}

function getCustomerMoveOutBadge(mo: any, settleData: any) {
  if (!mo) return null;
  if (mo.status === 'SCHEDULED')
    return (
      <Badge tone="info" dot>
        Chờ kiểm tra kho
      </Badge>
    );
  if (mo.status === 'INSPECTED')
    return (
      <Badge tone="warn" dot>
        Chờ ký quyết toán
      </Badge>
    );
  if (mo.status === 'DISPUTED')
    return (
      <Badge tone="bad" dot>
        Đang khiếu nại
      </Badge>
    );
  if (mo.status === 'CANCELLED')
    return (
      <Badge tone="neutral" dot>
        Đã hủy
      </Badge>
    );
  if (mo.status === 'COMPLETED') {
    const st = settleData?.settlement;
    const refund = settleData?.refund;
    const net = Number(
      st?.net_amount ?? st?.netAmount ?? mo.estimated_settlement?.net ?? 0,
    );
    if (!isNaN(net) && net > 0) {
      if (refund?.status === 'SUCCEEDED')
        return (
          <Badge tone="ok" dot>
            Đã hoàn tiền &amp; Hoàn tất
          </Badge>
        );
      if (
        st?.status === 'FINALIZED' ||
        refund?.status === 'APPROVED' ||
        refund?.status === 'MANUAL_REQUIRED'
      ) {
        return (
          <Badge tone="warn" dot>
            Chưa hoàn tiền (Nhận tại quầy)
          </Badge>
        );
      }
      return (
        <Badge tone="warn" dot>
          Chưa hoàn tiền
        </Badge>
      );
    }
    return (
      <Badge tone="ok" dot>
        Hoàn tất
      </Badge>
    );
  }
  return <StatusBadge kind="generic" value={mo.status} />;
}

function MoveOutTab({ c }: { c: any }) {
  const mo = c.moveOutRequest;
  const [date, setDate] = useState(addDaysYmd(14));
  const est = useGet<any>(
    !mo && ['ACTIVE'].includes(c.status)
      ? `/contracts/${c.id}/move-out-estimate`
      : null,
    { date },
  );
  const req = useAct(
    () => post(`/contracts/${c.id}/move-out`, { date }, newIdemKey()),
    { ok: 'Đã gửi yêu cầu trả kho', invalidate: ['/contracts'] },
  );
  const settle = useGet<any>(
    mo || ['ENDED', 'CLOSED', 'MOVED_OUT', 'TERMINATED'].includes(c.status)
      ? `/contracts/${c.id}/settlement`
      : null,
  );
  const L: Record<string, string> = {
    deposit: 'Tiền cọc đang giữ',
    outstanding: 'Nợ còn lại',
    damageTotal: 'Hư hại',
    cleaningTotal: 'Vệ sinh',
    earlyTerminationFee: 'Phí chấm dứt sớm',
    prepaidRefund: 'Hoàn tiền trả trước',
    net: 'Dự kiến hoàn lại',
  };

  if (mo)
    return (
      <Card className="overflow-hidden">
        <CardHead
          title={`Yêu cầu trả kho ngày ${fmtDate(mo.requested_date)}`}
          sub={
            mo.notice_ok
              ? 'Đủ thời gian báo trước theo hợp đồng'
              : 'Báo trước thiếu ngày — có thể phát sinh phí chấm dứt sớm'
          }
          action={getCustomerMoveOutBadge(mo, settle.data)}
        />
        <div className="space-y-4 p-5">
          {mo.status === 'SCHEDULED' && (
            <ActBtn
              label="Hủy yêu cầu trả kho"
              danger
              title="Hủy yêu cầu trả kho"
              description="Hợp đồng thuê kho của bạn sẽ tiếp tục duy trì như bình thường."
              run={() => post(`/move-out-requests/${mo.id}/cancel`)}
              ok="Đã hủy yêu cầu trả kho"
              invalidate={['/contracts']}
            />
          )}
          {settle.data?.settlement && (
            <SettlementView s={settle.data} contractId={c.id} />
          )}
        </div>
      </Card>
    );

  if (settle.data?.settlement) {
    return (
      <Card className="p-5">
        <SettlementView s={settle.data} contractId={c.id} />
      </Card>
    );
  }

  if (c.status !== 'ACTIVE')
    return (
      <Alert tone="info">
        Chỉ hợp đồng đang hoạt động mới có thể gửi yêu cầu đăng ký trả kho.
      </Alert>
    );

  return (
    <Card className="overflow-hidden">
      <CardHead
        title="Đăng ký lịch bàn giao trả kho (Move-out)"
        sub="Chọn ngày dự kiến dọn đồ để hệ thống tính toán ước tính hoàn trả tiền đặt cọc"
      />
      <div className="space-y-4 p-5">
        <div className="max-w-xs">
          <Field label="Ngày trả kho dự kiến" required>
            <Input
              type="date"
              min={addDaysYmd(1)}
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </Field>
        </div>
        <Async q={est}>
          {(e) => (
            <div className="rounded-2xl border hairline bg-paper p-5 text-sm">
              <p className="mb-3 font-bold text-ink-950">
                Bảng ước tính quyết toán hoàn cọc
              </p>
              <dl className="space-y-2">
                {Object.entries(L).map(
                  ([k, label]) =>
                    e[k] !== undefined && (
                      <div
                        key={k}
                        className={cn(
                          'flex justify-between',
                          k === 'net' &&
                            'border-t-2 border-ink-950/15 pt-2.5 text-base font-extrabold text-ink-950',
                        )}
                      >
                        <dt className={k === 'net' ? '' : 'text-steel-600'}>
                          {label}
                        </dt>
                        <dd className="font-mono num">{vnd(e[k])}</dd>
                      </div>
                    ),
                )}
              </dl>
              {e.noticeDays && (
                <p className="mt-3 text-xs text-steel-500">
                  Quy định hợp đồng: Cần thông báo trước tối thiểu {e.noticeDays}{' '}
                  ngày.
                </p>
              )}
            </div>
          )}
        </Async>
        <Button
          variant="dark"
          icon={<OutIcon className="size-4" />}
          loading={req.isPending}
          onClick={() => req.mutate(undefined)}
        >
          Gửi yêu cầu trả kho
        </Button>
      </div>
    </Card>
  );
}

interface SettleField {
  key: string;
  alt: string;
  label: string;
  isTotal?: boolean;
}

const SETTLEMENT_FIELDS: SettleField[] = [
  { key: 'deposit_amount', alt: 'depositAmount', label: 'Tiền cọc ban đầu' },
  {
    key: 'outstanding_applied',
    alt: 'outstandingApplied',
    label: 'Khấu trừ nợ tiền thuê',
  },
  { key: 'damage_total', alt: 'damageTotal', label: 'Chi phí hư hại' },
  {
    key: 'cleaning_total',
    alt: 'cleaningTotal',
    label: 'Chi phí dọn dẹp / vệ sinh',
  },
  {
    key: 'early_termination_fee',
    alt: 'earlyTerminationFee',
    label: 'Phí chấm dứt sớm',
  },
  {
    key: 'prepaid_refund',
    alt: 'prepaidRefund',
    label: 'Hoàn tiền trả trước',
  },
  {
    key: 'net_amount',
    alt: 'netAmount',
    label: 'Số tiền hoàn lại cho khách',
    isTotal: true,
  },
];

const APPROVAL_LABELS: Record<string, string> = {
  NOT_REQUIRED: 'Không cần duyệt',
  APPROVED: 'Đã duyệt',
  PENDING: 'Chờ duyệt',
  REJECTED: 'Từ chối',
};

function SettlementView({
  s,
  contractId,
}: {
  s: any;
  contractId: string;
}) {
  const st = s.settlement;
  const refund = s.refund;
  if (!st) return null;
  const netNum = Number(st.net_amount ?? st.netAmount ?? 0);
  return (
    <div className="rounded-2xl border hairline bg-paper/40 p-5 text-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-base font-bold text-ink-950">
          Bảng quyết toán tiền đặt cọc
        </p>
        {netNum > 0 ? (
          refund?.status === 'SUCCEEDED' ? (
            <Badge tone="ok" dot>
              Đã hoàn tiền &amp; Hoàn tất
            </Badge>
          ) : (
            <Badge tone="warn" dot>
              Chưa hoàn tiền
            </Badge>
          )
        ) : (
          <StatusBadge kind="generic" value={st.status} />
        )}
      </div>
      <dl className="space-y-2">
        {SETTLEMENT_FIELDS.map((f) => {
          const rawVal = st[f.key] ?? st[f.alt];
          if (rawVal === undefined || rawVal === null) return null;
          const val = Number(rawVal);
          if (isNaN(val)) return null;
          const label =
            f.isTotal && val < 0 ? 'Số tiền cần thanh toán thêm' : f.label;
          const displayVal = f.isTotal && val < 0 ? Math.abs(val) : val;
          return (
            <div
              key={f.key}
              className={cn(
                'flex justify-between',
                f.isTotal &&
                  'border-t-2 border-ink-950/15 pt-2.5 text-base font-extrabold text-ink-950',
              )}
            >
              <dt
                className={
                  f.isTotal ? 'font-bold text-ink-950' : 'text-steel-600'
                }
              >
                {label}
              </dt>
              <dd
                className={cn(
                  'font-mono num',
                  f.isTotal && 'font-extrabold text-ink-950',
                )}
              >
                {vnd(displayVal)}
              </dd>
            </div>
          );
        })}
      </dl>

      {netNum > 0 && (
        <div className="mt-4 rounded-xl border border-brass-500/30 bg-white p-3.5 text-xs">
          {refund?.status === 'SUCCEEDED' ? (
            <span className="font-semibold text-ok-600">
              ✓ Đã hoàn tiền mặt tại quầy: {vnd(netNum)}
            </span>
          ) : st.status === 'FINALIZED' ? (
            <span className="font-semibold text-ok-600">
              ✓ Quản lý đã duyệt chi tiền mặt ({vnd(netNum)}) — Vui lòng nhận tiền mặt tại quầy cơ sở
            </span>
          ) : (
            <span className="text-brass-700 font-medium">
              ⏳ Đang chờ Quản lý cơ sở / BOM xác nhận khoản hoàn tiền mặt ({vnd(netNum)})
            </span>
          )}
        </div>
      )}

      {s.damages?.length > 0 && (
        <ul className="mt-4 space-y-2.5">
          {s.damages.map((d: any) => (
            <li
              key={d.id}
              className="rounded-xl border hairline bg-white p-3.5"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  {d.description} — <b className="font-mono num">{vnd(d.amount)}</b>
                </span>
                <Badge
                  tone={
                    d.status === 'APPROVED' ||
                    d.approval_status === 'APPROVED'
                      ? 'warn'
                      : 'neutral'
                  }
                >
                  {APPROVAL_LABELS[d.status ?? d.approval_status] ??
                    (d.status ?? d.approval_status)}
                </Badge>
              </div>
              {d.photos?.length > 0 && (
                <div className="mt-2">
                  <PhotoGallery photos={d.photos} size="sm" />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {['DRAFT', 'PROPOSED', 'PENDING_CONFIRMATION'].includes(st.status) && (
        <div className="mt-4 border-t hairline pt-4">
          <p className="mb-2.5 text-xs text-steel-500">
            Không đồng ý với khoản khấu trừ nào? Gửi khiếu nại trong thời hạn quy định để Quản lý cơ sở kiểm tra lại.
          </p>
          <ActBtn
            label="Khiếu nại quyết toán"
            title="Khiếu nại quyết toán"
            fields={[REASON]}
            run={(v) =>
              post(`/contracts/${contractId}/settlement/dispute`, v)
            }
            ok="Đã gửi khiếu nại"
            invalidate={['/contracts']}
          />
        </div>
      )}
    </div>
  );
}
