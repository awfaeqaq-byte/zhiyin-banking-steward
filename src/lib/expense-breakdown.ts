import type { ExpenseBook, ExpenseInput } from './expense-notebook';

export type ExpenseBreakdown = {
  title: string;
  total: number;
  items: { title: string; amount: number; personal: boolean }[];
  needsClarification?: string;
  requiresModel?: boolean;
  payer?: 'self';
  hasSelfPaidDetail?: boolean;
};

const yuan = (amount: number) => (amount / 100).toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1');
const quantity = /^(?:瓶|杯|罐|个|份|盒|包|串|斤|人)/;
const drink = /可乐|啤酒|汽水|矿泉水|气泡水|纯净水|果汁|奶茶|咖啡|牛奶|豆浆|酸奶|茶饮/;
const selfPayment = /我(?:自己)?(?:先)?(?:买|付|垫|出钱|出了)/;
const contexts = [
  /早餐|早饭/, /午餐|午饭|中饭/, /晚餐|晚饭/, /夜宵/, /饮料|酒水|饮品|可乐|啤酒|咖啡|奶茶/,
  /打车|车费|出租车|地铁|交通|公交/, /住宿|房费|酒店/, /停车/, /电影票|门票/,
];

function mentionsAnotherPurchase(title: string, clauses: string[]) {
  const parent = contexts.flatMap((pattern,index)=>pattern.test(title)?[index]:[]);
  if (!parent.length) return false;
  const allowed = new Set(parent);
  if (parent.some(index=>index<4)) allowed.add(4); // Drinks may be part of a meal.
  return clauses.some(clause=>contexts.some((pattern,index)=>!allowed.has(index)&&pattern.test(clause)));
}

function cost(clause: string) {
  const amounts = [...clause.matchAll(/-?\d+(?:\.\d+)?/g)].filter(match => !quantity.test(clause.slice(match.index! + match[0].length).trimStart()));
  if (amounts.length !== 1) return null;
  const amount = amounts[0];
  if (!/^\d+(?:\.\d{1,2})?$/.test(amount[0])) return null;
  const [whole, decimal = ''] = amount[0].split('.');
  const value = Number(whole) * 100 + Number(decimal.padEnd(2,'0'));
  if (!Number.isSafeInteger(value) || value <= 0 || value > 10_000_000) return null;
  return { amount: value, index: amount.index!, length: amount[0].length };
}

function itemTitle(clause: string, amount: ReturnType<typeof cost> & {}) {
  return (clause.slice(0, amount.index) + clause.slice(amount.index + amount.length))
    .replace(/\d+(?:\.\d+)?\s*(?:瓶|杯|罐|个|份|盒|包|串|斤)/g, '')
    .replace(/我(?:自己)?(?:先)?(?:买|付|垫付|垫|出钱|出了)(?:了|的)?/g,'')
    .replace(/然后|其中|剩下|剩余|其余|另外|还有|一共|总共|合计|总计|共计|共|我自己|我的|我|自己|买了|买|喝了|喝的|吃了|吃的|独自承担|自己承担|单独承担|由你承担|平分|均摊|大家|一起|AA|aa|通a|元|块钱|块|钱|的|了|个|[¥￥：:\s]/g, '')
    .trim();
}

