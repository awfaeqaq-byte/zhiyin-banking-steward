export const customerSegmentLabels = {
  general: '通用客群',
  young_growth: '年轻成长客群',
  family: '家庭客群',
  wealth_management: '财富管理客群',
  silver_safety: '银发安全客群',
  merchant_sme: '商户／小微经营客群',
} as const;

export const customerNeedLabels = {
  budget_control: '控制支出',
  goal_saving: '目标储蓄',
  subscription_review: '订阅管理',
  family_planning: '家庭资金规划',
  liquidity: '流动性管理',
  asset_allocation: '资产配置',
  safety_first: '强化安全',
  simple_explanation: '通俗解释',
  business_reconcile: '经营对账',
  cashflow_forecast: '现金流预测',
} as const;

export const customerExperience = {
  general: {
    bills: ['收支与消费分类', '异常交易候选提示', '月度账单摘要'],
    investment: ['风险测评入口', '产品信息对比', '申购前确认'],
    cards: ['多卡总览', '交易提醒', '挂失与锁卡入口'],
  },
  young_growth: {
    bills: ['月度分类预算', '超支预警', '订阅与冲动消费识别'],
    investment: ['小额闲钱测算', '产品风险对比', '目标储蓄进度'],
    cards: ['消费限额', '订阅扣款管理', '异常交易提醒'],
  },
  family: {
    bills: ['家庭收支视图', '房贷教育保险固定支出', '年度大额支出日历'],
    investment: ['购房教育旅行目标', '期限与流动性对比', '家庭应急金提醒'],
    cards: ['多卡总览', '大额交易提醒', '境内外与额度管理'],
  },
  wealth_management: {
    bills: ['收支与资产变化', '闲置资金识别', '大额异常交易'],
    investment: ['风险画像确认', '产品筛选与对比', '持仓分析与赎回辅助'],
    cards: ['大额支付控制', '额度调整', '境外支付安全'],
  },
  silver_safety: {
    bills: ['陌生商户高亮', '大额转出提醒', '异常频次解释'],
    investment: ['条款通俗解释', '稳健产品风险对比', '到期与二次确认'],
    cards: ['一键锁卡与挂失', '异常交易确认', '敏感操作强化验证'],
  },
  merchant_sme: {
    bills: ['营收与支出分析', '收款对账', '退款异常与经营趋势'],
    investment: ['经营闲置资金', '现金流预测', '经营资金需求匹配'],
    cards: ['经营卡管理', '员工与用途限额', '大额支付异常控制'],
  },
} as const;

export type CustomerSegment = keyof typeof customerSegmentLabels;
export type CustomerNeed = keyof typeof customerNeedLabels;
export type CustomerContext = {
  enabled: boolean;
  primarySegment: CustomerSegment;
  needs: CustomerNeed[];
  updatedAt: number;
  expiresAt: number;
};

const isSegment = (value: unknown): value is CustomerSegment =>
  typeof value === 'string' && Object.hasOwn(customerSegmentLabels, value);
const isNeed = (value: unknown): value is CustomerNeed =>
  typeof value === 'string' && Object.hasOwn(customerNeedLabels, value);

export function validCustomerContext(value: unknown): value is CustomerContext {
  if (!value || typeof value !== 'object') return false;
  const context = value as CustomerContext;
  return typeof context.enabled === 'boolean' && isSegment(context.primarySegment) &&
    Array.isArray(context.needs) && context.needs.length <= Object.keys(customerNeedLabels).length &&
    new Set(context.needs).size === context.needs.length && context.needs.every(isNeed) &&
    Number.isFinite(context.updatedAt) && Number.isFinite(context.expiresAt);
}

export function updateCustomerContext(value: unknown, now = Date.now()): CustomerContext {
  if (!value || typeof value !== 'object') throw new Error('服务偏好格式无效');
  const input = value as Partial<CustomerContext>;
  if (typeof input.enabled !== 'boolean' || !isSegment(input.primarySegment) || !Array.isArray(input.needs)) {
    throw new Error('请选择有效的主客群和需求标签');
  }
  const needs = [...new Set(input.needs)];
  if (needs.length > Object.keys(customerNeedLabels).length || !needs.every(isNeed)) {
    throw new Error('需求标签无效');
  }
  return {
    enabled: input.enabled,
    primarySegment: input.primarySegment,
    needs,
    updatedAt: now,
    expiresAt: now + 365 * 86400000,
  };
}

export function customerContextPrompt(context: CustomerContext | undefined, now = Date.now()) {
  if (!context?.enabled || context.expiresAt <= now) return '';
  const data = {
    main: customerSegmentLabels[context.primarySegment],
    needs: context.needs.map(need => customerNeedLabels[need]),
  };
  return '\n用户确认的服务偏好（不是身份、收入或风险等级推断）：' + JSON.stringify(data) +
    '。只调整信息排序、解释粒度和提醒重点；不能改变金额、风险测评、产品适当性、权限或确认步骤。当前表达优先，冲突时先询问。';
}
