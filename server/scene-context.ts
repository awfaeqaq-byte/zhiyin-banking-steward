import {additiveSceneFields, sceneFactFields, validSceneContext, type SceneContext, type SceneFact, type SceneFactField} from '../src/lib/scene-context';
import {dayKey, nextAnnualDate, type Reminder} from '../src/lib/task-calendar';
import {occasionTotals} from '../src/lib/occasion-plans';
import {sharedTextPreview} from '../src/lib/wechat-message-share';
import type {Workspace} from '../src/lib/workspaces';
import type {BankSnapshot} from '../src/lib/bank-transfer';

type Input = {sceneId: string; members: Workspace[]; calendar: Reminder[]; bank: Pick<BankSnapshot, 'occasions' | 'payments'>; now?: number};
const fieldNames: Partial<Record<SceneFactField, string>> = {recipient: '准备对象', birthdayDate: '生日日期', eventDate: '日程日期', budget: '预算', prepareAt: '筹备时间', deliverAt: '期望送达时间', address: '地址', contact: '联系方式'};

/** Joins only explicit task IDs. Text similarity and quoted messages never establish ownership. */
export function buildSceneContext({sceneId, members, calendar, bank, now = Date.now()}: Input): SceneContext {
  const owned = members.filter(task => task.status === 'active' && (task.id === sceneId || task.sceneId === sceneId));
  const workspaceIds = owned.map(task => task.id);
  const context: SceneContext = {version: 1, sceneId, workspaceIds, authorization: 'none', facts: [], conflicts: [], evidence: []};
  const add = (field: SceneFactField, value: string | number, source: SceneFact['source']) => {
    if (typeof value === 'string' && !value.trim()) return;
    context.facts.push({field, value, source});
  };
  for (const task of calendar.filter(task => !!task.workspaceId && workspaceIds.includes(task.workspaceId) && task.status !== 'cancelled')) {
    const source: SceneFact['source'] = {kind: 'calendar', id: task.id, workspaceId: task.workspaceId!, label: `日历：${task.title}`.slice(0, 120)};
    if (task.repeat === 'yearly' && task.allDay) {
      const saved = dayKey(task.dueAt), next = nextAnnualDate(Number(saved.slice(5, 7)), Number(saved.slice(8, 10)), now);
      if (next !== null) add(/生日/.test(task.title) ? 'birthdayDate' : 'eventDate', dayKey(next), source);
      // A clear, already-linked birthday title supplies a label, never cross-person identity matching.
      const recipient = /^(.{1,30}?)(?:的)?生日$/.exec(task.title.trim())?.[1];
      if (recipient) add('recipient', recipient, source);
    } else add('eventDate', dayKey(task.dueAt), source);
  }
  for (const plan of (bank.occasions ?? []).filter(plan => workspaceIds.includes(plan.id))) {
    const source: SceneFact['source'] = {kind: 'occasion', id: plan.id, workspaceId: plan.id, label: `筹备：${plan.title}`.slice(0, 120)};
    if (plan.status === 'draft' || plan.status === 'reserved') {
      for (const field of ['recipient', 'budget', 'prepareAt', 'deliverAt', 'address', 'contact'] as const) add(field, plan[field], source);
    }
    add('held', occasionTotals(plan, bank).held, source);
    for (const payment of (bank.payments ?? []).filter(payment => payment.occasionId === plan.id && plan.orders.some(order => order.paymentId === payment.id && order.amount === payment.amount && order.merchant === payment.merchant))) {
      add(payment.refundedAt === undefined ? 'paid' : 'refunded', payment.amount, {kind: 'payment', id: payment.id, workspaceId: plan.id, label: `银行回执：${payment.merchant}`.slice(0, 120)});
    }
  }
  for (const field of sceneFactFields.filter(field => !additiveSceneFields.includes(field))) {
    const values = [...new Set(context.facts.filter(fact => fact.field === field).map(fact => fact.value))];
    if (values.length > 1) context.conflicts.push({field, values: values.slice(0, 100), question: `同一事项有不同的${fieldNames[field] || field}记录，请核对这次采用哪一个。`});
  }
  // Each task contributes recent original messages; the quote remains evidence, not a confirmed fact.
  const messages = owned.flatMap(task => task.messages.filter(message => message.role === 'user' && message.memoryRevision === task.memoryRevision).slice(-2).map(message => ({task, message})));
  for (const {task, message} of messages.slice(-8)) {
    const shared = sharedTextPreview(message.content);
    const text = shared ? `来源：${shared.source}；本人当时要求：${shared.instruction}；引用原文：${JSON.stringify(shared.messages)}` : message.content;
    context.evidence.push({kind: shared ? 'wechat_share' : 'user_message', id: message.id, workspaceId: task.id, text: text.slice(0, 1200)});
    if (text.length > 1200) context.truncated = true;
  }
  if (context.facts.length > 100) {context.facts = context.facts.slice(0, 100); context.truncated = true;}
  if (messages.length > 8) context.truncated = true;
  if (!validSceneContext(context)) throw new Error('同一事项资料无法核对，原业务记录已保留');
  return context;
}
