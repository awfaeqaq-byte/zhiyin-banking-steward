import { ChevronRight, Minus, Plus, ShoppingBasket, Store } from 'lucide-react';
import { productImage } from '../assets';
import { PageHeader, formatMoney } from '../components/PageHeader';
import { FOOD_DELIVERY_CONFIG } from '../data';
import { useFoodDeliveryGestures } from '../hooks/useFoodDeliveryGestures';
import { calculateCart } from '../orderModel';
import { useFoodDeliveryStore } from '../state';

export function CartPage() {
  const cart = useFoodDeliveryStore(state => state.cart);
  const changeQuantity = useFoodDeliveryStore(state => state.changeQuantity);
  const { bindAction, bindTap } = useFoodDeliveryGestures();
  const merchant = FOOD_DELIVERY_CONFIG.merchant;
  const totals = calculateCart(cart, { deliveryFee: merchant.deliveryFee, discount: merchant.discount });
  return <main data-status-bar-foreground="dark" className="min-h-full pt-10 pb-24 bg-[#f4f5f7] text-[#202126]"><PageHeader title="购物车" />
    <div className="px-3 pt-3">
      {cart.length === 0 ? <div className="mt-28 text-center"><ShoppingBasket size={68} strokeWidth={1.2} className="mx-auto text-[#c8c9ce]" /><h2 className="mt-5 font-bold">购物车还是空的</h2><p className="mt-2 text-[12px] text-[#9698a0]">去选点好吃的吧</p></div> : <>
        <section className="bg-white rounded-[18px] overflow-hidden"><div className="h-12 px-4 flex items-center gap-2 border-b border-[#f1f1f2]"><span className="w-7 h-7 rounded-full bg-[#fff0f4] text-[#ff2d55] grid place-items-center"><Store size={15} /></span><h2 className="font-extrabold text-[14px]">{merchant.name}</h2><ChevronRight size={15} className="text-[#aaa]" /><span className="ml-auto text-[10px] text-[#ff2d55]">已享满减</span></div>
          <div className="px-3">{cart.map(line => <article key={line.dishId} className="py-3 flex gap-3 border-b last:border-0 border-[#f2f2f3]"><img src={productImage(line.dishId)} alt="" className="w-[64px] h-[64px] rounded-[10px] object-cover" /><div className="min-w-0 flex-1"><h3 className="text-[13px] font-bold truncate">{line.dishName}</h3><p className="mt-1 text-[9px] text-[#999]">标准份 · 不辣 · 无需餐具</p><strong className="block mt-2 text-[#ff2d55] text-[15px]">{formatMoney(line.unitPrice)}</strong></div><div className="self-end mb-0.5 flex items-center gap-2"><button aria-label="减少" className="w-7 h-7 rounded-full border border-[#ddd] grid place-items-center" {...bindAction<HTMLButtonElement>('fooddelivery.cart.item.decrease', { productId: line.dishId }, () => changeQuantity(line.dishId, -1))}><Minus size={13} /></button><span className="w-3 text-center text-[12px]">{line.quantity}</span><button aria-label="增加" className="w-7 h-7 rounded-full bg-[#ff2d55] text-white grid place-items-center" {...bindAction<HTMLButtonElement>('fooddelivery.cart.item.increase', { productId: line.dishId }, () => changeQuantity(line.dishId, 1))}><Plus size={13} /></button></div></article>)}</div>
        </section>
        <section className="mt-3 bg-white rounded-[18px] px-4 divide-y divide-[#f2f2f3] text-[13px]"><div className="h-12 flex items-center justify-between"><span>餐具份数</span><span className="text-[#777]">无需餐具，助力环保 <ChevronRight size={14} className="inline" /></span></div><div className="h-12 flex items-center justify-between"><span>打包费</span><span>¥0</span></div><div className="h-12 flex items-center justify-between"><span>优惠券</span><span className="text-[#ff2d55]">已减5元 <ChevronRight size={14} className="inline" /></span></div></section>
        <section className="mt-3 bg-white rounded-[18px] p-4"><div className="flex justify-between text-[13px]"><span>商品小计</span><span>{formatMoney(totals.itemTotal)}</span></div><div className="mt-3 flex justify-between text-[13px]"><span>配送费</span><span>{formatMoney(totals.deliveryFee)}</span></div><div className="mt-3 flex justify-between text-[13px]"><span>满减优惠</span><span className="text-[#ff2d55]">-{formatMoney(totals.discount)}</span></div><div className="mt-4 pt-3 border-t border-[#f2f2f3] text-right text-[12px]">已优惠 <span className="text-[#ff2d55]">{formatMoney(totals.discount)}</span>　合计 <strong className="text-[19px]">{formatMoney(totals.payable)}</strong></div></section>
      </>}
    </div>
    {cart.length > 0 && <div className="fixed bottom-4 left-3 right-3 h-[58px] pl-5 pr-1.5 rounded-full bg-[#24252a] flex items-center text-white shadow-[0_10px_30px_rgba(0,0,0,.24)]"><span className="text-[10px] text-white/65">合计</span><strong className="ml-2 text-[20px]">{formatMoney(totals.payable)}</strong><span className="ml-1 text-[9px] text-white/50">已减¥5</span><button className="ml-auto h-[46px] px-7 rounded-full bg-[#ff2d55] text-[13px] font-bold" {...bindTap<HTMLButtonElement>('fooddelivery.cart.openCheckout')}>去结算</button></div>}
  </main>;
}
