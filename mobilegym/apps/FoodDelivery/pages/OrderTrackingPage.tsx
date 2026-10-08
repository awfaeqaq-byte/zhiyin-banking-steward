import { useRef, useState } from 'react';
import { Bike, Check, ChevronRight, Gift, LoaderCircle, MapPin, Phone, RotateCcw, Store } from 'lucide-react';
import { useParams } from 'react-router-dom';
import { FOOD_ASSETS, productImage } from '../assets';
import { PageHeader, formatMoney } from '../components/PageHeader';
import { useFoodDeliveryGestures } from '../hooks/useFoodDeliveryGestures';
import { getOrderPaymentDisplay, type OrderStatus } from '../orderModel';
import { getFoodDeliveryPaymentBackend, getFoodDeliveryPaymentMethodLabel } from '../payments/backend';
import { useFoodDeliveryStore } from '../state';
import {useFoodDeliveryStrings} from '../hooks/useFoodDeliveryStrings';

const PROGRESS: OrderStatus[] = ['PAID', 'ACCEPTED', 'PREPARING', 'READY_FOR_DELIVERY', 'DELIVERY_ASSIGNED', 'DELIVERING', 'COMPLETED'];
const LABELS: Partial<Record<OrderStatus, string>> = { PENDING_PAYMENT: '待支付', PAID: '商家已接单', ACCEPTED: '商家已接单', PREPARING: '商家备餐中', READY_FOR_DELIVERY: '等待骑手取餐', DELIVERY_ASSIGNED: '骑手赶往商家', DELIVERING: '骑手配送中', COMPLETED: '订单已送达', REFUNDING: '退款处理中', REFUNDED: '退款已完成', CANCELLED: '订单已取消' };

