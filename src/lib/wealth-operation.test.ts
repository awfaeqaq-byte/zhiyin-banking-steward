import {afterEach,describe,expect,it} from 'vitest';
import {mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createWealthStore} from '../../server/wealth-store';
import {createBankStore} from '../../server/bank-store';
import {assessRisk,suitableWealthProducts,type RiskAnswers} from './wealth-operation';

const directories:string[]=[];
function store(){const directory=mkdtempSync(join(tmpdir(),'zhiyin-wealth-'));directories.push(directory);return createWealthStore(createBankStore(join(directory,'bank.json')));}
afterEach(()=>{for(const directory of directories.splice(0))rmSync(directory,{recursive:true,force:true});});
const answers=(level:0|1|2):RiskAnswers=>({experience:level,loss:level,term:level,liquidity:level,income:level});
const T=1_000_000;

describe('理财复杂业务链路',()=>{
 it('五项风险测评以亏损承受为硬上限，不能通过产品选择越级',()=>{
  expect(assessRisk({...answers(2),loss:0},T).risk).toBe('low');
  expect(suitableWealthProducts(30000,12,'low').map(item=>item.id)).toEqual(['cash-plus']);
  const wealth=store();
  expect(()=>wealth.prepare({productId:'cash-plus',amount:3000000,term:12},T)).toThrow(/风险测评/);
  wealth.assess(answers(0),T);
  expect(()=>wealth.prepare({productId:'balanced-fund',amount:3000000,term:12},T+1)).toThrow(/不符合/);
 });
 it('申购前不扣款，确认后金额与持仓一致，重复确认只有一笔回执',()=>{
  const wealth=store();wealth.assess(answers(2),T);
  const draft=wealth.prepare({productId:'steady-income',amount:3000000,term:12},T+1);
  expect(wealth.get().cashBalance).toBe(4230000);
  expect(wealth.get().holdings).toHaveLength(0);
  const receipt=wealth.confirm(draft.id,T+2);
  expect(receipt.fee).toBe(6000);
  expect(wealth.get().cashBalance).toBe(1224000);
  expect(wealth.get().holdings).toEqual([expect.objectContaining({id:draft.id,principal:3000000})]);
  expect(wealth.confirm(draft.id,T+3)).toEqual(receipt);
  expect(wealth.get().holdings).toHaveLength(1);
 });
 it('余额不足、旧测评和过期方案均不产生持仓',()=>{
  const wealth=store();wealth.assess(answers(2),T);
  expect(()=>wealth.prepare({productId:'cash-plus',amount:5000000,term:12},T+1)).toThrow(/资金不足/);
  const old=wealth.prepare({productId:'cash-plus',amount:1000000,term:12},T+2);
  wealth.assess(answers(0),T+3);
  expect(()=>wealth.confirm(old.id,T+4)).toThrow(/不存在/);
  const expired=wealth.prepare({productId:'cash-plus',amount:1000000,term:12},T+5);
  expect(()=>wealth.confirm(expired.id,T+300006)).toThrow(/过期/);
  expect(wealth.get().holdings).toHaveLength(0);
 });
 it('封闭期拒绝赎回，开放后赎回入账且重复提交幂等',()=>{
  const wealth=store();wealth.assess(answers(2),T);
  const draft=wealth.prepare({productId:'steady-income',amount:1000000,term:12},T+1);
  wealth.confirm(draft.id,T+2);
  expect(()=>wealth.prepareRedemption(draft.id,T+3)).toThrow(/最低持有期/);
  const later=T+2+180*86400000;
  const redemption=wealth.prepareRedemption(draft.id,later);
  expect(wealth.get().cashBalance).toBe(3228000);
  const receipt=wealth.confirmRedemption(redemption.id,later+1);
  expect(wealth.get().cashBalance).toBe(4228000);
  expect(wealth.get().holdings?.[0].redeemedAt).toBe(later+1);
  expect(wealth.confirmRedemption(redemption.id,later+2)).toEqual(receipt);
  expect(()=>wealth.prepareRedemption(draft.id,later+3)).toThrow(/没有可赎回/);
 });
 it('旧版只有申购回执的本机数据迁移为一致的资金和持仓',()=>{
  const directory=mkdtempSync(join(tmpdir(),'zhiyin-wealth-legacy-'));directories.push(directory);
  const file=join(directory,'wealth.json');
  writeFileSync(file,JSON.stringify({version:1,receipts:[{id:'legacy-1',productId:'cash-plus',amount:3000000,term:12,risk:'low',createdAt:T,expiresAt:T+300000,completedAt:T+1,status:'confirmed'}],drafts:[]}));
  const wealth=createWealthStore(createBankStore(join(directory,'bank.json')),file);
  expect(wealth.get().cashBalance).toBe(1230000);
  expect(wealth.get().holdings).toEqual([expect.objectContaining({id:'legacy-1',principal:3000000})]);
 });
 it('旧理财账本一次性并入银行卡，重启不会重复扣款',()=>{
  const directory=mkdtempSync(join(tmpdir(),'zhiyin-wealth-unify-'));directories.push(directory);
  const bankFile=join(directory,'bank.json'),wealthFile=join(directory,'wealth.json');
  const bank=createBankStore(bankFile);
  bank.configure({revision:0,controls:{night:false,overseas:false,contactless:true}});
  bank.pay({id:'legacy-bank-payment',channel:'wechat',amount:500,merchant:'旧银行付款'},T);
  writeFileSync(wealthFile,JSON.stringify({version:1,cashBalance:3230000,receipts:[{id:'legacy-wealth',productId:'cash-plus',amount:1000000,term:12,risk:'low',createdAt:T,expiresAt:T+300000,completedAt:T+1,status:'confirmed'}],holdings:[{id:'legacy-wealth',productId:'cash-plus',principal:1000000,units:1000000,purchasedAt:T+1}],drafts:[],redemptionDrafts:[],redemptions:[]}));
  const wealth=createWealthStore(bank,wealthFile);
  expect(bank.get().balance).toBe(3229500);
  expect(wealth.get().cashBalance).toBe(3229500);
  expect(wealth.get().holdings).toHaveLength(1);
  const restarted=createWealthStore(createBankStore(bankFile),wealthFile);
  expect(restarted.get().cashBalance).toBe(3229500);
  const alreadyUnified=createBankStore(join(directory,'new-bank.json'));
  createWealthStore(alreadyUnified).assess(answers(0),T);
  expect(()=>createWealthStore(alreadyUnified,wealthFile)).toThrow(/不能覆盖导入旧账本/);
 });
});
