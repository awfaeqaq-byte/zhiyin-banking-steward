import {isGroupAAAuthorizationRequired,groupAAAuthorizationMessage,groupAAAuthorizedEvent} from '../lib/group-aa-authorization';
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { BookOpen, ChevronDown, Plus, ArrowUpRight } from "lucide-react";
import {
  calculateGroupAA,
  groupAARequest,
  type AAGroup,
} from "../lib/group-aa";
import {
  emptyExpenseState,
  entryAllocations,
  isDefaultExpenseSplit,
  expenseSplitSummary,
  settlementPlan,
  type ExpenseOperation,
  type ExpenseState,
  type ExpenseBook,
  type ExpenseBatch,
  type ExpenseEntry,
} from "../lib/expense-notebook";
import {
  expenseRequest,
  requestExpenseReply,
  type ExpenseReply,
  isExpenseReviewPrompt,
} from "../lib/expense-service";
import "./expense-notebook.css";
import {collectionProgress,expenseActivityClosed,expenseProgressText} from '../lib/expense-follow-up';
import {remindExpenseTomorrow,finishExpenseReminder} from '../lib/expense-reminder';
import {sceneExpenseRequest,sceneExpenseCandidates,sourceExpenseNet,sourceExpenseIssue,sourceExpenseAdjustment,type SceneExpenseSource} from '../lib/scene-expenses';
import type {SceneContext} from '../lib/scene-context';
import {TaskCardHeader} from './task-card-header';
import {expenseBreakdownSummary} from '../lib/expense-breakdown';
export type ExpenseNotebookHandle = {
  handle: (prompt: string) => Promise<string | null>;
  restoreAuthorization: () => Promise<void>;
};
const money = (c: number) => `¥${(c / 100).toFixed(2)}`;
const startPattern =
  /随手记|零散消费|记个账|帮我记|开始记|新活动|我先[付垫]|最后一起算|先垫付/;
export const ExpenseNotebook = forwardRef<
  ExpenseNotebookHandle,
  { authorizationRequired?:boolean; onPrompt: (text: string) => void; activityKey?:string; sourceWorkspaceId?:string; sceneContext?:SceneContext; onReconcileSources?:()=>Promise<void>; activityTitle?:string; conversation?:boolean; onRecorded?:(prompt:string,text:string)=>Promise<void>; onNeedsInput?:(needs:boolean)=>void; initialBookId?:string; onBookSelected?:(id:string)=>Promise<void>; getMemoryContext?:(prompt:string)=>Promise<string>; stewardName?:string; initialHistory?:{role:'user'|'assistant';content:string}[] }
