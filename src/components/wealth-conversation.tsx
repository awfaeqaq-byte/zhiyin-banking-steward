import {createContext,useCallback,useContext,useEffect,useId,useRef,useState,type ReactNode} from 'react';
import {ArrowUp,ChevronDown,ChevronRight,MessageCircle} from 'lucide-react';
import {findWealthCatalogProduct} from '../lib/wealth-catalog';
import {cleanWealthPlan,extractWealthPlan,requestWealthConversation,type WealthCandidate,type WealthConversationMessage,type WealthPlan} from '../lib/wealth-conversation';
import type {StewardModelCall} from '../lib/steward-chat';
import type {WealthSnapshot} from '../lib/wealth-operation';
import './wealth-conversation.css';

type Message=WealthConversationMessage & {id:number;candidates?:WealthCandidate[];assessmentAt?:number;planKey?:string};
type SendOptions={snapshot?:WealthSnapshot|null;stewardName?:string;model?:StewardModelCall};
type Session={plan:WealthPlan;setPlan:(patch:WealthPlan)=>void;messages:Message[];draft:string;setDraft:(value:string)=>void;expanded:boolean;setExpanded:(value:boolean)=>void;busy:boolean;error:string;send:(options:SendOptions,retry?:boolean)=>Promise<void>};
const Context=createContext<Session|null>(null);
const planKey=(plan:WealthPlan)=>JSON.stringify({amountYuan:plan.amountYuan,termMonths:plan.termMonths});

function OwnedProvider({children,initialPlan}:{children:ReactNode;initialPlan?:WealthPlan}){
 const [plan,updatePlan]=useState<WealthPlan>(()=>cleanWealthPlan(initialPlan||{}));
 const [messages,setMessages]=useState<Message[]>([]);
 const [draft,setDraft]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [expanded,setExpanded]=useState(false);
 const planRef=useRef(plan),messagesRef=useRef<Message[]>([]),busyRef=useRef(false),failedRef=useRef<WealthConversationMessage[]|null>(null),sequence=useRef(0),alive=useRef(true);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 const setPlan=useCallback((patch:WealthPlan)=>{const next=cleanWealthPlan({...planRef.current,...patch});planRef.current=next;updatePlan(next);},[]);
 const send=async(options:SendOptions,retry=false)=>{
  if(busyRef.current)return;
  const content=draft.trim();
  if(!retry&&!content||retry&&!failedRef.current)return;
  busyRef.current=true;setBusy(true);setError('');
  let input:WealthConversationMessage[];
  if(retry){input=failedRef.current!;}else{
   const next:Message[]=[...messagesRef.current,{id:++sequence.current,role:'user',content}];
   messagesRef.current=next;setMessages(next);setDraft('');input=next.map(({role,content:body})=>({role,content:body}));
   setPlan(extractWealthPlan(content,messagesRef.current.filter(m=>m.role==='assistant').at(-1)?.content||''));
  }
  failedRef.current=input;
  try{
   const result=await requestWealthConversation({...options,messages:input,plan:planRef.current});
   if(!alive.current)return;
   // A separate editor may have changed the plan while this reply was in flight. Never restore stale quantities.
   const next:Message[]=[...messagesRef.current,{id:++sequence.current,role:'assistant',content:result.text,candidates:result.candidates,assessmentAt:result.assessmentAt,planKey:planKey(result.plan)}];
   messagesRef.current=next;setMessages(next);failedRef.current=null;
  }catch(reason){if(alive.current)setError(reason instanceof Error?reason.message:'暂时没有收到答复，请重试这条消息。');}
  finally{busyRef.current=false;if(alive.current)setBusy(false);}
 };
 return <Context.Provider value={{plan,setPlan,messages,draft,setDraft,expanded,setExpanded,busy,error,send}}>{children}</Context.Provider>;
}

