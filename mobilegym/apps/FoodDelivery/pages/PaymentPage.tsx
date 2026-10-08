import { useRef, useState } from 'react';
import { Check, ChevronRight, CircleDollarSign, LoaderCircle, MessageCircle, ShieldCheck } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { useAlipayStore } from '../../Alipay/state';
import { useWechatStore } from '../../Wechat/state';
import { FOOD_ASSETS } from '../assets';
import { PageHeader, formatMoney } from '../components/PageHeader';
import { useFoodDeliveryGestures } from '../hooks/useFoodDeliveryGestures';
import type { FoodDeliveryPaymentMethod } from '../orderModel';
import { getFoodDeliveryPaymentBackend } from '../payments/backend';
import { useFoodDeliveryStore } from '../state';
import {useFoodDeliveryStrings} from '../hooks/useFoodDeliveryStrings';
import type {FundingSource} from '../payments/bank';

type PaymentOption = {
  method: FoodDeliveryPaymentMethod;
  name: string;
  balanceCents: number;
  accent: string;
  icon: typeof MessageCircle;
};

export function PaymentPage() {
  const s=useFoodDeliveryStrings();
  const [search] = useSearchParams();
  const activeOrderId = useFoodDeliveryStore(state => state.activeOrderId);
  const orderId = search.get('orderId') ?? activeOrderId ?? '';
  const order = useFoodDeliveryStore(state => state.orders.find(item => item.id === orderId));
  const wechatBalanceCents = useWechatStore(state => state.wallet.balanceCents);
  const alipayBalanceCents = useAlipayStore(state => Math.round(state.balance.total * 100));
  const [chosenMethod, setMethod] = useState<FoodDeliveryPaymentMethod>('wechat_pay');
  const method=order?.pendingBankMethod??chosenMethod;
  const [chosenFunding,setFunding]=useState<FundingSource>('balance');
  const fundingSource=order?.pendingBankMethod||order?.occasionId?'bank_8888':chosenFunding;
  const [isPaying, setIsPaying] = useState(false);
  const [error, setError] = useState('');
  const payingRef = useRef(false);
  const { bindTap, bindAction, go } = useFoodDeliveryGestures();

  const options: PaymentOption[] = [
    { method: 'wechat_pay', name: '微信支付', balanceCents: wechatBalanceCents, accent: '#07c160', icon: MessageCircle },
    { method: 'alipay', name: '支付宝', balanceCents: alipayBalanceCents, accent: '#1677ff', icon: CircleDollarSign },
  ];
  const selected = options.find(option => option.method === method) ?? options[0];
  const hasEnoughBalance = fundingSource==='bank_8888' || Boolean(order && selected.balanceCents >= order.payable);

  const chooseMethod = (nextMethod: FoodDeliveryPaymentMethod) => {
    if (payingRef.current || order?.pendingBankMethod) return;
    setMethod(nextMethod);
    setError('');
  };

  const pay = async () => {
    if (!order || payingRef.current) return;
    payingRef.current = true;
    setIsPaying(true);
    setError('');
    try {
      await getFoodDeliveryPaymentBackend().pay(order.id, method, undefined, fundingSource);
      go('fooddelivery.payment.complete', { orderId: order.id }, { mode: 'replace' });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '支付失败，请稍后重试');
    } finally {
      payingRef.current = false;
      setIsPaying(false);
    }
  };

  return (
    <main data-status-bar-foreground="dark" className="min-h-full pt-10 pb-28 bg-[#f4f5f7]">
      <PageHeader title="收银台" />
      <section className="relative overflow-hidden bg-[linear-gradient(150deg,#ffe4ea,#fff5f7)] px-4 pt-7 pb-8 text-center">
        <img src={FOOD_ASSETS.homePoster} alt="" className="absolute right-0 top-0 h-full w-[52%] object-cover object-right opacity-30" />
        <div className="relative">
          <p className="text-[11px] text-[#666]">订单待支付</p>
          <div className="mt-1 text-[34px] font-black tracking-tight">{formatMoney(order?.payable ?? 0)}</div>
          <p className="mt-1 text-[10px] text-[#777]">{order?.lines[0]?.storeName ?? '好食送外卖'} · 订单 {orderId || '—'}</p>
        </div>
      </section>

      <div className="px-3 -mt-3 relative z-10">
        <section className="bg-white rounded-[18px] overflow-hidden shadow-[0_6px_24px_rgba(32,33,38,.04)]">
          <h2 className="px-4 pt-4 pb-2 font-extrabold text-[14px]">选择支付方式</h2>
          <div className="px-3 pb-2">
            {options.map((option, index) => {
              const Icon = option.icon;
              const checked = method === option.method;
              const enough = !order || option.balanceCents >= order.payable;
              return (
                <button
                  key={option.method}
                  type="button"
                  aria-pressed={checked}
                  disabled={isPaying || Boolean(order?.pendingBankMethod)}
                  className={`w-full min-h-[72px] px-2 flex items-center text-left rounded-[14px] transition-colors duration-200 disabled:opacity-60 ${checked ? 'bg-[#fff7f9]' : 'bg-white'} ${index === 0 ? 'border-b border-[#f2f2f3]' : ''}`}
                  {...(option.method==='wechat_pay'
                    ?bindAction<HTMLButtonElement>('fooddelivery.payment.method.wechat',{},()=>chooseMethod('wechat_pay'))
                    :bindAction<HTMLButtonElement>('fooddelivery.payment.method.alipay',{},()=>chooseMethod('alipay')))}
                >
                  <span className="w-10 h-10 rounded-[12px] text-white grid place-items-center shadow-sm" style={{ backgroundColor: option.accent }}>
                    <Icon size={21} strokeWidth={2.2} />
                  </span>
                  <span className="ml-3 min-w-0">
                    <span className="block text-[14px] font-bold text-[#202126]">{option.name}</span>
                    <span className={`mt-1 block text-[11px] ${enough ? 'text-[#777]' : 'text-[#d93857]'}`}>
                      {order?.occasionId?s.occasion_channel:<>可用余额 {formatMoney(option.balanceCents)}{enough || fundingSource==='bank_8888' ? '' : ' · 余额不足'}</>}
                    </span>
                  </span>
                  <span
                    aria-hidden="true"
                    className={`ml-auto w-5 h-5 rounded-full grid place-items-center transition-all duration-200 ${checked ? 'bg-[#ff2d55] text-white scale-100' : 'border border-[#c9cbd1] text-transparent scale-95'}`}
                  >
                    <Check size={13} />
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        {order?.occasionId&&<section className="mt-3 bg-white rounded-[16px] p-4"><h2 className="text-[14px] font-bold">{s.occasion_review}</h2><p className="text-[12px] mt-2">{order.lines.map(l=>l.dishName).join('、')}</p><p className="text-[12px] mt-1">{order.address} · {order.contact}</p><p className="text-[12px] mt-1">{s.occasion_delivery} {new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',dateStyle:'medium',timeStyle:'short'}).format(order.deliveryAt)}</p>{order.note&&<p className="text-[12px] mt-1">{order.note}</p>}<p className="text-[11px] mt-2 text-[#666]">{s.occasion_budget_hint}</p></section>}
        <fieldset className="mt-3 bg-white rounded-[16px] p-4" disabled={isPaying || Boolean(order?.pendingBankMethod) || Boolean(order?.occasionId)}>
          <legend className="sr-only">{s.funding_title}</legend>
          <h2 className="text-[14px] font-bold mb-2">{s.funding_title}</h2>
          {!order?.occasionId&&<button type="button" aria-pressed={fundingSource==='balance'} className="min-h-12 w-full flex items-center justify-between text-[14px] disabled:opacity-60" {...bindAction('fooddelivery.payment.funding.select.balance',{},()=>setFunding('balance'))}>
            <span>{s.funding_balance}</span>{fundingSource==='balance'&&<Check size={18} className="text-[#ff2d55]"/>}
          </button>}
          <button type="button" aria-pressed={fundingSource==='bank_8888'} className="min-h-12 w-full flex items-center justify-between text-[14px] border-t border-[#eee] disabled:opacity-60" {...bindAction('fooddelivery.payment.funding.select.bank',{},()=>setFunding('bank_8888'))}>
            <span>{s.funding_bank}</span>{fundingSource==='bank_8888'&&<Check size={18} className="text-[#ff2d55]"/>}
          </button>
          {fundingSource==='bank_8888'&&<p className="text-[12px] leading-5 text-[#666] mt-1">{s.funding_bank_hint}</p>}
          {order?.pendingBankMethod&&<p role="status" className="text-[12px] leading-5 text-[#9b4d5d] mt-2">{s.funding_pending}</p>}
        </fieldset>

        <section className="mt-3 bg-white rounded-[18px] px-4">
          <div className="h-12 flex items-center text-[12px]">
            <span>支付优惠</span>
            <span className="ml-auto text-[#ff2d55]">暂无可用优惠</span>
            <ChevronRight size={14} className="text-[#aaa]" />
          </div>
        </section>

        <div className="mt-4 flex gap-2 items-start px-2 text-[11px] leading-4 text-[#666]">
          <ShieldCheck size={15} className="flex-none text-[#36975a]" />
          支付后会真实扣减沙箱中的余额，并同步写入所选支付应用的账单。
        </div>
        {error && <p role="alert" className="mt-3 mx-2 rounded-[12px] bg-[#fff0f3] px-3 py-2.5 text-[12px] leading-5 text-[#c92d4b]">{error}</p>}
      </div>

      <div className="fixed bottom-5 left-4 right-4 z-20">
        <button
          type="button"
          disabled={!order || isPaying}
          aria-busy={isPaying}
          className="w-full h-[50px] rounded-full bg-[#ff2d55] text-white text-[14px] font-bold shadow-[0_9px_24px_rgba(255,45,85,.25)] transition-transform active:scale-[.985] disabled:opacity-50 disabled:active:scale-100"
          {...bindTap<HTMLButtonElement>('fooddelivery.payment.complete', { onTrigger: () => { void pay(); }, params: { orderId } })}
        >
          <span className="inline-flex items-center justify-center gap-2">
            {isPaying && <LoaderCircle size={16} className="animate-spin" />}
            {isPaying ? '正在支付' : `${selected.name} · ${fundingSource==='bank_8888'?s.funding_bank:s.funding_balance} ${formatMoney(order?.payable ?? 0)}`}
          </span>
        </button>
        {!hasEnoughBalance && order && !error && <p className="mt-2 text-center text-[10px] text-[#9b4d5d]">当前方式余额不足，可切换另一种支付方式</p>}
      </div>
    </main>
  );
}
