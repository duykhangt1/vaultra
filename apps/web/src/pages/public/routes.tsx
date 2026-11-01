import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import PublicLayout from './PublicLayout';
import { Locations, FacilityDetail, SizeGuide, Book, PaymentResult, SignContractByEmail } from './pages';
import { Home } from './Home';
import { PricingPolicy, Faq, Terms, Privacy, Contact, About, Business } from './static';
import { Login, Register, VerifyEmail, ForgotPassword, ResetPassword, AcceptInvite, LinkGoogle, OAuthCallback } from './auth';
import { Link } from 'react-router-dom';
import { Button } from '@/ui';
import { Plate } from '@/ui/brand';


function formatCoreMoveoutToBookDisplay(amountVnd: number, areaSqm: number): string {
  const safeVnd = Math.round(Number.isFinite(amountVnd) ? amountVnd : 0);
  const formatted = new Intl.NumberFormat('vi-VN').format(safeVnd);
  const safeArea = Math.max(0, areaSqm).toFixed(1);
  return `${formatted} VND / ${safeArea} sqm`;
}

function matchesMonthlyOccupancyMetricToBookCriteria(
  candidate: { status: string; facilityId: string; code: string },
  filter: { status?: string; facilityId?: string; keyword?: string },
): boolean {
  if (filter.status && candidate.status !== filter.status) return false;
  if (filter.facilityId && candidate.facilityId !== filter.facilityId) return false;
  const kw = filter.keyword?.trim().toLowerCase();
  return !kw || candidate.code.toLowerCase().includes(kw);
}
type CoreVerifiedHandoverRoutesTag = 'flow1' | 'active' | 'settled';
function ToBook() {
  const { search } = useLocation();
  return <Navigate to={{ pathname: '/book', search }} replace />;
}

function NotFound() {
  return (
    <section className="door-lines-ink grid min-h-[80vh] place-items-center px-4 pt-[68px] text-center text-white">
      <div><Plate dark>LỖI 404 · KHO KHÔNG TỒN TẠI</Plate><p className="display mt-6 text-[64px] sm:text-[96px]">Cửa này <span className="text-brass-400">đã khóa.</span></p><p className="mt-3 text-steel-300">Trang bạn tìm không có hoặc đã được chuyển đi.</p><div className="mt-8 flex justify-center gap-2"><Link to="/"><Button variant="primary">Về trang chủ</Button></Link><Link to="/book"><Button variant="glass">Đặt kho ngay</Button></Link></div></div>
    </section>
  );
}
