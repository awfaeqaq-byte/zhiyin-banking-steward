import {describe,it,expect} from 'vitest';
import {changeWorkspaces,emptyWorkspaces,type WorkspaceCommand} from './workspaces';
import type {MessageOperation} from './message-flow';
const uuid=()=>crypto.randomUUID();
function fixture(){let state=emptyWorkspaces();return {get:()=>state,apply:(op:MessageOperation)=>state=changeWorkspaces(state,{...op,revision:state.revision,requestId:uuid()} as WorkspaceCommand)};}
describe('服务端消息状态与串行任务',()=>{
 it('原消息先持久化，同ID重试不会复制用户消息或替换原文',()=>{
  const f=fixture(),id=uuid();f.apply({type:'message-submit',id,text:'你好',currentId:'',memoryRevision:0});
  expect(f.get().conversation?.[0]).toMatchObject({id:`user-${id}`,content:'你好'});
  expect(f.get().runs?.[0].status).toBe('routing');
  f.apply({type:'message-submit',id,text:'你好',currentId:'',memoryRevision:0});expect(f.get().conversation).toHaveLength(1);
  expect(()=>f.apply({type:'message-submit',id,text:'转500',currentId:'',memoryRevision:0})).toThrow();
 });
 it('多任务原子入队；只有队首可领取，双页面不能重复领取，完成后放行下一项',()=>{
  const f=fixture(),id=uuid(),owner=uuid();f.apply({type:'message-submit',id,text:'饮料18，明天去杭州',currentId:'',memoryRevision:0});
  f.apply({type:'message-routed',id,parts:[{taskId:null,kind:'aa',title:'聚餐',text:'饮料18'},{taskId:null,kind:'general',title:'出行',text:'明天去杭州'}]});
  const [one,two]=f.get().runs![0].jobs;expect(one.status).toBe('queued');
  expect(()=>f.apply({type:'message-claim',id,jobId:two.id,owner})).toThrow();
  f.apply({type:'message-claim',id,jobId:one.id,owner});
  expect(()=>f.apply({type:'message-claim',id,jobId:one.id,owner:uuid()})).toThrow();
  f.apply({type:'message-complete',id,jobId:one.id,owner,assistant:'饮料已记好。',memoryRevision:0,failed:false});
  f.apply({type:'message-complete',id,jobId:one.id,owner,assistant:'饮料已记好。',memoryRevision:0,failed:false});
  expect(f.get().conversation?.filter(m=>m.role==='assistant')).toHaveLength(1);
  f.apply({type:'message-claim',id,jobId:two.id,owner});
  f.apply({type:'message-complete',id,jobId:two.id,owner,assistant:'出行已整理。',memoryRevision:0,failed:false});
  expect(f.get().runs![0].status).toBe('completed');expect(f.get().items.flatMap(t=>t.pending||[])).toHaveLength(0);
 });
 it('失败有稳定消息ID与阶段记录，后续事项不自动执行；迟到或错误归属的结果不被写入',()=>{
  const f=fixture(),id=uuid(),owner=uuid();f.apply({type:'message-submit',id,text:'给妈妈转500',currentId:'',memoryRevision:0});
  f.apply({type:'message-fail',id,error:'分类服务不可用',stage:'routing'});
  expect(f.get().runs![0]).toMatchObject({id,status:'failed'});expect(f.get().runs![0].trace.at(-1)?.stage).toBe('failed');
  expect(f.get().conversation?.at(-1)?.retryPrompt).toBe('给妈妈转500');
  expect(()=>f.apply({type:'message-complete',id,jobId:uuid(),owner,assistant:'已付款',memoryRevision:0,failed:false})).toThrow();
 });
});
