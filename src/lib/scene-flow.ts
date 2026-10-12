import type {Workspace,WorkspaceState} from './workspaces';
export type SceneStage='processing'|'waiting_user'|'waiting_authorization'|'waiting_external'|'completed'|'cancelled'|'failed';
export type SceneLink={kind:'message'|'calendar'|'occasion'|'food_order'|'expense_book'|'transfer'|'schedule'|'bank_aa'|'collection';id:string;workspaceId:string;channel?:'food'|'occasion'};
export type SceneNext={kind:'food'|'occasion'|'expense'|'calendar'|'bank';id:string;workspaceId:string;channel?:'food'|'occasion';date?:number};
export type SceneRecord=SceneLink&{status:string;label:string};
export type SceneOrderObservation={taskId:string;id:string;status:string;checkedAt:number};
export type SceneFlow={id:string;title:string;workspaceIds:string[];links:SceneLink[];records:SceneRecord[];stage:SceneStage;summary:string;orders:SceneOrderObservation[];checkedAt:number;fingerprint:string;error?:string;next?:SceneNext};
const id=(v:unknown):v is string=>typeof v==='string'&&/^[\w:.-]{1,180}$/.test(v);
const text=(v:unknown,max:number):v is string=>typeof v==='string'&&v.length<=max&&!!v.trim();
export const orderStatuses=['PENDING_PAYMENT','PAID','ACCEPTED','PREPARING','READY_FOR_DELIVERY','DELIVERY_ASSIGNED','DELIVERING','COMPLETED','REFUNDING','REFUNDED','CANCELLED'];
export function validSceneOrder(v:unknown):v is SceneOrderObservation{const x=v as SceneOrderObservation;return !!x&&id(x.taskId)&&id(x.id)&&orderStatuses.includes(x.status)&&Number.isSafeInteger(x.checkedAt)&&x.checkedAt>=0;}
export function validSceneLink(v:unknown):v is SceneLink{const x=v as SceneLink;return !!x&&['message','calendar','occasion','food_order','expense_book','transfer','schedule','bank_aa','collection'].includes(x.kind)&&id(x.id)&&id(x.workspaceId)&&(x.channel===undefined||['food','occasion'].includes(x.channel));}
export function validScene(v:unknown):v is SceneFlow{const x=v as SceneFlow;return !!x&&id(x.id)&&text(x.title,60)&&Array.isArray(x.workspaceIds)&&x.workspaceIds.length<=100&&x.workspaceIds.every(id)&&new Set(x.workspaceIds).size===x.workspaceIds.length&&Array.isArray(x.links)&&x.links.length<=300&&x.links.every(validSceneLink)&&Array.isArray(x.records)&&x.records.length<=300&&x.records.every(r=>validSceneLink(r)&&text(r.status,80)&&text(r.label,300))&&['processing','waiting_user','waiting_authorization','waiting_external','completed','cancelled','failed'].includes(x.stage)&&text(x.summary,1000)&&Array.isArray(x.orders)&&x.orders.length<=200&&x.orders.every(validSceneOrder)&&Number.isSafeInteger(x.checkedAt)&&x.checkedAt>=0&&typeof x.fingerprint==='string'&&x.fingerprint.length<=50000&&(x.error===undefined||text(x.error,1000))&&(x.next===undefined||id(x.next.id)&&id(x.next.workspaceId)&&['food','occasion','expense','calendar','bank'].includes(x.next.kind)&&(x.next.channel===undefined||['food','occasion'].includes(x.next.channel))&&(x.next.date===undefined||Number.isSafeInteger(x.next.date)&&x.next.date>0));}
/** A named relation groups new stages; it never moves or executes an old task. */
export function attachSceneParent(items:Workspace[],childId:string,parentId:string){
 const child=items.find(t=>t.id===childId&&t.status==='active'),parent=items.find(t=>t.id===parentId&&t.status==='active');
 if(!child||!parent||child.id===parent.id)throw new Error('事项关联无效');
 const root=parent.sceneId||parent.id;if(root===child.id||!items.some(t=>t.id===root))throw new Error('事项关联不能形成循环');
 if(child.sceneId&&child.sceneId!==root)throw new Error('事项已经关联，不能改为其他事项');child.sceneId=root;
}
export function sceneFingerprint(scene:Pick<SceneFlow,'records'|'error'>){return JSON.stringify({records:scene.records.filter(r=>r.kind!=='message').map(({kind,id,workspaceId,status,label})=>({kind,id,workspaceId,status,label})),error:scene.error||''});}
function digest(value:string){let hash=2166136261;for(let i=0;i<value.length;i++){hash^=value.charCodeAt(i);hash=Math.imul(hash,16777619);}return (hash>>>0).toString(16);}
export function applySceneSnapshot(state:WorkspaceState,scenes:SceneFlow[]):WorkspaceState{
 if(!Array.isArray(scenes)||scenes.length>100||!scenes.every(validScene)||new Set(scenes.map(s=>s.id)).size!==scenes.length||scenes.some(s=>s.workspaceIds.some(id=>!state.items.some(t=>t.id===id))))throw new Error('事项状态无效');
 const next=structuredClone(state);next.scenes=scenes;
 for(const scene of scenes){const previous=state.scenes?.find(s=>s.id===scene.id);
  if(!scene.records.some(r=>r.kind!=='message')||scene.stage==='processing'||previous?.fingerprint===scene.fingerprint)continue;
  const id=`scene-${digest(scene.id)}-${digest(scene.fingerprint)}`;next.conversation??=[];
  if(!next.conversation.some(m=>m.id===id))next.conversation=[...next.conversation,{id,role:'assistant' as const,content:scene.summary,workspaceId:scene.workspaceIds[0],sceneId:scene.id}].slice(-100);
 }
 return next;
}