export function OrderTrackingPage() {
  const s=useFoodDeliveryStrings();
  const { orderId = '' } = useParams();
  const order = useFoodDeliveryStore(state => state.orders.find(item => item.id === orderId));
  const advanceOrder = useFoodDeliveryStore(state => state.advanceOrder);
  const [isRefunding, setIsRefunding] = useState(false);
  const [refundError, setRefundError] = useState('');
  const refundingRef = useRef(false);
  const { bindAction } = useFoodDeliveryGestures();

  const submitRefund = async () => {
    if (!order || refundingRef.current) return;
    refundingRef.current = true;
    setIsRefunding(true);
    setRefundError('');
    try {
      await getFoodDeliveryPaymentBackend().refund(order.id, '用户取消外卖订单');
    } catch (reason) {
      setRefundError(reason instanceof Error ? reason.message : '退款失败，请稍后重试');
    } finally {
      refundingRef.current = false;
      setIsRefunding(false);
    }
  };

  if (!order) return <main data-status-bar-foreground="dark" className="min-h-full pt-10 bg-[#f4f5f7]"><PageHeader title="订单追踪" /><p className="p-8 text-center text-[#888]">没有找到这个订单</p></main>;
  const activeIndex = PROGRESS.indexOf(order.status);
  const canAdvance = ['ACCEPTED', 'PREPARING', 'READY_FOR_DELIVERY', 'DELIVERY_ASSIGNED', 'DELIVERING'].includes(order.status);
  const canRefund = Boolean(order.paymentMethod) && !['PENDING_PAYMENT', 'CANCELLED', 'REFUNDING', 'REFUNDED'].includes(order.status);
  const { paymentLabel, refundLabel } = getOrderPaymentDisplay(order, getFoodDeliveryPaymentMethodLabel(order.paymentMethod), s.funding_bank);

  return <main data-status-bar-foreground="dark" className="min-h-full pt-10 pb-8 bg-[#f4f5f7]"><PageHeader title="订单追踪" />
    {order.occasionId&&<section className="m-3 p-4 bg-white rounded-[16px]"><strong>{s.occasion_review}</strong><p className="text-[12px] mt-1">{s.occasion_delivery} {new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',dateStyle:'medium',timeStyle:'short'}).format(order.deliveryAt)}</p><p className="text-[12px] mt-1">{s.occasion_budget_hint}</p></section>}
    <section className="relative overflow-hidden mx-3 mt-3 rounded-[20px] min-h-[132px] p-5 text-white bg-[linear-gradient(145deg,#ff365f,#ff7188)]"><img src={FOOD_ASSETS.homePoster} alt="" className="absolute right-0 top-0 h-full w-[55%] object-cover object-right opacity-20" /><div className="relative"><p className="text-[10px] text-white/75">{order.occasionId?s.occasion_delivery:'预计 12:35 前送达'}{order.occasionId&&new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',dateStyle:'medium',timeStyle:'short'}).format(order.deliveryAt)}</p><h1 className="mt-1 text-[23px] font-black">{LABELS[order.status]}</h1><p className="mt-3 text-[10px] text-white/85">订单号 {order.id}</p></div></section>
    {order.status === 'REFUNDED' ? <section className="m-3 bg-white rounded-[18px] p-6 text-center"><span className="mx-auto w-12 h-12 rounded-full bg-[#eaf8ef] text-[#45a56a] grid place-items-center"><Check size={25} /></span><h2 className="mt-3 font-bold">退款已完成</h2><p className="mt-1 text-[11px] text-[#666]">{formatMoney(order.payable)} 已原路退回至{refundLabel}</p></section> : <>
      <section className="m-3 bg-white rounded-[18px] p-4"><div className="flex justify-between items-center"><h2 className="font-extrabold text-[14px]">配送进度</h2><span className="text-[10px] text-[#ff2d55]">查看配送详情 <ChevronRight size={12} className="inline" /></span></div><div className="mt-5 flex items-start">{PROGRESS.map((status, index) => <div key={status} className="flex-1 text-center relative"><span className={`mx-auto relative z-10 w-6 h-6 rounded-full grid place-items-center text-[9px] ${index <= activeIndex ? 'bg-[#ff2d55] text-white' : 'bg-[#eee] text-[#aaa]'}`}>{index <= activeIndex ? <Check size={12} /> : index + 1}</span>{index < PROGRESS.length - 1 && <span className={`absolute top-3 left-1/2 w-full h-0.5 ${index < activeIndex ? 'bg-[#ff2d55]' : 'bg-[#eee]'}`} />}</div>)}</div><div className="mt-3 grid grid-cols-4 text-center text-[9px] text-[#888]"><span>已接单</span><span>备餐中</span><span>配送中</span><span>已送达</span></div></section>
      <section className="m-3 bg-white rounded-[18px] overflow-hidden"><div className="h-[138px] relative bg-[#eef3ef]"><div className="absolute inset-0 opacity-60" style={{ backgroundImage: 'linear-gradient(25deg,transparent 45%,#b7cfbe 46%,#b7cfbe 49%,transparent 50%),linear-gradient(155deg,transparent 45%,#dbc9b8 46%,#dbc9b8 49%,transparent 50%)', backgroundSize: '48px 48px' }} /><span className="absolute left-8 top-8 w-8 h-8 rounded-full bg-white text-[#555] shadow grid place-items-center"><Store size={16} /></span><span className="absolute right-12 bottom-9 w-9 h-9 rounded-full bg-[#ff2d55] text-white shadow grid place-items-center"><Bike size={19} /></span><span className="absolute right-5 top-5 text-[#ff2d55]"><MapPin size={21} fill="currentColor" /></span><svg className="absolute inset-0 w-full h-full pointer-events-none"><path d="M55 48 C120 90, 210 20, 300 95" fill="none" stroke="#ff2d55" strokeWidth="3" strokeDasharray="6 6" /></svg></div><div className="p-4 flex items-center"><span className="w-10 h-10 rounded-full bg-[#fff0f4] text-[#ff2d55] grid place-items-center"><Bike size={20} /></span><div className="ml-3"><div className="text-[10px] text-[#888]">配送员</div><div className="mt-0.5 text-[13px] font-bold">{order.rider.name}　{order.rider.phone}</div></div><button aria-label="联系骑手" className="ml-auto w-10 h-10 rounded-full border border-[#eee] text-[#ff2d55] grid place-items-center"><Phone size={17} /></button></div></section>
    </>}
    <section className="mx-3 bg-white rounded-[18px] overflow-hidden"><div className="h-12 px-4 flex items-center font-extrabold text-[14px] border-b border-[#f2f2f3]">{order.lines[0]?.storeName ?? '好食送外卖'}</div><div className="px-4">{order.lines.slice(0, 3).map(line => <div key={line.dishId} className="py-3 flex items-center gap-3">{order.occasionId?<span className="w-10 h-10 rounded-lg bg-[#edf6f4] text-[#206a70] grid place-items-center"><Gift size={22} aria-hidden="true"/></span>:<img src={productImage(line.dishId)} alt="" className="w-10 h-10 rounded-lg object-cover" />}<span className="flex-1 min-w-0 truncate text-[11px]">{line.dishName}　x{line.quantity}</span><span className="text-[11px]">{formatMoney(line.unitPrice * line.quantity)}</span></div>)}</div><div className="px-4 py-3 border-t border-[#f2f2f3] space-y-2 text-[12px]"><div className="flex justify-between"><span className="text-[#777]">支付方式</span><span>{paymentLabel}</span></div><div className="flex justify-between items-end"><span className="text-[#777]">实付</span><strong className="text-[16px]">{formatMoney(order.payable)}</strong></div></div></section>
    {refundError && <p role="alert" className="mx-3 mt-3 rounded-[12px] bg-[#fff0f3] px-3 py-2.5 text-[12px] text-[#c92d4b]">{refundError}</p>}
    <div className="px-3 mt-3 flex gap-2">{canAdvance && <button className="flex-1 h-11 rounded-full bg-[#24252a] text-white text-[12px] font-bold" {...bindAction<HTMLButtonElement>('fooddelivery.order.status.advance', {}, () => advanceOrder(order.id))}>模拟下一阶段</button>}{canRefund && <button disabled={isRefunding} aria-busy={isRefunding} className="flex-1 h-11 rounded-full border border-[#ff9cb0] text-[#d93658] text-[12px] flex items-center justify-center gap-1 disabled:opacity-50" {...bindAction<HTMLButtonElement>('fooddelivery.order.refund.submit', {}, () => { void submitRefund(); })}>{isRefunding ? <LoaderCircle size={14} className="animate-spin" /> : <RotateCcw size={14} />}{isRefunding ? '正在退款' : '申请退款'}</button>}</div>
  </main>;
}
