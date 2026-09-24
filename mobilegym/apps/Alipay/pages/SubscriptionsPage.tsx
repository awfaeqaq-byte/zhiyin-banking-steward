import React from 'react';
import { IcAdd, IcNavBack, IcNavForward } from '../res/icons';
import { useAlipayStrings } from '../hooks/useAlipayStrings';
import { useAlipayStore } from '../state';
import { useAlipayGestures } from '../hooks/useAlipayGestures';
import * as TimeService from '../../../os/TimeService';
import { useLocale } from '../locale';

const cycleSuffix: Record<string, string> = { '月': '/月', '季': '/季', '年': '/年' };

export const SubscriptionsPage: React.FC = () => {
  const s = useAlipayStrings();
  const locale = useLocale();
  const { bindBack, bindTap } = useAlipayGestures();
  const subscriptions = useAlipayStore(state => state.subscriptions);
  const activeSubscriptions = subscriptions.filter(subscription => subscription.autoRenew);

  const formatDate = (timestamp?: number) => timestamp
    ? TimeService.fromTimestamp(timestamp).toLocaleDateString(locale === 'en' ? 'en-US' : 'zh-CN', {
        year: 'numeric', month: 'short', day: 'numeric',
      })
    : s.subscriptions_schedule_pending;

  return (
    <div className="min-h-full bg-[#f5f5f5] pb-10" data-status-bar-foreground="dark">
      <header className="sticky top-0 z-20 flex h-14 items-center border-b border-black/[0.04] bg-white px-4">
        <button type="button" {...bindBack<HTMLButtonElement>()} className="-ml-2 grid h-10 w-10 place-items-center" aria-label={s.common_back}>
          <IcNavBack size={24} className="text-[#1f1f1f]" />
        </button>
        <h1 className="pointer-events-none absolute left-1/2 -translate-x-1/2 text-[17px] font-semibold text-[#1f1f1f]">
          {s.subscriptions_title}
        </h1>
        <button
          type="button"
          className="ml-auto flex h-10 items-center gap-1 text-[15px] font-medium text-app-primary active:opacity-60"
          {...bindTap<HTMLButtonElement>('subscription.add.open')}
        >
          <IcAdd size={18} />
          {s.subscriptions_add}
        </button>
      </header>

      <p className="px-5 py-4 text-[13px] leading-5 text-[#888]">{s.subscriptions_intro}</p>

      <section className="bg-white" aria-label={s.subscriptions_active_services}>
        {activeSubscriptions.length === 0 ? (
          <div className="px-8 py-16 text-center">
            <div className="text-[16px] text-[#666]">{s.subscriptions_empty}</div>
            <p className="mt-2 text-[13px] leading-5 text-[#999]">{s.subscriptions_empty_hint}</p>
            <button
              type="button"
              className="mt-6 rounded-md border border-app-primary px-5 py-2 text-sm text-app-primary active:bg-[#f2f8ff]"
              {...bindTap<HTMLButtonElement>('subscription.add.open')}
            >
              {s.subscriptions_add_service}
            </button>
          </div>
        ) : activeSubscriptions.map(subscription => (
          <button
            key={subscription.id}
            type="button"
            className="flex min-h-[92px] w-full items-center border-b border-[#eee] px-5 py-4 text-left last:border-none active:bg-[#fafafa]"
            {...bindTap<HTMLButtonElement>('subscription.detail.open', { params: { id: subscription.id } })}
          >
            <div className="mr-4 grid h-11 w-11 shrink-0 place-items-center rounded-[10px] bg-[#eaf4ff] text-[18px] font-semibold text-app-primary">
              {(subscription.source || subscription.membershipType).slice(0, 1)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[16px] font-medium text-[#1f1f1f]">{subscription.membershipType}</div>
              <div className="mt-1 flex items-center gap-2 text-[13px] text-[#666]">
                <span className="truncate">{subscription.source}</span>
                <span aria-hidden="true">·</span>
                <span className="shrink-0 tabular-nums">{`¥${subscription.price}${cycleSuffix[subscription.billingCycle] || ''}`}</span>
              </div>
              <div className="mt-1 text-[12px] text-[#666]">
                {s.subscriptions_next_charge}{formatDate(subscription.nextChargeAt)}
              </div>
            </div>
            <IcNavForward size={17} className="ml-3 shrink-0 text-[#c6c6c6]" />
          </button>
        ))}
      </section>

      <p className="px-5 pt-4 text-[12px] leading-5 text-[#aaa]">{s.subscriptions_balance_note}</p>
    </div>
  );
};
