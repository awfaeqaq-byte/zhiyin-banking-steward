import {afterEach,expect,it,vi} from 'vitest';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {validSceneOrder,type SceneFlow} from './scene-flow';
import {emptyWorkspaces} from './workspaces';
import {reconcileSceneSources} from './scene-service';
import {createWorkspaceStore} from '../../server/workspace-store';
import {createSceneService} from '../../server/scene-service';

const payment={id:'pay-order',amount:680,refundedAmount:0,paidAt:1791513000000,merchant:'橙子小馆'};
const observation={id:'order',taskId:'food',status:'ACCEPTED',checkedAt:Date.now(),payment};
const dirs:string[]=[];
afterEach(()=>{dirs.splice(0).forEach(dir=>rmSync(dir,{recursive:true,force:true}));vi.restoreAllMocks();});

it('实付证据必须是合法金额和付款身份，待支付状态不能携带付款回执',()=>{
 expect(validSceneOrder(observation)).toBe(true);
 for(const patch of [{amount:0.5},{refundedAmount:681},{id:''},{merchant:''},{paidAt:-1}]){
  expect(validSceneOrder({...observation,payment:{...payment,...patch}})).toBe(false);
 }
 expect(validSceneOrder({...observation,status:'PENDING_PAYMENT'})).toBe(false);
});

it('后台核对保留原订单实付与退款证据，不能只传订单状态',async()=>{
 const scene:SceneFlow={id:'food',title:'聚餐',workspaceIds:['food'],links:[{kind:'food_order',id:'order',workspaceId:'food',channel:'food'}],records:[],stage:'waiting_external',summary:'核对中',orders:[],checkedAt:0,fingerprint:''};
 const request=vi.fn().mockResolvedValue({...emptyWorkspaces(),scenes:[scene]});
 await reconcileSceneSources({request,food:vi.fn().mockResolvedValue({orders:[{...observation,payable:680}]}),occasion:vi.fn(),expenses:vi.fn()});
 expect(request.mock.lastCall?.[0].orders[0]).toMatchObject({payment});
});

it('同一订单不能换付款身份或金额，迟来的缺字段不能擦掉付款证据',()=>{
 const dir=mkdtempSync(join(tmpdir(),'zhiyin-scene-payment-'));dirs.push(dir);
 const scope='11111111-1111-4111-8111-111111111111';
 const store=createWorkspaceStore(join(dir,`.zhiyin-workspaces-${scope}.local.json`));
 store.change({type:'create',id:'food',kind:'food',title:'聚餐',revision:0,requestId:'create'});
 store.change({type:'progress',id:'food',memoryRevision:0,progress:{goal:'聚餐',stage:'waiting_authorization',food:{items:[{productId:'tea',quantity:1}],note:'',orderId:'order'}},revision:1,requestId:'progress'});
 const service=createSceneService(dir);
 service.reconcile(scope,{orders:[observation]});
 const {payment:unused,...withoutPayment}=observation;void unused;
 const restored=service.reconcile(scope,{orders:[{...withoutPayment,status:'COMPLETED',checkedAt:Date.now()}]});
 expect(restored.scenes?.[0].orders[0]).toMatchObject({payment});
 expect(()=>service.reconcile(scope,{orders:[{...observation,status:'COMPLETED',checkedAt:Date.now(),payment:{...payment,amount:999}}]})).toThrow('付款');
 service.reconcile(scope,{orders:[{...observation,status:'REFUNDED',checkedAt:Date.now(),payment:{...payment,refundedAmount:680}}]});
 expect(()=>service.reconcile(scope,{orders:[{...observation,status:'REFUNDED',checkedAt:Date.now(),payment}]})).toThrow('退款');
});
