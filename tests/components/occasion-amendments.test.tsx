import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {OccasionPlanner} from '../../src/components/occasion-planner';
import {createBankStore} from '../../server/bank-store';
import type {OccasionDraft} from '../../src/lib/occasion-plans';
import {occasionFoodRequest} from '../../src/lib/occasion-food-bridge';
vi.mock('../../src/lib/occasion-food-bridge',()=>({occasionFoodRequest:vi.fn()}));
const dirs:string[]=[];
afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.clearAllMocks();sessionStorage.clear();dirs.splice(0).forEach(d=>rmSync(d,{recursive:true,force:true}));});
function setup(patch:Partial<OccasionDraft>){
 const dir=mkdtempSync(join(tmpdir(),'occasion-amend-ui-'));dirs.push(dir);const bank=createBankStore(join(dir,'bank.json'));
 bank.configure({revision:0,controls:{night:false,overseas:false,contactless:true}});
 const draft:OccasionDraft={title:'王芳生日筹备',recipient:'王芳',budget:80000,prepareAt:Date.now()+86400000,deliverAt:Date.now()+3*86400000,address:'江湾路 8 号',contact:'王芳 13800001234',note:'低甜',productIds:['cake-light','flowers-roses']};
 bank.saveOccasion({id:'birthday',revision:1,draft});bank.reserveOccasion('birthday',2);const order=bank.prepareOccasionOrder('birthday','cake-light',3);bank.pay({id:order.paymentId,occasionId:'birthday',amount:order.amount,merchant:order.merchant,channel:'wechat'});
 const fetcher=vi.fn(async(url:string,init?:RequestInit)=>{
  const body=init?.body?JSON.parse(init.body as string):null;
  if(url.includes('steward-reply'))return {ok:true,json:async()=>({output_text:JSON.stringify({text:'已整理变更，请核对后确认。',patch})})};
  try{return {ok:true,json:async()=>body?.type==='save-occasion'?bank.saveOccasion(body):bank.get()};}catch(error){return {ok:false,json:async()=>({error:(error as Error).message})};}
 });vi.stubGlobal('fetch',fetcher);vi.mocked(occasionFoodRequest).mockResolvedValue({status:'ok',orders:[]});
 return {bank,draft,order,fetcher};
}
it('已付蛋糕保留，未下单鲜花可移除；展示变更差异，确认前不改资金或原单',async()=>{
 const {bank,order}=setup({productIds:['cake-light'],budget:30000});
 render(<OccasionPlanner stewardName="宁宁" initialPlanId="birthday" initialPrompt="蛋糕保留，不要鲜花，预算减到300"/>);
 await screen.findByText(/已整理变更，请核对后确认/);
 expect(screen.getByRole('region',{name:'本次变更'})).toHaveTextContent('¥300');
 expect(screen.getByRole('region',{name:'本次变更'})).toHaveTextContent('粉玫瑰');
 expect(bank.get().occasions![0].budget).toBe(80000);
 fireEvent.click(screen.getByRole('button',{name:'核对本次变更'}));
 expect(bank.get().occasions![0].budget).toBe(80000);
 fireEvent.click(screen.getByRole('button',{name:'确认变更并调整预留'}));
 await waitFor(()=>expect(bank.get().occasions![0].budget).toBe(30000));
 expect(bank.get().occasions![0].orders).toEqual([order]);
 expect(bank.get().payments).toHaveLength(1);
});
it('改动已付款订单的送达时间只形成待处理变更，保留原单入口并阻止应用',async()=>{
 const {bank,draft,order}=setup({deliverAt:Date.now()+4*86400000});
 render(<OccasionPlanner stewardName="宁宁" initialPlanId="birthday" initialPrompt="配送改到后一天"/>);
 await screen.findByText(/已整理变更，请核对后确认/);
 expect(screen.getByRole('region',{name:'本次变更'})).toHaveTextContent('原订单');
 expect(screen.getByRole('button',{name:'核对本次变更'})).toBeDisabled();
 fireEvent.click(screen.getByRole('button',{name:/处理原订单/}));
 await waitFor(()=>expect(occasionFoodRequest).toHaveBeenCalledWith('open',{planId:'birthday',orderId:order.orderId}));
 expect(bank.get().occasions![0].deliverAt).toBe(draft.deliverAt);
});
it('确认面板打开后账户变化使原确认失效，必须重新核对',async()=>{
 const {bank}=setup({productIds:['cake-light'],budget:30000});
 render(<OccasionPlanner stewardName="宁宁" initialPlanId="birthday" initialPrompt="预算减到300，不要鲜花"/>);
 await screen.findByText(/已整理变更，请核对后确认/);
 fireEvent.click(screen.getByRole('button',{name:'核对本次变更'}));
 expect(screen.getByRole('button',{name:'确认变更并调整预留'})).toBeInTheDocument();
 bank.pay({id:'another-payment',channel:'wechat',merchant:'其他消费',amount:100});
 window.dispatchEvent(new Event('zhiyin-bank-updated'));
 await waitFor(()=>expect(screen.queryByRole('button',{name:'确认变更并调整预留'})).not.toBeInTheDocument());
 expect(bank.get().occasions![0].budget).toBe(80000);
});
