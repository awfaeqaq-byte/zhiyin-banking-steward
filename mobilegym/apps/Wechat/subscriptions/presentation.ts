export type SubscriptionRenewalLabelKey =
  | 'subscription_monthly_auto_renew'
  | 'subscription_quarterly_auto_renew'
  | 'subscription_yearly_auto_renew';

export const getSubscriptionRenewalLabelKey = (cycle: string): SubscriptionRenewalLabelKey => {
  if (cycle === '年') return 'subscription_yearly_auto_renew';
  if (cycle === '季') return 'subscription_quarterly_auto_renew';
  return 'subscription_monthly_auto_renew';
};

export const getSubscriptionIconTone = (source: string): string => {
  if (source.includes('联通')) return 'bg-[#f3c744] text-[#9c4b18]';
  if (source.includes('网易云')) return 'bg-[#e93434] text-white';
  return 'bg-[#07c160] text-white';
};
