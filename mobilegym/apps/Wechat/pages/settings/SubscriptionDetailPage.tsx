import React from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import * as TimeService from '../../../../os/TimeService';
import { IcNavForward } from '../../res/icons';
import { useWechatGestures } from '../../hooks/useWechatGestures';
import { useWechatStore } from '../../state';
import { useLocale } from '@/os/locale';
import { useWechatStrings } from '../../hooks/useWechatStrings';
import { getWechatSubscriptionBackend } from '../../subscriptions/backend';
import {
  getSubscriptionIconTone,
  getSubscriptionRenewalLabelKey,
} from '../../subscriptions/presentation';

export const SubscriptionDetailPage: React.FC = () => {
  const t = useWechatStrings();
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const { bindTap, bindBack, back } = useWechatGestures();
  const locale = useLocale();

  const subs = useWechatStore(store => store.subscriptions);
  const sub = subs.find(item => item.id === id);
  const showDialog = searchParams.get('modal') === 'cancel_confirm';
  const [cancelError, setCancelError] = React.useState('');
  const [cancelling, setCancelling] = React.useState(false);
  const cancellingRef = React.useRef(false);
  const dialogRef = React.useRef<HTMLDivElement>(null);
  const safeActionRef = React.useRef<HTMLButtonElement>(null);

  React.useEffect(() => {
    cancellingRef.current = cancelling;
  }, [cancelling]);

  React.useEffect(() => {
    if (!showDialog) return;
    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    safeActionRef.current?.focus();

    const handleDialogKeyDown = (event: KeyboardEvent) => {
      if (cancellingRef.current && (event.key === 'Escape' || event.key === 'Tab')) {
        event.preventDefault();
        dialogRef.current?.focus();
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        back(1);
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled])'),
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleDialogKeyDown);
    return () => {
      document.removeEventListener('keydown', handleDialogKeyDown);
      previouslyFocused?.focus();
    };
  }, [back, showDialog]);

  if (!sub) {
    return (
      <div className="bg-app-bg min-h-full flex items-center justify-center px-6 py-10 text-sm text-gray-500">
        {t.subscription_detail_not_found}
      </div>
    );
  }

  const renewalLabel = t[getSubscriptionRenewalLabelKey(sub.billingCycle)];
  const iconTone = getSubscriptionIconTone(sub.source);
  const serviceDescriptionText = t.subscription_service_description_template
    .replace(/\{\{price\}\}/g, String(sub.price))
    .replace(/\{\{cycle\}\}/g, sub.billingCycle)
    .replace(/\{\{cycleLabel\}\}/g, renewalLabel);
  const formatBillingDate = (timestamp?: number) => timestamp
    ? TimeService.fromTimestamp(timestamp).toLocaleString(locale === 'en' ? 'en-US' : 'zh-CN', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : t.subscription_detail_not_charged;

  const handleConfirmClose = async () => {
    if (!id || cancelling) return;
    setCancelling(true);
    requestAnimationFrame(() => dialogRef.current?.focus());
    setCancelError('');
    try {
      const backend = getWechatSubscriptionBackend();
      await backend.cancel(id);
      back(2);
    } catch (reason) {
      setCancelError(reason instanceof Error ? reason.message : '关闭失败，请重试');
      setCancelling(false);
    }
  };

  const ListItem = ({ label, value }: { label: string; value: string }) => (
    <div className="flex justify-between py-4 text-sm">
      <span className="text-gray-500">{label}</span>
      <span className="text-black max-w-[60%] text-right">{value}</span>
    </div>
  );

  return (
    <div className="bg-app-bg min-h-full flex flex-col">
      <div className="flex flex-col items-center pt-8 pb-6 bg-white mb-2">
        <div className={`mb-4 flex h-16 w-16 items-center justify-center rounded-full text-2xl font-bold ${iconTone}`}>
          {sub.source.slice(0, 1)}
        </div>
        <div className="mb-2 text-xl font-bold text-black">{sub.membershipType}</div>
        <div className="text-sm text-gray-500">{`${renewalLabel} · ${sub.source}`}</div>
      </div>

      <div className="bg-white px-6 mb-2">
        <ListItem
          label={t.subscription_detail_current_status}
          value={sub.autoRenew ? t.subscription_detail_status_active : t.subscription_detail_status_disabled}
        />
        <ListItem
          label={t.subscription_detail_activated_at}
          value={TimeService.fromTimestamp(sub.createdAt).toLocaleString(locale === 'en' ? 'en-US' : undefined)}
        />
        <ListItem label={t.subscription_detail_next_charge} value={formatBillingDate(sub.nextChargeAt)} />
        <ListItem label={t.subscription_detail_last_charge} value={formatBillingDate(sub.lastChargedAt)} />
        <ListItem label={t.subscription_detail_account} value="1079284754" />
        <ListItem label={t.subscription_detail_service_intro} value={serviceDescriptionText} />
      </div>

      <div className="bg-white px-6 flex justify-between items-center py-4 mb-2">
        <span className="text-sm text-gray-500">{t.subscription_detail_payment_method}</span>
        <div className="flex items-center gap-2">
          <div className="flex h-4 w-4 items-center justify-center rounded-full bg-[#F6C02C] text-xs text-white">
            ¥
          </div>
          <span className="text-sm text-black">{t.subscription_detail_balance}</span>
        </div>
      </div>

      <button
        type="button"
        className="mb-8 flex w-full items-center justify-between bg-white px-6 py-4 text-left active:bg-gray-50"
        {...bindTap<HTMLButtonElement>('wechatPay.ledger.open')}
      >
        <span className="text-sm text-black">{t.subscription_detail_billing_history}</span>
        <IcNavForward size={16} className="text-gray-300" />
      </button>

      {sub.autoRenew && (
        <div className="mt-auto pb-10 px-4">
          <button
            className="w-full rounded-lg bg-[#F2F2F2] py-3 text-base text-[#576B95] active:bg-gray-200"
            {...bindTap<HTMLButtonElement>('subscription.cancel', { params: { id: id! } })}
          >
            {t.subscription_detail_stop_billing}
          </button>
        </div>
      )}

      {showDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="subscription-cancel-title"
            aria-describedby="subscription-cancel-description"
            tabIndex={-1}
            className="w-[300px] overflow-hidden rounded-xl bg-white outline-none"
          >
            <div className="p-6 text-center">
              <div id="subscription-cancel-title" className="mb-2 text-lg font-bold">{t.subscription_cancel_confirm_title}</div>
              <div id="subscription-cancel-description" className="text-sm text-gray-500">{t.subscription_cancel_confirm_body}</div>
            </div>
            <div className="flex border-t border-gray-100">
              <button
                ref={safeActionRef}
                className="flex-1 border-r border-gray-100 py-4 text-base text-black outline-none active:bg-gray-50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#07c160]"
                {...bindBack<HTMLButtonElement>()}
                disabled={cancelling}
              >
                {t.subscription_cancel_think_again}
              </button>
              <button
                className="flex-1 py-4 text-base font-medium text-[#FA5151] outline-none active:bg-gray-50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#07c160]"
                disabled={cancelling}
                {...bindTap<HTMLButtonElement>(
                  { kind: 'action', id: 'subscription.cancel.confirm' },
                  { onTrigger: handleConfirmClose },
                )}
              >
                {cancelling ? t.common_loading : t.subscription_cancel_still_close}
              </button>
            </div>
            {cancelError && <p className="px-5 pb-4 text-center text-[12px] text-[#fa5151]" role="alert">{cancelError}</p>}
          </div>
        </div>
      )}
    </div>
  );
};
