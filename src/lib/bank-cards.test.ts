import {afterEach,describe,expect,it,vi} from 'vitest';
import {mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createBankStore,bankMiddleware} from '../../server/bank-store';
import {bankCards,bankRequest,bankCardsRequest,validBankSnapshot} from './bank-transfer';

const directories:string[]=[];
const noon=Date.parse('2026-10-21T12:00:00+08:00');
afterEach(()=>{vi.unstubAllGlobals();for(const path of directories.splice(0))rmSync(path,{recursive:true,force:true});});
function setup(){const dir=mkdtempSync(join(tmpdir(),'zhiyin-bank-cards-'));directories.push(dir);const file=join(dir,'bank.json');return {file,bank:createBankStore(file)};}

describe('独立卡账本',()=>{
 it('没有cardId的原账本按原金额和记录读取，新增卡不复制旧资产',()=>{
  const {file,bank}=setup();const draft=bank.prepare({recipientId:'dad',amount:500},noon);bank.confirm(draft.id,noon+1);
  const legacy=JSON.parse(readFileSync(file,'utf8'));delete legacy.cardId;writeFileSync(file,JSON.stringify(legacy));
  const restarted=createBankStore(file);expect(restarted.get().balance).toBe(4229500);expect(restarted.status(draft.id).receipt?.amount).toBe(500);
  expect(restarted.getCards().filter(card=>!card.isPrimary).every(card=>card.balance===0)).toBe(true);
  writeFileSync(file+'.living.json',JSON.stringify({...legacy,cardId:'primary'}));
  expect(()=>restarted.forCard('living').get()).toThrow(/账本不匹配/);
 });
 it('旧主卡资金和回执保留；新卡从零开始，设置与余额各自持久化',()=>{
  const {file,bank}=setup();
  const original=bank.prepare({recipientId:'mom',amount:10000},noon);bank.confirm(original.id,noon+1);
  const cards=bank.getCards();
  expect(cards.map(card=>[card.id,card.balance])).toEqual([['primary',4220000],['living',0],['reserve',0]]);
  const living=bank.forCard('living');living.configure({revision:0,limit:50000,frozen:true,controls:{overseas:true,contactless:false,night:false}});
  expect(bank.get()).toMatchObject({cardId:'primary',balance:4220000,limit:2000000,frozen:false,controls:{overseas:false,contactless:true,night:true}});
  expect(createBankStore(file).forCard('living').get()).toMatchObject({cardId:'living',balance:0,limit:50000,frozen:true,controls:{overseas:true,contactless:false,night:false}});
  expect(bank.forCard('reserve').get()).toMatchObject({balance:0,frozen:false,transactions:[]});
  expect(bank.status(original.id).receipt?.amount).toBe(10000);
  expect(()=>bank.forCard('living').confirm(original.id,noon+2)).toThrow();
  expect(()=>bank.forCard('../bank')).toThrow(/卡片不存在/);
  expect(()=>bank.forCard('')).toThrow(/卡片不存在/);
 });
 it('副卡余额不足时不会扣主卡；原草稿和退款不能跨卡使用',()=>{
  const {bank}=setup(),living=bank.forCard('living');
  const draft=bank.prepare({recipientId:'mom',amount:10000},noon);
  expect(()=>living.confirm(draft.id,noon)).toThrow(/方案不存在/);
  expect(()=>living.prepare({recipientId:'mom',amount:100},noon)).toThrow(/余额不足/);
  expect(()=>living.pay({id:'bill-1',channel:'wechat',amount:100,merchant:'商户'},noon)).toThrow(/余额不足/);
  bank.pay({id:'bill-1',channel:'wechat',amount:100,merchant:'商户'},noon);
  expect(()=>living.refundPayment('bill-1',noon)).toThrow(/未找到原付款/);
  expect(bank.get().balance).toBe(4229900);
  expect(living.get().balance).toBe(0);
 });
 it('副卡AA入账进入本卡并出现在总览，付款与退款各自核对原交易',()=>{
  const {bank}=setup(),living=bank.forCard('living');
  const request=living.createAA({requestId:'living-aa',title:'聚餐',amount:10000,recipientIds:['mom'],includeSelf:false},noon);
  living.settleAA(request.id,'mom',noon+1);expect(living.get().balance).toBe(10000);expect(bank.get().balance).toBe(4230000);
  expect(bank.get().cards?.find(card=>card.id==='living')?.balance).toBe(10000);
  expect(()=>bank.settleAA(request.id,'mom',noon+1)).toThrow(/未找到/);
  const payment={id:'living-order',channel:'wechat' as const,amount:1000,merchant:'商户'};
  living.pay(payment,noon+2);expect(living.get().balance).toBe(9000);living.refundPayment(payment.id,noon+3);expect(living.get().balance).toBe(10000);
  expect(bank.get().payments).toEqual([]);expect(bank.get().collections).toEqual([]);
 });
 it('副卡的写锁与账本损坏不会导致重置或套用主卡',()=>{
  const {file,bank}=setup();bank.forCard('living').configure({revision:0,limit:50000});
  const cardFile=file+'.living.json';
  writeFileSync(cardFile+'.lock','locked');
  expect(()=>bank.forCard('living').configure({revision:1,frozen:true})).toThrow(/正在处理/);
  writeFileSync(cardFile,'bad-json');
  expect(()=>bank.forCard('living').get()).toThrow();
  expect(readFileSync(cardFile,'utf8')).toBe('bad-json');
  expect(bank.forCard('primary').get().balance).toBe(4230000);
  expect(()=>bank.get()).toThrow(/生活备用卡.*6216.*汇总暂不可用/);
 });
 it('主调度执行各卡自己的预约，不将副卡预约扣到主卡',()=>{
  const {file,bank}=setup();const living=bank.forCard('living');living.configure({revision:0,limit:50000});
  expect(bank.get().allSchedules).toEqual([]);
  const persisted=JSON.parse(readFileSync(file+'.living.json','utf8'));persisted.balance=30000;writeFileSync(file+'.living.json',JSON.stringify(persisted));
  const draft=living.prepare({recipientId:'mom',amount:10000,executeAt:noon+1000},noon);living.schedule(draft.id,noon);
  const snapshot=createBankStore(file).get();
  expect(snapshot.schedules).toEqual([]);expect(snapshot.allSchedules).toEqual([expect.objectContaining({id:draft.id,cardId:'living',status:'pending'})]);expect(validBankSnapshot(snapshot)).toBe(true);
  expect(validBankSnapshot({...snapshot,allSchedules:snapshot.allSchedules?.map(item=>({...item,cardId:'invalid'}))})).toBe(false);
  expect(validBankSnapshot({...snapshot,allSchedules:snapshot.allSchedules?.map(item=>({...item,status:'invented'}))})).toBe(false);
  expect(bank.runDue(noon+1000)).toEqual([expect.objectContaining({id:draft.id,status:'completed'})]);
  expect(living.get().balance).toBe(20000);expect(bank.get().balance).toBe(4230000);
  expect(bank.get().allSchedules?.[0].status).toBe('completed');expect(living.get().allSchedules).toBeUndefined();
 });
 it('一张卡账本损坏仍执行其它卡到期预约，并明确报告失败卡',()=>{
  const {file,bank}=setup();const reserve=bank.forCard('reserve');reserve.configure({revision:0,limit:50000});
  const persisted=JSON.parse(readFileSync(file+'.reserve.json','utf8'));persisted.balance=30000;writeFileSync(file+'.reserve.json',JSON.stringify(persisted));
  const draft=reserve.prepare({recipientId:'mom',amount:10000,executeAt:noon+1000},noon);reserve.schedule(draft.id,noon);
  writeFileSync(file+'.living.json','bad-json');
  expect(()=>bank.runDue(noon+1000)).toThrow(/生活备用卡.*6216.*预约调度失败/);
  expect(reserve.status(draft.id).schedule?.status).toBe('completed');expect(reserve.get().balance).toBe(20000);
 });
 it('已识别卡ID才是有效快照；旧快照继续兼容',()=>{
  const {bank}=setup(),snapshot=bank.get();expect(validBankSnapshot(snapshot)).toBe(true);
  expect(validBankSnapshot({...snapshot,cardId:'wrong-card'})).toBe(false);
  const legacy={...snapshot};delete legacy.cardId;expect(validBankSnapshot(legacy)).toBe(true);
  expect(validBankSnapshot({...snapshot,cards:snapshot.cards?.map(card=>card.isPrimary?{...card,balance:1}:card)})).toBe(false);
 });
});

