import {afterEach,expect,it,vi} from 'vitest';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createSceneExpenseResolver} from '../../server/scene-expense-sources';
import {createWorkspaceStore} from '../../server/workspace-store';
import {createBankStore} from '../../server/bank-store';
import {createSceneService} from '../../server/scene-service';

const scope='11111111-1111-4111-8111-111111111111',dirs:string[]=[];
afterEach(()=>{vi.restoreAllMocks();dirs.splice(0).forEach(d=>rmSync(d,{recursive:true,force:true}));});
function fixture(){
 const dir=mkdtempSync(join(tmpdir(),'scene-source-'));dirs.push(dir);
 const workspace=createWorkspaceStore(join(dir,`.zhiyin-workspaces-${scope}.local.json`));
 const change=(op:object)=>workspace.change({...op,revision:workspace.get().revision,requestId:crypto.randomUUID()} as Parameters<typeof workspace.change>[0]);
 change({type:'create',id:'birthday',kind:'occasion',title:'王芳生日'});
 change({type:'create',id:'aa',kind:'aa',title:'王芳聚餐AA'});
 change({type:'scene-parent',id:'aa',parentId:'birthday'});
 change({type:'link',id:'aa',expenseBookId:'book'});
 return {dir,change,resolve:createSceneExpenseResolver(dir)};
}
it('关联AA只取本事项真实银行付款，未付订单与别人的筹备不进入候选',async()=>{
 const f=fixture(),bank=createBankStore(join(f.dir,'.zhiyin-bank.local.json'));
 const now=Date.parse('2026-10-22T12:00:00+08:00');vi.spyOn(Date,'now').mockReturnValue(now);
 const draft={title:'生日',recipient:'王芳',budget:50000,prepareAt:now+1000,deliverAt:now+86400000,address:'家',contact:'本人',note:'',productIds:['cake-light','flowers-seasonal']};
 bank.saveOccasion({id:'birthday',draft,revision:0},now);bank.reserveOccasion('birthday',bank.get().revision,now);
 const order=bank.prepareOccasionOrder('birthday','cake-light',bank.get().revision,now);
 bank.prepareOccasionOrder('birthday','flowers-seasonal',bank.get().revision,now);
 bank.pay({id:order.paymentId,occasionId:'birthday',amount:order.amount,merchant:order.merchant,channel:'wechat'},now);
 const result=await f.resolve(scope,'aa');
 expect(result.bookIds).toEqual(['book']);expect(result.sources).toHaveLength(1);
 expect(result.sources[0]).toMatchObject({workspaceId:'birthday',orderId:order.orderId,paymentId:order.paymentId,paidAmount:20600,refundedAmount:0});
 bank.refundPayment(order.paymentId,now+1);
 expect((await f.resolve(scope,'aa')).sources[0].refundedAmount).toBe(20600);
 await expect(Promise.resolve().then(()=>f.resolve(scope,'unrelated'))).rejects.toThrow('事项');
});
it('日常外卖付款按明确订单关联进入同一事项，付款状态本身不能补造金额',async()=>{
 const f=fixture();f.change({type:'create',id:'meal',kind:'food',title:'生日晚餐'});f.change({type:'scene-parent',id:'meal',parentId:'birthday'});
 f.change({type:'progress',id:'meal',memoryRevision:0,progress:{goal:'晚餐',stage:'ready',food:{items:[{productId:'tea',quantity:1}],note:'',orderId:'food-order'}}});
 const service=createSceneService(f.dir),checkedAt=Date.now();
 service.reconcile(scope,{orders:[{id:'food-order',taskId:'meal',status:'ACCEPTED',checkedAt}]});
 expect((await f.resolve(scope,'aa')).sources).toEqual([]);
 const payment={id:'payment',amount:680,refundedAmount:0,merchant:'小馆',paidAt:checkedAt-100};
 service.reconcile(scope,{orders:[{id:'food-order',taskId:'meal',status:'ACCEPTED',checkedAt,payment}]});
 expect((await f.resolve(scope,'aa')).sources).toEqual([expect.objectContaining({kind:'food',workspaceId:'meal',paidAmount:680,paymentId:'payment'})]);
 const foreign='22222222-2222-4222-8222-222222222222';
 await expect(Promise.resolve().then(()=>f.resolve(foreign,'aa'))).rejects.toThrow('事项');
});
