import { describe, expect, it } from 'vitest';
import { advanceStewardTaskPlan, createStewardTaskPlan, detectStewardTaskKind } from '../../src/lib/steward-agent';
import type { ConnectedFinancialSource } from '../../src/lib/financial-connections';

const wechat: ConnectedFinancialSource = {
  provider: 'wechat_pay', displayName: '微信支付', accountMasked: '叶先生',
  scopes: ['transactions'], transactions: [], autopays: [], syncedAt: '2026-09-29',
};

describe('管家任务规划', () => {
  it('识别三条主场景并显示数据授权', () => {
    expect(detectStewardTaskKind('分析我9月的微信账单')).toBe('bill_analysis');
    expect(detectStewardTaskKind('帮我规划5万元闲钱')).toBe('wealth_operation');
    expect(detectStewardTaskKind('把银行卡限额调到5000')).toBe('card_management');
    const plan = createStewardTaskPlan('分析我9月的微信账单', { wechat_pay: wechat });
    expect(plan.sources).toEqual(['微信支付']);
    expect(plan.steps.map(step => step.title)).toEqual(['理解意图','获取授权','调用信息','规划步骤','执行分析','解释与选项']);
  });

  it('关键操作完成规划后停在用户确认边界', () => {
    const plan = createStewardTaskPlan('把银行卡限额调到5000元', {});
    const complete = advanceStewardTaskPlan(plan, 'complete');
    expect(complete.confirmationRequired).toBe(true);
    expect(complete.steps.find(step => step.id === 'execution')?.status).toBe('waiting');
    expect(complete.steps.find(step => step.id === 'result')?.status).toBe('done');
  });
});
