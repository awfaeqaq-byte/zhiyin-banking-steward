import type {MerchantState} from './merchant';

export type FundingPlan = {
 id: string; title: string; category: string; amount: number; dueDate: string;
 status: 'planned' | 'paid' | 'cancelled'; createdAt: number; updatedAt: number; expenseId?: string;
};
export type MerchantFunding = {
 cash?: {amount: number; confirmedAt: number; ledgerNet: number};
 plans: FundingPlan[];
};
export type FundingOperation =
 | {type: 'set-funding-cash'; amount: number}
 | {type: 'save-funding-plan'; id: string; title: string; category: string; amount: number; dueDate: string}
 | {type: 'cancel-funding-plan'; id: string}
 | {type: 'pay-funding-plan'; id: string; occurredAt?: number; expenseId?: string};
/** A server-authored proposal is not a mutation or a payment authorization. */
export type FundingDraft = {
 intent: 'overview' | 'plan' | 'cash' | 'cancel' | 'paid'; revision: number;
 planId?: string; title?: string; category?: string; amount?: number; dueDate?: string;
};
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const id = (v: unknown): v is string => typeof v === 'string' && /^[\w-]{1,100}$/.test(v);
const text = (v: unknown, max: number): v is string => typeof v === 'string' && !!v.trim() && v.length <= max && !/[\x00-\x1f\x7f]/.test(v); // eslint-disable-line no-control-regex
const integer = (v: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): v is number => Number.isSafeInteger(v) && Number(v) >= min && Number(v) <= max;
export const fundingDay = (now = Date.now()) => new Date(now + 8 * 3600000).toISOString().slice(0, 10);
export function validFundingDate(v: unknown): v is string {
 return typeof v === 'string' && /^20\d\d-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v;
}
export function validFunding(v: unknown): v is MerchantFunding {
 if (!object(v) || !Array.isArray(v.plans) || v.plans.length > 1000) return false;
 if (v.cash !== undefined && (!object(v.cash) || !integer(v.cash.amount, 0, 100000000) || !integer(v.cash.confirmedAt, 0, 8640000000000000) || !Number.isSafeInteger(v.cash.ledgerNet))) return false;
 return v.plans.every(p => object(p) && id(p.id) && text(p.title, 80) && text(p.category, 30) && integer(p.amount, 1, 100000000) && validFundingDate(p.dueDate) && ['planned', 'paid', 'cancelled'].includes(String(p.status)) && integer(p.createdAt, 0, 8640000000000000) && integer(p.updatedAt, p.createdAt as number, 8640000000000000) && (p.status === 'paid' ? id(p.expenseId) : p.expenseId === undefined)) && new Set(v.plans.map(p => p.id)).size === v.plans.length && new Set(v.plans.filter(p => p.expenseId).map(p => p.expenseId)).size === v.plans.filter(p => p.expenseId).length;
}
export function validFundingDraft(v: unknown): v is FundingDraft {
 return object(v) && ['overview', 'plan', 'cash', 'cancel', 'paid'].includes(String(v.intent)) && integer(v.revision) && (v.planId === undefined || id(v.planId)) && (v.title === undefined || text(v.title, 80)) && (v.category === undefined || text(v.category, 30)) && (v.amount === undefined || integer(v.amount, v.intent === 'cash' ? 0 : 1, 100000000)) && (v.dueDate === undefined || validFundingDate(v.dueDate)) && (!['plan', 'cancel', 'paid'].includes(String(v.intent)) || id(v.planId));
}
/** This is the recorded ledger, not a bank balance. Backfilled entries also change it. */
export function fundingLedgerNet(state: MerchantState): number {
 return state.orders.reduce((sum, o) => sum + (o.status === 'paid' ? o.total : 0), 0) - state.expenses.reduce((sum, e) => sum + e.amount, 0);
}
export function fundingProjection(state: MerchantState, now = Date.now()) {
 const cash = state.funding?.cash;
 const available = cash ? cash.amount + fundingLedgerNet(state) - cash.ledgerNet : null;
 let remaining = available;
 const rows = (state.funding?.plans ?? []).filter(p => p.status === 'planned').slice().sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.createdAt - b.createdAt || a.id.localeCompare(b.id)).map(plan => {
  if (remaining !== null) remaining -= plan.amount;
  return {...plan, remaining, overdue: plan.dueDate < fundingDay(now)};
 });
 const required = rows.reduce((sum, p) => sum + p.amount, 0);
 return {available, required, free: available === null ? null : Math.max(0, available - required), shortfall: available === null ? null : Math.max(0, required - available), firstShortfall: rows.find(p => p.remaining !== null && p.remaining < 0)?.dueDate, rows};
}
export function isFundingPrompt(prompt: string) {
 return /资金安排|可用(?:资金|余额)|周转金|预留|备付|缺口|够不够|现金流预测|(?:安排|准备|计划|到期).{0,12}(?:房租|进货|采购|工资|水电|付款)|(?:房租|进货|采购|工资|水电|设备|装修).{0,20}(?:\d|付了|已付|取消|安排)|(?:下周|明天|后天|\d日|\d号).{0,12}(?:房租|进货|采购|工资|水电)|^(?:改成|改到|调整|延期|取消这笔)/.test(prompt);
}
function parseDate(prompt: string, now: number): {date?: string; invalid?: boolean} {
 const today = fundingDay(now), base = Date.parse(today), year = Number(today.slice(0, 4));
 const absolute = prompt.match(/(20\d{2})[-/年](\d{1,2})[-/月](\d{1,2})(?:日|号)?/);
 const month = prompt.match(/(\d{1,2})月(\d{1,2})(?:日|号)?/);
 let value: string | undefined;
 if (absolute) value = `${absolute[1]}-${absolute[2].padStart(2, '0')}-${absolute[3].padStart(2, '0')}`;
 else if (month) {value = `${year}-${month[1].padStart(2, '0')}-${month[2].padStart(2, '0')}`; if (validFundingDate(value) && value < today) value = `${year + 1}${value.slice(4)}`;}
 else {
  const weekday = prompt.match(/(下周|本周|这周|周)([一二三四五六日天])/);
  if (weekday) {
   const current = new Date(base).getUTCDay() || 7, target = '一二三四五六日'.indexOf(weekday[2] === '天' ? '日' : weekday[2]) + 1;
   let delta = target - current + (weekday[1] === '下周' ? 7 : 0);
   if (weekday[1] === '周' && delta < 0) delta += 7;
   value = new Date(base + delta * 86400000).toISOString().slice(0, 10);
  } else if (/今天|明天|后天/.test(prompt)) value = new Date(base + (/后天/.test(prompt) ? 2 : /明天/.test(prompt) ? 1 : 0) * 86400000).toISOString().slice(0, 10);
 }
 return value ? validFundingDate(value) ? {date: value} : {invalid: true} : {};
}
/** Conservative extraction: ambiguous or compound instructions remain unexecuted. */
export function fundingReply(state: MerchantState, prompt: string, now = Date.now(), previous?: FundingDraft): {text: string; draft: FundingDraft} | null {
 const continuation = !!previous && /^(?:改|调|延期|取消|\d|今天|明天|后天|下周|本周|周)/.test(prompt.trim());
 if (!isFundingPrompt(prompt) && !continuation) return null;
 const overview = (message: string) => ({text: message, draft: {intent: 'overview' as const, revision: state.revision}});
 if (/每月|每周|每年|按月|按周|循环/.test(prompt)) return overview('先核对最近一次的金额和明确日期；当前安排按单次记录，不会自动生成每期付款。');
 const date = parseDate(prompt, now);
 if (date.invalid) return overview('这个日期不存在，请给一个有效的到期日期。原安排没有修改。');
 const withoutDates = prompt.replace(/20\d{2}[-/年]\d{1,2}[-/月]\d{1,2}(?:日|号)?|\d{1,2}月\d{1,2}(?:日|号)?/g, '');
 const amounts = [...withoutDates.matchAll(/(?<![\d.])(\d+(?:\.\d{1,2})?)\s*(万)?\s*(?:元|块)(?!\d)/g)];
 if (amounts.length > 1 || /(?:房租.*(?:进货|采购|工资)|(?:进货|采购|工资).*房租)/.test(prompt)) return overview('这里有多笔资金安排，请逐笔核对金额与日期；本次还没有保存任何一笔。');
 const bare = !amounts.length && withoutDates.match(/(?:改成|金额(?:是|为)?|房租|进货款?|采购款?|可用资金|可用余额|周转金)\s*(\d+(?:\.\d{1,2})?)(万)?(?:\s|[，。！？]|$)/);
 const numeric = continuation ? withoutDates.trim().match(/^(\d+(?:\.\d{1,2})?)(万)?[。！!]?$/) : null;
 const match = amounts[0] || bare || numeric;
 const amount = match ? Math.round(Number(match[1]) * (match[2] ? 10000 : 1) * 100) : undefined;
 if (amount !== undefined && (!integer(amount, 0, 100000000) || /-\s*\d|\d+\.\d{3,}/.test(prompt))) return overview('金额需要在 0 到 100 万元之间，最多保留两位小数。原安排没有修改。');
 if (/可用资金|可用余额|周转金/.test(prompt) || previous?.intent === 'cash' && continuation) return {text: '请核对现在可用于小店经营的余额。确认后会作为测算起点，未收款订单不计入。', draft: {intent: 'cash', revision: state.revision, ...(amount !== undefined ? {amount} : {})}};
 const title = prompt.match(/房租|进货(?:款)?|采购(?:款)?|工资|水电(?:费)?|设备(?:款)?|装修(?:款)?/)?.[0];
 const editing = /改成|改到|调整|延期|取消|付了|已付|已经付/.test(prompt);
 const active = (state.funding?.plans ?? []).filter(p => p.status === 'planned');
 const matched = title ? active.filter(p => p.title.includes(title) || title.includes(p.title)) : [];
 let prior = continuation && previous?.intent === 'plan' ? previous : undefined;
 if (editing && title) {
  if (matched.length !== 1) return overview('请在下面选择要调整的具体安排，避免改错同名账目。');
  const p = matched[0]; prior = {intent: 'plan', revision: state.revision, planId: p.id, title: p.title, category: p.category, amount: p.amount, dueDate: p.dueDate};
 }
 if (editing && !prior) return overview('请先选中一笔安排，或告诉我是哪笔房租、进货款。原安排没有修改。');
 if (/取消|付了|已付|已经付/.test(prompt)) {
  if (amount !== undefined && prior?.amount !== amount) return overview('你刚说的金额与原安排不同，请先调整并保存金额，再核对付款记录。');
  if (!active.some(p => p.id === prior?.planId)) return overview('这笔草稿还未保存，无需取消，也不能登记为已支付。');
  return {text: /取消/.test(prompt) ? '核对后可取消这笔预算安排，不会撤销已经发生的付款。' : '请确认这笔钱已在原渠道支付，并选择新记一笔支出或关联已有账目。', draft: {...prior!, revision: state.revision, intent: /取消/.test(prompt) ? 'cancel' : 'paid'}};
 }
 if (!title && !prior && amount === undefined && !/预留|安排.{0,10}(?:支出|付款)/.test(prompt)) return overview('按到期顺序核对下面的安排。可用余额需要你确认，未收款收入不会用于填补缺口。');
 if (amount === 0) return overview('支出安排的金额需要大于 0；如果不再需要，可以取消原安排。');
 const category = title ? /房租/.test(title) ? '房租' : /进货|采购/.test(title) ? '进货' : /工资/.test(title) ? '人工' : /水电/.test(title) ? '水电' : '其他' : prior?.category;
 const draft: FundingDraft = {intent: 'plan', revision: state.revision, planId: prior?.planId ?? crypto.randomUUID(), ...(prior?.title || title ? {title: prior?.title ?? title} : {}), ...(category ? {category} : {}), ...(amount !== undefined || prior?.amount !== undefined ? {amount: amount ?? prior?.amount} : {}), ...(date.date || prior?.dueDate ? {dueDate: date.date ?? prior?.dueDate} : {})};
 const missing = [!draft.title && '支出事项', draft.amount === undefined && '金额', !draft.dueDate && '到期日期'].filter(Boolean);
 return {text: missing.length ? `还需要${missing.join('、')}，可以直接补充或在卡片里选择。确认前不会改账。` : '安排已整理，核对后保存。预留只用于测算，不会冻结资金或自动付款。', draft};
}
