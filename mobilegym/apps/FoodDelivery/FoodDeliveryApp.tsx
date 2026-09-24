import React, { useCallback, useEffect, useRef } from 'react';
import { MemoryRouter, Navigate, Route, Routes, UNSAFE_NavigationContext, useLocation, useNavigate } from 'react-router-dom';
import { useAppNavigationHandler } from '../../os/hooks/useAppNavigationHandler';
import { HomePage } from './pages/HomePage';
import { MerchantPage } from './pages/MerchantPage';
import { CartPage } from './pages/CartPage';
import { CheckoutPage } from './pages/CheckoutPage';
import { PaymentPage } from './pages/PaymentPage';
import { OrderTrackingPage } from './pages/OrderTrackingPage';

function NavigationHandler() {
  const navigate = useNavigate();
  const { navigator } = React.useContext(UNSAFE_NavigationContext);
  const onBack = useCallback(() => {
    const index = (navigator as { index?: number }).index ?? 0;
    if (index <= 0) return false;
    navigate(-1);
    return true;
  }, [navigate, navigator]);
  useAppNavigationHandler('fooddelivery', { onBack });
  return null;
}

export default function FoodDeliveryApp() {
  return <div className="h-full w-full bg-[#F7F7F9] text-[#202126] overflow-hidden">
    <MemoryRouter initialEntries={['/']}>
      <NavigationHandler />
      <AppRoutes />
    </MemoryRouter>
  </div>;
}

function AppRoutes() {
  const location = useLocation();
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [location.pathname]);
  return <div ref={scrollRef} data-scroll-container="main" data-scroll-direction="vertical" className="h-full overflow-y-auto no-scrollbar">
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/merchant/:merchantId" element={<MerchantPage />} />
      <Route path="/cart" element={<CartPage />} />
      <Route path="/checkout" element={<CheckoutPage />} />
      <Route path="/payment" element={<PaymentPage />} />
      <Route path="/orders/:orderId" element={<OrderTrackingPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  </div>;
}