it('HTTP按显式卡ID操作，拒绝未知/冲突卡和副卡尚未接入功能',async()=>{
 const {bank}=setup();const server=createServer(bankMiddleware(bank));await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 const address=server.address();if(!address||typeof address==='string')throw Error('address');const url=`http://127.0.0.1:${address.port}`;
 const post=(body:object,query='')=>fetch(url+query,{method:'POST',headers:{'Content-Type':'application/json','X-Zhiyin-Bank':'1'},body:JSON.stringify(body)});
 try{
  expect((await (await fetch(url+'?view=cards')).json()).map((card:{id:string})=>card.id)).toEqual(bankCards.map(card=>card.id));
  expect(await (await fetch(url+'?cardId=living')).json()).toMatchObject({cardId:'living',balance:0});
  expect((await fetch(url+'?cardId=unknown')).status).toBe(400);
  expect((await fetch(url+'?cardId=')).status).toBe(400);
  expect((await fetch(url+'?view=cards&cardId=unknown')).status).toBe(400);
  expect((await post({type:'settings',cardId:'living',revision:0,frozen:true})).status).toBe(200);
  expect(bank.forCard('living').get().frozen).toBe(true);expect(bank.get().frozen).toBe(false);
  expect((await post({type:'settings',cardId:'nope',revision:0,frozen:true})).status).toBe(400);
  expect((await post({type:'settings',cardId:'living',revision:1,frozen:false},'?cardId=primary')).status).toBe(400);
  expect((await post({type:'apply-card',cardId:'living',authorized:true,id:'application',productId:'standard-debit',revision:1})).status).toBe(400);
  expect(bank.forCard('living').get().cardApplications).toEqual([]);
  const primarySettings=await (await post({type:'settings',revision:0,limit:50000})).json();
  expect(primarySettings.cards).toHaveLength(3);expect(primarySettings.cardId).toBe('primary');
 }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));}
});

