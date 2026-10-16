import {useCallback,useEffect,useRef,useState} from 'react';
import {ArrowUpRight,MapPin,Minus,Plus,ShoppingBag} from 'lucide-react';
import {foodQuote,requestFoodAdvice,type FoodCatalog,type FoodDraft,type FoodReceipt} from '../lib/food-order';
import {foodOrderRequest} from '../lib/food-order-bridge';
import type {SceneContext} from '../lib/scene-context';
import type {TaskProgress} from '../lib/task-progress-schema';
import {Button} from './ui/button';
import {TaskCardHeader} from './task-card-header';
import './food-order-planner.css';
type Props={sceneContext?:SceneContext;taskId:string;stewardName:string;initialDraft:FoodDraft;history:Array<{role:'user'|'assistant';content:string}>;injectedPrompt?:{token:string;text:string};getMemoryContext?:(text:string)=>Promise<string>;onPrompt?:(text:string)=>void;onTurn?:(user:string,answer:string,failed:boolean,progress:TaskProgress)=>Promise<void>|void;onDraftChange?:(draft:FoodDraft)=>Promise<void>|void};
const money=(value:number)=>`¥${(value/100).toFixed(2)}`;
const statusLabel:Record<string,string>={PENDING_PAYMENT:'待付款',PAID:'已付款',ACCEPTED:'商家已接单',PREPARING:'正在制作',READY_FOR_DELIVERY:'等待配送',DELIVERY_ASSIGNED:'骑手已接单',DELIVERING:'配送中',COMPLETED:'已送达',CANCELLED:'已取消',REFUNDING:'退款中',REFUNDED:'已退款'};
/** One inline plan, not a second chat. Model suggestions never invoke the order bridge. */
export function FoodOrderPlanner(props:Props){
 const {taskId,stewardName}=props;
 const callbacks=useRef(props);callbacks.current=props;
 const [catalog,setCatalog]=useState<FoodCatalog>(),[draft,setDraft]=useState(props.initialDraft),[receipt,setReceipt]=useState<FoodReceipt>(),[ready,setReady]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[choices,setChoices]=useState<string[]>([]);
 const current=useRef(draft),consumed=useRef(''),lock=useRef(false),alive=useRef(true),orderId=useRef('');
 const history=useRef(props.history);history.current=props.history;
 const update=useCallback((next:FoodDraft)=>{current.current=next;setDraft(next);},[]);
 const refresh=useCallback(async()=>{
  if(lock.current)return;
  try{
   const [menu,records]=await Promise.all([foodOrderRequest('catalog',{taskId}),foodOrderRequest('records',{taskId})]);
   if(!alive.current)return;
   setCatalog(menu.catalog);const found=records.orders?.find(o=>o.id===current.current.orderId)||records.orders?.[0];setReceipt(found);
   if(found&&current.current.orderId!==found.id){const next={...current.current,orderId:found.id};update(next);await callbacks.current.onDraftChange?.(next);}
   setReady(true);setError('');
  }catch(e){if(alive.current){setReady(false);setError(e instanceof Error?e.message:'菜单暂不可用，请重试。');}}
 },[taskId,update]);
 useEffect(()=>{alive.current=true;void refresh();const run=()=>void refresh();window.addEventListener('zhiyin-phone-foreground',run);return()=>{alive.current=false;window.removeEventListener('zhiyin-phone-foreground',run);};},[refresh]);
 const advise=useCallback(async(text:string)=>{
  if(!catalog||lock.current)return;lock.current=true;setBusy(true);setError('');let answer='',failed=false;let next=current.current;
  try{
   const memory=await callbacks.current.getMemoryContext?.(text)||'';
   const result=await requestFoodAdvice(text,catalog,next,history.current,memory,stewardName,callbacks.current.sceneContext);if(!alive.current)return;
   answer=result.text;setChoices(result.choices);
   if(result.intent!=='answer'&&result.intent!=='clarify'&&result.draft&&!next.orderId){next={...result.draft,...(result.draft.address===undefined&&next.address?{address:next.address}:{}),...(result.draft.contact===undefined&&next.contact?{contact:next.contact}:{})};update(next);orderId.current='';}
   else if(result.intent!=='answer'&&result.intent!=='clarify'&&result.draft&&next.orderId){answer='这笔已经生成订单，不能在这里修改。我可以带你回原订单核对。';setChoices([]);}
  }catch(e){failed=true;answer=e instanceof Error?e.message:'点餐暂时未能整理，请重试。';if(alive.current)setError(answer);}
  finally{
   try{if(alive.current)await callbacks.current.onTurn?.(text,answer,failed,{goal:'日常点餐',stage:failed?'failed':next.items.length?'waiting_authorization':'waiting_user',food:next});}
   finally{lock.current=false;if(alive.current)setBusy(false);}
  }
 },[catalog,stewardName,update]);
 useEffect(()=>{
  const input=props.injectedPrompt;if(!input||consumed.current===input.token||busy)return;
  if(ready&&catalog){consumed.current=input.token;void advise(input.text);}
  else if(error){consumed.current=input.token;void callbacks.current.onTurn?.(input.text,error,true,{goal:'日常点餐',stage:'failed',food:current.current});}
 },[props.injectedPrompt,ready,catalog,busy,error,advise]);
 async function persist(next:FoodDraft){if(lock.current)return;lock.current=true;setBusy(true);setError('');try{await callbacks.current.onDraftChange?.(next);if(alive.current){update(next);orderId.current='';}}catch(e){if(alive.current)setError(e instanceof Error?e.message:'方案未保存，请重试。');}finally{lock.current=false;if(alive.current)setBusy(false);}}
 async function checkout(){
  if(!catalog||!ready||lock.current)return;lock.current=true;setBusy(true);setError('');
  try{
   if(current.current.orderId){await foodOrderRequest('open',{taskId,orderId:current.current.orderId});return;}
   orderId.current||=`FOOD-${crypto.randomUUID()}`;
   const plan={...current.current,address:current.current.address||catalog.address,contact:current.current.contact||catalog.contact};
   const result=await foodOrderRequest('prepare',{taskId,orderId:orderId.current,draft:plan,quote:foodQuote(catalog,plan),authorized:true});if(!alive.current)return;
   const next={...plan,orderId:result.orderId};update(next);setReceipt({id:result.orderId!,taskId,status:'PENDING_PAYMENT',payable:foodQuote(catalog,plan).payable});await callbacks.current.onDraftChange?.(next);
  }catch(e){if(alive.current)setError(e instanceof Error?e.message:'订单结果待核对，请重试原订单。');}
  finally{lock.current=false;if(alive.current)setBusy(false);}
 }
 let quote;try{if(catalog&&draft.items.length)quote=foodQuote(catalog,draft);}catch{/* Changed menus require a new reviewed recommendation. */}
 const phase=error?'需要重新核对':busy?'正在处理':receipt?statusLabel[receipt.status]||'状态待核对':draft.orderId?'待核对订单':!ready?'正在读取菜单':quote?'待核对方案':'待补充选择';
 const tone=error?'warning':receipt?.status==='COMPLETED'?'success':receipt&&['CANCELLED','REFUNDED'].includes(receipt.status)?'neutral':'attention';
 return <section className="steward-food-scene" aria-label="外卖方案" aria-busy={busy}>
  <TaskCardHeader title={catalog?.storeName||'日常点餐'} icon={<ShoppingBag size={18}/>} status={phase} tone={tone} meta={draft.items.length?`${draft.items.length} 款商品 · ${draft.items.reduce((total,item)=>total+item.quantity,0)} 份`:undefined}/>
  {catalog&&(quote||receipt)&&<>
   {draft.items.map(item=>{const product=catalog.products.find(p=>p.id===item.productId);return product&&<div className="food-scene-product" key={item.productId}>
    {product.image&&<img src={product.image} alt="" loading="lazy"/>}
    <div><strong>{product.name}</strong><p>{product.description}</p><span>{money(product.price)} / 份</span></div>
    <div className="food-scene-quantity"><button aria-label={`减少${product.name}`} disabled={busy||!!draft.orderId||item.quantity<=1} onClick={()=>void persist({...draft,items:draft.items.map(i=>i.productId===item.productId?{...i,quantity:i.quantity-1}:i)})}><Minus size={14}/></button><span>{item.quantity}</span><button aria-label={`增加${product.name}`} disabled={busy||!!draft.orderId||item.quantity>=20} onClick={()=>void persist({...draft,items:draft.items.map(i=>i.productId===item.productId?{...i,quantity:i.quantity+1}:i)})}><Plus size={14}/></button></div>
   </div>;})}
   <p className="food-scene-address"><MapPin size={16}/><span>{draft.address||catalog.address}<small>{draft.contact||catalog.contact}</small></span></p>
   {draft.note&&<p className="food-scene-note">给商家的备注：{draft.note}</p>}
   <div className="food-scene-total"><div><small>{receipt?'订单金额':'预计实付'}</small><strong>{money(receipt?.payable??quote!.payable)}</strong></div>{quote&&<span>商品 {money(quote.itemTotal)}<br/>配送 {money(quote.deliveryFee)} · 优惠 −{money(quote.discount)}</span>}</div>
   <Button disabled={busy||!ready||!quote&&!receipt} onClick={()=>void checkout()}>{busy?'正在核对…':receipt?.status==='PENDING_PAYMENT'?'继续付款':receipt||draft.orderId?'查看订单':'核对后去支付'}<ArrowUpRight size={16}/></Button>
   <p className="food-scene-footnote">{receipt||draft.orderId?'订单状态以外卖 App 为准。':'下一步进入外卖 App 选择微信或支付宝支付；现在不会扣款。'}</p>
  </>}
  {!!choices.length&&!draft.orderId&&<div className="food-scene-choices">{choices.map(choice=><Button key={choice} variant="secondary" disabled={busy} onClick={()=>callbacks.current.onPrompt?.(choice)}>{choice}</Button>)}</div>}
  {error&&<div className="food-scene-error" role="alert"><p>{error}</p>{!ready&&<Button variant="secondary" onClick={()=>void refresh()}>重新读取菜单</Button>}</div>}
 </section>;
}
