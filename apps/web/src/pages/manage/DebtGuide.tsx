import { useState } from 'react';
import { BookOpen, ArrowRight } from 'lucide-react';
import { useGet } from '@/lib/hooks';
import { Badge, Button, Card, cn } from '@/ui';
import { vnd } from '@/lib/format';

/** The debt-process numbers of the policy that is in force (the same values the daily job uses for new contracts). */
export type DebtPolicy = {
  grace_days: number; lockout_day: number; final_notice_day: number; default_day: number;
  late_fee_type: 'FIXED' | 'PERCENT_OF_RENT' | 'GREATER_OF'; late_fee_fixed: number; late_fee_pct: number; late_fee_cap: number;
  overlock_fee: number; abandoned_goods_hold_days: number;
};

export function useDebtPolicy(facilityId?: string | null) {
  const q = useGet<{ version: number; params: DebtPolicy }>('/catalog/policy-summary', facilityId ? { facility: facilityId } : undefined, { staleTime: 60_000 });
  return { policy: q.data?.params, version: q.data?.version };
}

function lateFeeText(p: DebtPolicy) {
  const cap = p.late_fee_cap > 0 ? `, tối đa ${vnd(p.late_fee_cap)}` : '';
  if (p.late_fee_type === 'FIXED') return `${vnd(p.late_fee_fixed)}${cap}`;
  if (p.late_fee_type === 'PERCENT_OF_RENT') return `${p.late_fee_pct}% tiền thuê một tháng${cap}`;
  return `số lớn hơn giữa ${vnd(p.late_fee_fixed)} và ${p.late_fee_pct}% tiền thuê một tháng${cap}`;
}

type Case = { delinquency_status: string; status: string; daysOverdue: number; debt: number; overlock?: any; promise?: any; termination?: any };

/** What a person should do next for this one case. `abandoned` = its abandoned-goods record, when there is one. */
export function nextStep(c: Case, p: DebtPolicy | undefined, ops: boolean | undefined, abandoned?: { disposition: string } | null): { text: string; who: string } {
  const left = (day: number) => Math.max(0, day - c.daysOverdue);
  const promise = c.promise ? ` Khách đã hẹn trả ${vnd(c.promise.promised_amount)} — theo dõi đến ngày hẹn.` : '';
  if (c.status === 'TERMINATED') {
    if (!abandoned) return { text: 'Kiểm kê tài sản tồn đọng trong kho (Bước 3): danh mục tài sản, 2 người làm chứng, ảnh hiện trường.', who: 'Quản lý cơ sở' };
    if (abandoned.disposition === 'PENDING') return { text: 'Chờ quyết định xử lý tài sản: trả lại khách, tiêu hủy hoặc thanh lý (Bước 4).', who: 'Quản lý vận hành (BOM)' };
    return { text: c.debt > 0 ? `Tài sản đã xử lý xong. Còn nợ ${vnd(c.debt)} sau khi cấn trừ cọc — theo dõi thu phần còn lại.` : 'Đã hoàn tất, không cần làm thêm.', who: 'Quản lý cơ sở' };
  }
  switch (c.delinquency_status) {
    case 'GRACE':
      return { text: `Đang trong ân hạn${p ? `, còn ${left(p.grace_days)} ngày` : ''}. Chưa tính phí trễ; có thể nhắc khách sớm.${promise}`, who: 'Nhân viên / Quản lý cơ sở' };
    case 'LATE':
      return { text: `Gọi nhắc khách và ghi nhận liên hệ. Nếu khách hứa trả, ghi "Hẹn trả".${promise}`, who: 'Nhân viên / Quản lý cơ sở' };
    case 'LOCKED_OUT':
      return c.overlock
        ? { text: `Kho đã khóa chặn. Tiếp tục thu nợ${p ? `; còn ${left(p.final_notice_day)} ngày nữa đến thông báo cuối` : ''}.${promise}`, who: 'Quản lý cơ sở' }
        : { text: 'Ra kho gắn khóa chặn, chụp ảnh hiện trường rồi bấm "Đặt khóa chặn". Mã ra vào của khách đã bị khóa.', who: 'Nhân viên / Quản lý cơ sở' };
    case 'FINAL_NOTICE':
      return { text: `Thông báo cuối đã gửi cho khách. Liên hệ lần cuối${p ? `; còn ${left(p.default_day)} ngày nữa hợp đồng bị coi là vi phạm` : ''}. Có thể "Đề xuất thu hồi kho" sớm.${promise}`, who: 'Quản lý cơ sở' };
    case 'DEFAULT_PENDING': {
      const t = c.termination;
      if (!t) return { text: 'Chưa có yêu cầu thu hồi kho. Kiểm tra khách đã nhận thông báo cuối chưa; hệ thống chỉ tạo yêu cầu khi có bằng chứng đã gửi.', who: 'Quản lý cơ sở' };
      if (t.bom_decision === 'PENDING' && !t.fm_confirmed_at) return ops ? { text: 'Chờ Quản lý cơ sở xác nhận yêu cầu thu hồi (Bước 1).', who: 'Quản lý cơ sở' } : { text: 'Xác nhận yêu cầu thu hồi kho (Bước 1) ở tab "Yêu cầu thu hồi kho".', who: 'Quản lý cơ sở' };
      if (t.bom_decision === 'PENDING') return ops ? { text: 'Duyệt hoặc từ chối thu hồi kho (Bước 2) ở tab "Yêu cầu thu hồi kho".', who: 'Quản lý vận hành (BOM)' } : { text: 'Đã xác nhận, chờ BOM duyệt thu hồi (Bước 2).', who: 'Quản lý vận hành (BOM)' };
      return { text: 'Yêu cầu thu hồi đã có quyết định.', who: '—' };
    }
    default:
      return { text: '—', who: '—' };
  }
}

