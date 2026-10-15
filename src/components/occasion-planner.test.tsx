import {afterEach, expect, it, vi} from 'vitest';
import {render,screen,fireEvent,waitFor,cleanup} from '@testing-library/react';
import {OccasionPlanner} from './occasion-planner';
import {createBankStore} from '../../server/bank-store';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import type {OccasionDraft} from '../lib/occasion-plans';
import {parseStewardReply} from '../lib/steward-chat';
import {occasionFoodRequest} from '../lib/occasion-food-bridge';
vi.mock('../lib/occasion-food-bridge',()=>({occasionFoodRequest:vi.fn()}));
afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.clearAllMocks();});
it('生日筹备有独立对话入口，不把建议当付款回执',()=>{
 expect(parseStewardReply('[ZHIYIN_ACTION:OPEN_OCCASIONS]',[]).action?.type).toBe('open_occasions');
});
it('自然语言建议填入可编辑方案；保存、手动改预算和商品，日历及外卖复用同一任务',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'occasion-flow-')),bank=createBankStore(join(dir,'bank.json'));
 bank.configure({revision:0,controls:{night:false,overseas:false,contactless:true}});
 const d:OccasionDraft={title:'生日筹备',recipient:'爱人',budget:100000,prepareAt:Date.now()+86400000,deliverAt:Date.now()+3*86400000,address:'测试地址',contact:'叶先生 13800001234',note:'低甜',productIds:['cake-light']};
 vi.stubGlobal('fetch',vi.fn(async(url:string,init?:RequestInit)=>{
  const b=init?.body?JSON.parse(init.body as string):null;
  if(url.includes('steward-reply'))return {ok:true,json:async()=>({output_text:JSON.stringify({text:'低甜蛋糕已整理，地址请核对。',patch:d,questions:['换成巧克力']})})};
  const data=b?.type==='save-occasion'?bank.saveOccasion(b):b?.type==='reserve-occasion'?bank.reserveOccasion(b.id,b.revision):bank.get();return {ok:true,json:async()=>data};
 }));
 vi.mocked(occasionFoodRequest).mockImplementation(async(op,payload)=>{
  if(op==='prepare'){bank.prepareOccasionOrder(payload.planId,payload.productId!,bank.get().revision);return {status:'ok'};}
  return {status:'ok',orders:[]};
 });
 const calendar=vi.fn(),memory=vi.fn(async()=> '喜欢低甜');
 try{
  render(<OccasionPlanner stewardName="宁宁" getMemoryContext={memory} onOpenCalendar={calendar}/>);
  fireEvent.click(await screen.findByRole('button',{name:'准备一个生日'}));
  fireEvent.change(screen.getByLabelText('交给宁宁整理'),{target:{value:'爱人生日，预算1000'}});fireEvent.click(screen.getByRole('button',{name:'整理筹备需求'}));
  await screen.findByText('低甜蛋糕已整理，地址请核对。');expect(memory).toHaveBeenCalled();
  expect(screen.queryByRole('button',{name:'换成巧克力'})).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'保存筹备方案'}));await screen.findByText('尚未预留资金');
  fireEvent.click(screen.getByText('手动编辑'));fireEvent.click(screen.getByRole('button',{name:'调整商品'}));
  fireEvent.change(screen.getByLabelText('预算（元）'),{target:{value:'1200'}});fireEvent.click(screen.getByRole('checkbox',{name:/时令鲜花/}));fireEvent.click(screen.getByRole('button',{name:'保存修改'}));
  await waitFor(()=>expect(bank.get().occasions![0].budget).toBe(120000));
  fireEvent.click(screen.getByRole('button',{name:'预留这笔预算'}));fireEvent.click(screen.getByRole('button',{name:/确认预留 ¥1,200/}));await screen.findByText('预算已预留');
  fireEvent.click(screen.getByRole('button',{name:'在日历查看'}));expect(calendar).toHaveBeenCalledWith(d.prepareAt);
  fireEvent.click(screen.getAllByRole('button',{name:'准备订单并去外卖'})[0]);await screen.findByRole('button',{name:'查看外卖订单'});
  fireEvent.click(screen.getByRole('button',{name:'查看外卖订单'}));await waitFor(()=>expect(occasionFoodRequest).toHaveBeenCalledWith('open',expect.objectContaining({orderId:bank.get().occasions![0].orders[0].orderId})));
  fireEvent.click(screen.getByRole('button',{name:'所有安排'}));await screen.findByRole('button',{name:/生日筹备/});
  fireEvent.click(screen.getByRole('button',{name:'新建安排'}));expect(screen.getByLabelText('为谁准备')).toHaveValue('');
 }finally{rmSync(dir,{recursive:true,force:true});}
});
it('初版先补眼前缺少的时间，不摊开完整表单，也不把模型问题当答案发送', async()=>{
 vi.stubGlobal('fetch',vi.fn(async(url:string)=>({ok:true,json:async()=>url.includes('steward-reply')?{output_text:'{"text":"先确定生日时间，再安排配送。","patch":{"recipient":"爱人"},"questions":["希望哪天送达？"]}'}:{revision:0,balance:100000,limit:2000000,frozen:false,controls:{night:false,overseas:false,contactless:true},transactions:[]}})));
 const {container}=render(<OccasionPlanner stewardName="宁宁" initialPrompt="给爱人准备生日"/>);
 await screen.findByText('先确定生日时间，再安排配送。');
 expect(container.querySelector('.occasion-arrangement')).not.toHaveAttribute('open');
 expect(screen.getByRole('region',{name:'下一步需要确认'})).toHaveTextContent('希望什么时候送达？');
 expect(screen.queryByRole('button',{name:'希望哪天送达？'})).not.toBeInTheDocument();
 expect(screen.getByRole('button',{name:'保存筹备方案'})).toBeDisabled();
});
it('已有订单的任务在首次打开时也不能被模型悄悄改金额；到货核对后完成释放余款',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'occasion-lock-')),bank=createBankStore(join(dir,'bank.json'));
 bank.configure({revision:0,controls:{night:false,overseas:false,contactless:true}});
 const d:OccasionDraft={title:'生日筹备',recipient:'爱人',budget:100000,prepareAt:Date.now()+86400000,deliverAt:Date.now()+3*86400000,address:'测试地址',contact:'叶先生',note:'',productIds:['cake-light']};
 bank.saveOccasion({id:'birthday',revision:1,draft:d});bank.reserveOccasion('birthday',2);const link=bank.prepareOccasionOrder('birthday','cake-light',3);bank.pay({id:link.paymentId,channel:'wechat',merchant:link.merchant,amount:link.amount,occasionId:'birthday'});
 vi.stubGlobal('fetch',vi.fn(async(url:string,init?:RequestInit)=>{
  const b=init?.body?JSON.parse(init.body as string):null;
  if(url.includes('steward-reply'))return {ok:true,json:async()=>({output_text:'{"text":"建议改为2000","patch":{"budget":200000}}'})};
  return {ok:true,json:async()=>b?.type==='complete-occasion'?bank.completeOccasion(b.id,b.revision):bank.get()};
 }));
 vi.mocked(occasionFoodRequest).mockResolvedValue({status:'ok',orders:[{id:link.orderId,status:'COMPLETED'}]});
 try{
  render(<OccasionPlanner stewardName="宁宁" initialPlanId="birthday" initialPrompt="改成2000"/>);
  await screen.findByText(/建议改为2000/);expect(screen.getByLabelText('预算（元）')).toHaveValue(2000);expect(bank.get().occasions![0].budget).toBe(100000);
  fireEvent.click(screen.getByRole('button',{name:'放弃本次修改'}));expect(screen.getByLabelText('预算（元）')).toHaveValue(1000);
  fireEvent.click(screen.getByRole('button',{name:'核对订单状态'}));await waitFor(()=>expect(screen.getByRole('button',{name:'确认已收到，完成安排'})).not.toBeDisabled());
  fireEvent.click(screen.getByRole('button',{name:'确认已收到，完成安排'}));fireEvent.click(screen.getByRole('button',{name:'确认完成并释放余款'}));await screen.findByText('安排已完成，余款已释放');
 }finally{rmSync(dir,{recursive:true,force:true});}
});
it('账户读取失败可重试，不自动造一份可用余额',async()=>{
 const fetcher=vi.fn().mockRejectedValueOnce(new Error('连接断开')).mockResolvedValue({ok:true,json:async()=>({revision:0,balance:100000,limit:2000000,frozen:false,controls:{night:false,overseas:false,contactless:true},transactions:[]})});vi.stubGlobal('fetch',fetcher);
 render(<OccasionPlanner stewardName="宁宁"/>);await screen.findByText('连接断开');fireEvent.click(screen.getByRole('button',{name:'刷新账户'}));await screen.findByRole('button',{name:'准备一个生日'});
});
it('用户核对草稿、独立确认预留、刷新恢复；取消释放资金而不自动退款',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'occasion-ui-'));const bank=createBankStore(join(dir,'bank.json'));bank.configure({revision:0,controls:{night:false,overseas:false,contactless:true}});
 const d:OccasionDraft={title:'生日筹备',recipient:'爱人',budget:100000,prepareAt:Date.now()+86400000,deliverAt:Date.now()+3*86400000,address:'测试地址',contact:'叶先生 13800001234',note:'低甜',productIds:['cake-light','flowers-roses']};
 bank.saveOccasion({id:'birthday',revision:1,draft:d});
 vi.stubGlobal('fetch',vi.fn(async (_url:string,init?:RequestInit)=>{
  const body=init?.body?JSON.parse(init.body as string):null;let data;
  if(body?.type==='reserve-occasion')data=bank.reserveOccasion(body.id,body.revision);
  else if(body?.type==='cancel-occasion')data=bank.cancelOccasion(body.id,body.revision);
  else data=bank.get();return {ok:true,json:async()=>data};
 }));
 try{
  render(<OccasionPlanner stewardName="宁宁"/>);
  fireEvent.click(await screen.findByRole('button',{name:/生日筹备/}));
  expect(screen.getByText('尚未预留资金')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'预留这笔预算'}));
  expect(bank.get().occasions![0].status).toBe('draft');
  fireEvent.click(screen.getByRole('button',{name:/^确认预留 ¥1,000(?:\.00)?$/}));
  await screen.findByText('预算已预留');expect(bank.get().balance).toBe(4230000);
  cleanup();render(<OccasionPlanner stewardName="宁宁"/>);fireEvent.click(await screen.findByRole('button',{name:/生日筹备/}));
  expect(await screen.findByText('预算已预留')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'取消安排'}));fireEvent.click(screen.getByRole('button',{name:'确认取消并释放余款'}));
  await waitFor(()=>expect(bank.get().occasions![0].status).toBe('cancelled'));
 }finally{rmSync(dir,{recursive:true,force:true});}
});
