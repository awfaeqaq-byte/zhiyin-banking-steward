import {createExpenseStore} from '../../server/expense-store';
import {it,expect,afterEach} from 'vitest';
import {mkdtempSync,rmSync} from 'node:fs';import {join} from 'node:path';import {tmpdir} from 'node:os';
import {createWorkspaceStore} from '../../server/workspace-store';import {createTaskStore} from '../../server/task-store';
import {createSceneService} from '../../server/scene-service';
import {sharePrompt,buildWechatShare} from './wechat-message-share';
const dirs:string[]=[];afterEach(()=>dirs.splice(0).forEach(d=>rmSync(d,{recursive:true,force:true})));
const scope='11111111-1111-4111-8111-111111111111';
function fixture(){const dir=mkdtempSync(join(tmpdir(),'zhiyin-scene-'));dirs.push(dir);const workspace=createWorkspaceStore(join(dir,`.zhiyin-workspaces-${scope}.local.json`));const change=(op:object)=>workspace.change({...op,revision:workspace.get().revision,requestId:crypto.randomUUID()} as Parameters<typeof workspace.change>[0]);return {dir,workspace,change,service:createSceneService(dir)};}
it('同一事项关联来源、日历和后续筹备，服务重建后仍有完整关联',()=>{
 const f=fixture();f.change({type:'create',id:'birthday',kind:'general',title:'王芳生日'});
 const prompt=sharePrompt(buildWechatShare({id:'chat',name:'王芳',kind:'direct'},[{id:'m',sender:'王芳',text:'我生日是7月15号。',sentAt:1791770000000}],['m'],'帮我记录王芳生日','s'));
 f.change({type:'turn',id:'birthday',user:prompt,assistant:'已核对生日',memoryRevision:0});f.change({type:'create',id:'prepare',kind:'occasion',title:'王芳生日蛋糕'});f.change({type:'scene-parent',id:'prepare',parentId:'birthday'});
 createTaskStore(join(f.dir,'.zhiyin-tasks.local.json')).change({type:'save',revision:0,id:'calendar',title:'王芳的生日',dueAt:Date.now()+86400000,allDay:true,repeat:'yearly',workspaceId:'birthday'});
 const state=f.service.get(scope),scene=state.scenes!.find(s=>s.id==='birthday')!;
 expect(scene.workspaceIds).toEqual(['birthday','prepare']);expect(scene.links).toContainEqual(expect.objectContaining({kind:'calendar',id:'calendar',workspaceId:'birthday'}));expect(scene.links.some(l=>l.kind==='message')).toBe(true);
 expect(createSceneService(f.dir).get(scope).scenes!.find(s=>s.id==='birthday')?.links).toEqual(scene.links);
});
it('返回自动核对实际订单，待付款不算完成；已付款、送达按同一订单推进且状态通知不重复',()=>{
 const f=fixture();f.change({type:'create',id:'food',kind:'food',title:'今晚点餐'});f.change({type:'progress',id:'food',memoryRevision:0,progress:{goal:'今晚点餐',stage:'waiting_authorization',food:{items:[{productId:'tea',quantity:1}],note:'',orderId:'order-a'}}});
 const check=(status:string)=>f.service.reconcile(scope,{orders:[{taskId:'food',id:'order-a',status,checkedAt:Date.now()}]});
 expect(check('PENDING_PAYMENT').scenes![0].stage).toBe('waiting_authorization');
 const paid=check('PAID');expect(paid.scenes![0].stage).toBe('waiting_external');expect(paid.scenes![0].summary).toContain('已付款');
 const replies=paid.conversation!.length;expect(check('PAID').conversation).toHaveLength(replies);
 expect(check('COMPLETED').scenes![0].stage).toBe('completed');expect(check('PAID').scenes![0].stage).toBe('completed');
 expect(()=>f.service.reconcile(scope,{orders:[{taskId:'other',id:'order-a',status:'PAID',checkedAt:Date.now()}]})).toThrow('归属');
});
it('平台读取失败保留原订单关联与上次记录，不宣称到账或自动支付；重试后解除待核对',()=>{
 const f=fixture();f.change({type:'create',id:'food',kind:'food',title:'奶茶'});f.change({type:'progress',id:'food',memoryRevision:0,progress:{goal:'奶茶',stage:'waiting_authorization',food:{items:[{productId:'tea',quantity:1}],note:'',orderId:'order-a'}}});
 const failed=f.service.reconcile(scope,{errors:[{workspaceId:'food',message:'外卖暂不可读'}]});expect(failed.scenes![0].stage).toBe('waiting_external');expect(failed.scenes![0].links.some(l=>l.id==='order-a')).toBe(true);expect(failed.scenes![0].summary).toContain('核对');
 const next=f.service.reconcile(scope,{orders:[{taskId:'food',id:'order-a',status:'PENDING_PAYMENT',checkedAt:Date.now()}],errors:[]});expect(next.scenes![0].stage).toBe('waiting_authorization');expect(next.scenes![0].error).toBeUndefined();
});

it('新筹备明确属于原生日事项时关联，未知父任务或循环不写入',()=>{
 const f=fixture();f.change({type:'create',id:'birthday',kind:'reminder',title:'王芳生日'});f.change({type:'message-submit',id:'msg',text:'给王芳生日准备蛋糕',currentId:'birthday',memoryRevision:0});
 f.change({type:'message-routed',id:'msg',parts:[{taskId:null,relatedTaskId:'birthday',kind:'occasion',title:'王芳生日蛋糕',text:'给王芳生日准备蛋糕'}]});
 const child=f.workspace.get().items.find(t=>t.kind==='occasion')!;expect(child.sceneId).toBe('birthday');expect(()=>f.change({type:'scene-parent',id:'birthday',parentId:child.id})).toThrow('循环');
 f.change({type:'message-submit',id:'bad',text:'筹备生日',currentId:'birthday',memoryRevision:0});expect(()=>f.change({type:'message-routed',id:'bad',parts:[{taskId:null,relatedTaskId:'missing',kind:'occasion',title:'生日',text:'筹备生日'}]})).toThrow('关联');
});


it('旧AA缺少授权转为等用户恢复，刷新仍保留账本链接且不生成聊天错误',()=>{
 const f=fixture();f.change({type:'create',id:'aa',kind:'aa',title:'原聚餐'});
 const group={id:'group',name:'原群',revision:1,members:[{id:'me',name:'我',self:true}]};
 createExpenseStore(join(f.dir,`.zhiyin-expenses-${scope}.local.json`)).change({type:'create',bookId:'book',title:'原聚餐',group,participants:['me'],defaultPayerId:'me',revision:0,requestId:crypto.randomUUID()});
 f.change({type:'link',id:'aa',expenseBookId:'book'});
 const next=f.service.reconcile(scope,{errors:[{workspaceId:'aa',message:'此群授权已失效，请重新选择'}]});
 expect(next.scenes?.[0]).toMatchObject({stage:'waiting_user',next:{kind:'expense',id:'book'}});
 expect(next.conversation?.some(message=>message.content.includes('授权'))??false).toBe(false);
 expect(f.service.get(scope).scenes?.[0].error).toContain('授权');
 expect(next.items[0].expenseBookId).toBe('book');
});
