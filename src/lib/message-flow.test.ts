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

it('部分失败清理所有未完成令牌；重试只重新入队失败项并拒绝迟到的旧结果',()=>{
 const f=fixture(),id=uuid(),owner=uuid();f.apply({type:'message-submit',id,text:'饮料18，给妈妈转500',currentId:'',memoryRevision:0});
 f.apply({type:'message-routed',id,parts:[{taskId:null,kind:'aa',title:'聚餐',text:'饮料18'},{taskId:null,kind:'transfer',title:'生活费',text:'给妈妈转500'}]});
 const [one,two]=f.get().runs![0].jobs;
 f.apply({type:'message-claim',id,jobId:one.id,owner});f.apply({type:'message-complete',id,jobId:one.id,owner,assistant:'饮料已记好。',memoryRevision:0,failed:false});
 f.apply({type:'message-claim',id,jobId:two.id,owner});f.apply({type:'message-complete',id,jobId:two.id,owner,assistant:'模型暂时不可用',memoryRevision:0,failed:true});
 expect(f.get().items.flatMap(task=>task.pending||[])).toHaveLength(0);
 expect(f.get().conversation?.at(-1)).toMatchObject({retryRunId:id});
 const retry={type:'message-retry',id,retryId:uuid(),memoryRevision:0} as MessageOperation;
 f.apply(retry);const jobs=f.get().runs![0].jobs;
 expect(jobs[0]).toEqual({...one,status:'completed',owner,leaseUntil:expect.any(Number)});expect(jobs[1]).toMatchObject({taskId:two.taskId,text:two.text,status:'queued'});expect(jobs[1].id).not.toBe(two.id);
 expect(f.get().items.flatMap(task=>task.pending||[])).toEqual([{token:jobs[1].id,text:two.text}]);
 expect(()=>f.apply({type:'message-complete',id,jobId:two.id,owner,assistant:'迟到结果',memoryRevision:0,failed:false})).toThrow();
 f.apply(retry);expect(f.get().runs![0].jobs).toEqual(jobs);
 f.apply({type:'message-claim',id,jobId:jobs[1].id,owner});f.apply({type:'message-complete',id,jobId:jobs[1].id,owner,assistant:'已整理转账方案，待确认。',memoryRevision:0,failed:false});
 f.apply(retry);expect(f.get().runs![0].status).toBe('completed');expect(f.get().conversation?.filter(m=>m.content==='饮料已记好。')).toHaveLength(1);
 const state=f.get();expect(()=>changeWorkspaces(state,{type:'status',id:two.taskId,status:'archived',revision:state.revision,requestId:uuid()})).not.toThrow();
});
it('中断清理未完成令牌，重试排在正在处理的消息之后且旧重试请求不会再次执行',()=>{
 const f=fixture(),first=uuid(),second=uuid(),owner=uuid();
 f.apply({type:'message-submit',id:first,text:'你好',currentId:'',memoryRevision:0});f.apply({type:'message-routed',id:first,parts:[{taskId:null,kind:'general',title:'问候',text:'你好'}]});
 const old=f.get().runs![0].jobs[0];f.apply({type:'message-fail',id:first,error:'处理已中断',stage:'gathering',interrupted:true});expect(f.get().items[0].pending).toHaveLength(0);
 f.apply({type:'message-submit',id:second,text:'早上好',currentId:'',memoryRevision:0});f.apply({type:'message-routed',id:second,parts:[{taskId:null,kind:'general',title:'新问候',text:'早上好'}]});
 const active=f.get().runs![1].jobs[0];f.apply({type:'message-claim',id:second,jobId:active.id,owner});
 const retry={type:'message-retry',id:first,retryId:uuid(),memoryRevision:0} as MessageOperation;f.apply(retry);
 expect(f.get().runs?.find(r=>['ready','processing'].includes(r.status))?.id).toBe(second);
 f.apply({type:'message-fail',id:first,error:'又中断了',stage:'gathering'});f.apply(retry);expect(f.get().runs?.find(r=>r.id===first)?.status).toBe('failed');
 expect(f.get().items.flatMap(task=>task.pending||[]).some(item=>item.token===old.id)).toBe(false);
 expect(()=>f.apply({type:'message-retry',id:first,retryId:uuid(),memoryRevision:1} as MessageOperation)).toThrow('已变化');
});
it('完整澄清原文只能绑定到同一上下文的待澄清消息，不能伪造别的事项原文',()=>{
 const f=fixture(),original=uuid(),answer=uuid();f.apply({type:'message-submit',id:original,text:'请转账783给家人',currentId:'',memoryRevision:0});f.apply({type:'message-routed',id:original,parts:[],clarification:'给哪位家人？'});
 f.apply({type:'message-submit',id:answer,text:'妈妈',currentId:'',memoryRevision:0});
 f.apply({type:'message-routed',id:answer,sourcePrompt:'请转账783给家人\n补充：妈妈',clarificationOf:original,parts:[{taskId:null,kind:'transfer',title:'家人转账',text:'请转账783给家人\n补充：妈妈'}]} as MessageOperation);
 expect(f.get().runs?.find(r=>r.id===answer)).toMatchObject({prompt:'妈妈',sourcePrompt:'请转账783给家人\n补充：妈妈',clarificationOf:original});
 expect(f.get().runs?.find(r=>r.id===answer)?.jobs[0].text).toContain('783');expect(f.get().conversation?.find(m=>m.id===`user-${answer}`)?.content).toBe('妈妈');
});
