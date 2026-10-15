import {afterEach,expect,it,vi} from 'vitest';
import {requestFoodAdvice,type FoodCatalog} from './food-order';
import {createMessageService} from '../../server/message-service';
import {createWorkspaceStore} from '../../server/workspace-store';
import {createTaskStore} from '../../server/task-store';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';

const dirs:string[]=[];
afterEach(()=>{vi.restoreAllMocks();dirs.splice(0).forEach(d=>rmSync(d,{recursive:true,force:true}));});
it('专用点餐模型读取同一事项来源事实，引用不能当作授权',async()=>{
 const fetch=vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response(JSON.stringify({output_text:'{"intent":"answer","text":"沿用本次聚餐要求。","choices":[]}'})));
 const catalog:FoodCatalog={storeId:'shop',storeName:'小馆',products:[{id:'tea',name:'茶',description:'',price:100,image:''}],deliveryFee:0,discount:0,deliveryMinutes:20,address:'家',contact:'本人'};
 const scene={version:1,sceneId:'birthday',workspaceIds:['birthday','meal'],authorization:'none',facts:[{field:'birthdayDate',value:'2026-10-20',source:{kind:'calendar',id:'date',workspaceId:'birthday',label:'王芳生日'}}],conflicts:[],evidence:[]};
 await Reflect.apply(requestFoodAdvice,undefined,['按这次生日安排推荐',catalog,{items:[],note:''},[],'','宁宁',scene]);
 const body=JSON.parse(String(fetch.mock.calls[0][1]?.body));
 expect(JSON.stringify(body.input)).toContain('2026-10-20');
 expect(JSON.stringify(body.input)).toContain('王芳生日');
 expect(body.instructions).toContain('授权');
});

it('领取新阶段时即带上关联日历资料，不依赖十五秒后台轮询先完成',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'scene-context-claim-'));dirs.push(dir);
 const scope='11111111-1111-4111-8111-111111111111';
 const store=createWorkspaceStore(join(dir,`.zhiyin-workspaces-${scope}.local.json`));
 store.change({type:'create',id:'birthday',kind:'reminder',title:'王芳生日',requestId:'create',revision:0});
 createTaskStore(join(dir,'.zhiyin-tasks.local.json')).change({type:'save',id:'date',title:'王芳生日',dueAt:Date.now()+86400000,allDay:true,repeat:'yearly',workspaceId:'birthday',revision:0});
 const service=createMessageService(dir,async()=>JSON.stringify({parts:[{taskId:null,relatedTaskId:'birthday',kind:'occasion',title:'王芳生日筹备',segmentIds:[0]}]}));
 service.submit(scope,{id:'message',text:'帮王芳准备生日蛋糕',currentId:'birthday',memoryRevision:0});
 await service.idle(scope);
 const job=service.get(scope).runs![0].jobs[0];
 const result=service.claim(scope,'message',job.id,'worker');
 expect(result.scenes?.find(s=>s.workspaceIds.includes(job.taskId))).toMatchObject({context:{facts:expect.arrayContaining([expect.objectContaining({field:'birthdayDate'})])}});
});
