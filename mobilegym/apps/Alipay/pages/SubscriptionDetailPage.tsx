import React from 'react';
import { useParams } from 'react-router-dom';
import { IcNavBack, IcNavForward } from '../res/icons';
import { useAlipayGestures } from '../hooks/useAlipayGestures';
import { useAlipayStrings } from '../hooks/useAlipayStrings';
import { useAlipayStore } from '../state';
import { useLocale } from '../locale';
import * as TimeService from '../../../os/TimeService';
import { getAlipaySubscriptionBackend } from '../subscriptions/backend';

export const SubscriptionDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const s = useAlipayStrings();
  const locale = useLocale();
  const { bindBack, bindTap, back } = useAlipayGestures();
  const subscription = useAlipayStore(state => state.subscriptions.find(item => item.id === id));
  const [showDialog, setShowDialog] = React.useState(false);
  const [cancelling, setCancelling] = React.useState(false);
  const [cancelError, setCancelError] = React.useState('');
  const dialogRef = React.useRef<HTMLDivElement>(null);
  const safeActionRef = React.useRef<HTMLButtonElement>(null);

  React.useEffect(() => {
    if (!showDialog) return;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    safeActionRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !cancelling) {
        event.preventDefault();
        setShowDialog(false);
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const buttons = Array.from(dialogRef.current.querySelectorAll<HTMLButtonElement>('button:not([disabled])'));
      if (buttons.length < 2) return;
      if (event.shiftKey && document.activeElement === buttons[0]) {
        event.preventDefault();
        buttons.at(-1)?.focus();
      } else if (!event.shiftKey && document.activeElement === buttons.at(-1)) {
        event.preventDefault();
        buttons[0].focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      previouslyFocused?.focus();
    };
  }, [cancelling, showDialog]);

  if (!subscription) {
    return <div className="grid min-h-full place-items-center bg-[#f5f5f5] px-6 text-sm text-[#888]">{s.subscriptions_not_found}</div>;
  }

  const formatDate = (timestamp?: number) => timestamp
    ? TimeService.fromTimestamp(timestamp).toLocaleString(locale === 'en' ? 'en-US' : 'zh-CN', {
        year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
      })
    : s.subscriptions_not_charged;

  const handleCancel = async () => {
    if (!id || cancelling) return;
    setCancelling(true);
    setCancelError('');
    try {
      const backend = getAlipaySubscriptionBackend();
      await backend.cancel(id);
      back();
    } catch (reason) {
      setCancelError(reason instanceof Error ? reason.message : s.subscriptions_cancel_failed);
      setCancelling(false);
    }
  };

  const Row = ({ label, value }: { label: string; value: string }) => (
    <div className="flex min-h-[52px] items-center justify-between gap-5 border-b border-[#eee] py-3 last:border-none">
      <span className="shrink-0 text-[14px] text-[#888]">{label}</span>
      <span className="text-right text-[14px] text-[#333]">{value}</span>
    </div>
  );

  return (
    <div className="min-h-full bg-[#f5f5f5] pb-10" data-status-bar-foreground="dark">
      <header className="sticky top-0 z-20 flex h-14 items-center border-b border-black/[0.04] bg-white px-4">
        <button type="button" {...bindBack<HTMLButtonElement>()} className="-ml-2 grid h-10 w-10 place-items-center" aria-label={s.common_back}>
          <IcNavBack size={24} className="text-[#1f1f1f]" />
        </button>
        <h1 className="pointer-events-none absolute left-1/2 -translate-x-1/2 text-[17px] font-semibold text-[#1f1f1f]">{s.subscriptions_detail_title}</h1>
      </header>

      <section className="flex flex-col items-center bg-white px-5 pb-6 pt-7">
        <div className="mb-3 grid h-16 w-16 place-items-center rounded-[14px] bg-[#eaf4ff] text-[26px] font-semibold text-app-primary">
          {(subscription.source || subscription.membershipType).slice(0, 1)}
        </div>
        <h2 className="text-[20px] font-semibold text-[#1f1f1f]">{subscription.membershipType}</h2>
        <p className="mt-1 text-[14px] text-[#888]">{subscription.source}</p>
      </section>

      <section className="mt-3 bg-white px-5">
        <Row label={s.subscriptions_status} value={subscription.autoRenew ? s.subscriptions_status_active : s.subscriptions_status_cancelled} />
        <Row label={s.subscriptions_amount_cycle} value={`¥${subscription.price} / ${subscription.billingCycle}`} />
        <Row label={s.subscriptions_activated_at} value={formatDate(subscription.createdAt)} />
        <Row label={s.subscriptions_next_charge_label} value={formatDate(subscription.nextChargeAt)} />
        <Row label={s.subscriptions_last_charge} value={formatDate(subscription.lastChargedAt)} />
        <Row label={s.subscriptions_payment_method} value={s.subscriptions_balance} />
      </section>

      <button type="button" className="mt-3 flex min-h-[56px] w-full items-center justify-between bg-white px-5 text-left active:bg-[#fafafa]" {...bindTap<HTMLButtonElement>('subscription.bill.open')}>
        <span className="text-[15px] text-[#333]">{s.subscriptions_view_bills}</span>
        <IcNavForward size={17} className="text-[#c6c6c6]" />
      </button>

      {subscription.autoRenew && (
        <div className="px-5 pt-8">
          <button type="button" className="h-12 w-full rounded-md border border-[#ff4d4f] bg-white text-[16px] text-[#ff4d4f] active:bg-[#fff5f5]" onClick={() => setShowDialog(true)}>
            {s.subscriptions_cancel}
          </button>
        </div>
      )}

      {showDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-8" onMouseDown={() => !cancelling && setShowDialog(false)}>
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="alipay-subscription-cancel-title"
            aria-describedby="alipay-subscription-cancel-description"
            tabIndex={-1}
            className="w-full max-w-[320px] overflow-hidden rounded-[12px] bg-white outline-none"
            onMouseDown={event => event.stopPropagation()}
          >
            <div className="px-6 pb-5 pt-6 text-center">
              <h3 id="alipay-subscription-cancel-title" className="text-[18px] font-semibold text-[#1f1f1f]">{s.subscriptions_cancel_title}</h3>
              <p id="alipay-subscription-cancel-description" className="mt-2 text-[14px] leading-5 text-[#777]">{s.subscriptions_cancel_body}</p>
              {cancelError && <p className="mt-3 text-[12px] text-[#ff3b30]" role="alert">{cancelError}</p>}
            </div>
            <div className="grid grid-cols-2 border-t border-[#eee]">
              <button ref={safeActionRef} type="button" disabled={cancelling} className="h-12 border-r border-[#eee] text-[16px] text-[#333] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-app-primary disabled:text-[#bbb]" onClick={() => setShowDialog(false)}>
                {s.subscriptions_keep}
              </button>
              <button type="button" disabled={cancelling} className="h-12 text-[16px] font-medium text-[#ff3b30] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-app-primary disabled:text-[#ffaaaa]" onClick={handleCancel}>
                {cancelling ? s.common_loading : s.subscriptions_confirm_cancel}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