it('客户端显式选卡请求，主卡保持旧请求路径兼容',async()=>{
 const {bank}=setup();const fetchMock=vi.fn().mockResolvedValue({ok:true,json:async()=>bank.getCards()});vi.stubGlobal('fetch',fetchMock);
 await bankRequest();await bankRequest(undefined,'primary');await bankRequest(undefined,'living');await bankRequest({type:'settings',revision:0},'reserve');await bankCardsRequest();
 expect(fetchMock.mock.calls.map(call=>call[0])).toEqual(['/api/zhiyin/bank','/api/zhiyin/bank','/api/zhiyin/bank?cardId=living','/api/zhiyin/bank','/api/zhiyin/bank?view=cards']);
 expect(JSON.parse(fetchMock.mock.calls[3][1].body)).toMatchObject({cardId:'reserve',type:'settings'});
 await expect(bankRequest({type:'settings',cardId:'reserve'},'primary')).rejects.toThrow(/不一致/);
});

it('合并后的付款账户和备注仍归属所选副卡，不能借主卡标识写入副卡',()=>{
 const {bank}=setup(),living=bank.forCard('living');
 const aa=living.createAA({requestId:'source-fund',title:'入账',amount:10000,recipientIds:['mom'],includeSelf:false},noon);living.settleAA(aa.id,'mom',noon+1);
 expect(()=>living.prepare({recipientId:'dad',amount:100,sourceAccountId:'demo-8888'},noon+2)).toThrow('付款账户');
 const draft=living.prepare({recipientId:'dad',amount:100,sourceAccountId:'living',remark:'聚餐结算'},noon+2);
 const receipt=living.confirm(draft.id,noon+3);
 expect(receipt).toMatchObject({sourceAccountId:'living',remark:'聚餐结算'});
 expect(living.get().balance).toBe(9900);expect(bank.get().balance).toBe(4230000);
});
