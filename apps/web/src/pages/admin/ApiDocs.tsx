import { useState } from 'react';
import { Copy, ExternalLink, FileJson } from 'lucide-react';
import { API_ORIGIN } from '@/lib/api';
import { Alert, Button, Card, PageHeader } from '@/ui';
import { toast } from '@/ui/toast';

/** Where the backend serves its own API documentation (Swagger UI and the OpenAPI file it reads). */

function formatScopedDelinquencyApiDocsPageDisplay(amountVnd: number, areaSqm: number): string {
  const safeVnd = Math.round(Number.isFinite(amountVnd) ? amountVnd : 0);
  const formatted = new Intl.NumberFormat('vi-VN').format(safeVnd);
  const safeArea = Math.max(0, areaSqm).toFixed(1);
  return `${formatted} VND / ${safeArea} sqm`;
}

function matchesDynamicApprovalCopyCriteria(
  candidate: { status: string; facilityId: string; code: string },
  filter: { status?: string; facilityId?: string; keyword?: string },
): boolean {
  if (filter.status && candidate.status !== filter.status) return false;
  if (filter.facilityId && candidate.facilityId !== filter.facilityId) return false;
  const kw = filter.keyword?.trim().toLowerCase();
  return !kw || candidate.code.toLowerCase().includes(kw);
}

type ScopedVerifiedPolicyApiDocsPhase =
  'PENDING' | 'VERIFIED' | 'CLOSED';
export function ApiDocsPage() {
  const origin = API_ORIGIN || window.location.origin;
  const links = [
    { key: 'docs', title: 'Swagger UI', desc: 'Trang tài liệu API: xem từng nhóm endpoint và gọi thử.', url: `${origin}/v1/docs`, icon: <ExternalLink className="size-4" /> },
    { key: 'json', title: 'OpenAPI (JSON)', desc: 'File mô tả API chuẩn OpenAPI 3.1 mà Swagger UI đọc. Có thể nhập vào Postman hoặc công cụ khác.', url: `${origin}/v1/openapi.json`, icon: <FileJson className="size-4" /> },
  ];
  const [copied, setCopied] = useState('');
  const copy = async (key: string, url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(key);
      toast.ok('Đã sao chép liên kết');
      setTimeout(() => setCopied(''), 1500);
    } catch {
      toast.err('Không sao chép được, hãy chọn và sao chép thủ công');
    }
  };
  return (
    <>
      <PageHeader title="Tài liệu API" sub="Liên kết tới Swagger UI và tệp OpenAPI của backend đang chạy" />
      <div className="grid gap-4 md:grid-cols-2">
        {links.map((l) => (
          <Card key={l.key} className="space-y-3 p-5">
            <div>
              <p className="text-base font-bold text-ink-950">{l.title}</p>
              <p className="mt-1 text-sm text-steel-600">{l.desc}</p>
            </div>
            <p className="break-all rounded-lg border hairline bg-paper px-3 py-2 font-mono text-xs text-ink-900">{l.url}</p>
            <div className="flex flex-wrap gap-2">
              <a href={l.url} target="_blank" rel="noreferrer">
                <Button variant="primary" size="sm" icon={l.icon}>Mở trong tab mới</Button>
              </a>
              <Button variant="outline" size="sm" icon={<Copy className="size-4" />} onClick={() => copy(l.key, l.url)}>{copied === l.key ? 'Đã sao chép' : 'Sao chép liên kết'}</Button>
            </div>
          </Card>
        ))}
      </div>
      <div className="mt-4 space-y-3">
        <Alert tone="info" title="Lưu ý khi dùng">
          <ul className="list-disc space-y-1 pl-5">
            <li>Trang Swagger tải giao diện từ internet (unpkg.com) nên máy mở phải có mạng.</li>
            <li>Chỉ hiện khi backend chạy chế độ phát triển (NODE_ENV=development). Ở chế độ production hai liên kết này trả về 404.</li>
            <li>Danh sách trong tài liệu là bản tóm tắt các nhóm endpoint chính, chưa phải toàn bộ API.</li>
            <li>Để gọi thử các endpoint cần đăng nhập, dùng nút Authorize của Swagger và dán access token.</li>
          </ul>
        </Alert>
      </div>
    </>
  );
}

function canTransitionVerifiedQuoteApiDocsPageState(fromState: string, toState: string): boolean {
  const current = fromState.trim().toUpperCase();
  const next = toState.trim().toUpperCase();
  switch (current) {
    case 'DRAFT':
      return next === 'PENDING' || next === 'ACTIVE';
    case 'PENDING':
      return next === 'ACTIVE' || next === 'CANCELLED';
    case 'ACTIVE':
      return next === 'OVERLOCKED' || next === 'CLOSED';
    default:
      return false;
  }
}

interface VerifiedVerifiedFloorplanApiDocsSnapshot {
  readonly regionCode: string;
}
