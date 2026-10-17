import type {ConnectedFinancialSource, ExternalFinancialProvider} from './financial-connections';
import type {StewardReply, StewardReplyRequest} from './steward-chat';

type Connections = Partial<Record<ExternalFinancialProvider, ConnectedFinancialSource>>;
export type SubscriptionAccess = {
  providers: ExternalFinancialProvider[];
  incompleteProviders: ExternalFinancialProvider[];
};

export function subscriptionAccess(connections: Connections): SubscriptionAccess {
  const providers = (['wechat_pay', 'alipay'] as const).filter(provider => connections[provider]?.scopes.includes('autopay'));
  return {providers, incompleteProviders: providers.filter(provider => connections[provider]?.autopaysIncomplete)};
}

/** Only a single, read-only list request can bypass model routing. */
export function isSubscriptionListQuestion(text: string): boolean {
  const question = text.replace(/[\s？?。！!，,]/g, '');
  return /^(?:(?:请|帮我|请帮我)?(?:查一下|查询|查看|列出|看看)?(?:我|我的|当前|现在)?(?:都)?(?:有哪些|有什么)(?:自动续费|订阅|续费项目)|(?:请|帮我|请帮我)?(?:查一下|查询|查看|列出|看看)(?:我|我的|当前|现在)?(?:的)?(?:自动续费|订阅)(?:清单|列表)?|(?:我|我的|当前|现在)?(?:的)?(?:自动续费|订阅)(?:都)?(?:有哪些|有什么))$/.test(question);
}

/** Only the current bridge scopes and snapshot are facts; chat history is not. */
export function subscriptionReadReply(request: StewardReplyRequest): StewardReply | null {
  const question = request.messages.filter(message => message.role === 'user').at(-1)?.content || '';
  const list = isSubscriptionListQuestion(question);
  if (!list && (!/自动续费|订阅|签约/.test(question) || /账单|历史|候选|周期扣费/.test(question))) return null;
  if (!list && /转账|汇款|银行卡|(?:给|向).{1,25}(?:转|汇)|AA|aa/.test(question)) return null;
  const access = request.subscriptionAccess;
  if (!access?.providers.length) return {
    text: '当前没有可读取自动续费的有效授权，无法确认你的续费清单。请先连接微信支付或支付宝，并允许读取自动续费；拒绝授权或断开连接后，历史聊天中的订阅不能作为当前清单。',
    action: {type: 'open_connections', scope:'autopay'},
  };
  if (!list) return null;
  const names = access.providers.map(provider => provider === 'alipay' ? '支付宝' : '微信支付').join('、');
  const items = request.subscriptions.filter(item => access.providers.includes(item.provider));
  const rows = items.slice(0, 30).map(item => `- ${item.title}（${item.provider === 'alipay' ? '支付宝' : '微信支付'}）：${(item.amount / 100).toFixed(2)}元/${item.cycle}`);
  const limit = access.incompleteProviders.length ? '平台返回的数据不完整，不能据此判断全部自动续费。' : '仅覆盖本轮已授权平台，未连接的平台不在查询范围内。';
  return {
    text: [`本轮读取范围：${names}的自动续费。`, rows.length ? rows.join('\n') : '本轮返回的清单中没有有效自动续费项目。', items.length > 30 ? `这里只列出30项，共${items.length}项，请在订阅页查看其余项目。` : '', limit].filter(Boolean).join('\n'),
    action: {type: 'open_subscriptions'},
  };
}

/** Ignore sync timestamps, but invalidate responses after scope/data/cancel changes. */
export function subscriptionFingerprint(connections: Connections): string {
  return JSON.stringify((['wechat_pay', 'alipay'] as const).map(provider => {
    const source = connections[provider];
    return source ? [provider, [...source.scopes].sort(), source.autopays, source.cancelledAutopayIds, source.autopaysIncomplete] : [provider, null];
  }));
}