/** Only identify an explicit total/detail relationship. Independent purchases remain separate. */
export function analyzeExpenseBreakdown(prompt: string): ExpenseBreakdown | null {
  if (/不要|别记|没买|取消|假如|假设|比如|例如|改成|改为|更正|说错|删除/.test(prompt)) return null;
  const clauses = prompt.trim().split(/[，,；;。\n]+/).map(value => value.trim()).filter(Boolean);
  if (clauses.length < 3 || clauses.length > 8) return null;
  const total = cost(clauses[0]);
  if (!total) return null;
  const title = itemTitle(clauses[0], total);
  if (!title || title.length > 20) return null;
  const detailClauses = clauses.slice(1);
  if (mentionsAnotherPurchase(title,detailClauses)) return null;
  const isDrinkBreakdown = /^(?:饮料|酒水|饮品|酒水饮料)$/.test(title) && detailClauses.every(value => drink.test(value));
  const explicitBreakdown = /总共|一共|合计|总计|共计|共/.test(clauses[0]) && detailClauses.some(value => /其中|剩下|剩余|其余/.test(value));
  if (!isDrinkBreakdown && !explicitBreakdown) return null;
  const costs = detailClauses.map(cost);
  if (detailClauses.some(clause=>/每瓶|每杯|每份|单价|一瓶|一杯|一份/.test(clause))) return {title,total:total.amount,items:[],needsClarification:'请确认这些明细的小计金额；我不会把单价当作这项的总价。'};
  if (costs.some(amount=>!amount)) return {title,total:total.amount,items:[],needsClarification:'请补充每项的小计金额，瓶数和单价不会直接记成消费总额。'};
  const sum = costs.reduce((value,amount)=>value+amount!.amount,0);
  if (sum !== total.amount) return {title,total:total.amount,items:[],needsClarification:`你说${title}共${yuan(total.amount)}元，但明细合计${yuan(sum)}元。请确认总额或哪一项金额需要修改，这笔还没有记入。`};
  // Generic relationships are useful to keep together, but ownership needs full interpretation.
  if (!isDrinkBreakdown) return {title,total:total.amount,items:[],requiresModel:true};
  // Preserve the whole sentence for the full interpreter when allocations need context.
  if (/不参与|没喝|没吃|不算|除我|除去|不包括|半份|双份|每人|我和|我们|他们|(?:由|给).{1,10}(?:承担|付|喝|吃)|请客/.test(detailClauses.join('，'))) return {title,total:total.amount,items:[],requiresModel:true};
  const items: ExpenseBreakdown['items'] = [];
  for (const [index,clause] of detailClauses.entries()) {
    const amount = costs[index]!;
    const label = itemTitle(clause, amount);
    if (!label || label.length > 25) return {title,total:total.amount,items:[],requiresModel:true};
    // Unknown names/qualifiers must not silently become a default shared allocation.
    if (isDrinkBreakdown && !/^(?:百事|可口|无糖|冰|热|冰镇)?(?:可乐|啤酒|汽水|矿泉水|气泡水|纯净水|果汁|奶茶|咖啡|牛奶|豆浆|酸奶|茶饮)$/.test(label)) return {title,total:total.amount,items:[],requiresModel:true};
    const personal = /我自己|我的|我(?!(?:买|付|垫|花|们|先|出了))|(?:我|自己)(?:单独|独自)?承担/.test(clause);
    if (personal && /AA|aa|通a|平分|均摊/.test(clause)) return {title,total:total.amount,items:[],needsClarification:`${label}是由你自己承担，还是参加平分？确认后我再记入。`};
    items.push({title:label,amount:amount.amount,personal});
  }
  return {
    title,total:total.amount,items,
    ...(selfPayment.test(clauses[0])?{payer:'self' as const}:{}),
    ...(detailClauses.some(clause=>selfPayment.test(clause))?{hasSelfPaidDetail:true}:{}),
  };
}

export function expenseBreakdownEntry(book: ExpenseBook, breakdown: ExpenseBreakdown): ExpenseInput | null {
  if (breakdown.needsClarification || breakdown.requiresModel) return null;
  const personal = breakdown.items.filter(item=>item.personal).reduce((sum,item)=>sum+item.amount,0);
  const self = book.group.members.find(member=>member.self);
  if ((personal || breakdown.payer || breakdown.hasSelfPaidDetail) && !self) return null;
  if (breakdown.hasSelfPaidDetail && !breakdown.payer && book.defaultPayerId !== self?.id) return null;
  return {
    title: breakdown.title, amount: breakdown.total, payerId: breakdown.payer === 'self' ? self!.id : book.defaultPayerId,
    fixed: personal ? [{memberId:self!.id,amount:personal}] : [],
    shares: personal === breakdown.total ? [] : book.participants.map(memberId=>({memberId,weight:1})),
  };
}

/** Match the saved values before describing composition; never trust a model's receipt text. */
export function expenseBreakdownSummary(book: ExpenseBook, prompt: string, entry: ExpenseInput) {
  const breakdown = analyzeExpenseBreakdown(prompt);
  const expected = breakdown && expenseBreakdownEntry(book,breakdown);
  if (!breakdown || !expected || JSON.stringify(expected) !== JSON.stringify({title:entry.title,amount:entry.amount,payerId:entry.payerId,fixed:entry.fixed,shares:entry.shares})) return null;
  return `${breakdown.title}共${yuan(breakdown.total)}元：${breakdown.items.map(item=>`${item.title}${yuan(item.amount)}元${item.personal?'由你承担':'按本次参与人平分'}`).join('，')}。`;
}
