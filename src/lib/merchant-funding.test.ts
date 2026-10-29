import {describe,it,expect,afterEach} from 'vitest';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createMerchantStore} from '../../server/merchant';
import {emptyMerchantState,validMerchantState,type MerchantState} from './merchant';
import {fundingProjection,fundingReply,validFunding,validFundingDraft} from './merchant-funding';
import {isMerchantPrompt,merchantAnswer,validMerchantInsight} from './merchant-assistant';
const now=Date.parse('2026-10-29T12:00:00+08:00');
const scope='12345678-1234-4234-8234-123456789abc';
const fixture=():MerchantState=>({...emptyMerchantState(),shop:{id:'shop',name:'小馆',publicToken:'abcdefghijklmnopqrstuv',menu:[],createdAt:now},funding:{cash:{amount:500000,confirmedAt:now,ledgerNet:0},plans:[{id:'rent',title:'房租',category:'房租',amount:300000,dueDate:'2026-11-01',status:'planned',createdAt:now,updatedAt:now},{id:'stock',title:'进货',category:'进货',amount:250000,dueDate:'2026-11-03',status:'planned',createdAt:now,updatedAt:now}]}});
const dirs:string[]=[];afterEach(()=>dirs.splice(0).forEach(d=>rmSync(d,{recursive:true,force:true})));
describe('小店资金安排',()=>{
 it('不把营业额或待收款当可用余额，按日期显示首次缺口',()=>{
  const state=fixture();state.funding!.cash=undefined;
  expect(fundingProjection(state,now).available).toBeNull();
  state.funding!.cash={amount:500000,confirmedAt:now,ledgerNet:0};
  const p=fundingProjection(state,now);expect(p.available).toBe(500000);expect(p.required).toBe(550000);expect(p.shortfall).toBe(50000);expect(p.firstShortfall).toBe('2026-11-03');expect(p.rows[0].remaining).toBe(200000);
 });
 it('新记收付款调整余额，已支付和取消安排不再预留，逾期仍计入',()=>{
  const s=fixture();s.expenses.push({id:'e',title:'已付进货',category:'进货',amount:10000,occurredAt:now});
  s.funding!.plans[0].dueDate='2026-10-28';s.funding!.plans[1].status='cancelled';
  const p=fundingProjection(s,now);expect(p.available).toBe(490000);expect(p.required).toBe(300000);expect(p.free).toBe(190000);expect(p.rows[0].overdue).toBe(true);
 });
 it('旧账本兼容，严格校验日期、金额、关联账目和结构',()=>{
  expect(validMerchantState(emptyMerchantState())).toBe(true);expect(validMerchantState(fixture())).toBe(true);
  expect(validFunding({...fixture().funding,plans:[{...fixture().funding!.plans[0],dueDate:'2026-02-30'}]})).toBe(false);
  expect(validFunding({...fixture().funding,cash:{amount:-1,confirmedAt:now,ledgerNet:0}})).toBe(false);
  expect(validMerchantState({...fixture(),funding:{...fixture().funding,plans:[{...fixture().funding!.plans[0],status:'paid',expenseId:'missing'}]}})).toBe(false);
  expect(validFundingDraft({intent:'cash',revision:0,amount:-1})).toBe(false);
 });
 it('一句话整理金额日期；补充只更新同一安排，不默认付款',()=>{
  const s=fixture();const first=fundingReply(s,'小店下周五房租3000元',now)!;
  expect(first.draft).toMatchObject({intent:'plan',title:'房租',amount:300000,dueDate:'2026-11-06'});
  const next=fundingReply(s,'改成3500元',now,first.draft)!;
  expect(next.draft).toMatchObject({intent:'plan',planId:first.draft.planId,amount:350000,dueDate:'2026-11-06'});
  expect(fundingReply(s,'小店预留进货款800元',now)!.draft.dueDate).toBeUndefined();
  expect(fundingReply(s,'小店可用资金0元',now)!.draft).toMatchObject({intent:'cash',amount:0});
  expect(fundingReply(s,'房租已经付了',now)!.draft).toMatchObject({intent:'paid',planId:'rent'});
  expect(s.expenses).toHaveLength(0);
 });
 it('不猜无效日期、重复周期、多笔金额或不明确的修改对象',()=>{
  for(const prompt of ['小店2月30日进货300元','小店每月1日房租3000元','小店房租3000元，进货200元'])expect(fundingReply(fixture(),prompt,now)!.draft.intent).toBe('overview');
  expect(fundingReply(fixture(),'改成500元',now)!.draft.intent).toBe('overview');
  expect(fundingReply(fixture(),'小店上个月收入多少',now)).toBeNull();
 });
 it('商户资金对话隔离个人转账和账单，结果可持久化校验',()=>{
  expect(isMerchantPrompt('小店下周五房租3000元')).toBe(true);expect(isMerchantPrompt('改成3500元',true)).toBe(true);
  expect(isMerchantPrompt('给房东转账3000元',true)).toBe(false);expect(isMerchantPrompt('看看本月账单',true)).toBe(false);
  const answer=merchantAnswer(fixture(),'小店资金安排',now);expect(answer.merchantUI?.funding).toBeDefined();expect(validMerchantInsight(answer.merchantUI)).toBe(true);
 });
 it('服务端保存、并发控制、重放、支付关联与重启恢复形成闭环',()=>{
  const dir=mkdtempSync(join(tmpdir(),'merchant-funding-'));dirs.push(dir);const store=createMerchantStore(dir);
  let s=store.change(scope,{type:'create-shop',name:'资金测试店',revision:0,requestId:crypto.randomUUID()});
  const change=(op:Record<string,unknown>)=>s=store.change(scope,{...op,revision:s.revision,requestId:crypto.randomUUID()});
  change({type:'set-funding-cash',amount:500000});
  const plan={type:'save-funding-plan',id:'rent',title:'房租',category:'房租',amount:300000,dueDate:'2026-11-01'};
  change(plan);expect(s.expenses).toHaveLength(0);expect(s.funding!.plans).toHaveLength(1);
  expect(()=>store.change(scope,{...plan,revision:0,requestId:crypto.randomUUID()})).toThrow(/更新|版本|变化/);
  expect(()=>change({...plan,id:'duplicate'})).toThrow(/已存在/);
  const pay={type:'pay-funding-plan',id:'rent',occurredAt:Date.now(),revision:s.revision,requestId:crypto.randomUUID()};
  s=store.change(scope,pay);expect(s.expenses).toHaveLength(1);expect(s.funding!.plans[0].status).toBe('paid');
  expect(store.change(scope,pay).expenses).toHaveLength(1);expect(()=>change({type:'pay-funding-plan',id:'rent',occurredAt:Date.now()})).toThrow();
  expect(()=>change(plan)).toThrow();expect(fundingProjection(s).available).toBe(200000);
  change({...plan,id:'stock',title:'进货',category:'进货',amount:100000});
  change({type:'add-expense',title:'买菜',category:'进货',amount:100000,occurredAt:Date.now()});
  change({type:'pay-funding-plan',id:'stock',expenseId:s.expenses[1].id});expect(s.expenses).toHaveLength(2);
  expect(createMerchantStore(dir).get(scope).funding).toEqual(s.funding);expect(store.publicMenu(s.shop!.publicToken)).not.toHaveProperty('funding');
  expect(store.get('22345678-1234-4234-8234-123456789abc').funding).toBeUndefined();
 });
});

it('补充日期与裸金额留在商户任务，付款金额不同先核对，不能默默沿用旧金额',()=>{
 expect(isMerchantPrompt('11月5日',true)).toBe(true);expect(isMerchantPrompt('8000',true)).toBe(true);
 const s=fixture(),cash=fundingReply(s,'小店可用资金',now)!.draft;
 expect(fundingReply(s,'8000',now,cash)!.draft.amount).toBe(800000);
 expect(fundingReply(s,'房租3500元已付',now)!.draft.intent).toBe('overview');
});
