import React from 'react';
import * as TimeService from '../../../../os/TimeService';
import { IcNavForward } from '../../res/icons';
import { useWechatGestures } from '../../hooks/useWechatGestures';
import { useWechatStore } from '../../state';
import { useAppNavigate } from '../../navigation';
import { useLocale } from '@/os/locale';
import { useWechatStrings } from '../../hooks/useWechatStrings';
import { getSubscriptionIconTone } from '../../subscriptions/presentation';

export const SubscriptionsPage: React.FC = () => {
  const t = useWechatStrings();
  const { go } = useAppNavigate();
  const { bindTap } = useWechatGestures();
  const locale = useLocale();
  const subs = useWechatStore(s => s.subscriptions);
  const activeSubscriptions = subs.filter(subscription => subscription.autoRenew);
  const formatActivatedAt = (timestamp: number) => {
    const date = TimeService.fromTimestamp(timestamp);
    if (locale === 'en') {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${t.subscription_activated_on} ${year}-${month}-${day}`;
    }
    return `${t.subscription_activated_on}${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
  };

  return (
    <div className="bg-app-bg min-h-full pb-10 flex flex-col">
      <div className="px-6 py-4 text-sm text-gray-500">
          {t.subscription_intro}
      </div>

      <div className="bg-white">
        {activeSubscriptions.length === 0 ? (
          <div className="px-8 py-16 text-center">
            <div className="text-[16px] text-gray-500">{t.subscription_empty}</div>
            <p className="mt-2 text-[13px] leading-5 text-gray-400">{t.subscription_empty_hint}</p>
          </div>
        ) : (
          activeSubscriptions.map(s => (
            <button
                key={s.id}
                type="button"
                className="flex min-h-[96px] w-full items-center border-b border-gray-100 px-4 py-4 text-left last:border-none active:bg-gray-50 cursor-pointer"
                {...bindTap<HTMLButtonElement>(
                  'subscription.detail.open',
                  { onTrigger: () => go('subscription.detail.open', { id: s.id }) },
                )}
            >
              <div className={`mr-3 flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full text-sm font-semibold ${getSubscriptionIconTone(s.source)}`}>
                  {s.source.slice(0, 1)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[16px] font-medium text-black mb-1 truncate">
                  {s.membershipType}
                </div>
                <div className="text-[13px] text-gray-500">{s.source}</div>
                <div className="mt-1 text-[12px] text-gray-400">{formatActivatedAt(s.createdAt)}</div>
              </div>
              <IcNavForward size={16} className="text-gray-300 ml-2" />
            </button>
          ))
        )}
      </div>

      <div className="mt-auto py-8 flex justify-center">
          <span className="text-sm text-gray-400">{t.subscription_service_center}</span>
      </div>
    </div>
  );
};
