import { describe, expect, it } from 'vitest';
import {
  getSubscriptionIconTone,
  getSubscriptionRenewalLabelKey,
} from '../apps/Wechat/subscriptions/presentation';

describe('automatic renewal presentation', () => {
  it.each([
    ['月', 'subscription_monthly_auto_renew'],
    ['季', 'subscription_quarterly_auto_renew'],
    ['年', 'subscription_yearly_auto_renew'],
    ['unknown', 'subscription_monthly_auto_renew'],
  ])('maps %s to the matching renewal label', (cycle, expected) => {
    expect(getSubscriptionRenewalLabelKey(cycle)).toBe(expected);
  });

  it('keeps known merchants visually consistent across list and detail', () => {
    expect(getSubscriptionIconTone('广东联通')).toContain('#f3c744');
    expect(getSubscriptionIconTone('网易云音乐主站')).toContain('#e93434');
    expect(getSubscriptionIconTone('其他商家')).toContain('#07c160');
  });
});
