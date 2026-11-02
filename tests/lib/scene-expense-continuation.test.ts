import {expect,it} from 'vitest';
import {changeWorkspaces,emptyWorkspaces,type WorkspaceCommand} from '../../src/lib/workspaces';
import {routeWorkspacePrompt} from '../../src/lib/workspace-service';
const begin=()=>changeWorkspaces(emptyWorkspaces(),{type:'create',id:'birthday',kind:'occasion',title:'王芳生日',revision:0,requestId:'create'});
it('整理实付只建立同一事项的AA现场，重复点击复用且不生成账本或收款',()=>{
 let state=begin();
 state=changeWorkspaces(state,{type:'scene-expense-task',id:'birthday',taskId:'aa',revision:state.revision,requestId:'one'} as unknown as WorkspaceCommand);
 expect(state.items.find(t=>t.id==='aa')).toMatchObject({kind:'aa',sceneId:'birthday',messages:[]});
 expect(state.items.find(t=>t.id==='aa')?.expenseBookId).toBeUndefined();
 state=changeWorkspaces(state,{type:'scene-expense-task',id:'birthday',taskId:'duplicate',revision:state.revision,requestId:'two'} as unknown as WorkspaceCommand);
 expect(state.items.filter(t=>t.kind==='aa')).toHaveLength(1);
 expect(()=>changeWorkspaces(state,{type:'scene-expense-task',id:'unknown',taskId:'other',revision:state.revision,requestId:'three'} as unknown as WorkspaceCommand)).toThrow();
});
it('明确整理当前AA事项实付时直接续接，不因再次分类丢掉原事件关联',async()=>{
 const state=begin();state.items.push({...state.items[0],id:'aa',kind:'aa',sceneId:'birthday',title:'王芳生日费用'});
 const route=await routeWorkspacePrompt('整理本次实付费用',state.items,'aa','',[],{model:async()=>{throw new Error('不应重新分类');}});
 expect(route.parts?.[0]).toMatchObject({taskId:'aa',kind:'aa',title:'王芳生日费用'});
});
