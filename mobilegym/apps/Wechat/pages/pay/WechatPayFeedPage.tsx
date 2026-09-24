import React from 'react';
import { BadgePercent, ChevronRight, ReceiptText, Store, WalletCards } from 'lucide-react';
import { useWechatGestures } from '../../hooks/useWechatGestures';
import { useWechatPayLedger } from '../../pay-ledger/useWechatPayLedger';
import { useWechatStore } from '../../state';
import { getWechatPayMonthKey } from '../../pay-ledger/dateKeys';

const money = (cents: number) => `¥${(cents / 100).toFixed(2)}`;

export const WechatPayFeedPage: React.FC = () => {
  const { bindTap } = useWechatGestures();
  const latestLedgerMonth = useWechatStore(state => state.payLedger.transactions[0]
    ? getWechatPayMonthKey(state.payLedger.transactions[0].occurredAt)
    : '2026-09');
  const { data, updateSettings } = useWechatPayLedger({ month: latestLedgerMonth });
  const latestDay = data?.daily[0];
  const latest = data?.transactions.find(item => item.direction === 'expense' && item.source !== 'manual');

  return (
    <div className="min-h-full bg-[#ededed] pb-[74px] text-[#191919]">
      <div className="px-5 py-5 space-y-4">
        <p className="text-center text-[13px] text-[#b2b2b2]">上午11:26</p>

        <section className="rounded-[12px] bg-white overflow-hidden shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
          <div className="h-[58px] px-4 flex items-center gap-2.5 border-b border-[#ededed]">
            <span className="w-7 h-7 rounded-full bg-[#40b983] text-white grid place-items-center"><ReceiptText size={16} /></span>
            <strong className="text-[16px] font-medium">微信记账本</strong>
          </div>
          {data?.settings.dailyReport === false ? (
            <div className="px-4 py-5">
              <h2 className="text-[19px] font-medium">记账日报已关闭</h2>
              <p className="text-[14px] text-[#888] mt-2 leading-6">后续不再自动生成日报，已有账单仍可随时查看。</p>
              <button onClick={() => void updateSettings({ dailyReport: true })} className="mt-4 h-9 px-4 rounded-[7px] bg-[#eaf7f1] text-[#27845d] text-[14px] active:bg-[#dcefe6]">重新开启</button>
            </div>
          ) : (
            <div className="px-4 pt-5 pb-3">
              <h2 className="text-[19px] font-medium">记账日报</h2>
              <p className="text-[14px] text-[#888] mt-1">{latestDay?.date || latestLedgerMonth} 收支</p>
              <dl className="grid grid-cols-[82px_1fr] gap-y-3 mt-5 text-[15px]">
                <dt className="text-[#888]">当日支出</dt><dd>{money(latestDay?.expenseCents || 0)}，共 {latestDay?.count || 0} 笔</dd>
                <dt className="text-[#888]">当日入账</dt><dd>{money(latestDay?.incomeCents || 0)}</dd>
                <dt className="text-[#888]">本月统计</dt><dd>已支出 {money(data?.summary.expenseCents || 0)}，已入账 {money(data?.summary.incomeCents || 0)}</dd>
              </dl>
              <p className="mt-4 text-[14px] leading-6 text-[#d99028]">查看昨日收支明细，也可以补充现金等其他收支</p>
            </div>
          )}
          <button {...bindTap<HTMLButtonElement>('wechatPay.ledger.open')} className="w-full h-[52px] px-4 border-t border-[#ededed] flex items-center justify-between text-[15px] active:bg-[#f7f7f7]">
            查看明细<ChevronRight size={19} className="text-[#b2b2b2]" />
          </button>
          <button {...bindTap<HTMLButtonElement>('wechatPay.settings.open')} className="w-full h-[52px] px-4 border-t border-[#ededed] flex items-center justify-between text-[15px] active:bg-[#f7f7f7]">
            日报设置<ChevronRight size={19} className="text-[#b2b2b2]" />
          </button>
        </section>

        {latest && (
          <section className="rounded-[12px] bg-white overflow-hidden shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
            <div className="h-[58px] px-4 flex items-center gap-2.5 border-b border-[#ededed]">
              <span className="w-7 h-7 rounded-full bg-[#e94036] text-white grid place-items-center"><Store size={15} /></span>
              <strong className="text-[16px] font-medium">{latest.merchant}</strong>
            </div>
            <button {...bindTap<HTMLButtonElement>('wechatPay.transaction.open', { params: { id: latest.id } })} className="w-full px-4 py-8 text-center active:bg-[#f8f8f8]">
              <span className="block text-[15px]">使用零钱支付</span>
              <strong className="block text-[38px] leading-none mt-4 tabular-nums">{money(latest.amountCents)}</strong>
              <span className="mt-5 inline-flex items-center text-[14px] text-[#888]">交易详情<ChevronRight size={17} /></span>
            </button>
          </section>
        )}
      </div>

      <nav className="absolute bottom-0 left-0 right-0 h-[64px] bg-white border-t border-[#dedede] grid grid-cols-3" aria-label="微信支付快捷入口">
        <button {...bindTap<HTMLButtonElement>('wechatPay.ledger.open')} className="flex items-center justify-center gap-2 text-[14px] active:bg-[#f4f4f4]"><ReceiptText size={19} />我的账单</button>
        <button {...bindTap<HTMLButtonElement>('wechatPay.services.open')} className="flex items-center justify-center gap-2 text-[14px] border-x border-[#ededed] active:bg-[#f4f4f4]"><WalletCards size={19} />支付服务</button>
        <button {...bindTap<HTMLButtonElement>('wechatPay.offers.open')} className="flex items-center justify-center gap-2 text-[14px] active:bg-[#f4f4f4]"><BadgePercent size={19} />摇优惠</button>
      </nav>
    </div>
  );
};
