import React from 'react';
import { IcNavBack } from '../res/icons';
import { useAlipayGestures } from '../hooks/useAlipayGestures';
import { useAlipayStrings } from '../hooks/useAlipayStrings';
import { getAlipaySubscriptionBackend, type NewAlipaySubscription } from '../subscriptions/backend';

type BillingCycle = NewAlipaySubscription['billingCycle'];

const SubscriptionField = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <label className="flex min-h-[60px] items-center gap-4 border-b border-[#eee] px-5 last:border-none">
    <span className="w-[82px] shrink-0 text-[15px] text-[#333]">{label}</span>
    <span className="min-w-0 flex-1">{children}</span>
  </label>
);

export const SubscriptionAddPage: React.FC = () => {
  const s = useAlipayStrings();
  const { back, bindBack } = useAlipayGestures();
  const [membershipType, setMembershipType] = React.useState('');
  const [source, setSource] = React.useState('');
  const [price, setPrice] = React.useState('');
  const [billingCycle, setBillingCycle] = React.useState<BillingCycle>('月');
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState('');

  const canSubmit = membershipType.trim() !== '' && source.trim() !== '' && Number(price) > 0 && !submitting;
  const handlePriceChange = (value: string) => {
    const normalized = value.replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1');
    const [integer = '', fraction] = normalized.split('.');
    setPrice((fraction === undefined ? integer : `${integer}.${fraction.slice(0, 2)}`).slice(0, 9));
  };
  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError('');
    try {
      await getAlipaySubscriptionBackend().create({ membershipType, source, price: Number(price), billingCycle });
      back();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : s.subscriptions_add_failed);
      setSubmitting(false);
    }
  };
  return (
    <div className="min-h-full bg-[#f5f5f5] pb-8" data-status-bar-foreground="dark">
      <header className="sticky top-0 z-20 flex h-14 items-center border-b border-black/[0.04] bg-white px-4">
        <button type="button" {...bindBack<HTMLButtonElement>()} className="-ml-2 grid h-10 w-10 place-items-center" aria-label={s.common_back}>
          <IcNavBack size={24} className="text-[#1f1f1f]" />
        </button>
        <h1 className="pointer-events-none absolute left-1/2 -translate-x-1/2 text-[17px] font-semibold text-[#1f1f1f]">{s.subscriptions_add_title}</h1>
      </header>

      <div className="mt-3 bg-white">
        <SubscriptionField label={s.subscriptions_service_name}>
          <input value={membershipType} onChange={event => setMembershipType(event.target.value.slice(0, 40))} placeholder={s.subscriptions_service_placeholder} className="w-full bg-transparent text-[15px] text-[#1f1f1f] outline-none placeholder:text-[#bbb]" autoComplete="off" />
        </SubscriptionField>
        <SubscriptionField label={s.subscriptions_merchant}>
          <input value={source} onChange={event => setSource(event.target.value.slice(0, 40))} placeholder={s.subscriptions_merchant_placeholder} className="w-full bg-transparent text-[15px] text-[#1f1f1f] outline-none placeholder:text-[#bbb]" autoComplete="off" />
        </SubscriptionField>
        <SubscriptionField label={s.subscriptions_price}>
          <span className="flex items-center gap-1 text-[15px] text-[#1f1f1f]">
            <span>¥</span>
            <input value={price} onChange={event => handlePriceChange(event.target.value)} inputMode="decimal" placeholder="0.00" className="min-w-0 flex-1 bg-transparent tabular-nums outline-none placeholder:text-[#bbb]" aria-invalid={Boolean(error)} />
          </span>
        </SubscriptionField>
      </div>

      <fieldset className="mt-3 bg-white px-5 py-4">
        <legend className="sr-only">{s.subscriptions_billing_cycle}</legend>
        <div className="mb-3 text-[14px] text-[#666]">{s.subscriptions_billing_cycle}</div>
        <div className="grid grid-cols-3 gap-3">
          {(['月', '季', '年'] as BillingCycle[]).map(cycle => {
            const selected = cycle === billingCycle;
            return (
              <button key={cycle} type="button" onClick={() => setBillingCycle(cycle)} aria-pressed={selected} className={`h-10 rounded-md border text-sm transition-colors ${selected ? 'border-app-primary bg-[#edf6ff] text-app-primary' : 'border-[#ddd] bg-white text-[#555] active:bg-[#fafafa]'}`}>
                {cycle === '月' ? s.subscriptions_cycle_month : cycle === '季' ? s.subscriptions_cycle_quarter : s.subscriptions_cycle_year}
              </button>
            );
          })}
        </div>
      </fieldset>

      <p className="mx-5 mt-4 text-[12px] leading-5 text-[#999]">{s.subscriptions_add_note}</p>
      {error && <p className="mx-5 mt-3 text-[13px] text-[#ff3b30]" role="alert">{error}</p>}
      <div className="px-5 pt-8">
        <button type="button" disabled={!canSubmit} onClick={handleSubmit} className="h-12 w-full rounded-md bg-app-primary text-[16px] font-medium text-white active:opacity-80 disabled:bg-[#9cc9f7]">
          {submitting ? s.common_loading : s.subscriptions_add_submit}
        </button>
      </div>
    </div>
  );
};
