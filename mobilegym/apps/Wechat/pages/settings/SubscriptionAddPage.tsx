import React, { useState } from 'react';
import { useWechatGestures } from '../../hooks/useWechatGestures';
import { useWechatStrings } from '../../hooks/useWechatStrings';
import {
  getWechatSubscriptionBackend,
  type NewWechatSubscription,
} from '../../subscriptions/backend';

type BillingCycle = NewWechatSubscription['billingCycle'];

export const SubscriptionAddPage: React.FC = () => {
  const t = useWechatStrings();
  const { back, bindTap } = useWechatGestures();
  const [membershipType, setMembershipType] = useState('');
  const [source, setSource] = useState('');
  const [price, setPrice] = useState('');
  const [billingCycle, setBillingCycle] = useState<BillingCycle>('月');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const canSubmit = membershipType.trim() !== ''
    && source.trim() !== ''
    && Number(price) > 0
    && !submitting;

  const handlePriceChange = (value: string) => {
    const normalized = value.replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1');
    const [integer = '', fraction] = normalized.split('.');
    const next = fraction === undefined ? integer : `${integer}.${fraction.slice(0, 2)}`;
    setPrice(next.slice(0, 9));
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError('');
    try {
      await getWechatSubscriptionBackend().create({
        membershipType,
        source,
        price: Number(price),
        billingCycle,
      });
      back();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '添加失败，请重试');
    } finally {
      setSubmitting(false);
    }
  };

  const Field = ({
    label,
    children,
  }: {
    label: string;
    children: React.ReactNode;
  }) => (
    <label className="flex min-h-[58px] items-center gap-4 border-b border-gray-100 px-4 last:border-b-0">
      <span className="w-[88px] shrink-0 text-[16px] text-black">{label}</span>
      <span className="min-w-0 flex-1">{children}</span>
    </label>
  );

  return (
    <div className="min-h-full bg-app-bg pb-8" data-status-bar-foreground="dark">
      <div className="mt-2 bg-white">
        <Field label={t.subscription_add_service_name}>
          <input
            value={membershipType}
            onChange={event => setMembershipType(event.target.value.slice(0, 40))}
            placeholder={t.subscription_add_service_placeholder}
            className="w-full bg-transparent text-[16px] text-black outline-none placeholder:text-gray-300"
            autoComplete="off"
          />
        </Field>
        <Field label={t.subscription_add_merchant}>
          <input
            value={source}
            onChange={event => setSource(event.target.value.slice(0, 40))}
            placeholder={t.subscription_add_merchant_placeholder}
            className="w-full bg-transparent text-[16px] text-black outline-none placeholder:text-gray-300"
            autoComplete="off"
          />
        </Field>
        <Field label={t.subscription_add_price}>
          <span className="flex items-center gap-1 text-base text-black">
            <span>¥</span>
            <input
              value={price}
              onChange={event => handlePriceChange(event.target.value)}
              inputMode="decimal"
              placeholder={t.subscription_add_price_placeholder}
              className="min-w-0 flex-1 bg-transparent text-base tabular-nums outline-none placeholder:text-gray-300"
              aria-invalid={Boolean(error)}
            />
          </span>
        </Field>
      </div>

      <fieldset className="mt-2 bg-white px-4 py-4">
        <legend className="sr-only">{t.subscription_add_cycle}</legend>
        <div className="mb-3 text-sm text-gray-500">{t.subscription_add_cycle}</div>
        <div className="grid grid-cols-3 gap-2">
          {([
            ['月', t.subscription_add_cycle_month],
            ['季', t.subscription_add_cycle_quarter],
            ['年', t.subscription_add_cycle_year],
          ] as Array<[BillingCycle, string]>).map(([value, label]) => {
            const selected = billingCycle === value;
            return (
              <button
                key={value}
                type="button"
                onClick={() => setBillingCycle(value)}
                aria-pressed={selected}
                className={`h-10 rounded-[6px] border text-sm transition-colors ${
                  selected
                    ? 'border-[#07c160] bg-[#f0fbf5] text-[#07a858]'
                    : 'border-gray-200 bg-white text-black active:bg-gray-50'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </fieldset>

      {error && (
        <p className="mx-4 mt-3 text-[13px] leading-5 text-[#fa5151]" role="alert">{error}</p>
      )}

      <p className="mx-5 mt-4 text-center text-[12px] leading-5 text-gray-400">
        {t.subscription_add_note}
      </p>

      <div className="px-4 pt-7">
        <button
          type="button"
          disabled={!canSubmit}
          className="h-12 w-full rounded-[6px] bg-[#07c160] text-base font-medium text-white transition-colors active:bg-[#06ad56] disabled:bg-[#9be6b8]"
          {...bindTap<HTMLButtonElement>(
            { kind: 'action', id: 'subscription.add.confirm' },
            { onTrigger: handleSubmit },
          )}
        >
          {submitting ? t.subscription_add_submitting : t.subscription_add_submit}
        </button>
      </div>
    </div>
  );
};
