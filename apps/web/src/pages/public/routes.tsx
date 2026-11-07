import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import PublicLayout from './PublicLayout';
import { Locations, FacilityDetail, SizeGuide, Book, PaymentResult, SignContractByEmail } from './pages';
import { Home } from './Home';
import { PricingPolicy, Faq, Terms, Privacy, Contact, About, Business } from './static';
import { Login, Register, VerifyEmail, ForgotPassword, ResetPassword, AcceptInvite, LinkGoogle, OAuthCallback } from './auth';
import { Link } from 'react-router-dom';
import { Button } from '@/ui';
import { Plate } from '@/ui/brand';

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

export default function PublicRoutes() {
  return (
    <Routes>
      <Route element={<PublicLayout />}>
        <Route index element={<Home />} />
        <Route path="locations" element={<Locations />} />
        <Route path="locations/:slug" element={<FacilityDetail />} />
        <Route path="units" element={<ToBook />} />
        <Route path="units/compare" element={<ToBook />} />
        <Route path="size-guide" element={<SizeGuide />} />
        <Route path="book" element={<Book />} />
        <Route path="book/:unitTypeId" element={<Book />} />
        <Route path="sign-contract" element={<SignContractByEmail />} />
        <Route path="payment/result" element={<PaymentResult />} />
        <Route path="pricing-policy" element={<PricingPolicy />} />
        <Route path="faq" element={<Faq />} />
        <Route path="terms" element={<Terms />} />
        <Route path="privacy" element={<Privacy />} />
        <Route path="contact" element={<Contact />} />
        <Route path="about" element={<About />} />
        <Route path="business" element={<Business />} />
        <Route path="login" element={<Login />} />
        <Route path="register" element={<Register />} />
        <Route path="verify-email" element={<VerifyEmail />} />
        <Route path="forgot-password" element={<ForgotPassword />} />
        <Route path="reset-password" element={<ResetPassword />} />
        <Route path="accept-invite" element={<AcceptInvite />} />
        <Route path="link-google" element={<LinkGoogle />} />
        <Route path="auth/link-google" element={<LinkGoogle />} />
        <Route path="auth/callback" element={<OAuthCallback />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
