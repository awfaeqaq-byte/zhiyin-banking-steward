import {describe,it,expect} from 'vitest';
import {changeExpenses,emptyExpenseState,settlementPlan,validExpenseState,type ExpenseCommand,type ExpenseState} from './expense-notebook';
import {importSceneExpenses,syncSceneExpenses,sceneExpenseCandidates,type SceneExpenseSource} from './scene-expenses';
import {expenseActivityClosed} from './expense-follow-up';
const at=1790000000000;
const group={id:'g',name:'生日聚餐',revision:1,members:[{id:'me',name:'我',self:true},{id:'li',name:'李娜'}]};
const source:SceneExpenseSource={id:'occasion-payment-a',workspaceId:'birthday',orderId:'order-a',paymentId:'payment-a',kind:'occasion',title:'生日蛋糕',merchant:'蛋糕店',paidAmount:20600,refundedAmount:0,paidAt:at,checkedAt:at};
function apply(state:ExpenseState,op:object){return changeExpenses(state,{...op,revision:state.revision,requestId:crypto.randomUUID()} as ExpenseCommand,at);}
function opened(){return apply(emptyExpenseState(),{type:'create',bookId:'book',title:'生日聚餐',group,participants:['me','li'],defaultPayerId:'me'});}
function imported(){return importSceneExpenses(opened(),'book',[source],at);}
describe('订单实付进入同一活动账本',()=>{
 it('只形成待确认候选，确认后保留付款来源、按既有参与人分摊且跨账本不重复',()=>{
  let state=opened();expect(sceneExpenseCandidates(state,[source])).toEqual([source]);expect(state.books[0].entries).toHaveLength(0);
  state=importSceneExpenses(state,'book',[source],at);const entry=state.books[0].entries[0];
  expect(entry.amount).toBe(20600);expect(entry.source).toEqual(source);expect(entry.shares).toEqual([{memberId:'me',weight:1},{memberId:'li',weight:1}]);
  expect(sceneExpenseCandidates(state,[source])).toEqual([]);expect(importSceneExpenses(state,'book',[source],at)).toEqual(state);
  state=apply(state,{type:'create',bookId:'other',title:'另一个活动',group,participants:['me','li'],defaultPayerId:'me'});
  expect(()=>importSceneExpenses(state,'other',[source],at)).toThrow(/已记入/);expect(validExpenseState(state)).toBe(true);
 });
 it('未结算退款按真实净额更新，拒绝用旧回执回滚；全退后不允许继续收款',()=>{
  let state=imported();state=syncSceneExpenses(state,[{...source,refundedAmount:600,checkedAt:at+1}]);
  expect(state.books[0].entries[0].amount).toBe(20000);expect(syncSceneExpenses(state,[source])).toEqual(state);
  state=syncSceneExpenses(state,[{...source,refundedAmount:20600,checkedAt:at+2}]);
  expect(()=>settlementPlan(state.books[0],[state.books[0].entries[0].id])).toThrow(/退款/);expect(validExpenseState(state)).toBe(true);
 });
 it('待微信确认时退款使旧草案失效，保留原批次锁直到核对平台结果',()=>{
  let state=imported();const id=state.books[0].entries[0].id;
  state=apply(state,{type:'prepare',bookId:'book',batchId:'batch',entryIds:[id]});
  state=syncSceneExpenses(state,[{...source,refundedAmount:600,checkedAt:at+1}]);
  expect(state.books[0].batches[0].sourceChanged).toBe(true);expect(state.books[0].entries[0].batchId).toBe('batch');
  expect(state.books[0].batches[0].plan.items[0].amount).toBe(20600);
  state=apply(state,{type:'release',bookId:'book',batchId:'batch'});
  expect(state.books[0].entries[0].amount).toBe(20000);expect(settlementPlan(state.books[0],[id]).items[0].amount).toBe(20000);
 });
 it('已发布后退款保留原收款依据并留下差额待处理，不再归档为结清',()=>{
  let state=imported();const id=state.books[0].entries[0].id;
  state=apply(state,{type:'prepare',bookId:'book',batchId:'batch',entryIds:[id]});state=apply(state,{type:'published',bookId:'book',batchId:'batch',collectionId:'batch'});
  state=syncSceneExpenses(state,[{...source,refundedAmount:600,checkedAt:at+1}]);
  expect(state.books[0].entries[0].amount).toBe(20600);expect(state.books[0].entries[0].source?.refundedAmount).toBe(600);
  expect(state.books[0].batches[0].sourceChanged).toBe(true);expect(expenseActivityClosed(state.books[0])).toBe(false);
  expect(sceneExpenseCandidates(state,[source])).toEqual([]);
 });
 it('手工修改只可改分摊规则，不能篡改回执实付金额或抹掉来源',()=>{
  let state=imported();const entry=state.books[0].entries[0];
  expect(()=>apply(state,{type:'edit',bookId:'book',entryId:entry.id,entry:{...entry,amount:30000}})).toThrow(/回执/);
  state=apply(state,{type:'edit',bookId:'book',entryId:entry.id,entry:{...entry,shares:[{memberId:'me',weight:2},{memberId:'li',weight:1}]}});
  expect(state.books[0].entries[0].source).toEqual(source);
  expect(()=>apply(state,{type:'delete',bookId:'book',entryId:entry.id})).toThrow(/来源/);
 });
 it('退款导致固定份额超过净额时等待重新分摊，不悄悄改变用户规则',()=>{
  let state=imported();const entry=state.books[0].entries[0];
  state=apply(state,{type:'edit',bookId:'book',entryId:entry.id,entry:{...entry,fixed:[{memberId:'li',amount:20000}],shares:[{memberId:'me',weight:1}]}});
  state=syncSceneExpenses(state,[{...source,refundedAmount:1000,checkedAt:at+1}]);
  expect(state.books[0].entries[0].fixed).toEqual([{memberId:'li',amount:20000}]);
  expect(()=>settlementPlan(state.books[0],[entry.id])).toThrow(/分摊/);expect(validExpenseState(state)).toBe(true);
 });
 it('不接受未付款、退款超额或同身份变价的来源，不因一次漏读删除历史',()=>{
  expect(()=>importSceneExpenses(opened(),'book',[{...source,paidAmount:0}],at)).toThrow();
  expect(()=>syncSceneExpenses(imported(),[{...source,refundedAmount:20601,checkedAt:at+1}])).toThrow();
  expect(()=>syncSceneExpenses(imported(),[{...source,paidAmount:30000,checkedAt:at+1}])).toThrow(/不一致/);
  expect(syncSceneExpenses(imported(),[])).toEqual(imported());
 });
});
