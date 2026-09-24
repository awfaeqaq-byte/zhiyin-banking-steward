import { getAlipaySubscriptionBackend } from '@/apps/Alipay/subscriptions/backend';
import { getWechatSubscriptionBackend } from '@/apps/Wechat/subscriptions/backend';

export type ZhiyinAutopayProvider = 'alipay' | 'wechat_pay';

type Dependencies = {
  cancelAlipay: (id: string) => Promise<unknown>;
  cancelWechat: (id: string) => Promise<unknown>;
};

const defaults: Dependencies = {
  cancelAlipay: id => getAlipaySubscriptionBackend().cancel(id),
  cancelWechat: id => getWechatSubscriptionBackend().cancel(id),
};

/**
 * Executes one narrowly scoped partner action after Zhiyin has shown its own
 * consequence confirmation. No general write access is exposed to the iframe.
 */
export async function cancelZhiyinAutopay(
  provider: ZhiyinAutopayProvider,
  subscriptionId: string,
  dependencies: Dependencies = defaults,
) {
  const id = subscriptionId.trim();
  if (!id || id.length > 80) throw new Error('无效的订阅标识');
  if (provider === 'wechat_pay') await dependencies.cancelWechat(id);
  else if (provider === 'alipay') await dependencies.cancelAlipay(id);
  else throw new Error('不支持的支付平台');
  return { status: 'cancelled' as const, provider, subscriptionId: id };
}
