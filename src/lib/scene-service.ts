import {validWorkspaces,type WorkspaceState} from './workspaces';
import {validSceneOrder,type SceneOrderObservation} from './scene-flow';
import {foodOrderRequest} from './food-order-bridge';
import {occasionFoodRequest} from './occasion-food-bridge';
import {expenseRequest} from './expense-service';
import {groupAARequest} from './group-aa';
import {collectionProgress} from './expense-follow-up';
type Observations={orders:SceneOrderObservation[];errors:Array<{workspaceId:string;message:string}>};
export async function sceneRequest(input?:Observations):Promise<WorkspaceState>{
 let scope=localStorage.getItem('zhiyin-expense-scope');if(!scope){scope=crypto.randomUUID();localStorage.setItem('zhiyin-expense-scope',scope);}
 const response=await fetch('/api/zhiyin/scenes',{method:input?'POST':'GET',headers:{'Content-Type':'application/json','X-Zhiyin-Scenes':'1','X-Zhiyin-Expense-Scope':scope},...(input?{body:JSON.stringify(input)}:{}),signal:AbortSignal.timeout(15000)});
 const data=await response.json();if(!response.ok)throw new Error(data.error||'跨场景进度暂未核对');if(!validWorkspaces(data))throw new Error('跨场景进度格式无效');return data;
}
/** Recover publication receipts without publishing again or releasing allocations. */
export async function reconcileExpenseBook(bookId:string){
 for(let attempt=0;attempt<3;attempt++){
  let state=await expenseRequest(),book=state.books.find(b=>b.id===bookId);if(!book)throw new Error('原消费记录暂不可读');if(!book.batches.length)return;
  const result=await groupAARequest('records',{groupId:book.group.id});if(!Array.isArray(result.collections))throw new Error('未取得微信收款记录');
  const collections=result.collections.filter(c=>book!.batches.some(b=>b.id===c.id));
  for(const collection of collections)collectionProgress(book,book.batches.find(b=>b.id===collection.id)!,collection);
  try{
   for(const collection of collections){const batch=book.batches.find(b=>b.id===collection.id)!;if(batch.status==='prepared'){state=await expenseRequest({type:'published',bookId,batchId:batch.id,collectionId:collection.id},state.revision);book=state.books.find(b=>b.id===bookId)!;}}
   const previous=book.batches.flatMap(b=>b.receipt?[b.receipt]:[]);
   // The platform may temporarily omit a record; never erase a saved receipt.
   const merged=[...previous.filter(p=>!collections.some(c=>c.id===p.id)),...collections];
   if(JSON.stringify(previous)!==JSON.stringify(merged))await expenseRequest({type:'sync-collections',bookId,collections:merged},state.revision);
   return;
  }catch(cause){if(attempt===2||!(cause instanceof Error)||!cause.message.includes('已变化'))throw cause;}
 }
}
type Dependencies={request:typeof sceneRequest;food:typeof foodOrderRequest;occasion:typeof occasionFoodRequest;expenses:(bookId:string)=>Promise<void>};
export async function reconcileSceneSources(dependencies:Dependencies={request:sceneRequest,food:foodOrderRequest,occasion:occasionFoodRequest,expenses:reconcileExpenseBook}):Promise<WorkspaceState>{
 const state=await dependencies.request(),orders:SceneOrderObservation[]=[],errors:Observations['errors']=[];
 const links=state.scenes?.flatMap(s=>s.links)||[],groups=new Map<string,typeof links>();
 for(const link of links.filter(l=>l.kind==='food_order'||l.kind==='expense_book')){const key=link.kind==='expense_book'?`book:${link.id}`:`${link.channel}:${link.workspaceId}`;groups.set(key,[...(groups.get(key)||[]),link]);}
 await Promise.all([...groups.values()].map(async(group)=>{
  const link=group[0],checkedAt=Date.now();
  try{
   if(link.kind==='expense_book'){await dependencies.expenses(link.id);return;}
   const result=link.channel==='occasion'?await dependencies.occasion('records',{planId:link.workspaceId}):await dependencies.food('records',{taskId:link.workspaceId});
   if(!Array.isArray(result.orders))throw new Error('原订单记录暂不可读');
   const observed:SceneOrderObservation[]=[];
   for(const owned of group){const receipt=result.orders.find(r=>r.id===owned.id);if(!receipt)throw new Error('原订单记录暂不可读');
    if(link.channel==='occasion'? !('occasionId' in receipt)||receipt.occasionId!==link.workspaceId:!('taskId' in receipt)||receipt.taskId!==link.workspaceId)throw new Error('订单归属无法核对');
    const observation={taskId:link.workspaceId,id:receipt.id,status:receipt.status,checkedAt};if(!validSceneOrder(observation))throw new Error('平台订单状态无法核对');observed.push(observation);
   }orders.push(...observed);
  }catch(cause){errors.push({workspaceId:link.workspaceId,message:(cause instanceof Error?cause.message:'平台结果暂不可读').slice(0,300)});}
 }));
 return dependencies.request({orders,errors});
}
