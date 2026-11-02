import {render,screen,within,waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach,it,expect,vi} from 'vitest';
import {SmartTransfers} from '../../src/components/smart-transfers';
import {BankTransfer} from '../../src/components/bank-transfer';
afterEach(()=>{vi.restoreAllMocks();localStorage.clear();});
it('管家带来的保留金额可核对修改，执行前展示资金影响',async()=>{
 const user=userEvent.setup(),calls:Record<string,unknown>[]=[];
 vi.spyOn(globalThis,'fetch').mockImplementation(async(_url,options)=>{
  const body=JSON.parse(String(options?.body||'{}'));calls.push(body);
  return new Response(JSON.stringify({...body,id:'budget',balance:4230000,impact:{pendingTotal:200000,protectedAmount:1200000,remaining:2630000,available:2000000}}));
 });
 render(<BankTransfer initial={{recipientId:'mom',amount:200000,protectedAmount:1200000}} onDone={vi.fn()}/>);
 await user.selectOptions(screen.getByLabelText('从哪个账户转出'),'demo-8888');
 expect(screen.getByLabelText('转账后至少保留（元）')).toHaveValue('12000');
 await user.click(screen.getByRole('button',{name:'核对即时转账'}));
 expect(await screen.findByText('其他待执行预约')).toBeVisible();
 expect(screen.getByRole('region',{name:'转账资金影响'})).toHaveTextContent('¥26,300');
 expect(calls.find(c=>c.type==='prepare')).toMatchObject({protectedAmount:1200000});
 expect(calls.some(c=>c.type==='confirm')).toBe(false);
});
it('查询安排直接打开记录页，失败任务提供重新安排且不自动付款',async()=>{
 vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response(JSON.stringify({revision:0,balance:4230000,limit:2000000,frozen:false,controls:{night:false,overseas:false,contactless:true},transactions:[],schedules:[{id:'failed',recipientId:'mom',amount:200000,protectedAmount:1200000,executeAt:1,createdAt:1,status:'failed',error:'保留金额不足'}]})));
 render(<SmartTransfers initial={{kind:'records'}} onDone={vi.fn()}/>);
 expect(await screen.findByText('执行失败')).toBeVisible();
 await userEvent.click(screen.getByRole('button',{name:'重新安排'}));
 expect(screen.getByLabelText('转账金额（元）')).toHaveValue('2000');
 expect(screen.getByLabelText('转账后至少保留（元）')).toHaveValue('12000');
 expect(screen.getByLabelText('执行方式')).toHaveValue('scheduled');
});
it('AA先核对再授权发起，在记录中展示待收而不是已到账',async()=>{
 const user=userEvent.setup(),calls:Record<string,unknown>[]=[];
 const snapshot={revision:0,balance:4230000,limit:2000000,frozen:false,controls:{night:false,overseas:false,contactless:true},transactions:[],aaRequests:[] as unknown[]};
 vi.spyOn(globalThis,'fetch').mockImplementation(async(_url,options)=>{
  const body=JSON.parse(String(options?.body||'{}'));calls.push(body);
  if(body.type==='create-aa'){const aa={...body,id:body.requestId,createdAt:1,status:'pending',shares:[{recipientId:'self',amount:3334},{recipientId:'mom',amount:3333},{recipientId:'dad',amount:3333}]};snapshot.aaRequests=[aa];return new Response(JSON.stringify(aa));}
  return new Response(JSON.stringify(snapshot));
 });
 render(<SmartTransfers initial={{kind:'aa',amount:10000,recipientIds:['mom','dad'],includeSelf:true}} onDone={vi.fn()}/>);
 await user.click(screen.getByRole('button',{name:'核对AA分摊'}));
 expect(calls.some(c=>c.type==='create-aa')).toBe(false);
 expect(screen.getByText('¥33.34')).toBeVisible();
 await user.click(screen.getByRole('button',{name:'确认发起AA收款'}));
 const records=await screen.findByRole('region',{name:'转账与收款记录'});
 expect(within(records).getByText('0/2 人已付')).toBeVisible();
 expect(calls.filter(c=>c.type==='create-aa')).toHaveLength(1);
 expect(calls.filter(c=>c.type==='settle-aa')).toHaveLength(0);
});
it('手机号搜索要显式选择匹配账户，预约发送时间字段且不走即时确认',async()=>{
 const user=userEvent.setup(),calls:Record<string,unknown>[]=[];
 vi.spyOn(globalThis,'fetch').mockImplementation(async(_url,options)=>{
  const body=JSON.parse(String(options?.body||'{}'));calls.push(body);
  if(body.type==='prepare')return new Response(JSON.stringify({...body,id:'scheduled',revision:0,balance:4230000,expiresAt:Date.now()+300000}));
  if(body.type==='schedule')return new Response(JSON.stringify({id:'scheduled',recipientId:'dad',amount:10000,executeAt:Date.now()+86400000,status:'pending'}));
  return new Response(JSON.stringify({revision:0,balance:4230000,limit:2000000,frozen:false,controls:{night:false,overseas:false,contactless:true},transactions:[]}));
 });
 render(<SmartTransfers initial={{recipientId:'mom',amount:10000,executeAt:Date.now()+86400000}} onDone={vi.fn()}/>);
 await user.selectOptions(screen.getByLabelText('从哪个账户转出'),'demo-8888');
 await user.type(screen.getByLabelText('查找收款人'),'13800007316');
 await user.selectOptions(screen.getByLabelText('收款人'),'dad');
 await user.click(screen.getByRole('button',{name:'核对预约转账'}));
 await user.click(screen.getByRole('button',{name:'确认预约转账（沙箱）'}));
 expect(await screen.findByText('预约已建立')).toBeVisible();
 expect(calls.filter(c=>c.type==='confirm')).toHaveLength(0);
 expect(calls.find(c=>c.type==='prepare')).toMatchObject({recipientId:'dad',executeAt:expect.any(Number)});
});
it('暂不撤销保持预约，确认撤销后同步转账标签，新预约也能独立撤销',async()=>{
 const user=userEvent.setup(),calls:Record<string,unknown>[]=[];
 const executeAt=Date.now()+86400000;
 const snapshot={revision:0,balance:4230000,limit:2000000,frozen:false,controls:{night:false,overseas:false,contactless:true},transactions:[],schedules:[] as Array<{id:string;recipientId:string;amount:number;executeAt:number;createdAt:number;status:'pending'|'cancelled'}>};
 let sequence=0;
 vi.spyOn(globalThis,'fetch').mockImplementation(async(_url,options)=>{
  const body=JSON.parse(String(options?.body||'{}'));calls.push(body);
  if(body.type==='prepare')return new Response(JSON.stringify({...body,id:`schedule-${++sequence}`,revision:snapshot.revision,balance:snapshot.balance,expiresAt:Date.now()+300000}));
  if(body.type==='schedule'){
   const item={id:body.draftId,recipientId:'dad',amount:2000,executeAt,createdAt:Date.now(),status:'pending' as const};
   snapshot.schedules.push(item);snapshot.revision++;
   return new Response(JSON.stringify(item));
  }
  if(body.type==='cancel-schedule'){
   const item=snapshot.schedules.find(s=>s.id===body.id)!;item.status='cancelled';snapshot.revision++;
   return new Response(JSON.stringify(item));
  }
  return new Response(JSON.stringify(snapshot));
 });
 render(<SmartTransfers initial={{recipientId:'dad',amount:2000,executeAt}} onDone={vi.fn()}/>);
 await user.selectOptions(screen.getByLabelText('从哪个账户转出'),'demo-8888');
 await user.click(screen.getByRole('button',{name:'核对预约转账'}));
 await user.click(await screen.findByRole('button',{name:'确认预约转账（沙箱）'}));
 expect(await screen.findByText('预约已建立')).toBeVisible();
 await user.click(screen.getByRole('button',{name:/^记录$/}));
 const records=await screen.findByRole('region',{name:'转账与收款记录'});
 await user.click(await within(records).findByRole('button',{name:'撤销预约'}));
 await user.click(screen.getByRole('button',{name:'暂不操作'}));
 await user.click(within(records).getByRole('button',{name:'刷新'}));
 expect(within(records).getByText('等待执行')).toBeVisible();
 expect(calls.filter(c=>c.type==='cancel-schedule')).toHaveLength(0);
 expect(snapshot.schedules[0].status).toBe('pending');
 await user.click(within(records).getByRole('button',{name:'撤销预约'}));
 await user.click(screen.getByRole('button',{name:'确认操作'}));
 expect(await within(records).findByText('已撤销')).toBeVisible();
 await user.click(screen.getByRole('button',{name:/^转账$/}));
 expect(await screen.findByRole('heading',{name:'预约已撤销'})).toBeVisible();
 expect(screen.queryByText('预约已建立')).not.toBeInTheDocument();
 expect(screen.getByText('本预约已撤销，不会执行。未扣款、未冻结余额。')).toBeVisible();
 await user.click(screen.getByRole('button',{name:'再安排一笔'}));
 await user.type(screen.getByLabelText('转账金额（元）'),'20');
 await user.click(screen.getByRole('button',{name:'核对预约转账'}));
 await user.click(await screen.findByRole('button',{name:'确认预约转账（沙箱）'}));
 expect(await screen.findByText('预约已建立')).toBeVisible();
 await user.click(screen.getByRole('button',{name:/^记录$/}));
 const newRecords=await screen.findByRole('region',{name:'转账与收款记录'});
 await user.click(await screen.findByRole('button',{name:'撤销预约'}));
 await user.click(screen.getByRole('button',{name:'确认操作'}));
 await waitFor(()=>expect(within(newRecords).getAllByText('已撤销')).toHaveLength(2));
 await user.click(screen.getByRole('button',{name:/^转账$/}));
 expect(await screen.findByRole('heading',{name:'预约已撤销'})).toBeVisible();
 expect(calls.filter(c=>c.type==='cancel-schedule')).toEqual([
  {type:'cancel-schedule',id:'schedule-1',authorized:true},
  {type:'cancel-schedule',id:'schedule-2',authorized:true},
 ]);
 expect(snapshot.balance).toBe(4230000);expect(snapshot.transactions).toHaveLength(0);
});
it('备用卡AA的到账说明、创建请求和刷新范围一致，保留主卡未决收款',async()=>{
 const calls:Array<{url:string;body:Record<string,unknown>}>=[];
 const snapshot={cardId:'living',revision:0,balance:0,limit:2000000,frozen:false,controls:{night:false,overseas:false,contactless:true},transactions:[],aaRequests:[] as unknown[]};
 const pending={requestId:'primary-aa',title:'主卡未决',amount:200,recipientIds:['mom'],includeSelf:false};
 localStorage.setItem('zhiyin-aa-pending',JSON.stringify(pending));
 vi.spyOn(globalThis,'fetch').mockImplementation(async(url,options)=>{
  const body=JSON.parse(String(options?.body||'{}'));calls.push({url:String(url),body});
  if(body.type==='create-aa'){const item={...body,id:body.requestId,createdAt:1,status:'pending',shares:[{recipientId:'mom',amount:100}]};snapshot.aaRequests=[item];return new Response(JSON.stringify(item));}
  return new Response(JSON.stringify(snapshot));
 });
 const user=userEvent.setup();render(<SmartTransfers cardId="living" initial={{kind:'aa',amount:100,recipientIds:['mom'],includeSelf:false}} onDone={vi.fn()}/>);
 await user.click(screen.getByRole('button',{name:'核对AA分摊'}));
 expect(screen.getByText(/收款到账生活备用卡 6216/)).toBeVisible();
 await user.click(screen.getByRole('button',{name:'确认发起AA收款'}));
 await screen.findByText('0/1 人已付');
 expect(calls.find(call=>call.body.type==='create-aa')?.body.cardId).toBe('living');
 expect(calls.filter(call=>!call.body.type).every(call=>call.url.endsWith('?cardId=living'))).toBe(true);
 expect(localStorage.getItem('zhiyin-aa-pending')).toBe(JSON.stringify(pending));
});