type Row = { key: string; title: string; when: string; auto: string[]; todo: string[]; actions: string[]; who: string; tone: 'info' | 'neutral' | 'warn' | 'bad' };

function stageRows(p: DebtPolicy): Row[] {
  const g = p.grace_days, l = p.lockout_day, f = p.final_notice_day, d = p.default_day;
  return [
    { key: 'GRACE', title: 'Ân hạn', when: `Quá hạn 1 – ${g} ngày`, tone: 'neutral',
      auto: ['Gửi thông báo nhắc thanh toán cho khách (ngày 1 và ngày 3).', 'Chưa tính phí trễ, chưa khóa gì.'],
      todo: ['Chưa bắt buộc xử lý, chỉ theo dõi.', 'Có thể gọi nhắc khách sớm để tránh phát sinh phí.'],
      actions: ['Ghi nhận liên hệ'], who: 'Nhân viên / Quản lý cơ sở' },
    { key: 'LATE', title: 'Trễ hạn', when: `Quá hạn ${g + 1} – ${l - 1} ngày`, tone: 'warn',
      auto: [`Tính phí trễ hạn: ${lateFeeText(p)} (hóa đơn phụ).`, 'Chặn khách đặt kho mới cho đến khi trả hết nợ.', 'Tạo việc "Gọi nhắc nợ" (hạn 1 ngày) và báo Quản lý cơ sở.'],
      todo: ['Gọi nhắc khách trong ngày, ghi lại kết quả cuộc gọi.', 'Khách hứa trả: ghi "Hẹn trả" (tối đa 7 ngày tới, mỗi hợp đồng 1 lần trong 60 ngày).'],
      actions: ['Ghi nhận liên hệ', 'Hẹn trả'], who: 'Nhân viên / Quản lý cơ sở' },
    { key: 'LOCKED_OUT', title: 'Khóa truy cập', when: `Quá hạn ${l} – ${f - 1} ngày`, tone: 'warn',
      auto: ['Khóa mã PIN / thẻ ra vào của khách, gửi thông báo và email.', 'Tạo việc "Gắn khóa chặn" mức ưu tiên cao cho nhân viên kho.'],
      todo: [`Ra kho gắn khóa chặn, chụp ảnh hiện trường, nhập số seri khóa (phí khóa chặn ${vnd(p.overlock_fee)}).`, 'Tiếp tục thu nợ; ghi nhận mọi lần liên hệ.', 'Khách có "Hẹn trả" hoặc đang khiếu nại thanh toán hợp lệ: hệ thống tạm không đẩy sang giai đoạn nặng hơn.'],
      actions: ['Đặt khóa chặn (bắt buộc có ảnh)', 'Ghi nhận liên hệ', 'Hẹn trả', 'Đề xuất thu hồi kho'], who: 'Nhân viên / Quản lý cơ sở' },
    { key: 'FINAL_NOTICE', title: 'Thông báo cuối', when: `Quá hạn ${f} – ${d - 1} ngày`, tone: 'bad',
      auto: [`Tạo và gửi "Thông báo cuối" (PDF) cho khách, ghi rõ hạn chót thanh toán (hóa đơn cũ nhất đến hạn + ${d} ngày).`, 'Lưu bằng chứng đã gửi để làm căn cứ thu hồi.'],
      todo: ['Liên hệ trực tiếp lần cuối, xác nhận khách đã nhận thông báo.', 'Nếu khách không có thiện chí, có thể "Đề xuất thu hồi kho" ngay, không cần chờ đủ ngày.'],
      actions: ['Ghi nhận liên hệ', 'Hẹn trả', 'Đề xuất thu hồi kho'], who: 'Quản lý cơ sở' },
    { key: 'DEFAULT_PENDING', title: 'Chờ xử lý vi phạm', when: `Quá hạn từ ${d} ngày`, tone: 'bad',
      auto: ['Nếu đã có bằng chứng gửi thông báo cuối: tự tạo "Yêu cầu thu hồi kho" và báo Quản lý cơ sở.', 'Chưa có bằng chứng thì không tạo yêu cầu (có cảnh báo).'],
      todo: ['Bước 1 (Quản lý cơ sở): xác nhận thu hồi ở tab "Yêu cầu thu hồi kho".', 'Bước 2 (BOM): duyệt hoặc từ chối thu hồi.'],
      actions: ['Xác nhận thu hồi (Bước 1)', 'Duyệt / Từ chối (Bước 2)'], who: 'Quản lý cơ sở → BOM' },
    { key: 'DEFAULTED', title: 'Vi phạm · đã chấm dứt', when: 'Sau khi BOM duyệt thu hồi', tone: 'bad',
      auto: ['Chấm dứt hợp đồng, thu hồi quyền ra vào, dừng lịch hóa đơn.', 'Cấn trừ tiền cọc vào các hóa đơn nợ (cũ nhất trước); phần nợ còn lại vẫn hiện trong danh sách.', 'Gửi thông báo chấm dứt cho khách.'],
      todo: [`Bước 3 (Quản lý cơ sở): kiểm kê tài sản tồn đọng — danh mục (tên + số lượng), 2 nhân viên làm chứng khác nhau, ảnh hiện trường, nơi lưu giữ (giữ ${p.abandoned_goods_hold_days} ngày).`, 'Bước 4 (BOM): quyết định trả lại khách, tiêu hủy hoặc thanh lý (nhập tiền thu được).'],
      actions: ['Kiểm kê tài sản tồn đọng (Bước 3)', 'Quyết định xử lý (Bước 4)'], who: 'Quản lý cơ sở → BOM' },
  ];
}

