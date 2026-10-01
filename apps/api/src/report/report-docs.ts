import { METRIC_DOCS as M } from '@vaultra/shared';

export interface ReportColumn {
  key: string;
  label: string;
  type?: 'money' | 'pct' | 'int' | 'date' | 'text';
  /** Hover explanation shown next to the column title. */
  help?: string;
  /** `sum`: the bottom row adds this column up. Columns that cannot be added meaningfully (rates, days, dates) have none. */
  total?: 'sum';
}

interface Doc {
  description: string;
  notes?: string[];
  columns: Record<string, string>;
  /** Columns whose values are added up in the bottom row. */
  sums?: string[];
}

/** What each report is, how every number in it is worked out, and which columns add up. Shown as (i) tips and sent with the report. */
export const REPORT_DOCS: Record<string, Doc> = {
  occupancy: {
    description: 'Tỷ lệ lấp đầy của từng cơ sở tại cuối mỗi kỳ: bao nhiêu kho đang có khách, chiếm bao nhiêu diện tích và bao nhiêu tiền thuê so với khả năng khai thác.',
    notes: [
      'Chỉ gồm cơ sở đang khai thác (hoạt động hoặc tạm đóng). Cơ sở ngưng hoạt động không có kho để cho thuê nên không tính.',
      'Kỳ hiện tại dùng số liệu trực tiếp ngay lúc bạn xem. Kỳ trước dùng ảnh chụp cuối cùng hệ thống đã lưu trong kỳ đó, kỳ nào chưa có ảnh chụp thì không hiện dòng.',
      'Dòng Tổng cộng cộng số kho, diện tích và tiền thuê của các cơ sở trong kỳ mới nhất rồi chia lại, nên bằng đúng tỷ lệ lấp đầy toàn hệ thống trên trang Tổng quan.',
      'Ô "Theo trạng thái kho" phía trên luôn là tình trạng kho ngay lúc này, không phụ thuộc khoảng ngày.',
    ],
    columns: {
      period: 'Kỳ của số liệu: theo tháng, ngày hoặc năm tùy mục "Nhóm theo".',
      facility: 'Cơ sở. Dòng Tổng cộng gộp tất cả cơ sở của kỳ mới nhất.',
      asOf: M['occ.asOf'],
      units: M['occ.rentable'],
      occupied: M['occ.occupied'],
      unitRate: M['occ.unit'],
      areaRate: M['occ.area'],
      economicRate: M['occ.economic'],
    },
  },
  revenue: {
    description: 'Tiền phát hành, tiền thực thu, doanh thu ghi nhận và tiền hoàn của từng cơ sở theo từng kỳ.',
    notes: [
      'Mỗi con số là tổng của các dòng bên dưới, nên ô tổng và bảng luôn khớp nhau.',
      'Thực thu là dòng tiền (gồm cả tiền cọc và tiền đặt trước) nên có thể lớn hơn Phát hành. Doanh thu ghi nhận chỉ tính phần tiền thuê của những ngày đã qua.',
      'Cơ sở không có số tiền nào trong kỳ thì không hiện dòng.',
    ],
    columns: { period: 'Kỳ: theo tháng, ngày hoặc năm tùy mục "Nhóm theo".', facility: 'Cơ sở.', billed: M['rev.billed'], collected: M['rev.collected'], recognized: M['rev.recognized'], refunded: M['rev.refunded'] },
    sums: ['billed', 'collected', 'recognized', 'refunded'],
  },
  'rent-roll': {
    description: 'Danh sách tất cả hợp đồng đang chạy, kèm giá thuê và số tiền còn nợ. Là ảnh chụp ngay lúc xem, không phụ thuộc khoảng ngày.',
    columns: {
      facility: 'Cơ sở.',
      unit: 'Mã kho đang được thuê.',
      unitType: 'Loại kho theo kích thước.',
      contract: 'Mã hợp đồng.',
      customer: 'Khách thuê.',
      phone: 'Số điện thoại khách (BOM xem số đã che bớt).',
      rent: 'Giá thuê một tháng ghi trên hợp đồng.',
      start: 'Ngày bắt đầu thuê.',
      end: 'Ngày cuối cùng của kỳ thuê hiện tại. "Cuốn chiếu" là hợp đồng thuê tiếp theo tháng, không có kỳ hạn.',
      status: 'Trạng thái hợp đồng: đang thuê, đã báo trả kho hoặc hết hạn.',
      delinquency: 'Giai đoạn xử lý nợ của hợp đồng. "Đúng hạn" nghĩa là không có hóa đơn quá hạn.',
      balance: 'Tổng tiền còn nợ của các hóa đơn chưa trả hết của hợp đồng này (đã trừ phần đã trả và phần ghi có).',
    },
    sums: ['rent', 'balance'],
  },
  'receivables-aging': {
    description: 'Số tiền khách còn nợ, chia theo số ngày đã quá hạn, mỗi dòng là một khách tại một cơ sở. Là ảnh chụp ngay lúc xem.',
    notes: ['Chỉ tính hóa đơn chưa trả hết. Số tiền là phần còn nợ sau khi trừ phần đã trả và phần ghi có.', 'Tỷ lệ nợ quá hạn ở ô trên = nợ quá hạn ÷ tổng còn nợ, luôn từ 0% đến 100%.'],
    columns: {
      facility: 'Cơ sở có hóa đơn.',
      customer: 'Khách đang nợ.',
      email: 'Email khách (BOM xem email đã che bớt).',
      current: M['ar.current'],
      d0_30: M['ar.d0_30'],
      d31_60: M['ar.d31_60'],
      d61_90: M['ar.d61_90'],
      d90_plus: M['ar.d90_plus'],
      total: 'Tổng còn nợ của khách này tại cơ sở, gồm cả chưa đến hạn.',
    },
    sums: ['current', 'd0_30', 'd31_60', 'd61_90', 'd90_plus', 'total'],
  },
};

/** Adds the hover explanations and the "adds up" flags to a freshly built report. */
export function decorateReport<T extends { columns: ReportColumn[] }>(code: string, t: T): T & { description?: string; notes?: string[] } {
  const doc = REPORT_DOCS[code];
  if (!doc) return t;
  return {
    ...t,
    description: doc.description,
    notes: doc.notes,
    columns: t.columns.map((c) => ({ ...c, help: doc.columns[c.key] ?? c.help, ...(doc.sums?.includes(c.key) ? { total: 'sum' as const } : {}) })),
  };
}
