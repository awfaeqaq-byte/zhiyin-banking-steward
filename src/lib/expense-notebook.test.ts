import {describe,it,expect} from 'vitest';
import {emptyExpenseState,changeExpenses,settlementPlan,entryAllocations,type ExpenseCommand,type ExpenseState} from './expense-notebook';
const group={id:'g',name:'饭搭子',revision:1,members:[{id:'self',name:'我',self:true},{id:'li',name:'李娜'},{id:'wang',name:'小王'}]};
const at=1790000000000;
const create={type:'create',bookId:'b',title:'今晚聚餐',group,participants:['self','li','wang'],defaultPayerId:'self'};
function apply(s:ExpenseState,c:object,key=crypto.randomUUID()){return changeExpenses(s,{...c,requestId:key,revision:s.revision} as ExpenseCommand,at);}
function opened(){return apply(emptyExpenseState(),create);}
const entry=(title='饮料',amount=1000)=>({title,amount,payerId:'self',fixed:[],shares:[{memberId:'self',weight:1},{memberId:'li',weight:1},{memberId:'wang',weight:1}]});
describe('零散消费账本',()=>{
 it('追加相同消费不去重，纠正只改指定记录，单笔例外不污染默认人选',()=>{
  let s=opened();s=apply(s,{type:'add',bookId:'b',entryId:'one',entry:entry()});s=apply(s,{type:'add',bookId:'b',entryId:'two',entry:entry()});
  s=apply(s,{type:'edit',bookId:'b',entryId:'two',entry:{...entry('饮料',1800),shares:[{memberId:'self',weight:1},{memberId:'li',weight:1}]}});
  expect(s.books[0].entries.map(e=>e.amount)).toEqual([1000,1800]);expect(s.books[0].participants).toEqual(['self','li','wang']);
 });
 it('固定3元可乐与余款平分逐分守恒',()=>{
  const e={...entry(),fixed:[{memberId:'li',amount:300}],shares:[{memberId:'self',weight:1},{memberId:'wang',weight:1}]};
  expect(entryAllocations(group,e).map(m=>m.amount)).toEqual([350,300,350]);
  expect(()=>entryAllocations(group,{...e,fixed:[{memberId:'li',amount:1001}]})).toThrow();
 });
 it('请求幂等、版本冲突和非法成员不会污染状态',()=>{
  const s=opened(),c={type:'add',bookId:'b',entryId:'one',entry:entry(),requestId:'req',revision:s.revision} as ExpenseCommand;
  const next=changeExpenses(s,c,at);expect(changeExpenses(next,c,at)).toEqual(next);
  expect(()=>changeExpenses(next,{...c,requestId:'other'},at)).toThrow();
  expect(()=>apply(s,{type:'add',bookId:'b',entryId:'bad',entry:{...entry(),payerId:'fake'}})).toThrow();
 });
 it('结算冻结原记录、发布后不重收，后续新增继续待结算',()=>{
  let s=apply(opened(),{type:'add',bookId:'b',entryId:'one',entry:entry()});
  s=apply(s,{type:'prepare',bookId:'b',batchId:'batch',entryIds:['one']});
  expect(()=>apply(s,{type:'edit',bookId:'b',entryId:'one',entry:entry('改',900)})).toThrow();
  expect(()=>settlementPlan(s.books[0],['one'])).toThrow();
  s=apply(s,{type:'published',bookId:'b',batchId:'batch',collectionId:'batch'});
  s=apply(s,{type:'add',bookId:'b',entryId:'two',entry:entry()});
  expect(settlementPlan(s.books[0],['two']).items).toHaveLength(1);
  expect(s.books[0].batches[0].status).toBe('published');
 });
 it('他人垫付款不能被当成向本人收款',()=>{
  const s=apply(opened(),{type:'add',bookId:'b',entryId:'one',entry:{...entry(),payerId:'li'}});
  expect(()=>settlementPlan(s.books[0],['one'])).toThrow(/他人垫付/);
 });
 it('取消准备可恢复修改，但已发布记录不能解锁或删除',()=>{
  let s=apply(opened(),{type:'add',bookId:'b',entryId:'one',entry:entry()});s=apply(s,{type:'prepare',bookId:'b',batchId:'batch',entryIds:['one']});s=apply(s,{type:'release',bookId:'b',batchId:'batch'});
  s=apply(s,{type:'delete',bookId:'b',entryId:'one'});expect(s.books[0].entries).toHaveLength(0);
 });
});
