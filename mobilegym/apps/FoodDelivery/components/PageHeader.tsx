import { ArrowLeft, ShoppingBag } from 'lucide-react';
import { useFoodDeliveryGestures } from '../hooks/useFoodDeliveryGestures';
import { useFoodDeliveryStore } from '../state';
import { useFoodDeliveryStrings } from '../hooks/useFoodDeliveryStrings';

export function PageHeader({ title, showCart = false }: { title: string; showCart?: boolean }) {
  const { bindBack, bindTap } = useFoodDeliveryGestures();
  const count = useFoodDeliveryStore(state => state.cart.reduce((sum, line) => sum + line.quantity, 0));
  const s = useFoodDeliveryStrings();
  return (
    <header className="h-12 px-4 flex items-center justify-between bg-white border-b border-[#F0F0F3] sticky top-0 z-20">
      <button aria-label={s.common_back} className="w-9 h-9 -ml-2 grid place-items-center" {...bindBack<HTMLButtonElement>()}>
        <ArrowLeft size={21} />
      </button>
      <h1 className="text-[17px] font-semibold text-[#202126]">{title}</h1>
      {showCart ? (
        <button aria-label={s.cart_title} className="relative w-9 h-9 grid place-items-center" {...bindTap<HTMLButtonElement>('fooddelivery.merchant.openCart')}>
          <ShoppingBag size={21} />
          {count > 0 && <span className="absolute top-0 right-0 min-w-4 h-4 px-1 rounded-full bg-[#FF4D72] text-white text-[10px] grid place-items-center">{count}</span>}
        </button>
      ) : <span className="w-9" />}
    </header>
  );
}

export function formatMoney(cents: number) {
  return `¥${(cents / 100).toFixed(2)}`;
}

