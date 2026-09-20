"""Flow 1 - Đặt kho (swimlane) for the slides: python docs/slides/make_flow1.py"""
import os
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch, Polygon, Rectangle

OUT = os.path.dirname(os.path.abspath(__file__))
INK = '#0E1B2C'; NAVY = '#1F3A5F'; BRASS = '#B0802A'; STEEL = '#64748B'
RED = '#B3362B'; VIO = '#6D28D9'

fig, ax = plt.subplots(figsize=(23, 11), dpi=150)
ax.set_xlim(0, 232); ax.set_ylim(0, 110); ax.axis('off')

for name, y, h, c in [('KHÁCH THUÊ', 70, 36, '#FEF3C7'), ('HỆ THỐNG VAULTRA', 34, 36, '#E0F2FE'), ('VNPAY', 4, 28, '#EDE9FE')]:
    ax.add_patch(Rectangle((2, y), 228, h, fc=c, ec=INK, lw=1.2, alpha=.55))
    ax.add_patch(Rectangle((2, y), 11, h, fc=NAVY, ec=INK, lw=1.2))
    ax.text(7.5, y + h / 2, name, rotation=90, ha='center', va='center', color='white', fontsize=12, fontweight='bold')
ax.text(116, 108, 'FLOW 1 — ĐẶT KHO (STORAGE UNIT RESERVATION & PAYMENT)', ha='center', fontsize=19, fontweight='bold', color=INK)

BH = 15


def box(x, y, text, num, fc='white', ec=NAVY, w=26, h=BH, size=9.6):
    ax.add_patch(FancyBboxPatch((x - w / 2, y - h / 2), w, h, boxstyle='round,pad=0.3,rounding_size=1.6', fc=fc, ec=ec, lw=1.8, zorder=3))
    ax.text(x, y, text, ha='center', va='center', fontsize=size, color=INK, zorder=4, linespacing=1.35)
    ax.add_patch(plt.Circle((x - w / 2 + 0.3, y + h / 2 - 0.3), 2.3, fc=BRASS, ec='white', lw=1.5, zorder=5))
    ax.text(x - w / 2 + 0.3, y + h / 2 - 0.3, str(num), ha='center', va='center', color='white', fontsize=10, fontweight='bold', zorder=6)
    return (x, y, w, h)


def diamond(x, y, text, w=24, h=18):
    ax.add_patch(Polygon([(x, y + h / 2), (x + w / 2, y), (x, y - h / 2), (x - w / 2, y)], fc='#FFF7E0', ec=BRASS, lw=2, zorder=3))
    ax.text(x, y, text, ha='center', va='center', fontsize=9.2, color=INK, fontweight='bold', zorder=4, linespacing=1.3)
    return (x, y, w, h)


def arrow(p, q, label=None, color=INK, style='-|>', rad=0.0, lx=0, ly=0, fs=8.8):
    ax.annotate('', xy=q, xytext=p, arrowprops=dict(arrowstyle=style, color=color, lw=1.8, connectionstyle=f'arc3,rad={rad}'), zorder=2)
    if label:
        ax.text((p[0] + q[0]) / 2 + lx, (p[1] + q[1]) / 2 + ly, label, ha='center', va='center', fontsize=fs, color=color, fontweight='bold',
                bbox=dict(fc='white', ec='none', pad=1.2, alpha=.92), zorder=6)


def R(b): return (b[0] + b[2] / 2, b[1])
def L(b): return (b[0] - b[2] / 2, b[1])
def T(b): return (b[0], b[1] + b[3] / 2)
def B(b): return (b[0], b[1] - b[3] / 2)


yK, yS, yV = 88, 52, 18
b1 = box(28, yK, 'Chọn cơ sở và loại kho\n(xem lịch trống 8 tuần tới)', 1)
b2 = box(60, yK, 'Chọn ngày bắt đầu,\nthời hạn 1/3/6/12 tháng,\nmã khuyến mãi', 2)
b3 = box(60, yS, 'Tính báo giá:\ntiền thuê, phí quản trị,\ncọc, VAT, khuyến mãi', 3, fc='#F0F7FF', w=28)
b4 = box(94, yK, 'Chọn ngày hẹn nhận kho\nvà khung giờ;\nđồng ý điều khoản', 4)
b5 = box(94, yS, 'Khóa kho theo loại kho,\ntạo đơn "Chờ thanh toán",\ngiữ chỗ 15 phút', 5, fc='#F0F7FF', w=30)
b6 = box(128, yK, 'Chọn thanh toán\ntrực tuyến VNPay\n(hoặc thanh toán tại quầy)', 6, w=28)
b7 = box(128, yV, 'Khách thanh toán\nbằng thẻ / QR\ntrên cổng VNPay', 7, fc='#F5F0FF', ec=VIO)
b8 = box(154, yS, 'Nhận IPN: kiểm chữ ký\nHMAC-SHA512, ghi nhận\nđúng một lần', 8, fc='#F0F7FF', w=28)
d9 = diamond(185, yS, 'Thanh toán\nthành công?', w=22)
b9 = box(214, yS, 'Phát hành hóa đơn + cọc,\nđặt lịch hẹn, gửi email\nvà thông báo xác nhận', 9, fc='#F0F7FF', w=26, size=8.6)
b11 = box(214, yK, 'Đơn "Đã xác nhận":\nxem hóa đơn, lịch hẹn,\nmã QR check-in', 11, fc='#FFFBEB', ec=BRASS, w=26)
b10 = box(185, yV, 'Hết 15 phút hoặc thất bại:\nnhả kho, đơn "Hết hạn",\nkhách đặt lại', 10, fc='#FEF2F2', ec=RED, w=32)

arrow(R(b1), L(b2))
arrow(R(b2), L(b4))
arrow(R(b4), L(b6))
ax.annotate('', xy=T(b3), xytext=B(b2), arrowprops=dict(arrowstyle='<|-|>', color=INK, lw=1.8), zorder=2)
ax.text(b2[0] + 1, (T(b3)[1] + B(b2)[1]) / 2, 'yêu cầu giá / trả giá', fontsize=8.8, fontweight='bold', color=INK, va='center',
        bbox=dict(fc='white', ec='none', pad=1.2, alpha=.92), zorder=6)
arrow(B(b4), T(b5), 'tạo đơn')
arrow(R(b3), L(b5))
arrow(B(b6), T(b7), 'chuyển sang cổng\nthanh toán')
arrow(R(b7), B(b8), 'kết quả (IPN)', color=VIO, rad=0.28, lx=-4, ly=-1)
arrow(R(b8), L(d9))
arrow(R(d9), L(b9), 'có', color=BRASS, ly=2.5)
arrow(T(b9), B(b11))
arrow(B(d9), T(b10), 'không', color=RED, lx=3)

ax.text(116, 1.5, 'Điểm nhấn: giữ chỗ 15 phút, tối đa 3 đơn chờ thanh toán mỗi khách; 100 yêu cầu đồng thời cho kho cuối cùng chỉ 1 thành công; '
        'nút bấm đúp không tạo đơn trùng (Idempotency-Key).', ha='center', fontsize=10, color=STEEL, style='italic')
plt.savefig(os.path.join(OUT, 'flow1-dat-kho.png'), bbox_inches='tight', facecolor='white')
print('ok')