const DOT: Record<Row['tone'], string> = { neutral: 'bg-steel-400', info: 'bg-info-600', warn: 'bg-warn-600', bad: 'bg-bad-600' };

/** The debt-process explanation of the policy in force. Hidden until the button is pressed, so the list stays uncluttered. */
export function DebtGuide({ ops, facilityId }: { ops?: boolean; facilityId?: string | null }) {
  const { policy: p, version } = useDebtPolicy(ops ? null : facilityId);
  const [open, setOpen] = useState(false);
  if (!p) return null;
  const rows = stageRows(p);
  const days = [0, 1, p.grace_days + 1, p.lockout_day, p.final_notice_day, p.default_day];
  const labels = ['Đến hạn', 'Ân hạn', 'Trễ hạn', 'Khóa truy cập', 'Thông báo cuối', 'Chờ xử lý vi phạm'];
  return (
    <div className="mb-4">
      <Button variant={open ? 'dark' : 'outline'} size="sm" icon={<BookOpen className="size-4" />} aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        {open ? 'Ẩn hướng dẫn xử lý công nợ' : 'Hướng dẫn xử lý công nợ'}{version ? ` · chính sách v${version}` : ''}
      </Button>
      {open && (
        <Card className="mt-3 overflow-hidden">
          <div className="border-b hairline px-4 py-3">
            <p className="text-sm font-bold text-ink-950">Hướng dẫn xử lý công nợ theo chính sách{version ? ` v${version}` : ''}</p>
            <p className="text-xs text-steel-500">Mỗi giai đoạn: khi nào xảy ra, hệ thống tự làm gì, bạn cần làm gì và thao tác ở đâu</p>
          </div>
          <div className="space-y-4 p-4">
          <ol className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6" aria-label="Mốc thời gian theo ngày quá hạn">
            {labels.map((l, i) => (
              <li key={l} className="relative rounded-lg border hairline bg-paper px-3 py-2">
                <p className="font-mono text-[11px] font-semibold uppercase tracking-wide text-steel-500">{i === 0 ? 'Ngày 0' : `Từ ngày ${days[i]}`}</p>
                <p className="text-[13px] font-semibold text-ink-950">{l}</p>
                {i < labels.length - 1 && <ArrowRight className="absolute -right-2.5 top-1/2 hidden size-4 -translate-y-1/2 text-steel-400 lg:block" aria-hidden />}
              </li>
            ))}
          </ol>

          <div className="overflow-x-auto rounded-xl border hairline">
            <table className="w-full min-w-[820px] text-left text-[13px]">
              <thead>
                <tr className="border-b border-steel-200/85 bg-[#faf8f4] text-[11px] font-bold uppercase tracking-[0.08em] text-steel-500">
                  <th className="px-3 py-2.5">Giai đoạn</th><th className="px-3 py-2.5">Hệ thống tự làm</th><th className="px-3 py-2.5">Bạn cần làm</th><th className="px-3 py-2.5">Thao tác trên trang này</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.key} className="border-b border-steel-100/90 align-top last:border-0">
                    <td className="w-44 px-3 py-3">
                      <span className="flex items-center gap-2 font-semibold text-ink-950"><span className={cn('size-2.5 rounded-full', DOT[r.tone])} />{r.title}</span>
                      <span className="mt-1 block text-xs text-steel-500">{r.when}</span>
                      <Badge tone="neutral" className="mt-1.5">{r.who}</Badge>
                    </td>
                    <td className="px-3 py-3"><ul className="list-disc space-y-1 pl-4 text-steel-700">{r.auto.map((t, i) => <li key={i}>{t}</li>)}</ul></td>
                    <td className="px-3 py-3"><ul className="list-disc space-y-1 pl-4 text-ink-900">{r.todo.map((t, i) => <li key={i}>{t}</li>)}</ul></td>
                    <td className="px-3 py-3"><div className="flex flex-wrap gap-1.5">{r.actions.map((a) => <span key={a} className="rounded-md border border-steel-300 bg-white px-2 py-0.5 text-xs font-semibold text-ink-900">{a}</span>)}</div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid gap-3 text-[13px] text-steel-700 md:grid-cols-2">
            <div className="rounded-xl border hairline bg-paper p-3">
              <p className="mb-1 font-bold text-ink-950">Quy tắc cần nhớ</p>
              <ul className="list-disc space-y-1 pl-4">
                <li><b>Khách trả đủ</b> (kể cả phí trễ và phí khóa) thì hợp đồng tự về "Đúng hạn" và mã ra vào được mở lại. Nếu kho đã khóa chặn, nhân viên phải ra tháo khóa (hệ thống tạo sẵn việc).</li>
                <li><b>Dư nợ</b> là tổng các hóa đơn chưa trả; <b>số ngày quá hạn</b> tính từ hóa đơn cũ nhất. Bấm vào một dòng để xem từng khoản.</li>
                <li>Mỗi hợp đồng chạy theo <b>chính sách lúc ký</b>, nên mốc ngày của hợp đồng cũ có thể khác bảng trên. Đổi chính sách chỉ ảnh hưởng hợp đồng ký mới.</li>
              </ul>
            </div>
            <div className="rounded-xl border hairline bg-paper p-3">
              <p className="mb-1 font-bold text-ink-950">Ai được làm gì</p>
              <ul className="list-disc space-y-1 pl-4">
                <li><b>Nhân viên cơ sở:</b> ghi nhận liên hệ, đặt và gỡ khóa chặn tại kho (xem việc ở mục Nhiệm vụ).</li>
                <li><b>Quản lý cơ sở:</b> tất cả việc của nhân viên, cộng thêm ghi "Hẹn trả", đề xuất thu hồi, xác nhận thu hồi (Bước 1), kiểm kê tài sản (Bước 3).</li>
                <li><b>Quản lý vận hành (BOM):</b> duyệt hoặc từ chối thu hồi (Bước 2), quyết định xử lý tài sản (Bước 4). Xem toàn hệ thống.</li>
                <li>Mọi thao tác đều được ghi vào nhật ký kiểm toán.</li>
              </ul>
            </div>
          </div>
          </div>
        </Card>
      )}
    </div>
  );
}
