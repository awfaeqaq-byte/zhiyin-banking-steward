import {describe,expect,it} from 'vitest';
import {buildWealthGoalPlan} from '../../src/lib/wealth-goal';

describe('目标型资金规划',()=>{
  it('生成保守、基准和积极三种压力测试情景',()=>{
    const plan=buildWealthGoalPlan(50000,10000,12)!;
    expect(plan.gap).toBe(40000);
    expect(plan.scenarios.map(item=>item.id)).toEqual(['conservative','baseline','active']);
    expect(plan.scenarios[0].monthlyContribution).toBeGreaterThan(plan.scenarios[2].monthlyContribution);
  });
  it('拒绝无效周期与金额',()=>{
    expect(buildWealthGoalPlan(0,0,12)).toBeNull();
    expect(buildWealthGoalPlan(10000,0,361)).toBeNull();
  });
});