>(function ExpenseNotebook({ authorizationRequired=false, onPrompt,activityKey,sourceWorkspaceId,sceneContext,onReconcileSources,activityTitle,conversation=false,onRecorded,onNeedsInput,initialBookId,onBookSelected,getMemoryContext,stewardName='宁宁',initialHistory=[] }, ref) {
  const activeKey=activityKey?`zhiyin-expense-active-${activityKey}`:'zhiyin-expense-active';
  const memoryEpoch=useRef(0);
  useEffect(()=>{const reset=()=>{memoryEpoch.current++;history.current=[];};window.addEventListener('zhiyin-memory-context-reset',reset);return()=>window.removeEventListener('zhiyin-memory-context-reset',reset);},[]);
  const [needsAuthorization,setNeedsAuthorization]=useState(authorizationRequired);
  const authorizationBlocked=useRef(authorizationRequired);
  function markAuthorizationRequired(required:boolean){authorizationBlocked.current=required;setNeedsAuthorization(required);}
  useEffect(()=>{markAuthorizationRequired(authorizationRequired);},[authorizationRequired]);
  const [state, setState] = useState<ExpenseState>(emptyExpenseState);
  const current = useRef(state),
    busyRef = useRef(false);
  const [active, setActive] = useState(
    () => initialBookId || localStorage.getItem(activeKey) || "",
  );
  const [setup, setSetup] = useState(false),
    [pending, setPending] = useState(""),
    [group, setGroup] = useState<AAGroup | null>(null),
    [people, setPeople] = useState<string[]>([]),
    [title, setTitle] = useState(activityTitle || "今晚聚餐");
  const [expanded, setExpanded] = useState(false),
    [review, setReview] = useState(false),
    [selected, setSelected] = useState<string[]>([]),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState("");
  const [sources,setSources]=useState<SceneExpenseSource[]>([]),[sourceError,setSourceError]=useState('');
  const sourceTask=sourceWorkspaceId||activityKey;
  const history = useRef<{ role: "user" | "assistant"; content: string }[]>(initialHistory.slice(-6));
  const book = state.books.find((b) => b.id === active);
  useEffect(()=>{onNeedsInput?.(setup);},[setup,onNeedsInput]);
  function accept(s: ExpenseState) {
    if(s.revision<current.current.revision)return current.current;
    current.current = s;
    setState(s);
    return s;
  }
  async function activate(id: string) {
    if(id&&onBookSelected)await onBookSelected(id);
    if(id!==active)markAuthorizationRequired(false);
    setActive(id);
    localStorage.setItem(activeKey, id);
    history.current = [];
    setReview(false);
    setExpanded(false);
  }
  async function load() {
    return accept(await expenseRequest());
  }
  async function loadSources(){
    if(!sourceTask)return;
    const result=await sceneExpenseRequest(sourceTask);accept(result.state);setSources(result.sources);setSourceError('');return result;
  }
  async function verifySourceEntries(entries:ExpenseEntry[]){
    const sourced=entries.filter(entry=>entry.source);if(!sourced.length)return;
    await onReconcileSources?.();
    const latest=await loadSources();
    for(const entry of sourced){
      const original=entry.source!;
      const verified=latest?.sources.find(source=>source.id===original.id&&source.paymentId===original.paymentId&&source.orderId===original.orderId&&source.workspaceId===original.workspaceId&&source.kind===original.kind);
      if(!verified)throw new Error('原订单来源暂不可核对，请恢复原事项后重新核对；原记录已保留，尚未发起收款');
      if(verified.paidAmount!==original.paidAmount||verified.refundedAmount!==original.refundedAmount||verified.merchant!==original.merchant||verified.paidAt!==original.paidAt||sourceExpenseNet(verified)!==entry.amount)throw new Error('原订单实付或退款已变化，请按最新回执重新核对分摊');
    }
  }
  const sourceRefresh=useRef<()=>void>(()=>{});
  sourceRefresh.current=()=>{if(sourceTask&&!busyRef.current)void loadSources().catch(e=>{if(sources.length||book?.entries.some(entry=>entry.source))setSourceError(e instanceof Error?e.message:'订单实付暂未核对');});};
  useEffect(()=>{
    let live=true;
    if(sourceTask)void sceneExpenseRequest(sourceTask).then(result=>{if(live){accept(result.state);setSources(result.sources);setSourceError('');}}).catch(()=>{});
    const refresh=()=>sourceRefresh.current();
    window.addEventListener('zhiyin-phone-foreground',refresh);window.addEventListener('zhiyin-bank-updated',refresh);window.addEventListener('zhiyin-expenses-updated',refresh);
    return()=>{live=false;window.removeEventListener('zhiyin-phone-foreground',refresh);window.removeEventListener('zhiyin-bank-updated',refresh);window.removeEventListener('zhiyin-expenses-updated',refresh);};
  },[sourceTask]);
  async function importSources(){
    if(!book||!sourceTask)return;
    await run(async()=>{
      const references=sceneExpenseCandidates(current.current,sources).map(({id,paidAmount,refundedAmount})=>({id,paidAmount,refundedAmount}));
      await onReconcileSources?.();
      const latest=await loadSources();
      const available=latest?sceneExpenseCandidates(latest.state,latest.sources):[];
      if(!latest||references.some(reference=>!available.some(source=>source.id===reference.id&&source.paidAmount===reference.paidAmount&&source.refundedAmount===reference.refundedAmount)))throw new Error('订单实付或退款已变化，请按最新金额重新确认');
      const result=await sceneExpenseRequest(sourceTask,{bookId:book.id,references,revision:current.current.revision});
      accept(result.state);setSources(result.sources);setSourceError('');setExpanded(true);setReview(false);
      setNotice('实付已记入，按本次参与人平分。可以直接告诉我谁不参与或怎样分；尚未发起收款。');
    });
  }
  async function save(op: ExpenseOperation) {
    return accept(await expenseRequest(op, current.current.revision));
  }
  async function refreshProgress(b:ExpenseBook,reauthorized=false) {
    if(authorizationBlocked.current&&!reauthorized)throw new Error(groupAAAuthorizationMessage);
    let result:Awaited<ReturnType<typeof groupAARequest>>;
    try{result=await groupAARequest('records',{groupId:b.group.id});}
    catch(cause){if(isGroupAAAuthorizationRequired(cause)){markAuthorizationRequired(true);throw new Error(groupAAAuthorizationMessage);}throw cause;}
    /* authorization was verified by the platform; existing receipt validation still applies */
    if(!Array.isArray(result.collections))throw new Error('未取得微信收款记录，请稍后重试');
    await load();
    let latest=current.current.books.find(x=>x.id===b.id)!;
    const observed=result.collections.filter(c=>latest.batches.some(batch=>batch.id===c.id));
    observed.forEach(c=>collectionProgress(latest,latest.batches.find(batch=>batch.id===c.id)!,c));
    for(const collection of observed){const batch=latest.batches.find(x=>x.id===collection.id)!;if(batch.status==='prepared')latest=(await save({type:'published',bookId:b.id,batchId:batch.id,collectionId:collection.id})).books.find(x=>x.id===b.id)!;}
    const previous=latest.batches.flatMap(batch=>batch.receipt?[batch.receipt]:[]);
    const collections=[...previous.filter(p=>!observed.some(c=>c.id===p.id)),...observed];
    const next=JSON.stringify(previous)===JSON.stringify(collections)?latest:
      (await save({type:'sync-collections',bookId:b.id,collections})).books.find(x=>x.id===b.id)!;
    try {
      await finishExpenseReminder(next);
      if(expenseActivityClosed(next))setNotice('已收齐，活动已结清归档；相关收款提醒已结束。');
    }
    catch { setNotice('收款进度已更新，但日历提醒未能自动结束，请到日历核对。'); }
    return next;
  }
  const refreshRef=useRef<()=>void>(()=>{});
  refreshRef.current=()=>{
    if(!book?.batches.length||busyRef.current||authorizationBlocked.current)return;
    void run(async()=>{await refreshProgress(book);});
  };
  useEffect(()=>{
    const refresh=()=>refreshRef.current();
    const timer=setInterval(refresh,30000);
    window.addEventListener('zhiyin-phone-foreground',refresh);
    window.addEventListener('zhiyin-expenses-updated',refresh);
    return ()=>{clearInterval(timer);window.removeEventListener('zhiyin-phone-foreground',refresh);window.removeEventListener('zhiyin-expenses-updated',refresh);};
  },[]);
  async function restoreGroupAuthorization() {
    if(!book)return;
    await run(async()=>{
      const response=await groupAARequest('choose',{groupId:book.group.id});
      if(!response.group||response.group.id!==book.group.id)throw new Error('请选择此活动原群，原账本和收款回执没有更改。');
      markAuthorizationRequired(false);setError('');
      try{await refreshProgress(book,true);setNotice('原群授权已恢复，已核对原账本的收款进度；没有重新发起收款。');}
      finally{window.dispatchEvent(new CustomEvent(groupAAAuthorizedEvent,{detail:{bookId:book.id}}));}
    });
  }
  async function run(fn: () => Promise<void>) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      if(isGroupAAAuthorizationRequired(e)){markAuthorizationRequired(true);setError("");}
      else setError(e instanceof Error ? e.message : "记录未完成，请重试");
      await load().catch(() => {});
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  useEffect(() => {
    let live = true;
    void expenseRequest()
      .then((s) => {
        if (live) {
          current.current = s;
          setState(s);
        }
      })
      .catch(() => {
        /* Report on explicit use, not an unsolicited home alert. */
      });
    return () => {
      live = false;
    };
  }, []);
  async function interpret(b: ExpenseBook, prompt: string) {
    const remembered=getMemoryContext?await getMemoryContext(prompt):'';
    const epoch=memoryEpoch.current;
    // Opening the review is not a financial execution and must not depend on
    // whether the model mistakes the existing collection bridge for a payment.
    const result: ExpenseReply = isExpenseReviewPrompt(prompt)
      ? { action: "review" as const }
      : await requestExpenseReply(b, prompt, history.current,{memoryContext:remembered,stewardName,sceneContext});
    if(epoch!==memoryEpoch.current)throw new Error('记忆已更新，本轮未保存，请重新交代。');
    if (
      /群收款|一起算|结算/.test(prompt) &&
      /\d|[一二两三四五六七八九十百千万]+[元块]/.test(prompt) &&
      !["add", "edit"].includes(result.action)
    )
      return "这句话同时提到了消费和结算，这笔还没有记入。请先单独告诉我消费金额和分摊方式，记好后再一起结算。";
    if (result.action === "unrelated") return null;
    let text = result.message || "请补充这笔消费的信息。";
    if (result.action === "review") {
      setExpanded(true);
      setReview(true);
      const today = new Date().toLocaleDateString("zh-CN");
      setSelected(
        b.entries
          .filter(
            (e) =>
              !e.batchId && !(e.source&&sourceExpenseNet(e.source)===0) &&
              (!/今天|今晚/.test(prompt) ||
                new Date(e.at).toLocaleDateString("zh-CN") === today),
          )
          .map((e) => e.id),
      );
      text =
        "明细已展开。勾选这次要结算的消费，核对每个人的金额后，再去微信确认。";
    }
    if (result.action === "add" || result.action === "edit") {
      const entry = result.entry!;
      entryAllocations(b.group, entry);
      await save({
        type: result.action,
        bookId: b.id,
        entryId:
          result.action === "edit" ? result.entryId! : crypto.randomUUID(),
        entry,
      });
      const allocations = entryAllocations(b.group, entry).filter(
        (m) => m.amount > 0,
      );
      text = expenseBreakdownSummary(b,prompt,entry) || `${result.action === "edit" ? "已更正" : "记下了"}：${entry.title} ${money(entry.amount)}。${isDefaultExpenseSplit(b, entry) ? "按这次参与人平分" : allocations.length <= 4 ? allocations.map((m) => `${m.self ? "你" : m.name} ${money(m.amount)}`).join("，") : `共 ${allocations.length} 人分摊，可展开明细核对`}。`;
      setReview(false);
      setExpanded(false);
      setNotice("");
      if (
        /群收款|一起算|结算/.test(prompt) &&
        !/不要|不用|别|取消/.test(prompt)
      ) {
        const updated = current.current.books.find((x) => x.id === b.id)!;
        setSelected(updated.entries.filter((e) => !e.batchId&&!(e.source&&sourceExpenseNet(e.source)===0)).map((e) => e.id));
        setReview(true);
        setExpanded(true);
        text += " 已展开结算，去微信前请核对。";
      }
    }
    if (result.action === "delete") {
      const target = b.entries.find((e) => e.id === result.entryId);
      if (!target) throw new Error("没有找到这笔记录，请在明细中选择");
      setExpanded(true);
      setRemoving(target.id);
      text = `要删除「${target.title} ${money(target.amount)}」吗？请在明细里确认。`;
    }
    history.current = [
      ...history.current,
      { role: "user", content: prompt },
      { role: "assistant", content: text },
    ].slice(-6) as typeof history.current;
    return text;
  }
  useImperativeHandle(ref, () => ({
    restoreAuthorization:restoreGroupAuthorization,
    async handle(prompt) {
      if (busyRef.current) throw new Error("上一笔记录正在处理，请稍后再说");
      // Routing may arrive before the initial fetch paints the linked activity.
      const book=active?(await load()).books.find(b=>b.id===active):undefined;
      if(active&&!book)throw new Error('没有找到此任务关联的活动，请重新选择账本。');
      if(prompt.trim()==='整理本次实付费用'){
        busyRef.current=true;setBusy(true);setError('');
        try{
          await onReconcileSources?.();
          const latest=await loadSources();
          if(!latest)return '当前事项尚未关联原订单，不能推断实付金额。';
          const candidates=sceneExpenseCandidates(latest.state,latest.sources);
          setExpanded(true);
          if(!book&&candidates.length){setPending(prompt);setSetup(true);return '已从本次原订单整理实付费用。先选择微信群和参与人，再确认记入；不用重新填写金额。';}
          if(candidates.length)return '已从本次原订单整理实付费用。请确认记入当前活动，再告诉我哪些费用由谁承担；尚未发起收款。';
          return book?.entries.some(entry=>entry.source)?'本次原订单实付已经记入，已展开原记录，可以核对分摊与退款差额。':'本次原订单暂时没有可确认的实付费用，原记录已保留。';
        }finally{busyRef.current=false;setBusy(false);}
      }
      if (
        (startPattern.test(prompt)||Boolean(activityKey&&!book)) &&
        (!book || /新活动|重新开始/.test(prompt))
      ) {
        setPending(prompt);
        setSetup(true);
        setExpanded(true);
        setError("");
        return "好，我帮你把零散消费记在一起。先选择微信群和这次参与人，默认由你垫付；单笔有例外直接告诉我。";
      }
      if (!book || setup) return null;
      const asksProgress=/收齐|谁.*(?:没付|未付|付了)|收款.*进度|还差谁|还差多少/.test(prompt);
      const asksReminder=/^(?:那就|那|帮我)?明天(?:上午9点)?提醒我(?:看看)?(?:收款|查收款|查看收款|看收款进度)?[。！! ]*$/.test(prompt);
      if(asksProgress||asksReminder){
        busyRef.current=true;setBusy(true);setError('');
        try {
          setExpanded(true);
          if(!book.batches.length)return expenseProgressText(book);
          if(authorizationBlocked.current)return `${groupAAAuthorizationMessage}请在此活动里点击“重新授权原群”，消费与原收款回执都在。`;
          const latest=await refreshProgress(book);
          return asksReminder?await remindExpenseTomorrow(latest):expenseProgressText(latest);
        } finally {busyRef.current=false;setBusy(false);}
      }
      if (/^(结束记录|暂停记账|停止记账)$/.test(prompt)) {
        await activate("");
        return conversation ? "好，先暂停记账，记录还在。以后直接告诉我要继续这次活动就行。" : "先收起了，记录还在。下次从“继续记录”打开即可。";
      }
      // Do not intercept ordinary banking requests just because an activity exists.
      if (
        !/\d|一半|半份|平分|均摊|分摊|[aA]{2}|收款|结算|记下|记录|刚才|上一笔|那笔|没吃|没喝|删除|算一下|请客|我请|我来付|我承担|算我的/.test(
          prompt,
        ) &&
        history.current.at(-1)?.role !== "assistant"
      )
        return null;
      busyRef.current = true;
      setBusy(true);
      setError("");
      try {
        const latest = await load();
        const b = latest.books.find((x) => x.id === active);
        if (!b) throw new Error("活动不存在，请重新选择");
        return await interpret(b, prompt);
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    },
  }));
  async function create() {
    await run(async () => {
      if (!group) throw new Error("请先选择微信群");
      const self = group.members.find((m) => m.self)!;
      await load();
      const id = crypto.randomUUID();
      await save({
        type: "create",
        bookId: id,
        title,
        group,
        participants: people,
        defaultPayerId: self.id,
      });
      await activate(id);
      setSetup(false);
      setExpanded(true);
      setNotice("已开始，直接在下面告诉我每笔消费。");
      // Keep the initiating request visible so its expense is never silently dropped.
      if (/\d/.test(pending)) {
        if(conversation) {
          const created=current.current.books.find(b=>b.id===id)!;
          // Selecting the participants completes the missing record data, not a payment authorization.
          const text=await interpret(created,pending);
          if(text) {setNotice('');await onRecorded?.(pending,text);}
        } else onPrompt(pending);
      }
    });
  }
  async function publish(batch: ExpenseBatch, b: ExpenseBook) {
    if(authorizationBlocked.current)throw new Error(groupAAAuthorizationMessage);
    await verifySourceEntries(b.entries.filter(entry=>batch.entryIds.includes(entry.id)));
    const currentBook=current.current.books.find(x=>x.id===b.id),currentBatch=currentBook?.batches.find(x=>x.id===batch.id);
    if(!currentBook||!currentBatch||currentBatch.sourceChanged)throw new Error('原订单退款或金额已变化，请先核对原微信群收款，再返回修改');
    const response = await groupAARequest("publish", {
      id: batch.id,
      groupId: b.group.id,
      revision: b.group.revision,
      plan: batch.plan,
    });
    if (!response.collection || response.collection.id !== batch.id)
      throw new Error("尚未收到微信回执，请核对结果，不要重新建一笔");
    await save({
      type: "published",
      bookId: b.id,
      batchId: batch.id,
      collectionId: response.collection.id,
    });
    setReview(false);
    setNotice("群收款已发起，等待成员付款；不是已经到账。");
  }
  async function submitSettlement() {
    if (!book) return;
    await run(async () => {
      if(authorizationBlocked.current)throw new Error(groupAAAuthorizationMessage);
      const reviewed=JSON.stringify(book.entries.filter(e=>selected.includes(e.id)).map(e=>({id:e.id,amount:e.amount,fixed:e.fixed,shares:e.shares,refund:e.source?.refundedAmount})));
      await load();
      await verifySourceEntries(book.entries.filter(entry=>selected.includes(entry.id)));
      const latest=current.current.books.find(b=>b.id===book.id);
      if(!latest||reviewed!==JSON.stringify(latest.entries.filter(e=>selected.includes(e.id)).map(e=>({id:e.id,amount:e.amount,fixed:e.fixed,shares:e.shares,refund:e.source?.refundedAmount}))))throw new Error('费用或退款已变化，请按最新金额重新核对分摊');
      const id = crypto.randomUUID();
      const next = await save({
        type: "prepare",
        bookId: book.id,
        batchId: id,
        entryIds: selected,
      });
      const b = next.books.find((x) => x.id === book.id)!;
      await publish(
        b.batches.find((x) => x.id === id)!,
        b,
      );
    });
  }
  async function reconcile(batch: ExpenseBatch, release = false) {
    if (!book) return;
    await run(async () => {
      const result = await groupAARequest("records", {
        groupId: book.group.id,
      });
      if (!Array.isArray(result.collections))
        throw new Error("未取得微信记录，暂不解锁");
      const found = result.collections.find((c) => c.id === batch.id);
      await load();
      if (found) {
        await save({
          type: "published",
          bookId: book.id,
          batchId: batch.id,
          collectionId: found.id,
        });
        setNotice("已核对，微信中已发起这笔群收款。");
      } else if (release) {
        await save({ type: "release", bookId: book.id, batchId: batch.id });
        setNotice("微信中尚未发布，已恢复修改。");
      } else setNotice("微信中尚未发布，可继续确认或返回修改。");
    });
  }
  let totals: ReturnType<typeof calculateGroupAA> | null = null,
    reviewError = "";
  if (book && review && selected.length) {
    try {
      totals = calculateGroupAA(book.group, settlementPlan(book, selected));
    } catch (e) {
      reviewError = e instanceof Error ? e.message : "无法结算";
    }
  }
  const outstanding = book?.entries.filter((e) => !e.batchId&&!(e.source&&sourceExpenseNet(e.source)===0)) ?? [];
  const candidates=sceneExpenseCandidates(state,sources);
  const splitSummary = book && review ? expenseSplitSummary(book, selected) : null;
  const closed=!!book&&expenseActivityClosed(book);
  const needsReconciliation=!!book?.batches.some(batch=>batch.sourceChanged);
  const phase=needsAuthorization?'待恢复群授权':error||sourceError?'需要重新核对':setup?'待确认参与人':needsReconciliation?'待核对差额':review?'待核对分摊':candidates.length?'待确认费用':closed?'已结清':book?.batches.some(batch=>batch.status==='prepared')?'待微信确认':outstanding.length?'待结算':book?.batches.length?'待核对收款':book?'记录中':'待确认费用';
  const activeWorkspace=!!book||setup||candidates.length>0;
  return (
    <section
      className={`expense-notebook${activeWorkspace?' expense-notebook-active':''}`}
      aria-label="随手记消费"
      aria-busy={busy}
    >
      <fieldset disabled={busy}>
        {activeWorkspace&&<TaskCardHeader title={book?.title||activityTitle||'AA消费记录'} icon={<BookOpen size={18}/>} status={phase} tone={needsAuthorization||error||sourceError||needsReconciliation?'warning':closed?'success':phase==='记录中'?'neutral':'attention'} meta={book?`${book.group.name} · ${book.participants.length} 人参与`:undefined}/>}
        {book&&needsAuthorization&&<section className="expense-source-warning expense-authorization" aria-label="原群授权待恢复"><strong>{book.group.name} · 待恢复授权</strong><p>{groupAAAuthorizationMessage}消费明细和上次回执都已保留。</p><button type="button" className="expense-primary" onClick={()=>void restoreGroupAuthorization()}>重新授权原群</button></section>}
        {candidates.length>0&&<section className="expense-source-review" aria-label="本次订单实付">
          <strong>这次已经付过的费用</strong>
          <p>从原订单带入实付，不用再填写金额。{book?'先按本次参与人平分，可继续调整。':'选择微信群和参与人后，再确认记入。'}</p>
          {candidates.map(source=><div className="expense-source-row" key={source.id}><span><strong>{source.title}</strong><small>{source.merchant}</small><small>原实付 {money(source.paidAmount)}{source.refundedAmount>0?` · 已退款 ${money(source.refundedAmount)}`:''}</small></span><span className="expense-source-amount"><small>本次记入</small><b>{money(sourceExpenseNet(source))}</b></span></div>)}
          {book?<button className={review?'':'expense-primary'} onClick={()=>void importSources()}>确认记入这 {candidates.length} 笔费用</button>:!setup&&<button className="expense-primary" onClick={()=>{setSetup(true);setExpanded(true);}}>选择这次参与人</button>}
        </section>}
        {sourceError&&<p className="expense-source-warning" role="alert">{sourceError}<button onClick={()=>void run(async()=>{await loadSources();})}>重新核对订单</button></p>}
        {!conversation && !book && !setup && (
          <div className="expense-launch">
            <button
              onClick={() => {
                setPending("");
                setSetup(true);
              }}
            >
              <Plus size={15} />
              随手记消费
            </button>
            {state.books.length > 0 && (
              <select
                aria-label="继续记录"
                value=""
                onChange={(e) => {const id=e.target.value;void run(()=>activate(id));}}
              >
                <option value="">继续记录…</option>
                {state.books.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.title}{expenseActivityClosed(b) ? ' · 已结清归档' : ''}
                  </option>
                ))}
              </select>
            )}
          </div>
        )}
        {book && !setup && (
          <>
            <button
              className="expense-heading"
              aria-label={`${book.title} · ${expanded?'收起账本':'展开账本'}`}
              aria-expanded={expanded}
              onClick={() => setExpanded(!expanded)}
            >
              <span>
                <strong>
                  {closed ? '已结清归档 · 明细保留' : outstanding.length
                    ? `${outstanding.length} 笔待结算 · ${money(outstanding.reduce((n, e) => n + e.amount, 0))}`
                    : book.batches.length ? '群收款跟进 · 展开查看' : "随时告诉我下一笔消费"}
                </strong>
                <small>{expanded?'收起账本':'查看消费与分摊依据'}</small>
              </span>
              <ChevronDown size={17} />
            </button>
            {outstanding.length > 0 && !review && (
              <button className={candidates.length?'':'expense-primary'} onClick={() => {
                setSelected(outstanding.map((e) => e.id));
                setReview(true);
                setExpanded(true);
              }}>核对并结算</button>
            )}
            {review&&!expanded&&<button className="expense-primary" onClick={()=>setExpanded(true)}>继续核对分摊</button>}
            {!expanded&&!review&&!outstanding.length&&book.batches.length>0&&!closed&&!needsAuthorization&&<button className="expense-primary" onClick={()=>{setExpanded(true);void run(async()=>{await refreshProgress(book);});}}>核对收款进度</button>}
            {expanded && (
              <div className="expense-body">
                <div className="expense-tools">
                  <span>
                    {book.group.name} · {book.participants.length} 人
                  </span>
                  <button
                    onClick={() => setExpanded(false)}
                  >
                    收起活动
                  </button>
                </div>
                {!book.entries.length && (
                  <p>比如“卤味42”，或“饮料10，李娜3元，剩下我和小王平分”。</p>
                )}
                {book.entries.map((e) => (
                  <div className="expense-row" key={e.id}>
                    <div className="expense-row-main">
                      {review && !e.batchId && !(e.source&&sourceExpenseNet(e.source)===0) && (
                        <label className="expense-row-choice">
                          <input
                            type="checkbox"
                            aria-label={`结算${e.title}`}
                            checked={selected.includes(e.id)}
                            onChange={(v) =>
                              setSelected(
                                v.target.checked
                                  ? [...selected, e.id]
                                  : selected.filter((id) => id !== e.id),
                              )
                            }
                          />
                        </label>
                      )}
                      <span>
                        <strong>{e.title}</strong>
                        <small>
                          {new Date(e.at).toLocaleDateString("zh-CN", {
                            month: "numeric",
                            day: "numeric",
                          })}{" "}
                          ·{" "}
                          {book.group.members.find((m) => m.id === e.payerId)
                            ?.self
                            ? "你"
                            : book.group.members.find((m) => m.id === e.payerId)
                                ?.name}
                          垫付{e.batchId ? " · 已进入结算" : ""}
                        </small>
                        {e.source&&<small>原订单实付 {money(e.source.paidAmount)}{e.source.refundedAmount>0?` · 已退款 ${money(e.source.refundedAmount)}`:''}</small>}
                      </span>
                      <b>{money(e.amount)}</b>
                    </div>
                    {sourceExpenseIssue(e)&&<p className="expense-source-warning">{sourceExpenseIssue(e)}{sourceExpenseAdjustment(e)>0&&e.batchId?`，差额 ${money(sourceExpenseAdjustment(e))} 待核对。`:''}</p>}
                    {e.source&&<details><summary>订单与付款依据</summary><p>{e.source.merchant} · {new Date(e.source.paidAt).toLocaleString('zh-CN')}</p><p className="expense-source-id">订单 {e.source.orderId}<br/>付款 {e.source.paymentId}</p></details>}
                    <details>
                      <summary>分摊依据</summary>
                      <p>
                        {entryAllocations(book.group, e)
                          .filter((m) => m.amount)
                          .map(
                            (m) =>
                              `${m.self ? "你" : m.name} ${money(m.amount)}`,
                          )
                          .join(" · ")}
                      </p>
                    </details>
                    {!e.batchId && !(e.source&&sourceExpenseNet(e.source)===0) && (
                      <div className="expense-row-actions">
                        <button
                          onClick={() =>
                            onPrompt(`修改「${e.title}」（记录 ${e.id}）：`)
                          }
                        >
                          修改
                        </button>
                        {!e.source&&<button onClick={() => setRemoving(e.id)}>删除</button>}
                      </div>
                    )}
                    {removing === e.id && !e.batchId && (
                      <div className="expense-confirm">
                        删除这笔记录？
                        <button
                          onClick={() =>
                            void run(async () => {
                              await save({
                                type: "delete",
                                bookId: book.id,
                                entryId: e.id,
                              });
                              setRemoving("");
                              setSelected((ids) =>
                                ids.filter((id) => id !== e.id),
                              );
                            })
                          }
                        >
                          确认删除
                        </button>
                        <button onClick={() => setRemoving("")}>保留</button>
                      </div>
                    )}
                  </div>
                ))}
                {review && (
                  <div className="expense-review">
                    <h3>这样分可以吗？</h3>
                    <p>仅结算上方勾选的消费，未选记录留待下次。</p>
                    {splitSummary && splitSummary.equalCount > 0 && (
                      <p>{splitSummary.equalCount} 笔按{splitSummary.people}平分。</p>
                    )}
                    {splitSummary?.exceptions.map(e => (
                      <p key={e.id}><strong>{e.title}</strong>：{e.text}</p>
                    ))}
                    {totals && (
                      <>
                        <p>
                          合计 {money(totals.total)} · 你承担{" "}
                          {money(totals.selfAmount)}
                        </p>
                        {totals.members
                          .filter((m) => !m.self && m.amount > 0)
                          .map((m) => (
                            <div className="expense-person" key={m.id}>
                              <span>{m.name}</span>
                              <strong>{money(m.amount)}</strong>
                            </div>
                          ))}
                        <button
                          className="expense-primary"
                          disabled={needsAuthorization}
                          onClick={() => void submitSettlement()}
                        >
                          没问题，去微信确认收款 {money(totals.collectAmount)}
                          <ArrowUpRight size={16} />
                        </button>
                      </>
                    )}
                    {reviewError && <p role="alert">{reviewError}</p>}
                    <button onClick={() => onPrompt("调整这次分摊：")}>调整分摊</button>
                    <button onClick={() => setReview(false)}>继续记录</button>
                  </div>
                )}
                {book.batches.map((batch) => (
                  <div className="expense-batch" key={batch.id}>
                    <strong>
                      {batch.entryIds.length} 笔消费 ·{" "}
                      {batch.status === "prepared"
                        ? "等待微信确认"
                        : "已发起群收款"}
                    </strong>
                    {batch.status === "prepared" ? (
                      <>
                        <p>{batch.sourceChanged?'原订单发生退款，旧收款方案已失效。先核对微信结果；确认未发布后才能返回修改。':'这些记录已锁定，避免重复发起。'}</p>
                        <button
                          disabled={batch.sourceChanged||needsAuthorization}
                          onClick={() =>
                            void run(async () => {
                              await load();
                              await publish(batch, book);
                            })
                          }
                        >
                          继续微信确认
                        </button>
                        <button disabled={needsAuthorization} onClick={() => void reconcile(batch)}>
                          核对结果
                        </button>
                        <button disabled={needsAuthorization} onClick={() => void reconcile(batch, true)}>
                          返回修改
                        </button>
                      </>
                    ) : (
                      <>
                        {batch.sourceChanged&&<p className="expense-source-warning">原订单退款产生差额，原收款记录已保留。请在微信核对已付成员与退款，处理完成前不会标记结清。</p>}
                        <p>
                          {(() => {
                            const c = batch.receipt;
                            return c
                              ? c.status === "cancelled"
                                ? "微信已取消；未自动重新收费"
                                : collectionProgress(book,batch,c).complete ? '已收齐 · 分摊依据已保留' : `${money(collectionProgress(book,batch,c).paid)} / ${money(c.collectAmount)} 已收（上次核对）`
                              : "收款进度以微信回执为准";
                          })()}
                        </p>
                        {batch.receipt && !collectionProgress(book,batch,batch.receipt).cancelled && collectionProgress(book,batch,batch.receipt).members.map(m=>(
                          <div className="expense-person" key={m.id}><span>{m.name}</span><span>{money(m.amount)} · {m.paid?'已付':'未付'}</span></div>
                        ))}
                        <button disabled={needsAuthorization}
                          onClick={() =>
                            void run(async () => {
                              await refreshProgress(book);
                            })
                          }
                        >
                          查看收款进度
                        </button>
                      </>
                    )}
                  </div>
                ))}
                {book.batches.some(b=>b.status==='published') && !expenseActivityClosed(book) && (
                  <button onClick={()=>void run(async()=>{
                    const latest=await refreshProgress(book);
                    setNotice(await remindExpenseTomorrow(latest));
                  })}>明天提醒我</button>
                )}
              </div>
            )}
          </>
        )}
        {setup && (
          <div className="expense-setup">
            <h3>把这次消费记在一起</h3>
            <p>选好参与人，接下来只要说消费。默认由你垫付，单笔可单独说明。</p>
            {pending && <p className="expense-original">你的交代：{pending}</p>}
            {!conversation&&<label>
              活动名称
              <input
                maxLength={60}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </label>}
            <button
              onClick={() =>
                void run(async () => {
                  const r = await groupAARequest("choose");
                  if (r.group) {
                    setGroup(r.group);
                    setPeople(
                      r.group.members.filter((m) => m.self).map((m) => m.id),
                    );
                  }
                })
              }
            >
              从微信选择群
            </button>
            {group && (
              <>
                <strong>{group.name}</strong>
                <div className="expense-people">
                  {group.members.map((m) => (
                    <label key={m.id}>
                      <input
                        type="checkbox"
                        checked={people.includes(m.id)}
                        disabled={m.self}
                        onChange={(e) =>
                          setPeople(
                            e.target.checked
                              ? [...people, m.id]
                              : people.filter((id) => id !== m.id),
                          )
                        }
                      />
                      {m.avatar && <img src={m.avatar} alt="" />}
                      {m.self ? "我（垫付人）" : m.name}
                    </label>
                  ))}
                </div>
                <button
                  className="expense-primary"
                  disabled={!people.length || !title.trim()}
                  onClick={() => void create()}
                >
                  开始记录
                </button>
              </>
            )}
            <button onClick={() => setSetup(false)}>暂不开始</button>
          </div>
        )}
      </fieldset>
      {busy && <p role="status">正在处理，请稍候…</p>}
      {notice && <p role="status">{notice}</p>}
      {error && (
        <p role="alert">
          {error}
          <button
            onClick={() =>
              void run(async () => {
                await load();
              })
            }
          >
            重新读取
          </button>
        </p>
      )}
    </section>
  );
});
