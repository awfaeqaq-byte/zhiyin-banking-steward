import {expect, it} from 'vitest';
import {contextValue, formatSceneContext, validSceneContext, type SceneContext} from '../../src/lib/scene-context';

const context: SceneContext = {version: 1, sceneId: 'birthday', workspaceIds: ['birthday', 'prepare'], authorization: 'none', facts: [
  {field: 'birthdayDate', value: '2026-10-28', source: {kind: 'calendar', id: 'date', workspaceId: 'birthday', label: '王芳生日'}},
], conflicts: [], evidence: []};
it('模型上下文明确来源只供建议、生日日期不是送达时刻，未关联事项不能注入事实', () => {
  expect(validSceneContext(context)).toBe(true);
  const formatted = formatSceneContext(context);
  expect(formatted).toContain('2026-10-28'); expect(formatted).toContain('不是送达'); expect(formatted).toContain('不构成授权');
  expect(validSceneContext({...context, facts: [{...context.facts[0], source: {...context.facts[0].source, workspaceId: 'other'}}]})).toBe(false);
  expect(formatSceneContext(undefined)).toBe('');
});
it('冲突的共同事实不自动回填，零预留仍是有效金额', () => {
  const conflict = {...context, facts: [...context.facts, {...context.facts[0], value: '2026-10-29'}], conflicts: [{field: 'birthdayDate' as const, values: ['2026-10-28', '2026-10-29'], question: '请核对生日日期'}]};
  expect(contextValue(context, 'birthdayDate')).toBe('2026-10-28');
  expect(contextValue(conflict, 'birthdayDate')).toBeUndefined();
  expect(contextValue({...context, facts: [{field: 'held', value: 0, source: {kind: 'occasion', id: 'prepare', workspaceId: 'prepare', label: '筹备预留'}}]}, 'held')).toBe(0);
});
it('上下文和金额有严格边界，不能携带执行授权或无限量原文', () => {
  expect(validSceneContext({...context, authorization: 'pay'})).toBe(false);
  expect(validSceneContext({...context, facts: [{...context.facts[0], field: 'budget', value: -1}]})).toBe(false);
  expect(validSceneContext({...context, facts: [{...context.facts[0], field: 'birthdayDate', value: '2026-02-30'}]})).toBe(false);
  expect(validSceneContext({...context, evidence: [{kind: 'user_message', id: 'm', workspaceId: 'birthday', text: 'x'.repeat(1201)}]})).toBe(false);
  expect(validSceneContext({...context, facts: Array.from({length: 101}, () => context.facts[0])})).toBe(false);
});

it('多笔同额付款仍是不同证据，不能把一个金额误当共同事项的付款总额', () => {
  const receipts: SceneContext = {...context, facts: ['pay-one', 'pay-two'].map(id => ({field: 'paid', value: 20600, source: {kind: 'payment', id, workspaceId: 'prepare', label: '订单付款'}}))};
  expect(contextValue(receipts, 'paid')).toBeUndefined();
});

it('格式化大量来源时保留完整JSON和截断标记，不输出无限量上下文', () => {
  const many: SceneContext = {...context, workspaceIds: Array.from({length: 100}, (_, index) => `task-${index}-${'x'.repeat(150)}`), facts: [], evidence: []};
  const formatted = formatSceneContext(many);
  expect(formatted.length).toBeLessThan(10000);
});

it('业务模型可限制共享资料字数，原文超量时优先保留业务事实', () => {
  const many: SceneContext = {...context, evidence: Array.from({length: 8}, (_, index) => ({kind: 'user_message', id: `message-${index}`, workspaceId: 'birthday', text: '甲'.repeat(1200)}))};
  const formatted = formatSceneContext(many, 3500);
  expect(formatted.length).toBeLessThanOrEqual(3500);
  const data = JSON.parse(formatted.slice(formatted.indexOf('\n') + 1));
  expect(data.facts).toEqual(context.facts); expect(data.truncated).toBe(true);
  expect(formatSceneContext(many, 1).length).toBeLessThanOrEqual(1000);
});
