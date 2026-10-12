import type { ConnectedFinancialSource, ExternalFinancialProvider } from './financial-connections';
import type { StewardAction } from './steward-chat';
import {isFinancialCoachingQuestion} from './financial-coach';

export type StewardTaskKind = 'bill_analysis' | 'wealth_operation' | 'financial_coaching' | 'card_management' | 'transfer' | 'subscription' | 'general';
export type StewardTaskStage = 'authorizing' | 'gathering' | 'planning' | 'executing' | 'complete' | 'error';
export type StewardPlanStepStatus = 'pending' | 'active' | 'done' | 'waiting' | 'error';

export type StewardPlanStep = {
  id: 'intent' | 'authorization' | 'information' | 'plan' | 'execution' | 'result';
  title: string;
  detail: string;
  status: StewardPlanStepStatus;
};

export type StewardTaskPlan = {
  id: string;
  kind: StewardTaskKind;
  goal: string;
  stage: StewardTaskStage;
  sources: string[];
  capabilities: string[];
  confirmationRequired: boolean;
  steps: StewardPlanStep[];
};

const kindCopy: Record<StewardTaskKind, { goal: string; capabilities: string[] }> = {
  bill_analysis: { goal: '核对账单并解释支出', capabilities: ['账单读取', '分类统计', '异常线索', '趋势对照'] },
  wealth_operation: { goal: '形成适配的理财方案', capabilities: ['目标拆解', '风险约束', '产品比较', '申购前核对'] },
  financial_coaching: { goal: '厘清财务目标并探索可行选择', capabilities: ['目标与时间', '数据范围', '现金流与风险', '下一步行动'] },
  card_management: { goal: '核对并管理卡片安全', capabilities: ['卡片状态', '限额与开关', '风险检查', '变更前确认'] },
  transfer: { goal: '准备安全的资金操作', capabilities: ['意图补全', '余额与限额', '方案核对', '授权执行'] },
  subscription: { goal: '核对订阅和资金安排', capabilities: ['订阅识别', '重复检查', '续费测算', '取消前确认'] },
  general: { goal: '理解问题并给出可执行建议', capabilities: ['意图理解', '信息核对', '步骤规划', '后续选项'] },
};

export function detectStewardTaskKind(prompt: string): StewardTaskKind {
  if (/转账|汇款|(?:给|向).{1,25}(?:转|汇)|AA|aa|平摊|均摊|收款|预约/.test(prompt)) return 'transfer';
  if (isFinancialCoachingQuestion(prompt)) return 'financial_coaching';
  if (/账单|收支|消费|花了|花费|花销|支出|收入|流水|退款|异常交易|不寻常/.test(prompt)) return 'bill_analysis';
  if (/理财|投资|基金|存款|资产配置|闲钱|收益|赎回|申购|风险测评|持仓/.test(prompt)) return 'wealth_operation';
  if (/卡片|银行卡|信用卡|挂失|锁卡|解锁|限额|境外交易|无卡支付|夜间保护/.test(prompt)) return 'card_management';
  if (/订阅|会员|续费|扣费/.test(prompt)) return 'subscription';
  return 'general';
}

function requestedProviders(prompt: string) {
  const providers: ExternalFinancialProvider[] = [];
  if (/微信/.test(prompt)) providers.push('wechat_pay');
  if (/支付宝/.test(prompt)) providers.push('alipay');
  return providers;
}

function connectedTransactionSources(
  connections: Partial<Record<ExternalFinancialProvider, ConnectedFinancialSource>>,
  prompt: string,
) {
  const requested = requestedProviders(prompt);
  return Object.values(connections)
    .filter((source): source is ConnectedFinancialSource => Boolean(source))
    .filter(source => !requested.length || (source.provider !== 'bank' && requested.includes(source.provider)))
    .filter(source => source.scopes.includes('transactions'))
    .map(source => source.displayName);
}

function operationNeedsConfirmation(kind: StewardTaskKind, prompt: string) {
  if (kind === 'transfer') return true;
  if (kind === 'wealth_operation') return /申购|购买|赎回|卖出|操作|办理/.test(prompt);
  if (kind === 'card_management') return /挂失|恢复|解挂|调整|调到|修改|关闭|开启|锁卡|解锁/.test(prompt);
  if (kind === 'subscription') return /取消|关闭|修改/.test(prompt);
  return false;
}

