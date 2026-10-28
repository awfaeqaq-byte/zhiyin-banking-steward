import {expect,it} from 'vitest';
import {analyzeExpenseBreakdown,expenseBreakdownEntry,expenseBreakdownSummary} from './expense-breakdown';
import {entryAllocations,type ExpenseBook} from './expense-notebook';

const book:ExpenseBook={id:'book',title:'聚餐',at:0,entries:[],batches:[],participants:['me','a','b'],defaultPayerId:'me',group:{id:'g',name:'群',revision:1,members:[{id:'me',name:'我',self:true},{id:'a',name:'赵强'},{id:'b',name:'刘敏'}]}};

it.each(['饮料18，午餐388','午餐20，晚饭4，打车16','饮料20，买零食4，打车16','不要记录饮料20，我可乐4，啤酒16AA'])('不合并独立消费或否定指令：%s',prompt=>{
  expect(analyzeExpenseBreakdown(prompt)).toBeNull();
});
it('精确处理小数金额，同时忽略四瓶的数量',()=>{
  const details=analyzeExpenseBreakdown('饮料总共6.6，我可乐3.3元，4瓶啤酒3.3AA')!;
  expect(details.total).toBe(660);
  expect(details.items.map(item=>item.amount)).toEqual([330,330]);
  const entry=expenseBreakdownEntry(book,details)!;
  expect(entryAllocations(book.group,entry).map(member=>member.amount)).toEqual([440,110,110]);
});
it.each(['饮料20，我可乐4，剩下啤酒16除我以外AA','饮料20，赵强可乐4，啤酒16AA','饮料20，我可乐4，啤酒16女生半份'])('复杂分配仍识别总分关系，保持整句交给解释器：%s',prompt=>{
  const details=analyzeExpenseBreakdown(prompt)!;
  expect(details.requiresModel).toBe(true);
  expect(expenseBreakdownEntry(book,details)).toBeNull();
});
it('单价不直接当作多瓶小计保存',()=>{
  const details=analyzeExpenseBreakdown('饮料20，我可乐4，4瓶啤酒每瓶4元AA')!;
  expect(details.needsClarification).toContain('单价');
  expect(expenseBreakdownEntry(book,details)).toBeNull();
});
it('汇总只描述和实际保存值一致的分配',()=>{
  const prompt='饮料20，我可乐4块，然后买了4瓶啤酒16aa';
  const entry=expenseBreakdownEntry(book,analyzeExpenseBreakdown(prompt)!)!;
  expect(expenseBreakdownSummary(book,prompt,entry)).toBe('饮料共20元：可乐4元由你承担，啤酒16元按本次参与人平分。');
  expect(expenseBreakdownSummary(book,prompt,{...entry,amount:4000})).toBeNull();
  expect(expenseBreakdownSummary(book,prompt,{...entry,fixed:[]})).toBeNull();
});
it('非饮料总分带他人归属时保留整句交给模型，不静默全员平分',()=>{
  const details=analyzeExpenseBreakdown('晚饭共20，其中小王的饭4，剩余菜16AA')!;
  expect(details.requiresModel).toBe(true);
  expect(expenseBreakdownEntry(book,details)).toBeNull();
});
it.each([
  '早餐共20，其中咖啡4；晚饭啤酒16',
  '早餐共20，其中咖啡4，晚餐啤酒16',
  '晚饭共20，其中饭4，打车16',
])('独立餐次或消费不构成同一笔总分关系：%s',prompt=>{
  expect(analyzeExpenseBreakdown(prompt)).toBeNull();
});
it('整单明确由我买时记录本人垫付，不套用他人的默认付款人',()=>{
  const details=analyzeExpenseBreakdown('我买的饮料共20，其中可乐4，啤酒16AA')!;
  const entry=expenseBreakdownEntry({...book,defaultPayerId:'a'},details)!;
  expect(entry.payerId).toBe('me');
  expect(entry.fixed).toEqual([]);
});
it('仅子项明确由我买而默认由别人付时不强行归成一个垫付人',()=>{
  const details=analyzeExpenseBreakdown('饮料共20，我买了可乐4，啤酒16AA')!;
  expect(expenseBreakdownEntry({...book,defaultPayerId:'a'},details)).toBeNull();
});