/** A nested wrapper reuses the App session, while standalone views get their own safe session. */
export function WealthConversationProvider({children,initialPlan}:{children:ReactNode;initialPlan?:WealthPlan}){
 const parent=useContext(Context);
 return parent?<>{children}</>:<OwnedProvider initialPlan={initialPlan}>{children}</OwnedProvider>;
}
export function useWealthConversation(){
 const session=useContext(Context);
 if(!session)throw new Error('WealthConversation requires WealthConversationProvider');
 return session;
}
export type WealthConversationProps={stewardName?:string;snapshot?:WealthSnapshot|null;onOpenRisk:()=>void;onViewProduct?:(id:string)=>void;focusProductId?:string;onFocusHandled?:()=>void;model?:StewardModelCall;compact?:boolean};
export function WealthConversation(props:WealthConversationProps){return <WealthConversationProvider><ConversationContent {...props}/></WealthConversationProvider>;}
function ConversationContent({stewardName='宁宁',snapshot,onOpenRisk,onViewProduct,focusProductId,onFocusHandled,model,compact=false}:WealthConversationProps){
 const {plan,messages,draft,setDraft,expanded,setExpanded,busy,error,send}=useWealthConversation();
 const container=useRef<HTMLElement>(null),history=useRef<HTMLDivElement>(null),input=useRef<HTMLTextAreaElement>(null),handled=useRef<string>();
 const contentId=useId(),open=!compact||expanded;
 useEffect(()=>{if(history.current)history.current.scrollTop=history.current.scrollHeight;},[messages,busy,error,open]);
 useEffect(()=>{if(compact&&open)input.current?.focus({preventScroll:true});},[compact,open]);
 const assessment=snapshot?.assessment,valid=!!assessment&&assessment.expiresAt>Date.now();
 useEffect(()=>{
  if(!focusProductId){handled.current=undefined;return;}
  if(handled.current===focusProductId)return;
  const product=findWealthCatalogProduct(focusProductId);
  if(product){setDraft(`${draft.trim()?`${draft}\n`:''}请帮我分析${product.name}`);setExpanded(true);container.current?.scrollIntoView?.({block:'nearest',behavior:'smooth'});}
  handled.current=focusProductId;onFocusHandled?.();
 },[focusProductId,onFocusHandled,setDraft,setExpanded,draft]);
 const submit=()=>void send({snapshot,stewardName,model});
 return <section className={`wealth-conversation${compact?' is-compact':''}`} aria-label={`和${stewardName}聊财富计划`} ref={container}>
  {compact?<button className="wealth-conversation-toggle" type="button" aria-label={`${open?'收起':'展开'}和${stewardName}的财富对话`} aria-expanded={open} aria-controls={contentId} onClick={()=>setExpanded(!open)}><MessageCircle size={18} aria-hidden="true"/><span><strong>和{stewardName}聊聊</strong><small>{busy?'正在整理建议…':error?'答复未完成，点击重试':draft.trim()?'草稿已保留':messages.length?'继续聊你的计划':'说说投入计划或关注方向'}</small></span><ChevronDown size={18} aria-hidden="true"/></button>:<header><MessageCircle size={18} aria-hidden="true"/><h3>和{stewardName}聊聊</h3><span>说说你的打算</span></header>}
  <div id={contentId} className="wealth-conversation-content" hidden={!open}>
  {(plan.amountYuan!==undefined||plan.termMonths!==undefined)&&<p className="wealth-conversation-plan" aria-label="当前投入计划">计划投入 <strong>{plan.amountYuan!==undefined?`${plan.amountYuan.toLocaleString('zh-CN')} 元`:'待确定'}</strong><span> · </span>持有 <strong>{plan.termMonths!==undefined?`${plan.termMonths} 个月`:'待确定'}</strong></p>}
  <div className="wealth-conversation-history" ref={history} role="log" aria-label="财富计划对话" aria-live="polite">
   {messages.length===0?<p className="wealth-conversation-intro">准备投入多少、多久会用到？也可以告诉我你关注的方向。</p>:messages.slice(-6).map(message=><div className={`wealth-conversation-message ${message.role}`} key={message.id}>
    <p><span>{message.role==='user'?'我':stewardName}</span>{message.content}</p>
    {message.role==='assistant'&&message.planKey!==planKey(plan)&&<small className="wealth-conversation-stale">计划已更新，可重新分析</small>}
    {message.role==='assistant'&&message.planKey===planKey(plan)&&valid&&message.assessmentAt===assessment.assessedAt&&message.candidates?.map(candidate=>{const product=findWealthCatalogProduct(candidate.id);if(!product)return null;return <div className="wealth-conversation-candidate" key={candidate.id}>
     <strong>{product.name}</strong><p>{candidate.reason}</p>{candidate.status==='needs_verification'&&<small>风险、费用与交易状态待核验</small>}
     {onViewProduct&&<button type="button" onClick={()=>onViewProduct(candidate.id)}>查看产品<ChevronRight size={15}/></button>}
    </div>;})}
   </div>)}
  </div>
  {!valid&&!compact&&<button className="wealth-conversation-risk" type="button" onClick={onOpenRisk}>完成风险测评，再比较产品<ChevronRight size={15}/></button>}
  {messages.length===0&&<details className="wealth-conversation-examples"><summary>看看提问示例</summary><div aria-label="可以这样说">{['投入1万元，持有一年','我想先了解医疗主题'].map(example=><button type="button" key={example} onClick={()=>{setDraft(example);input.current?.focus();}}>{example}</button>)}</div></details>}
  <form className="wealth-conversation-composer" onSubmit={event=>{event.preventDefault();submit();}}>
   <textarea ref={input} rows={2} aria-label={`和${stewardName}聊财富计划`} placeholder="说说投入计划，或问一只产品…" value={draft} maxLength={1500} onChange={event=>setDraft(event.target.value)} onKeyDown={event=>{if(event.key==='Enter'&&!event.shiftKey&&!event.nativeEvent.isComposing){event.preventDefault();submit();}}}/>
   <button type="submit" disabled={busy||!draft.trim()} aria-label={`发送给${stewardName}`}><ArrowUp size={19}/></button>
  </form>
  {busy&&<p className="wealth-conversation-status" role="status">{stewardName}正在结合产品资料整理…</p>}
  {error&&<div className="wealth-conversation-error" role="alert"><p>{error}</p><button type="button" disabled={busy} onClick={()=>void send({snapshot,stewardName,model},true)}>重试这条消息</button></div>}
  </div>
 </section>;
}
