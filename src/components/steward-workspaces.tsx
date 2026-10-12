import { useCallback, useEffect, useRef, useState, type ComponentProps } from "react";
import { StewardChatHome } from "./steward-chat-home";
import { emptyWorkspaces, type WorkspaceOperation } from "../lib/workspaces";
import { workspaceRequest, routeWorkspacePrompt } from "../lib/workspace-service";
import "./steward-workspaces.css";
import {advanceTaskProgress,clearBillIntent,readTaskProgress,taskContinuation,type TaskProgress} from '../lib/task-progress';
import type {StewardChatMessage} from '../lib/steward-chat';
import {WECHAT_SHARE_PREFIX} from '../lib/wechat-message-share';

type Props = ComponentProps<typeof StewardChatHome> & { route?: typeof routeWorkspacePrompt };
type Queued = { id: string; text: string; token: string };

/** One frontstage conversation. Task ownership, routing and serial processing stay backstage.
 * A queued instruction is not payment authorization; persisted pending work is never replayed on mount. */
export function StewardWorkspaces({ route = routeWorkspacePrompt, ...props }: Props) {
  const [state, setState] = useState(emptyWorkspaces);
  const [active, setActive] = useState(() => localStorage.getItem("zhiyin-workspace-active") || "");
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [conversationNotice, setConversationNotice] = useState<{id:string;text:string}>();
  const [injected, setInjected] = useState<Queued>();
  const queue = useRef<Queued[]>([]);
  const executing = useRef<Queued>();
  const lock = useRef(false);
  const saveTail = useRef<Promise<unknown>>(Promise.resolve());
  const clarify = useRef("");
  const receiptOwner = useRef(localStorage.getItem("zhiyin-transfer-workspace") || "");
  const work = state.items.find(w => w.id === active && w.status === "active");
  const load = useCallback(async () => {
    try { setState(await workspaceRequest()); setLoaded(true); setError(""); }
    catch(e) { setError(e instanceof Error ? e.message : "之前的交代暂时无法载入，请重试。"); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  function say(text:string) { setConversationNotice({id:crypto.randomUUID(),text}); }
  function save(operation: WorkspaceOperation | ((latest:ReturnType<typeof emptyWorkspaces>)=>WorkspaceOperation)) {
    // A group-selection callback may finish while another task's reply is being saved.
    const operationResult=saveTail.current.then(async()=>{
      const latest=await workspaceRequest();
      const next=await workspaceRequest(typeof operation==='function'?operation(latest):operation,latest.revision);
      setState(next);return next;
    });
    saveTail.current=operationResult.catch(()=>undefined);
    return operationResult;
  }
  function dispatch(item:Queued) {
    executing.current = item;
    setActive(item.id);
    localStorage.setItem("zhiyin-workspace-active", item.id);
    setInjected(item);
  }
  async function arrange(text:string,recent:StewardChatMessage[]=[],knownBillTaskId?:string) {
    if(lock.current || !loaded) throw new Error("正在处理上一条交代，请稍等。");
    lock.current=true; setBusy(true); setError("");
    try {
      const latest = await workspaceRequest(); setState(latest);
      const source = clarify.current ? `${clarify.current}；补充：${text}` : text;
      if(clarify.current && /^(取消|不用了|算了)[。！! ]*$/.test(text)) {
        clarify.current=""; say("好，刚才的请求没有执行。"); return;
      }
      const revision=props.memory?.current.current.revision??0;
      const routingTasks=latest.items.map(task=>({...task,progress:task.memoryRevision===revision?task.progress:undefined,memoryRevision:revision,messages:task.messages.filter(message=>message.memoryRevision===revision)}));
      const known=knownBillTaskId?routingTasks.find(task=>task.id===knownBillTaskId&&task.status==='active'&&(task.kind==='bills'||task.kind==='general'&&readTaskProgress(task).bill)):undefined;
      if(knownBillTaskId&&!known)throw new Error('这份账单任务已变化，请重新交代需要查看的范围');
      // A control on an existing bill scene already identifies the task. Never reclassify it.
      const result = known?{parts:[{taskId:known.id,kind:known.kind,title:known.title,text}]}:(!clarify.current&&!text.startsWith(WECHAT_SHARE_PREFIX)?taskContinuation(text,routingTasks,work?.id||''):null)||await route(source,routingTasks,work?.id || "","",recent);
      if(result.clarification) { clarify.current=source; say(result.clarification); return; }
      if(!result.parts.length) throw new Error("还没理解清楚你的意思，可以再说具体一点吗？");
      clarify.current="";
      const items:Queued[]=[];
      for(const part of result.parts) {
        const id=part.taskId || crypto.randomUUID();
        const original=routingTasks.find(task=>task.id===id);
        const kind=part.kind==='general'&&clearBillIntent(part.text)?'bills':part.kind;
        let saved=latest;
        if(!part.taskId)saved=await save({type:"create",id,title:part.title,kind});
        const task=original||saved.items.find(task=>task.id===id)!;
        const progress=advanceTaskProgress(part.kind==='food'?{...task,kind:'food'}:task,part.text);
        const repair=(task.kind==='general'&&progress.food)?{kind:'food' as const}:(task.kind==='general'&&progress.bill)?{kind:'bills' as const}:{};
        await save({type:'progress',id,progress,memoryRevision:revision,...repair});
        // Repeating an interrupted instruction resumes its token instead of adding duplicate pending work.
        const token=latest.items.find(w=>w.id===id)?.pending?.find(p=>p.text===part.text)?.token || crypto.randomUUID();
        await save({type:"enqueue",id,token,text:part.text});
        items.push({id,text:part.text,token});
      }
      queue.current=items.slice(1); dispatch(items[0]);
    } catch(e) {
      queue.current=[];
      setError(`${e instanceof Error?e.message:"暂时没理解清楚"}。这次尚未执行，请重试。`);
      throw e;
    } finally {
      if(!executing.current) {lock.current=false;setBusy(false);}
    }
  }
  async function completed(user:string,assistant:string,revision:number,failed:boolean,progress?:TaskProgress) {
    const owner=executing.current;
    if(!owner)return;
    try {
      await save({type:"turn",id:owner.id,user,assistant,memoryRevision:revision,...(progress?{progress}:{}),...(!failed?{token:owner.token}:{})});
      executing.current=undefined; setInjected(undefined);
      if(failed) {
        if(queue.current.length) say("这一项没能完成，后面的交代暂未处理。需要时直接告诉我继续哪件事。");
        queue.current=[];
      } else {
        const next=queue.current.shift();
        if(next) {dispatch(next);return;}
      }
    } catch(e) {
      queue.current=[]; executing.current=undefined;setInjected(undefined);
      setError(`${e instanceof Error?e.message:"对话未能保存"}。当前答复还在，请勿重复提交资金操作。`);
    }
    lock.current=false;setBusy(false);
  }
  return <div className="steward-workspaces">
    {error&&<div className="workspace-feedback" role="alert">{error}{!loaded&&<button onClick={()=>void load()}>重新载入</button>}</div>}
    <StewardChatHome {...props}
      seamless
      contextWorkspaces={state.items}
      onBackgroundBook={async(id,expenseBookId)=>{await save({type:'link',id,expenseBookId});}}
      onBackgroundProgress={async(id,progress,memoryRevision)=>{await save(latest=>{const task=latest.items.find(t=>t.id===id&&t.status==='active');if(!task||task.memoryRevision!==memoryRevision||(props.memory?.current.current.revision??0)!==memoryRevision)throw new Error('任务上下文已变化，请重新交代');return {type:'progress',id,progress,memoryRevision};});}}
      onBackgroundTurn={async(id,user,assistant,memoryRevision)=>{await save({type:'turn',id,user,assistant,memoryRevision});}}
      conversationNotice={conversationNotice}
      bankReceipt={props.bankReceipt}
      onPrepareTransfer={props.onPrepareTransfer ? (intent,workspaceId)=>{
        receiptOwner.current=workspaceId || work?.id || "";
        localStorage.setItem("zhiyin-transfer-workspace",receiptOwner.current);
        props.onPrepareTransfer?.(intent);
      }:undefined}
      workspace={work || null}
      onBillViewChange={async(id,view)=>{
        await save(latest=>{
          const task=latest.items.find(t=>t.id===id&&t.status==='active');
          const revision=props.memory?.current.current.revision??0;
          if(!task||task.memoryRevision!==revision)throw new Error('这份账单任务已变化，请重新交代查看范围。');
          const progress=readTaskProgress(task);
          if(!progress.bill)throw new Error('原账单任务不可用，请重新交代查看范围。');
          return {type:'progress',id,memoryRevision:revision,progress:{...progress,bill:{...progress.bill,provider:view.provider||'all'}}};
        });
      }}
      onRoutePrompt={arrange}
      externalBusy={busy || !loaded}
      injectedPrompt={injected}
      onTurnComplete={completed}
      onWorkspaceBook={async expenseBookId=>{if(work)await save({type:"link",id:work.id,expenseBookId});}}
    />
  </div>;
}
