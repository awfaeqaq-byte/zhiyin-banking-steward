import {render,screen,within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach,it,expect,vi} from 'vitest';
import {SmartTransfers} from './smart-transfers';
afterEach(()=>{vi.restoreAllMocks();localStorage.clear();});
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
 await user.type(screen.getByLabelText('查找收款人'),'13800007316');
 await user.selectOptions(screen.getByLabelText('收款人'),'dad');
 await user.click(screen.getByRole('button',{name:'核对预约转账'}));
 await user.click(screen.getByRole('button',{name:'确认预约转账（沙箱）'}));
 expect(await screen.findByText('预约已建立')).toBeVisible();
 expect(calls.filter(c=>c.type==='confirm')).toHaveLength(0);
 expect(calls.find(c=>c.type==='prepare')).toMatchObject({recipientId:'dad',executeAt:expect.any(Number)});
});
