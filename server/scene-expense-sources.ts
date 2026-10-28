import {join} from 'node:path';
import {createBankStore} from './bank-store';
import {createSceneService} from './scene-service';
import {createWorkspaceStore} from './workspace-store';
import {sceneExpenseFacts} from './scene-expense-facts';
import type {SceneExpenseResolver} from './scene-expenses';

/** Resolve identities first. Neither request bodies nor model text supply amounts. */
export function createSceneExpenseResolver(directory:string):SceneExpenseResolver {
 const scenes=createSceneService(directory),bank=createBankStore(join(directory,'.zhiyin-bank.local.json'));
 return (scope,workspaceId)=>{
  const state=scenes.get(scope);
  const task=state.items.find(item=>item.id===workspaceId&&item.status==='active');
  const scene=state.scenes?.find(item=>item.workspaceIds.includes(workspaceId));
  if(!task||!scene)throw new Error('原事项不存在或已经归档，请回到原事项核对');
  const members=state.items.filter(item=>item.status==='active'&&scene.workspaceIds.includes(item.id));
  const memberIds=new Set(members.map(item=>item.id));
  if(scene.error&&scene.links.some(link=>link.kind==='food_order'&&link.channel==='food'))throw new Error('原订单尚未核对成功，请重试后再整理实付费用');
  const sources=sceneExpenseFacts({members,scene,account:bank.get(),checkedAt:Date.now()});
  // Re-read bindings: a background archive must not turn this into cross-task access.
  const current=createWorkspaceStore(join(directory,`.zhiyin-workspaces-${scope}.local.json`)).get();
  const bookIds=current.items.filter(item=>memberIds.has(item.id)&&item.status==='active').flatMap(item=>item.expenseBookId?[item.expenseBookId]:[]);
  return {sources,bookIds:[...new Set(bookIds)]};
 };
}