export function createStewardTaskPlan(
  prompt: string,
  connections: Partial<Record<ExternalFinancialProvider, ConnectedFinancialSource>>,
): StewardTaskPlan {
  const kind = detectStewardTaskKind(prompt);
  const base = kindCopy[kind];
  const sources = kind === 'bill_analysis' ? connectedTransactionSources(connections, prompt)
    : kind === 'card_management' || kind === 'transfer' ? ['银行沙箱']
      : kind === 'wealth_operation' ? ['风险测评', '理财产品库', '银行沙箱']
        : kind === 'financial_coaching' ? [...connectedTransactionSources(connections,prompt),'银行沙箱','风险测评']
        : Object.values(connections).filter(Boolean).map(source => source!.displayName);
  const confirmationRequired = operationNeedsConfirmation(kind, prompt);
  const authorizationDetail = kind === 'bill_analysis'
    ? (sources.length ? `已获得 ${sources.join('、')} 账单读取权限` : '需要账单读取授权后才能继续')
    : kind === 'wealth_operation' ? '核对风险测评、产品与资金权限'
      : kind === 'financial_coaching' ? '只读取已授权财务摘要，不代替用户决定'
      : kind === 'card_management' || kind === 'transfer' ? '仅读取脱敏卡片与沙箱账户状态'
        : '按任务最小范围核对授权';
  return {
    id: `task-${Date.now()}`,
    kind,
    goal: base.goal,
    stage: 'authorizing',
    sources,
    capabilities: base.capabilities,
    confirmationRequired,
    steps: [
      { id: 'intent', title: '理解意图', detail: `${base.goal}；已识别本轮边界`, status: 'done' },
      { id: 'authorization', title: '获取授权', detail: authorizationDetail, status: 'active' },
      { id: 'information', title: '调用信息', detail: sources.length ? `准备读取：${sources.join('、')}` : '等待可用数据源', status: 'pending' },
      { id: 'plan', title: '规划步骤', detail: base.capabilities.join(' → '), status: 'pending' },
      { id: 'execution', title: kind === 'bill_analysis' ? '执行分析' : '准备方案', detail: confirmationRequired ? '只准备变更，不自动执行关键操作' : '按计划处理并核对约束', status: 'pending' },
      { id: 'result', title: '解释与选项', detail: '说明依据、限制与可继续的下一步', status: 'pending' },
    ],
  };
}

const activeStep: Record<Exclude<StewardTaskStage, 'complete' | 'error'>, StewardPlanStep['id']> = {
  authorizing: 'authorization',
  gathering: 'information',
  planning: 'plan',
  executing: 'execution',
};

export function advanceStewardTaskPlan(
  plan: StewardTaskPlan,
  stage: StewardTaskStage,
  action?: StewardAction,
): StewardTaskPlan {
  const current = stage === 'complete' || stage === 'error' ? null : activeStep[stage];
  const order = plan.steps.map(step => step.id);
  const currentIndex = current ? order.indexOf(current) : order.length;
  const hasConfirmation = Boolean(action && ['prepare_transfer', 'prepare_aa', 'prepare_cancel'].includes(action.type));
  return {
    ...plan,
    stage,
    confirmationRequired: plan.confirmationRequired || hasConfirmation,
    steps: plan.steps.map((step, index) => {
      if (stage === 'error') {
        const wasActive = step.status === 'active';
        return wasActive ? { ...step, status: 'error' as const, detail: '本步未完成，可检查后重试' } : step;
      }
      if (stage === 'complete') {
        if (step.id === 'execution' && (plan.confirmationRequired || hasConfirmation)) {
          return { ...step, status: 'waiting' as const, detail: '方案已准备，关键操作等待你在核对页确认' };
        }
        return { ...step, status: 'done' as const };
      }
      if (index < currentIndex) return { ...step, status: 'done' as const };
      if (step.id === current) return { ...step, status: 'active' as const };
      return { ...step, status: 'pending' as const };
    }),
  };
}
