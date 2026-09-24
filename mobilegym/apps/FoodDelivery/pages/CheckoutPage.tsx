import { ChevronRight, Clock3, FileText, MapPin, ShieldCheck } from 'lucide-react';
import { productImage } from '../assets';
import { PageHeader, formatMoney } from '../components/PageHeader';
import { FOOD_DELIVERY_CONFIG } from '../data';
import { useFoodDeliveryGestures } from '../hooks/useFoodDeliveryGestures';
import { calculateCart } from '../orderModel';
import { useFoodDeliveryStore } from '../state';

export function CheckoutPage() {
  const cart = useFoodDeliveryStore(state => state.cart);
  const placeOrder = useFoodDeliveryStore(state => state.placeOrder);
  const { bindTap, go } = useFoodDeliveryGestures();
  const { merchant, user } = FOOD_DELIVERY_CONFIG;
  const totals = calculateCart(cart, { deliveryFee: merchant.deliveryFee, discount: merchant.discount });
  const submit = () => { if (!cart.length) return; const orderId = placeOrder(); go('fooddelivery.checkout.submit', { orderId }); };
  return <main data-status-bar-foreground="dark" className="min-h-full pt-10 pb-24 bg-[#f4f5f7]"><PageHeader title="确认订单" />
    <div className="px-3 pt-3 space-y-3">
      <section className="relative overflow-hidden bg-white rounded-[18px] p-4"><div className="absolute left-0 top-0 bottom-0 w-1 bg-[repeating-linear-gradient(0deg,#ff2d55_0_8px,white_8px_12px,#5ca6ff_12px_20px,white_20px_24px)]" /><div className="flex items-center text-[11px] text-[#888]"><MapPin size={15} className="mr-1 text-[#ff2d55]" />配送至 <span className="ml-auto text-[#ff2d55]">修改地址</span><ChevronRight size={14} className="text-[#aaa]" /></div><h2 className="mt-2 text-[17px] font-black leading-6">{user.address}</h2><p className="mt-1 text-[11px] text-[#777]">{user.name}　{user.phone}</p></section>
      <section className="bg-white rounded-[18px] px-4"><div className="h-14 flex items-center"><Clock3 size={17} className="mr-2 text-[#ff2d55]" /><span className="text-[13px] font-bold">送达时间</span><div className="ml-auto text-right"><div className="text-[#ff2d55] text-[13px] font-bold">尽快送达</div><div className="text-[9px] text-[#999]">预计 12:20–12:35</div></div><ChevronRight size={14} className="ml-1 text-[#aaa]" /></div><div className="h-14 flex items-center border-t border-[#f2f2f3]"><ShieldCheck size={17} className="mr-2 text-[#ff2d55]" /><span className="text-[13px]">准时宝</span><span className="ml-auto text-[10px] text-[#777]">超时自动赔付</span><ChevronRight size={14} className="ml-1 text-[#aaa]" /></div></section>
      <section className="bg-white rounded-[18px] overflow-hidden"><h2 className="h-12 px-4 flex items-center font-extrabold text-[14px] border-b border-[#f2f2f3]">{merchant.name}</h2><div className="px-4">{cart.map(line => <div key={line.dishId} className="py-3 flex items-center gap-3 border-b border-[#f2f2f3]"><img src={productImage(line.dishId)} alt="" className="w-11 h-11 rounded-lg object-cover" /><div className="flex-1 min-w-0"><div className="truncate text-[12px] font-medium">{line.dishName}</div><div className="mt-1 text-[10px] text-[#999]">x{line.quantity}</div></div><span className="text-[12px]">{formatMoney(line.unitPrice * line.quantity)}</span></div>)}</div><div className="px-4 py-3 space-y-3 text-[12px]"><div className="flex justify-between"><span>配送费</span><span>{formatMoney(totals.deliveryFee)}</span></div><div className="flex justify-between"><span>店铺满减</span><span className="text-[#ff2d55]">-{formatMoney(totals.discount)}</span></div><div className="pt-3 border-t border-[#f2f2f3] text-right">已优惠 <span className="text-[#ff2d55]">{formatMoney(totals.discount)}</span>　小计 <strong className="text-[17px]">{formatMoney(totals.payable)}</strong></div></div></section>
      <section className="bg-white rounded-[18px] px-4 divide-y divide-[#f2f2f3] text-[13px]"><div className="h-12 flex items-center"><span>支付方式</span><span className="ml-auto text-[#777]">在线支付</span><ChevronRight size={14} className="text-[#aaa]" /></div><div className="h-12 flex items-center"><FileText size={16} className="mr-2 text-[#ff2d55]" /><span>订单备注</span><span className="ml-auto text-[10px] text-[#999]">放前台，无需餐具</span><ChevronRight size={14} className="text-[#aaa]" /></div></section>
    </div>
    {cart.length > 0 && <div className="fixed bottom-4 left-3 right-3 h-[58px] rounded-full bg-[#24252a] text-white pl-5 pr-1.5 flex items-center shadow-[0_10px_30px_rgba(0,0,0,.24)]"><span className="text-[10px] text-white/65">合计</span><strong className="ml-2 text-[20px]">{formatMoney(totals.payable)}</strong><button className="ml-auto h-[46px] px-6 rounded-full bg-[#ff2d55] text-[13px] font-bold" {...bindTap<HTMLButtonElement>('fooddelivery.checkout.submit', { onTrigger: submit })}>提交订单</button></div>}
  </main>;
}
