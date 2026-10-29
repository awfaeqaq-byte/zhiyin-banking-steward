import type {MerchantState} from '../src/lib/merchant';
import {fundingLedgerNet,validFundingDate} from '../src/lib/merchant-funding';
import {randomUUID} from 'node:crypto';

export function applyFundingOperation(state: MerchantState, input: Record<string, unknown>, now: number) {
 if (!['set-funding-cash','save-funding-plan','cancel-funding-plan','pay-funding-plan'].includes(String(input.type))) throw new Error('不支持的小店操作');
 if (!state.shop) throw new Error('请先创建小店');
 const amount = (v: unknown, min = 1) => {if (!Number.isSafeInteger(v) || Number(v) < min || Number(v) > 100000000) throw new Error('金额超出有效范围'); return Number(v);};
 const text = (v: unknown, max: number) => {if (typeof v !== 'string' || !v.trim() || v.length > max || /[\x00-\x1f\x7f]/.test(v)) throw new Error('安排文字格式不正确'); return v.trim();}; // eslint-disable-line no-control-regex
 const funding = state.funding ??= {plans: []};
 if (input.type === 'set-funding-cash') {funding.cash = {amount: amount(input.amount, 0), confirmedAt: now, ledgerNet: fundingLedgerNet(state)}; return;}
 if (typeof input.id !== 'string' || !/^[\w-]{1,100}$/.test(input.id)) throw new Error('安排标识无效');
 const plan = funding.plans.find(p => p.id === input.id);
 if (plan && plan.status !== 'planned') throw new Error('这笔安排已结束，不能重复修改或记账');
 if (input.type === 'save-funding-plan') {
  const title = text(input.title, 80), category = text(input.category, 30), total = amount(input.amount);
  if (!validFundingDate(input.dueDate)) throw new Error('请输入有效的到期日期');
  if (funding.plans.some(p => p.id !== input.id && p.status === 'planned' && p.title === title && p.amount === total && p.dueDate === input.dueDate)) throw new Error('相同安排已存在，请修改原安排');
  if (!plan && funding.plans.length >= 1000) throw new Error('资金安排已达容量上限');
  const fields = {title, category, amount: total, dueDate: input.dueDate, updatedAt: now};
  if (plan) Object.assign(plan, fields);
  else funding.plans.push({id: input.id, ...fields, createdAt: now, status: 'planned'});
  return;
 }
 if (!plan) throw new Error('安排不存在，请重新核对');
 if (input.type === 'cancel-funding-plan') {plan.status = 'cancelled'; plan.updatedAt = now; return;}
 let expenseId: string;
 if (input.expenseId !== undefined) {
  const expense = state.expenses.find(e => e.id === input.expenseId);
  if (!expense || expense.amount !== plan.amount || funding.plans.some(p => p.expenseId === expense.id)) throw new Error('请选择同金额且未关联其他安排的已有支出');
  expenseId = expense.id;
 } else {
  if (!Number.isSafeInteger(input.occurredAt) || Number(input.occurredAt) < 0 || Number(input.occurredAt) > now) throw new Error('请输入实际已付款时间');
  if (state.expenses.length >= 10000) throw new Error('经营支出已达容量上限');
  expenseId = randomUUID();
  state.expenses.push({id: expenseId, title: plan.title, category: plan.category, amount: plan.amount, occurredAt: Number(input.occurredAt)});
 }
 plan.status = 'paid'; plan.expenseId = expenseId; plan.updatedAt = now;
}
