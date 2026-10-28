import {usePageMotion} from './lib/use-interface-motion';
import {AnimatedBottomNav} from './components/animated-bottom-nav';
import {StatusToast} from './components/status-toast';
import {StewardGuide} from './components/steward-guide';
import { useEffect, useMemo, useRef, useState, type ReactNode, type FormEvent } from "react";
import {useStewardMemory} from './lib/use-steward-memory';
import {MemoryManager} from './components/memory-manager';
import {useBankAccount} from './lib/use-bank-account';
import {SmartTransfers,type SmartIntent} from './components/smart-transfers';
import {bankCards,type BankCardId,type BankReceipt} from './lib/bank-transfer';
import {assetMoney} from './lib/bank-assets';
import {TermDepositPanel} from './components/term-deposit-panel';
import {
  ArrowLeft,
  ArrowRight,
  ArrowRightLeft,
  Bell,
  BellRing,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  CreditCard,
  Eye,
  EyeOff,
  FileText,
  Fingerprint,
  Headphones,
  Landmark,
  Leaf,
  Link2,
  MessageCircle,
  Mic,
  PieChart,
  Plus,
  Send,
  Settings2,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  UserRound,
  Wallet,
  Users,
  X,
  CalendarDays,
  CircleAlert,
  ContactRound,
  type LucideIcon,
} from "lucide-react";
import { Button } from "./components/ui/button";
import { Dialog } from "./components/ui/dialog";
import { Switch } from "./components/ui/switch";
import { DataConnections } from "./components/data-connections";
import { PhoneContactPicker } from "./components/phone-contact-picker";
import { SubscriptionCenter } from "./components/subscription-center";
import {HomePreviewHeader} from './components/home-preview-header';
import {ElderHome} from './components/elder-home';
import './components/elder-mode.css';
import { StewardWorkspaces } from "./components/steward-workspaces";
import {useWechatShare} from './lib/use-wechat-share';
import { WealthOperationMvp } from "./components/wealth-operation-mvp";
import { BillReports } from "./components/bill-reports";
import { CardManagement } from "./components/card-management";
import {AssetDashboard} from './components/asset-dashboard';
import {AssetSchedule} from './components/asset-schedule';
import {WealthConversationProvider} from './components/wealth-conversation';
import {parseCardIntent,cardIntentTarget} from './lib/card-intent';
import {AuthorizationCenter} from './components/authorization-center';
import { AgentAutomationCenter } from "./components/agent-automation-center";
import { FinancialFocusRules } from "./components/financial-focus-rules";
import { FundingInsights } from "./components/funding-insights";
import {automationServerRequest,automationTemplates,type AutomationRun,type AutomationServerSnapshot} from './lib/agent-automations';
import { type DuplicatePreferences, type DuplicateDecision } from "./lib/subscription-insights";
import { fundingReferenceTime } from "./lib/funding-forecast";
import { FundingPlan } from "./components/funding-plan";
import { FundDiscovery } from "./components/fund-discovery";
import {TaskCalendar} from './components/task-calendar';
import {GroupAA} from './components/group-aa';
import {MerchantWorkspace} from './components/merchant-workspace';
import {AAHistory} from './components/aa-history';
import {OccasionPlanner} from './components/occasion-planner';
import {memoryContext} from './lib/steward-memory';
import type {ReminderDraft} from './lib/task-calendar';
import { useSubscriptionSync } from "./lib/use-subscription-sync";
import {updateBillSourceGrant} from './lib/bill-source-grant';
import type { RecurringReviews, RecurringReviewStatus } from "./components/recurring-subscription-review";
import "./components/native-banking.css";
import "./components/account-pages.css";
import {
  cancelFinancialAutopay,
  requestAuthorizedFinancialSource,
  restoreFinancialSource,
  revokeFinancialSource,
  usePhoneBack,
  usePhoneBridge,
} from "./lib/phone-bridge";
import type {
  ExternalFinancialProvider,
  FinancialScope,
} from "./lib/financial-connections";
import { buildSubscriptionInsights } from "./lib/subscription-insights";
import { RENEWAL_REMINDER_WINDOW_DAYS } from "./lib/subscription-insights";
import ningning from "./assets/ningning.png";
import aheng from "./assets/aheng.png";

type Page =
  | "home"
  | "assets"
  | "deposits"
  | "spending"
  | "plan"
  | "risk"
  | "cards"
  | "profile"
  | "settings"
  | "connections"
  | "authorization"
  | "funding"
  | "funds"
  | "tasks"
  | "group-aa"
  | "aa-history"
  | "merchant"
  | "occasions"
  | "subscriptions"
  | "automations";
type Modal =
  | "steward"
  | "transfer"
  | "notifications"
  | "help"
  | "memory"
  | "privacy"
  | "limit"
  | "freeze"
  | "unfreeze"
  | "cardControl"
  | "voice"
  | "attach"
  | null;
const emptyAutomationSnapshot:AutomationServerSnapshot={version:1,engine:'mastra',tasks:[],runs:[]};
const stewards = {
  ningning: {
    name: "宁宁",
    image: ningning,
    tagline: "细心温和，擅长日常规划",
    greeting: "钱的事，我们慢慢理清。",
    intro: "我会记住你的计划，把每一步安排得更妥帖。",
  },
  aheng: {
    name: "阿衡",
    image: aheng,
    tagline: "沉稳直接，擅长分析与提醒",
    greeting: "把复杂的事，理得明明白白。",
    intro: "我会帮你看清数据，给出直接、清晰的建议。",
  },
};
type StewardId = keyof typeof stewards;
const nav: { page: Page; label: string; icon: LucideIcon }[] = [
  { page: "home", label: "管家", icon: MessageCircle },
  { page: "assets", label: "资产", icon: PieChart },
  { page: "risk", label: "财富", icon: TrendingUp },
  { page: "cards", label: "卡片", icon: CreditCard },
  { page: "profile", label: "我的", icon: UserRound },
];
function read<T>(key: string, fallback: T): T {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}
function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* Storage is optional for this prototype. */
  }
}
function Glyph({
  icon: Icon,
  tone = "",
  className = "",
}: {
  icon: LucideIcon;
  tone?: string;
  className?: string;
}) {
  return (
    <span className={`glyph ${tone} ${className}`}>
      <Icon size={21} aria-hidden="true" />
    </span>
  );
}
function Row({
  icon,
  title,
  subtitle,
  onClick,
  end,
  tone = "",
}: {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  onClick?: () => void;
  end?: ReactNode;
  tone?: string;
}) {
  const content = (
    <>
      <Glyph icon={icon} tone={tone} />
      <span className="row-copy">
        <strong>{title}</strong>
        {subtitle && <span>{subtitle}</span>}
      </span>
      {end || (onClick ? <ChevronRight size={18} aria-hidden="true" /> : null)}
    </>
  );
  return onClick ? (
    <button className="list-row" onClick={onClick}>
      {content}
    </button>
  ) : (
    <div className="list-row">{content}</div>
  );
}

export default function App() {
  return <WealthConversationProvider><AppContent/></WealthConversationProvider>;
}
function AppContent() {
  const [standardMode, setMode] = useState<"classic" | "native">(() =>
    read<string>("zhiyin-mode", "classic") === "native" ? "native" : "classic",
  );
  const [elderMode, setElderMode] = useState(() => read<unknown>('zhiyin-elder-mode', false) === true);
  const [elderChatOpen, setElderChatOpen] = useState(false);
  const mode = elderMode ? 'native' : standardMode;
  useEffect(() => {
    save('zhiyin-elder-mode', elderMode);
    document.body.dataset.zhiyinAppearance = elderMode ? 'elder' : 'standard';
    return () => { delete document.body.dataset.zhiyinAppearance; };
  }, [elderMode]);
  const stewardWorkerStarted=useRef(mode==='native');
  if(mode==='native')stewardWorkerStarted.current=true;
  const [page, setPage] = useState<Page>("home");
  const navigationIntent = useRef<'forward' | 'back'>('forward');
  const pageSurface = usePageMotion(page, navigationIntent.current);
  useEffect(()=>{
    if(!elderMode||!pageSurface.current)return;
    pageSurface.current.scrollTop=elderChatOpen?pageSurface.current.scrollHeight:0;
  },[elderMode,elderChatOpen,pageSurface]);
  const [fundDetailId,setFundDetailId]=useState<string>();
  const [wealthFocusProductId,setWealthFocusProductId]=useState<string>();
  const [wealthEntry,setWealthEntry]=useState<'assessment'|'holdings'>();
  function openFunds(id?:string){setFundDetailId(id);go("funds");}
  const [pageHistory, setPageHistory] = useState<Page[]>([]);
  const [stewardId, setStewardId] = useState<StewardId>(() => {
    const saved = read<string>("zhiyin-steward", "ningning");
    return saved === "aheng" ? "aheng" : "ningning";
  });
  const steward = stewards[stewardId];
  const [modal, setModal] = useState<Modal>(null);
  const [hidden, setHidden] = useState(false);
  const [input, setInput] = useState("");
  const [toast, setToast] = useState("");
  const [message, setMessage] = useState("");
  const [chatDraft,setChatDraft]=useState('');
  const [conversationListOpen,setConversationListOpen]=useState(false);
  const [conversationRequest,setConversationRequest]=useState<{id:string;token:string}>();
  const [automationSnapshot,setAutomationSnapshot]=useState<AutomationServerSnapshot>(emptyAutomationSnapshot);
  const [transferStep, setTransferStep] = useState(0);
  const [amount, setAmount] = useState("2000");
  const [recipient, setRecipient] = useState("妈妈");
  const [contactPickerOpen, setContactPickerOpen] = useState(false);
  const [transferDate, setTransferDate] = useState("2026-09-18");
  const [transferError, setTransferError] = useState("");
  const [readNotifications, setReadNotifications] = useState(false);
  const bank=useBankAccount();
  const frozen=bank.state?.frozen ?? false;
  const controls=useMemo(()=>bank.state?.controls || {overseas:false,contactless:true,night:true},[bank.state]);
  const [bankIntent,setBankIntent]=useState<SmartIntent|null>(null);
  const [taskDraft,setTaskDraft]=useState<ReminderDraft|null>(null);
  const [taskDate,setTaskDate]=useState<number>();
  const [occasionEntry,setOccasionEntry]=useState<{prompt?:string;id?:string}>({});
  const [wealthFollowup,setWealthFollowup]=useState<import('./lib/operation-followup').WealthEntry>();
  const [connectionEntry,setConnectionEntry]=useState<ExternalFinancialProvider>();
  const [bankReceipt,setBankReceipt]=useState<BankReceipt|null>(null);
  const memory=useStewardMemory();
  const limit=String((bank.state?.limit ?? 2000000)/100);
  const [draftLimit, setDraftLimit] = useState(limit);
  const [pendingControl,setPendingControl]=useState<{key:'overseas'|'contactless'|'night';title:string;enabled:boolean}|null>(null);
  function recordCardAction(text:string){save('zhiyin-last-card-action',`${text} · ${new Date().toLocaleString('zh-CN')}`);setToast(text);}
  const [cardEntry,setCardEntry]=useState<BankCardId>();
  const [cardTransfer,setCardTransfer]=useState<{cardId:BankCardId;initial:SmartIntent}|null>(null);
  const [speak, setSpeak] = useState<StewardId | null>(null);
  const [attachment, setAttachment] = useState("");
  const [privacy, setPrivacy] = useState({
    notifications: read('zhiyin-privacy', {notifications:true,analytics:false}).notifications,
    analytics: read('zhiyin-privacy', {notifications:true,analytics:false}).analytics,
  });
  useEffect(()=>save('zhiyin-privacy',privacy),[privacy]);
  const {
    connections, setConnections, refresh: refreshSubscriptions,
    refreshing: subscriptionsRefreshing, error: subscriptionRefreshError,
    setError: setSubscriptionRefreshError, getCurrentConnections,
  } = useSubscriptionSync(() => read("zhiyin-connections", {}));
  const [disabledSubscriptionReminders, setDisabledSubscriptionReminders] = useState<string[]>(
    () => read("zhiyin-disabled-subscription-reminders", []),
  );
  const [subscriptionActionTarget, setSubscriptionActionTarget] = useState<string | null>(null);
  const [subscriptionFocusTarget, setSubscriptionFocusTarget] = useState<string | null>(null);
  const [recurringReviews, setRecurringReviews] = useState<RecurringReviews>(() => read("zhiyin-recurring-reviews-v1", {}));
  const [duplicatePreferences, setDuplicatePreferences] = useState<DuplicatePreferences>(() => read("zhiyin-duplicate-preferences-v1", {}));
  useEffect(() => save("zhiyin-duplicate-preferences-v1", duplicatePreferences), [duplicatePreferences]);
  function changeDuplicatePreference(key: string, decision: DuplicateDecision) {
    setDuplicatePreferences(current => {
      const next = { ...current };
      if (decision === 'review') delete next[key];
      else next[key] = decision === 'keep' ? { decision } : { decision, until: fundingReferenceTime(connections) + 86400000 };
      return next;
    });
  }
  useEffect(() => { save("zhiyin-recurring-reviews-v1", recurringReviews); }, [recurringReviews]);
  function reviewRecurring(key: string, status: RecurringReviewStatus) {
    setRecurringReviews(current => ({ ...current, [key]: status }));
  }
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 3500);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    save("zhiyin-steward", stewardId);
  }, [stewardId]);
  useEffect(()=>{
    let active=true;
    void automationServerRequest().then(value=>{if(active)setAutomationSnapshot(value);}).catch(()=>{/* Automatic tasks are optional while the local service starts. */});
    return()=>{active=false;};
  },[]);
  useEffect(() => {
    save("zhiyin-controls", controls);
  }, [controls]);
  useEffect(() => () => window.speechSynthesis?.cancel(), []);
  useEffect(() => {
    save("zhiyin-mode", standardMode);
  }, [standardMode]);
  useEffect(() => {
    save("zhiyin-connections", connections);
  }, [connections]);
  useEffect(() => {
    save("zhiyin-disabled-subscription-reminders", disabledSubscriptionReminders);
  }, [disabledSubscriptionReminders]);
  async function connectFinancialSource(
    provider: ExternalFinancialProvider,
    scopes: FinancialScope[],
  ) {
    const result = await requestAuthorizedFinancialSource(provider, scopes);
    if (result.status !== "granted" || !result.source) {
      throw new Error(
        result.status === "denied"
          ? "合作方未确认授权，连接没有建立。你可以调整范围后重试。"
          : "请从 MobileGym 手机桌面打开知银，再尝试连接这个账户。",
      );
    }
    if(scopes.includes('transactions'))await updateBillSourceGrant(provider,true);
    setConnections((current) => ({
      ...current,
      [provider]: { ...result.source!, scopes },
    }));
    setSubscriptionRefreshError("");
    setToast(`${result.source.displayName}已连接，账单已按统一口径整理`);
    return {...result.source,scopes};
  }
  async function disconnectFinancialSource(provider: ExternalFinancialProvider) {
    const name = connections[provider]?.displayName || "该账户";
    await updateBillSourceGrant(provider,false);
    const result = await revokeFinancialSource(provider);
    if (result.status !== "revoked") {
      throw new Error(result.message || "支付平台未确认断开，连接仍然保留。");
    }
    setConnections((current) => {
      const next = { ...current };
      delete next[provider];
      return next;
    });
    setSubscriptionRefreshError("");
    setToast(`已断开${name}，知银不再读取它的数据`);
  }
  async function cancelSubscription(provider: ExternalFinancialProvider, subscriptionId: string) {
    const result = await cancelFinancialAutopay(provider, subscriptionId);
    if (result.status !== "cancelled") {
      throw new Error(result.message || "未能同步到支付平台，请重试。");
    }
    setConnections(current => {
      const source = current[provider];
      if (!source) return current;
      return {
        ...current,
        [provider]: {
          ...source,
          autopays: source.autopays.filter(item => item.id !== subscriptionId),
          cancelledAutopayIds: [...new Set([...(source.cancelledAutopayIds || []), subscriptionId])],
        },
      };
    });
    setDisabledSubscriptionReminders(current => current.filter(key => key !== `${provider}:${subscriptionId}`));
    setToast("已取消自动续费，结果已同步到签约平台");
  }
  function toggleSubscriptionReminder(key: string, enabled: boolean) {
    setDisabledSubscriptionReminders(current => enabled
      ? current.filter(item => item !== key)
      : current.includes(key) ? current : [...current, key]);
    setToast(enabled ? "已开启续费前提醒" : "已关闭这项续费提醒");
  }
  async function decideHomeAutomationEvidence(runId:string,evidenceId:string,decision:'confirmed'|'dismissed'){
    const next=await automationServerRequest({type:'decide',runId,evidenceId,decision});
    setAutomationSnapshot(next);
    setToast(decision==='confirmed'?'已继续关注这笔支出':'已标记为正常消费');
  }
  function go(next: Page) {
    navigationIntent.current = 'forward';
    setConversationListOpen(false);
    if (next !== page) setPageHistory((history) => [...history, page]);
    setPage(next);
    setModal(null);
    document.querySelector(".workspace")?.scrollTo({ top: 0 });
    window.scrollTo({ top: 0 });
  }
  function goBack() {
    navigationIntent.current = 'back';
    setPage(pageHistory.at(-1) || "home");
    setPageHistory((history) => history.slice(0, -1));
    setModal(null);
    window.scrollTo({ top: 0 });
    document.querySelector(".workspace")?.scrollTo({ top: 0 });
  }
  function askSteward(prompt: string, useNative=mode==='native') {
    if(useNative){setChatDraft(prompt);if(elderMode)setElderChatOpen(true);}
    else setInput(prompt);
    go('home');
  }
  function openCardIntent(instruction?:string){
    const intent=instruction?parseCardIntent(instruction):null;
    const target=instruction?cardIntentTarget(instruction):null;
    go('cards');
    if(target==='unknown'||target==='ambiguous'){setToast(target==='unknown'?'没有匹配到可操作的卡片，请从已登记银行卡中选择':'请先选择这次要管理的银行卡');return;}
    setCardEntry(target??'primary');
    if(target&&target!=='primary'){setToast(`已定位尾号 ${bankCards.find(card=>card.id===target)!.last4}，请核对本卡设置`);return;}
    if(!intent)return;
    if(intent.kind==='limit'){setDraftLimit(String(intent.yuan));setModal('limit');}
    else if(intent.kind==='freeze')setModal('freeze');
    else if(intent.kind==='unfreeze')setModal('unfreeze');
    else if(intent.kind==='control'){
      const title={overseas:'境外交易',contactless:'无卡支付',night:'夜间保护'}[intent.key];
      setPendingControl({key:intent.key,title,enabled:intent.enabled});setModal('cardControl');
    }
  }
  usePhoneBack(() => {
    if (modal) {
      setModal(null);
      return true;
    }
    if (page !== "home") {
      goBack();
      return true;
    }
    if (elderMode && elderChatOpen) {
      setElderChatOpen(false);
      return true;
    }
    return false;
  });
  usePhoneBridge();
  const wechatShare=useWechatShare(()=>{setMode('native');setElderChatOpen(true);setPage('home');setModal(null);setPageHistory([]);});
  useEffect(() => {
    if (connections.wechat_pay) return;
    let cancelled = false;
    void restoreFinancialSource("wechat_pay", ["transactions"]).then((result) => {
      if (cancelled || result.status !== "granted" || !result.source) return;
      setConnections((current) => ({
        ...current,
        wechat_pay: { ...result.source!, scopes: ["transactions"] },
      }));
      setSubscriptionRefreshError("");
    });
    return () => { cancelled = true; };
  }, [connections.wechat_pay, setConnections, setSubscriptionRefreshError]);
  useEffect(() => {
    if (page === "home" || page === "subscriptions" || page === "funding" || page === "tasks") void refreshSubscriptions();
  }, [page, refreshSubscriptions]);
  useEffect(() => {
    const refresh = () => { void refreshSubscriptions(); };
    const visible = () => { if (document.visibilityState === "visible") refresh(); };
    window.addEventListener("focus", refresh);
    window.addEventListener("zhiyin-phone-foreground", refresh);
    document.addEventListener("visibilitychange", visible);
    return () => {
      window.removeEventListener("focus", refresh);
      window.removeEventListener("zhiyin-phone-foreground", refresh);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [refreshSubscriptions]);
  function openTransfer(text = "给妈妈转 2000 元，下周五到账") {
    setMessage(text);
    setTransferStep(0);
    setTransferError("");
    const parsed = text.match(/(\d+(?:\.\d+)?)\s*(?:元|块)/);
    setAmount(parsed?.[1] || "2000");
    setModal("transfer");
  }
  function submit(e: FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text) return;
    setInput("");
    if (/定时|自动任务|每月.*分析|每周.*检查/.test(text)) go("automations");
    else if (/转|汇款/.test(text)) openTransfer(text);
    else if (/消费|花|账单|支出/.test(text)) go("spending");
    else if (/理财|投资|稳妥/.test(text)) go("plan");
    else if (/卡|挂失|单笔限额|支付限额|交易限额|夜间保护|境外交易|无卡支付/.test(text)) openCardIntent(text);
    else {
      setMessage(text);
      setToast("已收到你的需求，可以从下方选择一个场景继续体验。");
    }
  }
  function previewVoice(id: StewardId) {
    if (!("speechSynthesis" in window)) {
      setToast("当前浏览器不支持语音试听");
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(
      `你好，我是${stewards[id].name}。${stewards[id].intro}`,
    );
    utterance.lang = "zh-CN";
    utterance.rate = id === "ningning" ? 0.9 : 1;
    utterance.onend = () => setSpeak(null);
    utterance.onerror = () => {
      setSpeak(null);
      setToast("语音暂不可用，请检查设备的中文语音支持");
    };
    setSpeak(id);
    window.speechSynthesis.speak(utterance);
  }
  const activeNav =
    elderMode ? (page === 'home' ? 'home' : ['assets', 'deposits', 'funding'].includes(page) ? 'assets' : 'profile')
      : page === "cards" ? "cards"
      : page === "risk" || page === "plan" || page === "funds" ? "risk"
      : page === "profile" || page === "settings" || page === "connections"
      ? "profile"
      : ["assets", "funding", "deposits", "spending"].includes(page)
        ? "assets"
        : "home";
  const otherCardBalance=bank.state?.cards?.filter(card=>!card.isPrimary).reduce((sum,card)=>sum+card.balance,0)??0;
  const balance = hidden ? "¥ •••,•••.••" : bank.state?.assetSummary ? assetMoney(bank.state.assetSummary.total+otherCardBalance) : "待读取";
  const num = (value: number) =>
    `¥${value.toLocaleString("zh-CN", { maximumFractionDigits: 2 })}`;
  const subscriptionInsights = useMemo(
    () => buildSubscriptionInsights(connections),
    [connections],
  );
  const enabledUpcomingSubscriptions = subscriptionInsights.upcoming.filter(
    item => !disabledSubscriptionReminders.includes(item.key),
  );
  const hasSubscriptionAttention = enabledUpcomingSubscriptions.length > 0 ||
    subscriptionInsights.possibleDuplicateCount > 0;
  const latestAnomalyRun=automationSnapshot.tasks.find(task=>task.kind==='anomaly_bill_review')?.lastRun;
  const pendingAutomationRun=latestAnomalyRun?.status==='waiting_confirmation'?latestAnomalyRun:undefined;
  const automationPendingCount=pendingAutomationRun?.evidence.filter(item=>item.decision==='pending').length||0;
  const pendingAutomationEvidence=pendingAutomationRun?.evidence.find(item=>item.decision==='pending');
  const homeAutomationAttention=automationPendingCount&&pendingAutomationRun&&pendingAutomationEvidence?{
    count:automationPendingCount,
    summary:pendingAutomationRun.summary,
    runId:pendingAutomationRun.id,
    evidence:pendingAutomationEvidence,
  }:undefined;
  const pending = Number(hasSubscriptionAttention) + Number(automationPendingCount>0);
  function Avatar({
    size = "",
    person = stewardId,
  }: {
    size?: string;
    person?: StewardId;
  }) {
    return (
      <span className={`avatar ${size}`}>
        <img
          src={stewards[person].image}
          alt={`${stewards[person].name}的头像`}
        />
        <i />
      </span>
    );
  }
  function Heading({ title, subtitle }: { title: string; subtitle?: string }) {
    return (
      <div className="page-heading">
        <button
          className="icon-control back-button"
          aria-label="返回"
          onClick={goBack}
        >
          <ArrowLeft size={21} />
        </button>
        <div>
          <h1>{title}</h1>
          {subtitle && <p>{subtitle}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className={`app-shell mode-${mode} ${elderMode ? 'elder-mode' : ''} ${elderMode && !elderChatOpen ? 'elder-home-view' : ''} ${mode === "native" && page === "home" ? "native-chat-shell home-ui-preview" : ""}`}>
      <aside className="sidebar" hidden={mode === "native"}>
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            go("home");
          }}
        >
          <span className="brand-mark">
            <Landmark size={25} />
          </span>
          <span>
            知银<small>你的个人银行管家</small>
          </span>
        </a>
        <div className="sidebar-nav">
          {nav.map(({ page: p, label, icon: Icon }) => (
            <button
              key={p}
              className={activeNav === p ? "selected" : ""}
              onClick={() => go(p)}
            >
              <Icon size={21} />
              <span>{label}</span>
              {activeNav === p && <span className="nav-dot" />}
            </button>
          ))}
        </div>
        <div className="sidebar-divider" />
        <button className="sidebar-link" onClick={() => go("spending")}>
          <FileText size={19} />
          消费分析
        </button>
        <button className="sidebar-link" onClick={() => go("automations")}>
          <CalendarDays size={19} />
          我的关注
        </button>
        <button className="sidebar-link" onClick={() => openFunds()}>
          <TrendingUp size={19} />
          大数据选基
        </button>
        <div className="sidebar-bottom">
          <div className="sidebar-assistant">
            <Avatar />
            <strong>
              {steward.name}在这里<p>随时为你搭把手</p>
            </strong>
          </div>
          <button className="text-link" onClick={() => setModal("steward")}>
            换一种陪伴方式 <ArrowRight size={15} />
          </button>
          <div className="demo-tag">
            <span />
            你的个人银行管家
          </div>
        </div>
      </aside>
      <div className="workspace">
        {(elderMode||mode==='classic')&&<div className="appearance-toolbar" role="group" aria-label="界面版本">
          <span>{elderMode ? '长辈版' : '普通版'}</span>
          <button type="button" className="appearance-toggle" aria-label={elderMode ? '切换到普通版' : '切换到长辈版'} onClick={() => setElderMode(value => !value)}>
            {elderMode ? '切换普通版' : '切换长辈版'}
          </button>
        </div>}
        {page === 'home' && elderMode && elderChatOpen && <header className="elder-chat-heading fixed-chat-header">
          <button type="button" aria-label="返回长辈版首页" onClick={() => setElderChatOpen(false)}><ArrowLeft aria-hidden="true" size={24}/>返回首页</button>
          <strong>和{steward.name}聊聊</strong>
        </header>}
        {page === "home" && mode === 'native' && !elderMode && <HomePreviewHeader stewardName={steward.name} stewardImage={steward.image} onSwitchSteward={()=>setModal('steward')} onTasks={()=>go('tasks')} onSubscriptions={()=>go('subscriptions')} onProfile={()=>go('profile')} onWealth={()=>go('plan')} onAutomations={()=>go('automations')} onConversations={()=>setConversationListOpen(true)} conversationsOpen={conversationListOpen} onToggleElder={()=>setElderMode(true)} onHelp={()=>setModal('help')}/>}
        {page === "home" && mode === 'classic' && (
          <header className="topbar">
            <button
              className="identity"
              onClick={() => setModal("steward")}
              aria-label="选择私人管家"
            >
              <span className="identity-portrait" key={`portrait-${stewardId}`}>
                <Avatar />
              </span>
              <span className="identity-copy" key={`identity-${stewardId}`}>
                <strong>
                  {steward.name}
                  <ChevronDown size={14} />
                </strong>
                <small>你的个人银行管家</small>
              </span>
            </button>
            <div className="topbar-right">
              <button className="icon-control" aria-label="任务日历" title="任务日历" onClick={()=>go('tasks')}><CalendarDays size={21}/></button>
              {mode === "classic" ? (
                <>
                  <span className="desktop-date">9月13日，星期日</span>
                  <button
                    className="icon-control notification-button"
                    aria-label="查看通知"
                    onClick={() => setModal("notifications")}
                  >
                    <Bell size={23} />
                    {!readNotifications && pending > 0 && <i />}
                  </button>
                </>
              ) : (
                <>
                  <button
                    className="native-header-link"
                    onClick={() => go("subscriptions")}
                  >
                    <BellRing size={18} />
                    <span>订阅</span>
                  </button>
                  <button
                    className="native-header-link native-header-secondary"
                    onClick={() => go("plan")}
                  >
                    资金规划
                  </button>
                  <button
                    className="native-header-link native-header-secondary"
                    onClick={() => go("automations")}
                  >
                    定时任务
                  </button>
                </>
              )}
              <button
                className="icon-control"
                aria-label="个人中心"
                onClick={() => go("profile")}
              >
                <UserRound size={23} />
              </button>
            </div>
          </header>
        )}
        <main
          ref={pageSurface}
          className={`main-content page-${page} ${page === "home" ? "home-content" : "is-detail-page"}`}
        >
          {page === 'home' && elderMode && !elderChatOpen && <ElderHome
            stewardName={steward.name} stewardImage={steward.image}
            bank={bank.state} bankError={bank.error} hidden={hidden}
            onToggleHidden={() => setHidden(value => !value)} onRefresh={() => { void bank.refresh(); }}
            onAssets={() => go('assets')} onTransfer={() => setBankIntent({recipientId:'mom',amount:0})}
            onBills={() => go('spending')} onSubscriptions={() => go('subscriptions')}
            onChat={() => setElderChatOpen(true)} onHelp={() => setModal('help')}
          />}
          {page === "home" && mode === "classic" && (
            <>
              <div className="home-title">
                <div>
                  <p className="greeting">
                    早安，叶先生 <span>很高兴又见到你</span>
                  </p>
                  <h1>今天想办理什么？</h1>
                  <p className="intro">
                    {steward.greeting} 说出需求，我来准备。
                  </p>
                </div>
                <span className="home-emblem" aria-hidden="true">
                  <Sparkles size={34} />
                </span>
              </div>
              <div className="home-grid">
                <div className="home-primary">
                  <section className="account-summary">
                    <div className="section-line">
                      <span>我的总资产</span>
                      <button
                        className="icon-control"
                        aria-label={hidden ? "显示资产金额" : "隐藏资产金额"}
                        onClick={() => setHidden(!hidden)}
                      >
                        {hidden ? <EyeOff size={19} /> : <Eye size={19} />}
                      </button>
                    </div>
                    <div className="balance">{balance}</div>
                    <div className="account-foot">
                      <span>
                        <span className="status-dot" />
                        账本资产 <span className="subtle-divider">/</span>{" "}
                        常用卡 8888
                      </span>
                      <button onClick={() => go("assets")}>
                        查看资产 <ArrowRight size={17} />
                      </button>
                    </div>
                  </section>
                  <section className="quick-section">
                    <h2>
                      常用服务<span>选择一项业务继续</span>
                    </h2>
                    <div className="quick-actions">
                      <Row
                        icon={ArrowRightLeft}
                        title="转账汇款"
                        subtitle="给妈妈转 2000 元，下周五到账"
                        onClick={() => openTransfer()}
                      />
                      <Row
                        icon={PieChart}
                        title="收支分析"
                        subtitle="分析这个月的钱花在哪"
                        onClick={() => go("spending")}
                      />
                      <Row
                        icon={TrendingUp}
                        title="财富管理"
                        subtitle="帮我选一个稳妥的理财方案"
                        onClick={() => go("risk")}
                      />
                      <Row
                        icon={CalendarDays}
                        title="我的关注"
                        subtitle="定时分析账单与理财情况"
                        onClick={() => go("automations")}
                      />
                    </div>
                  </section>
                  {message && (
                    <div className="inline-request">
                      <MessageCircle size={18} />
                      <p>你刚刚说：{message}</p>
                      <button
                        aria-label="清除上条需求"
                        className="icon-control"
                        onClick={() => setMessage("")}
                      >
                        <X size={16} />
                      </button>
                    </div>
                  )}
                  <div className="how-to">
                    <div className="how-icon">
                      <Leaf size={24} />
                    </div>
                    <div>
                      <strong>初次见面，先认识一下</strong>
                      <p>说出需求 → 核对方案 → 确认后执行</p>
                    </div>
                    <button
                      className="icon-control"
                      aria-label="了解如何使用"
                      onClick={() => setModal("help")}
                    >
                      <ArrowRight size={22} />
                    </button>
                  </div>
                  <p className="security-note">
                    <ShieldCheck size={16} />
                    涉及资金的操作，都由你最后确认
                  </p>
                </div>
                <aside className="home-secondary">
                  <section className="pending-section">
                    <div className="section-line">
                      <h2>
                        值得你关注<span className="count-badge">{pending}</span>
                      </h2>
                      <span className="quiet">已为你整理</span>
                    </div>
                    {pending === 0 ? (
                      <div className="all-done">
                        <CheckCheck size={30} />
                        <strong>都处理好了</strong>
                        <p>接下来的事，交给时间。</p>
                      </div>
                    ) : (
                      <div className="pending-items">
                        {automationPendingCount > 0 && (
                          <button
                            className="attention-item"
                            onClick={() => go("automations")}
                          >
                            <div className="attention-top">
                              <Glyph icon={CircleAlert} tone="amber" />
                              <span>账单核对</span>
                              <ChevronRight size={18} />
                            </div>
                            <h3>{automationPendingCount} 条账单线索等待确认</h3>
                            <p>{pendingAutomationRun?.summary}</p>
                            <span className="attention-foot">
                              宁宁已整理交易依据 <span>逐项核对</span>
                            </span>
                          </button>
                        )}
                        {hasSubscriptionAttention && (
                          <button
                            className="attention-item"
                            onClick={() => go("subscriptions")}
                          >
                            <div className="attention-top">
                              <Glyph icon={FileText} tone="amber" />
                              <span>续费管理</span>
                              <ChevronRight size={18} />
                            </div>
                            <h3>{enabledUpcomingSubscriptions.length
                              ? `${enabledUpcomingSubscriptions.length} 项自动续费即将扣款`
                              : "发现可能重复的会员服务"}</h3>
                            <p>{enabledUpcomingSubscriptions.length
                              ? "已按扣费时间为你排好，可提前提醒或取消。"
                              : "跨平台同类会员可能功能重叠，建议核对。"}</p>
                            <span className="attention-foot">
                              已识别 <b>{subscriptionInsights.items.length} 项</b>
                              <span>去管理</span>
                            </span>
                          </button>
                        )}
                      </div>
                    )}
                  </section>
                  <div className="daily-note">
                    <span className="line-ornament" />
                    <p>
                      好的规划，
                      <br />
                      是让今天从容一点。
                    </p>
                    <small>知银，陪你过好每一天。</small>
                  </div>
                </aside>
              </div>
            </>
          )}
          {page === "assets" && (
            <>
              <Heading title="我的资产" />
              <AssetDashboard snapshot={bank.state} error={bank.error} hidden={hidden} onToggleHidden={()=>setHidden(value=>!value)} onRefresh={()=>void bank.refresh()}
                stewardName={steward.name} stewardImage={steward.image} onAsk={askSteward}
                onOpenCards={id=>{setCardEntry(id);go('cards');}} onOpenHoldings={()=>{setWealthEntry('holdings');go('risk');}}
                onOpenDeposits={()=>go('deposits')} onOpenBills={()=>go('spending')} onOpenRisk={()=>go('risk')} onOpenFunds={()=>openFunds()} onOpenFocus={()=>go('automations')}
                schedule={<AssetSchedule snapshot={bank.state} hidden={hidden} loading={!bank.state&&!bank.error} error={bank.error} subscriptions={subscriptionInsights.upcoming}
                  subscriptionError={subscriptionRefreshError} now={bank.state?.asOf??Date.now()} onRetry={()=>void bank.refresh()}
                  onOpenSchedule={()=>go('tasks')} onOpenFunding={()=>go('funding')} onOpenDeposits={()=>go('deposits')}
                  onOpenTransfer={cardId=>cardId!=='primary'?setCardTransfer({cardId,initial:{kind:'records'}}):setBankIntent({kind:'records'})}
                  onOpenSubscription={(source,id)=>{setSubscriptionActionTarget(null);setSubscriptionFocusTarget(`${source}:${id}`);go('subscriptions');}}/>}/>
            </>
          )}
          {page === "spending" && (
            <>
              <Heading title="我的账单" subtitle="按授权账单生成月度与年度报告" />
              <BillReports connections={connections} onConnect={() => go("authorization")} />
            </>
          )}
          {page === "deposits" && <><Heading title="存款" subtitle="同一银行账本，先核对资金影响再由你确认"/>{hidden?<button type="button" className="primary-button" onClick={()=>setHidden(false)}>显示金额，继续办理</button>:<TermDepositPanel/>}</>}
          {page === "funds" && <FundDiscovery stewardName={steward.name} initialFundId={fundDetailId} onOpenRisk={() => {setWealthEntry('assessment');go("risk");}} onBack={goBack} onAskNingning={id=>{setWealthFocusProductId(id);go("risk");}}/>}
          {page === "plan" && (
            <>
              <Heading
                title="资金规划"
                subtitle={`由${steward.name}结合你的账单、目标与风险边界持续整理`}
              />
              <FundingInsights
                stewardName={steward.name}
                connections={connections}
                automationAttention={homeAutomationAttention}
                onOpenAutomations={() => go("automations")}
                onAsk={askSteward}
              />
              <div className="surface" aria-label="继续安排资金">
                <Row icon={CalendarDays} title="近期资金安排" subtitle="按账户核对接下来的续费" onClick={()=>go('funding')}/>
                <Row icon={TrendingUp} title="理财与基金" subtitle="到财富页聊目标、筛产品和查看持仓" onClick={()=>go('risk')}/>
              </div>
            </>
          )}
          {page === "risk" && (
            <>
              <WealthOperationMvp entry={wealthFollowup} onEntryConsumed={()=>setWealthFollowup(undefined)} onBack={goBack} availableBalance={bank.state?.balance} stewardName={steward.name} onOpenFund={openFunds} focusProductId={wealthFocusProductId} onFocusHandled={()=>setWealthFocusProductId(undefined)} initialScreen={wealthEntry} onInitialScreenConsumed={()=>setWealthEntry(undefined)}/>
            </>
          )}
          {page === "cards" && <CardManagement onBack={goBack} initialCardId={cardEntry} onInitialCardConsumed={()=>setCardEntry(undefined)} onTransfer={cardId=>setCardTransfer({cardId,initial:{recipientId:'mom',amount:0}})} onAsk={askSteward}/>}
          {page === "profile" && (
            <>
              <Heading title="我的" subtitle="熟悉你的习惯，也尊重你的边界" />
              <div className="profile-layout">
                <section className="surface profile-identity" aria-label="个人资料与私人管家">
                  <div className="profile-person">
                    <span className="user-avatar"><UserRound size={28} aria-hidden="true" /></span>
                    <div><h2>叶先生</h2><p>手机 138 **** 6688</p></div>

                  </div>
                  <div className="profile-steward">
                    <Avatar />
                    <div><strong>{steward.name}</strong><p>{steward.tagline}</p></div>
                    <button className="text-link" aria-label="切换管家" onClick={() => setModal("steward")}>
                      切换管家<ChevronRight size={16} aria-hidden="true" />
                    </button>
                  </div>
                </section>

                <section className="profile-services" aria-labelledby="profile-services-title">
                  <h2 id="profile-services-title" className="section-title">常用服务</h2>
                  <div className="profile-service-group"><h3>账户与资金</h3><div className="surface">
                    <Row icon={CreditCard} title="银行卡与安全" subtitle={!bank.state?'账户状态待读取':frozen?'常用卡 8888 · 已挂失':'常用卡 8888 · 状态正常'} onClick={()=>go('cards')}/>
                    <Row icon={FileText} title="我的账单" subtitle="已授权平台的收支与交易明细" onClick={()=>go('spending')}/>
                    <Row icon={PieChart} title="资金规划" subtitle="了解收支，再安排续费与理财" onClick={()=>go('plan')}/>
                  </div></div>
                  <div className="profile-service-group"><h3>日常安排</h3><div className="surface">
                    <Row icon={BellRing} title="订阅与续费" subtitle="查看签约、续费提醒与取消方案" onClick={()=>go('subscriptions')}/>
                    <Row icon={CalendarDays} title="日程" subtitle="提醒、生日与已建立的预约安排" onClick={()=>go('tasks')}/>
                    <Row icon={Users} title="微信群智能AA" subtitle="记录消费，核对分摊后再收款" onClick={()=>go('group-aa')}/>
                    <Row icon={FileText} title="我的小店" subtitle="点餐码、菜品收入与经营账本" onClick={()=>go('merchant')}/>
                    <Row icon={FileText} title="历史 AA 账本" subtitle="查看每次消费、分摊与收款进度" onClick={()=>go('aa-history')}/>
                    <Row icon={CalendarDays} title="生活筹备" subtitle="重要日子、预算与外卖订单" onClick={()=>{setOccasionEntry({});go('occasions');}}/>
                    <Row icon={CalendarDays} title="我的关注" subtitle="持续检查账单、理财与异常线索" onClick={()=>go('automations')}/>
                  </div></div>
                  <div className="profile-service-group"><h3>连接与设置</h3><div className="surface">
                    <Row icon={Link2} title="数据连接" subtitle={Object.keys(connections).length?`已连接 ${Object.keys(connections).length} 个支付账户`:'连接微信支付、支付宝'} onClick={()=>go('authorization')}/>
                    <Row icon={Settings2} title="设置" subtitle={elderMode?'长辈版 · 大字显示':`使用模式 · ${standardMode==='classic'?'经典款':'AI 原生'}`} onClick={()=>go('settings')}/>
                  </div></div>
                </section>

                <section className="profile-preferences" aria-labelledby="profile-preferences-title">
                  <h2 id="profile-preferences-title" className="section-title">{steward.name}对我的了解</h2>
                  <div className="surface">
                    {memory.state.items.length ? memory.state.items.slice(0,3).map((item, i) => (
                      <Row key={item.id} icon={[FileText, PieChart, Bell][i % 3]}
                        title={item.text} onClick={() => setModal("memory")} />
                    )) : <p className="empty-message">还没有保存的偏好。我们可以慢慢了解彼此。</p>}
                  </div>
                  <p className="fine-print left">切换管家不会丢失你的偏好与历史。</p>
                </section>

                <section className="profile-controls" aria-labelledby="profile-controls-title">
                  <h2 id="profile-controls-title" className="section-title">偏好与帮助</h2>
                  <div className="surface">
                    <Row icon={Settings2} title="管理记忆" subtitle="对我的了解 · 确认、纠正或忘记"
                      onClick={() => setModal("memory")} />
                    <Row icon={ShieldCheck} title="授权与批准中心" subtitle="集中管理读取范围、卡片安全和提醒"
                      onClick={() => go('authorization')} />
                    <Row icon={CircleHelp} title="帮助与使用指南" onClick={() => setModal("help")} />
                  </div>
                </section>
              </div>
              <div className="profile-brand">
                <Landmark size={22} aria-hidden="true" />
                <strong>知银</strong>
                <span>知你所需，认真对待每一笔。</span>
                <small>知银 v0.1 · 当前使用本地账户账本</small>
              </div>
            </>
          )}
          {page === "settings" && (
            <>
              <Heading title="设置" subtitle="选择适合你的使用方式" />
              <div className="settings-content">
                <fieldset className="mode-preferences">
                  <legend>界面显示</legend>
                  <label className={`mode-option ${elderMode ? 'selected' : ''}`}>
                    <input type="checkbox" checked={elderMode} onChange={event => setElderMode(event.target.checked)}/>
                    <span><strong>长辈版</strong><small>大字、大按钮，常用功能更好找。随时可以切回普通版。</small></span>
                  </label>
                </fieldset>
                <fieldset className="mode-preferences">
                  <legend>使用模式</legend>
                  <p id="mode-help">
                    只改变办理方式。管家、偏好与未完成安排都会保留。
                  </p>
                  {(
                    [
                      [
                        "classic",
                        "经典款",
                        "通过首页功能入口，查看账户和办理业务。",
                      ],
                      [
                        "native",
                        "AI 原生",
                        "直接说出需求，由管家整理安排，再由你确认。",
                      ],
                    ] as const
                  ).map(([value, title, description]) => (
                    <label
                      key={value}
                      className={`mode-option ${standardMode === value ? "selected" : ""}`}
                    >
                      <input
                        type="radio"
                        name="usage-mode"
                        value={value}
                        checked={standardMode === value}
                        aria-describedby="mode-help"
                        onChange={() => {
                          setMode(value);
                          setToast(elderMode ? `普通版已设为${title}，切回普通版即可体验` : `已切换为${title}，返回首页即可体验`);
                        }}
                      />
                      <span>
                        <strong>{title}</strong>
                        <small>{description}</small>
                      </span>
                      {standardMode === value && <Check size={19} aria-hidden="true" />}
                    </label>
                  ))}
                </fieldset>
                <p className="settings-note">
                  <ShieldCheck size={18} />
                  两种模式的资金操作都需要你单独确认。
                </p>
                <section className="settings-section">
                  <div>
                    <h2>数据与授权</h2>
                    <p>决定知银可以看见哪些资金信息。</p>
                  </div>
                  <div className="surface">
                    <Row
                      icon={Link2}
                      title="数据连接"
                      subtitle={
                        Object.keys(connections).length
                          ? `微信支付、支付宝 · 已连接 ${Object.keys(connections).length} 个`
                          : "微信支付、支付宝 · 尚未连接"
                      }
                      onClick={() => go("authorization")}
                    />
                  </div>
                </section>
              </div>
            </>
          )}
          {page === "authorization" && <><Heading title="授权与批准中心" subtitle="每一项变更都先展示风险，再由你接受或拒绝"/><AuthorizationCenter bank={bank.state} bankBusy={bank.busy} bankError={bank.error} onBankChange={bank.change} onRefresh={bank.refresh} connections={connections} initialProvider={connectionEntry} onEntryConsumed={()=>setConnectionEntry(undefined)} onConnect={async(provider,scopes)=>{await connectFinancialSource(provider,scopes);}} onDisconnect={disconnectFinancialSource} privacy={privacy} onPrivacyChange={setPrivacy}/></>}
          {page === "connections" && (
            <>
              <Heading
                title="数据连接"
                subtitle="把分散的资金信息，放回同一张图里"
              />
              <DataConnections
                initialProvider={connectionEntry}
                onEntryConsumed={()=>setConnectionEntry(undefined)}
                connections={connections}
                onConnect={async(provider,scopes)=>{await connectFinancialSource(provider,scopes);}}
                onDisconnect={disconnectFinancialSource}
              />
            </>
          )}
          {page === "subscriptions" && (
            <>
              <Heading
                title="订阅与续费"
                subtitle="跨平台识别、提前提醒，需要时再取消"
              />
              <Button variant="ghost" onClick={() => go("funding")} className="mb-4">
                <CalendarDays size={17} aria-hidden="true" />查看近期资金安排<ChevronRight size={16} aria-hidden="true" />
              </Button>
              <SubscriptionCenter
                now={fundingReferenceTime(connections)}
                duplicatePreferences={duplicatePreferences}
                onDuplicatePreference={changeDuplicatePreference}
                connections={connections}
                recurringReviews={recurringReviews}
                onReviewRecurring={reviewRecurring}
                refreshing={subscriptionsRefreshing}
                refreshError={subscriptionRefreshError}
                onRefresh={refreshSubscriptions}
                disabledReminders={disabledSubscriptionReminders}
                onToggleReminder={toggleSubscriptionReminder}
                onCancel={cancelSubscription}
                onConnect={() => go("authorization")}
                focusKey={subscriptionFocusTarget}
                onFocusConsumed={() => setSubscriptionFocusTarget(null)}
                selectedKey={subscriptionActionTarget}
                onSelectionConsumed={() => setSubscriptionActionTarget(null)}
              />
            </>
          )}
          {page === 'tasks' && <><Heading title="日程"/><TaskCalendar stewardName={steward.name} onDiscuss={mode==='native'?askSteward:undefined} initialDate={taskDate} schedules={bank.state?.allSchedules??bank.state?.schedules??[]} occasions={bank.state?.occasions??[]} onOpenOccasion={id=>{setOccasionEntry({id});go('occasions');}} sources={Object.values(connections).filter((s):s is NonNullable<typeof s>=>!!s)} bankError={bank.error} sourceError={subscriptionRefreshError} draft={taskDraft} onDraftConsumed={()=>setTaskDraft(null)} onOpenTransfers={cardId=>cardId&&cardId!=='primary'?setCardTransfer({cardId,initial:{kind:'records'}}):setBankIntent({kind:'records'})} onOpenSubscription={(source,id)=>{setSubscriptionActionTarget(null);setSubscriptionFocusTarget(`${source}:${id}`);go('subscriptions');}}/></>}
          {page === 'group-aa' && <><Heading title="微信群智能AA"/><GroupAA onOpenHistory={()=>go('aa-history')}/></>}
          {page === 'merchant' && <><Heading title="我的小店"/><MerchantWorkspace stewardName={steward.name} onAsk={prompt=>{setMode('native');askSteward(prompt,true);}}/></>}
          {page === 'aa-history' && <><Heading title="历史 AA 账本"/><AAHistory stewardName={steward.name} onStartBook={()=>{setMode('native');askSteward('帮我记下这次聚餐的消费，最后一起 AA',true);}} onOpenGroupAA={()=>go('group-aa')} onOpenConversation={id=>{setMode('native');setConversationRequest({id,token:crypto.randomUUID()});if(elderMode)setElderChatOpen(true);go('home');}}/></>}
          {page === 'occasions' && <><Heading title="生活筹备"/><OccasionPlanner stewardName={steward.name} initialPrompt={occasionEntry.prompt} initialPlanId={occasionEntry.id} getMemoryContext={async prompt=>{const current=await memory.refresh();return current?memoryContext(current,prompt):'';}} onOpenCalendar={date=>{setTaskDate(date);go('tasks');}}/></>}
          {page === "funding" && (
            <>
              <Heading title="近期资金安排" subtitle="分开核对每个账户，留足接下来的续费" />
              <FundingPlan connections={connections} refreshing={subscriptionsRefreshing}
                refreshError={subscriptionRefreshError} onRefresh={refreshSubscriptions}
                onConnect={() => go("authorization")} onOpenSubscriptions={() => go("subscriptions")} />
            </>
          )}
          {page === "automations" && (
            <>
              <Heading title="我的关注" subtitle={`由${steward.name}按时检查，发现变化后再请你决定`} />
              <FinancialFocusRules stewardName={steward.name} />
              <AgentAutomationCenter stewardName={steward.name} connections={connections} availableBalance={bank.state?.balance}
                onOpenBills={() => go("spending")} onOpenWealth={() => go("risk")} onOpenCards={() => go("cards")}
                onSnapshotChange={setAutomationSnapshot}
                onDiscussRun={(run:AutomationRun)=>{
                  askSteward(`我想继续了解“${automationTemplates[run.kind].title}”：${run.summary.replace(/[。；;]+$/,'')}。请结合这次检查的依据，告诉我最需要先处理什么。`);
                }} />
            </>
          )}
          {stewardWorkerStarted.current && (
            <div data-page-persistent hidden={mode !== "native" || page !== "home" || (elderMode && !elderChatOpen)} style={mode !== "native" || page !== "home" || (elderMode && !elderChatOpen)?{display:"none"}:undefined} aria-label="管家处理现场">
            {wechatShare.error&&<p role="alert">{wechatShare.error}</p>}
            <StewardWorkspaces
              conversationRequest={conversationRequest}
              onConversationRequestConsumed={()=>setConversationRequest(undefined)}
              conversationListOpen={conversationListOpen}
              onConversationListOpenChange={setConversationListOpen}
              voiceEnabled={mode==='native'&&page==='home'&&(!elderMode||elderChatOpen)&&!['steward','privacy','memory'].includes(modal||'')}
              voiceReviewing={!!bankIntent||!!cardTransfer||!!modal}
              homePreview
              elderMode={elderMode}
              wechatShare={wechatShare.share}
              onWechatShareDone={wechatShare.done}
              memory={memory}
              duplicatePreferences={duplicatePreferences}
              onDuplicatePreference={changeDuplicatePreference}
              stewardName={steward.name}
              stewardImage={steward.image}
              connections={connections}
              disabledReminders={disabledSubscriptionReminders}
              recurringReviews={recurringReviews}
              refreshSubscriptions={refreshSubscriptions}
              getCurrentConnections={getCurrentConnections}
              refreshError={subscriptionRefreshError}
              refreshing={subscriptionsRefreshing}
              onToggleReminder={toggleSubscriptionReminder}
              onOpenSubscriptions={() => go("subscriptions")}
              onOpenConnections={provider=>{setConnectionEntry(provider);go('authorization');}}
              onConnectSource={connectFinancialSource}
              onOpenFunding={() => go("funding")}
              onOpenTasks={date=>{setTaskDate(date);go('tasks');}}
              onOpenMerchant={()=>go('merchant')}
              onOpenGroupAA={()=>go('group-aa')}
              onOpenOccasions={(prompt,id)=>{setOccasionEntry({prompt,id});go('occasions');}}
              occasionPlans={bank.state?.occasions}
              onPrepareTask={draft=>{setTaskDraft(draft);go('tasks');}}
              onOpenWealth={entry=>{setWealthEntry(undefined);setWealthFollowup(entry);go('risk');}}
              onOpenCards={openCardIntent}
              onOpenAutomations={() => go("automations")}
              automationAttention={homeAutomationAttention}
              onAutomationDecision={decideHomeAutomationEvidence}
              initialDraft={chatDraft}
              onInitialDraftConsumed={()=>setChatDraft('')}
              onPrepareTransfer={setBankIntent}
              bankReceipt={bankReceipt}
              onPrepareCancel={(provider, subscriptionId) => {
                setSubscriptionActionTarget(`${provider}:${subscriptionId}`);
                go("subscriptions");
              }}
            />
            </div>
          )}
        </main>
        {page === "home" && mode === "classic" && (
          <div className="composer-wrap">
            <form className="composer" onSubmit={submit}>
              <button
                type="button"
                className="icon-control"
                aria-label="添加账单附件"
                onClick={() => setModal("attach")}
              >
                <Plus size={23} />
              </button>
              <label className="sr-only" htmlFor="request">
                告诉{steward.name}你想办理的事
              </label>
              <input
                id="request"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={`告诉${steward.name}，你想办理什么…`}
                autoComplete="off"
              />
              <button
                type="button"
                className="icon-control microphone"
                aria-label="语音输入"
                onClick={() => setModal("voice")}
              >
                <Mic size={22} />
              </button>
              <button
                className="send-button"
                type="submit"
                aria-label={`发送给${steward.name}`}
                disabled={!input.trim()}
              >
                <Send size={20} />
              </button>
            </form>
            <span className="composer-hint">
              {attachment
                ? `已选择：${attachment}`
                : "涉及资金的操作仍需你确认"}
            </span>
          </div>
        )}
        <AnimatedBottomNav items={elderMode?[
          {page:'home' as const,label:'首页',icon:MessageCircle},
          {page:'assets' as const,label:'我的账户',icon:Wallet},
          {page:'profile' as const,label:'更多服务',icon:UserRound},
        ]:nav} activePage={activeNav} onNavigate={next=>{if(elderMode&&next==='home')setElderChatOpen(false);go(next);}}/>
      </div>
      <StatusToast message={toast} onDismiss={() => setToast('')}/>
      <Dialog
        open={modal === "steward"}
        onOpenChange={(open) => !open && setModal(null)}
        title="选择你的私人管家"
        description="能力一样，陪伴方式不同。以后可以随时更换。"
        className="steward-dialog"
      >
        <div className="steward-options">
          {(Object.keys(stewards) as StewardId[]).map((id) => (
            <div
              className={`steward-option ${stewardId === id ? "chosen" : ""}`}
              key={id}
            >
              <img src={stewards[id].image} alt={stewards[id].name} />
              <div className="steward-option-copy">
                <h3>
                  {stewards[id].name}
                  {id === stewardId && <Check size={18} />}
                </h3>
                <p>{stewards[id].tagline}</p>
                <button
                  className="text-link voice-preview"
                  onClick={() => previewVoice(id)}
                >
                  <Headphones size={16} />
                  {speak === id ? "正在试听…" : "听听问候"}
                </button>
                <Button
                  variant={id === stewardId ? "secondary" : "primary"}
                  className="full-width"
                  aria-label={`选择${stewards[id].name}`}
                  onClick={() => {
                    setStewardId(id);
                    window.speechSynthesis?.cancel();
                    setSpeak(null);
                    setModal(null);
                    setToast(
                      `接下来，由${stewards[id].name}陪你。偏好已保留。`,
                    );
                  }}
                >
                  {id === stewardId ? "继续陪伴" : `和${stewards[id].name}开始`}
                </Button>
              </div>
            </div>
          ))}
        </div>
        <p className="fine-print">语音试听使用设备自带语音，非正式角色配音。</p>
      </Dialog>
      <Dialog
        open={modal === "transfer"}
        onOpenChange={(open) => !open && setModal(null)}
        title={
          transferStep === 2
            ? "预约已记录"
            : transferStep === 1
              ? "请核对并确认"
              : "我先帮你整理好了"
        }
        description={
          transferStep === 2
            ? "本地流程已完成，未发生银行扣款。"
            : "尚未执行，需要你本人确认"
        }
      >
        <div className="transfer-dialog">
          {transferStep === 2 ? (
            <div className="success-state">
              <span>
                <CheckCheck size={36} />
              </span>
              <h3>
                转给{recipient} {num(Number(amount))}
              </h3>
              <p>
                计划日期 {transferDate}
                <br />
                你可以在执行前撤销预约。
              </p>
              <Button className="full-width" onClick={() => setModal(null)}>
                完成
              </Button>
              <Button
                variant="ghost"
                className="full-width"
                onClick={() => {
                  setModal(null);
                  setToast("预约已撤销");
                }}
              >
                撤销这笔预约
              </Button>
            </div>
          ) : (
            <>
              <div className="request-bubble">{message}</div>
              <label className="field">
                收款人
                <input
                  value={recipient}
                  readOnly={transferStep === 1}
                  onChange={(e) => setRecipient(e.target.value)}
                />
              </label>
              {transferStep === 0 && (
                <Button
                  type="button"
                  variant="secondary"
                  className="contact-picker-trigger"
                  onClick={() => setContactPickerOpen(true)}
                >
                  <ContactRound size={18} />从手机通讯录选择
                </Button>
              )}
              <div className="form-grid">
                <label className="field">
                  转账金额（元）
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={amount}
                    readOnly={transferStep === 1}
                    onChange={(e) => setAmount(e.target.value)}
                  />
                </label>
                <label className="field">
                  计划日期
                  <input
                    type="date"
                    value={transferDate}
                    readOnly={transferStep === 1}
                    onChange={(e) => setTransferDate(e.target.value)}
                  />
                </label>
              </div>
              <div className="transfer-source">
                <CreditCard size={19} />
                <span>
                  付款账户 · 常用卡 8888<small>可用余额 ¥42,300.00</small>
                </span>
                <ShieldCheck size={18} />
              </div>
              {transferError && (
                <p role="alert" className="form-error">
                  {transferError}
                </p>
              )}
              <p className="fine-print left">
                {transferStep === 0
                  ? "日期表示计划发起时间，实际到账以银行处理为准。"
                  : "确认后更新本地账户状态。"}
              </p>
              <Button
                className="full-width"
                onClick={() => {
                  if (
                    !recipient.trim() ||
                    Number(amount) < 0.01 ||
                    !Number.isFinite(Number(amount)) ||
                    !/^\d+(\.\d{1,2})?$/.test(amount) ||
                    !amount ||
                    Number(amount) > Math.min(Number(limit), 42300) ||
                    !transferDate ||
                    frozen
                  ) {
                    setTransferError(
                      frozen
                        ? "卡片已挂失，请先在卡片页面恢复。"
                        : `请填写收款人、日期，金额保留两位以内小数且不超过 ${num(Math.min(Number(limit), 42300))}。`,
                    );
                    return;
                  }
                  setTransferError("");
                  setTransferStep(transferStep + 1);
                }}
              >
                {transferStep === 0 ? "核对转账方案" : "确认模拟预约"}
                {transferStep === 1 ? (
                  <Fingerprint size={20} />
                ) : (
                  <ArrowRight size={18} />
                )}
              </Button>
              {transferStep === 1 && (
                <Button
                  className="full-width"
                  variant="ghost"
                  onClick={() => setTransferStep(0)}
                >
                  返回修改
                </Button>
              )}
            </>
          )}
        </div>
      </Dialog>
      <PhoneContactPicker
        open={contactPickerOpen}
        onOpenChange={setContactPickerOpen}
        onSelect={(nextRecipient) => {
          setRecipient(nextRecipient);
          setTransferError("");
          setToast(`已匹配${nextRecipient}的收款账户`);
        }}
      />
      <Dialog
        open={modal === "notifications"}
        onOpenChange={(open) => !open && setModal(null)}
        title="消息与待办"
        description="只把值得关注的事带给你。"
      >
        <div className="surface">
          <Row
            icon={ShieldCheck}
            title="理财风险测评"
            subtitle="进入测评并查看产品与持仓"
            onClick={() => go("risk")}
          />
          <Row
            icon={FileText}
            title="自动续费提醒"
            subtitle={enabledUpcomingSubscriptions.length
              ? `${enabledUpcomingSubscriptions.length} 项将在 ${RENEWAL_REMINDER_WINDOW_DAYS} 天内扣款`
              : subscriptionInsights.upcoming.length
                ? "你已关闭近期续费提醒"
                : subscriptionInsights.items.length ? "已识别的续费暂时都不紧急" : "连接支付账户后自动识别"}
            onClick={() => go("subscriptions")}
          />
        </div>
        <Button
          variant="secondary"
          className="full-width spaced"
          onClick={() => {
            setReadNotifications(true);
            setToast("消息已全部标为已读");
          }}
        >
          {readNotifications ? "全部已读" : "全部标为已读"}
        </Button>
      </Dialog>
      <Dialog
        open={modal === "memory"}
        onOpenChange={(open) => !open && setModal(null)}
        title="管理记忆"
        description={`${steward.name}对我的了解：明确记忆与暂定印象由你掌握。`}
      >
        <MemoryManager memory={memory}/>
      </Dialog>
      <Dialog
        open={modal === "privacy"}
        onOpenChange={(open) => !open && setModal(null)}
        title="隐私与授权"
        description="管理知银如何使用你的数据与提醒。"
      >
        <div className="surface">
          <Row
            icon={Link2}
            title="数据连接"
            subtitle={
              Object.keys(connections).length
                ? `已连接 ${Object.keys(connections).length} 个支付账户`
                : "连接或管理第三方支付账户"
            }
            onClick={() => {
              setModal(null);
              go("authorization");
            }}
          />
          <Row
            icon={Bell}
            title="事项提醒"
            subtitle="接收还款、订阅等事项提醒"
            end={
              <Switch
                label="事项提醒"
                checked={privacy.notifications}
                onCheckedChange={(v) =>
                  setPrivacy({ ...privacy, notifications: v })
                }
              />
            }
          />
          <Row
            icon={PieChart}
            title="个性化分析"
            subtitle="允许基于偏好调整分析展示"
            end={
              <Switch
                label="个性化分析"
                checked={privacy.analytics}
                onCheckedChange={(v) =>
                  setPrivacy({ ...privacy, analytics: v })
                }
              />
            }
          />
        </div>
        <p className="dialog-body-copy">
          支付账户采用只读授权，不包含付款能力。长期记忆保存在本机沙箱后端；聊天记录和部分业务设置保存在当前浏览器中。
        </p>
      </Dialog>
      <Dialog
        open={modal === "limit"}
        onOpenChange={(open) => !open && setModal(null)}
        title="调整单笔支付限额"
        description="设置一个适合日常使用的金额。"
      >
        <label className="field">
          单笔限额（元）
          <input
            type="number"
            min="100"
            max="50000"
            step="100"
            value={draftLimit}
            onChange={(e) => setDraftLimit(e.target.value)}
          />
        </label>
        <p className="fine-print left">可设置范围：¥100 — ¥50,000</p>
        {bank.error&&<p role="alert">{bank.error}</p>}
        <Button
          className="full-width"
          disabled={!bank.state || bank.busy || Number(draftLimit) < 100 || Number(draftLimit) > 50000}
          onClick={async() => {
            if(await bank.change({limit:Math.round(Number(draftLimit)*100)})){setModal(null);setToast("单笔限额已更新");recordCardAction(`单笔限额已调整为 ${num(Number(draftLimit))}`);}
          }}
        >
          确认调整
        </Button>
      </Dialog>
      <Dialog
        open={modal === "freeze"}
        onOpenChange={(open) => !open && setModal(null)}
        title="确认挂失这张卡？"
        description="常用卡 · 尾号 8888"
      >
        {bank.error&&<p role="alert">{bank.error}</p>}
        <div className="warning-box">
          <CircleAlert size={22} />
          <p>挂失后，此卡将无法支付或取现。请确认你要操作的卡片。</p>
        </div>
        <div className="form-grid">
          <Button variant="secondary" onClick={() => setModal(null)}>
            暂不挂失
          </Button>
          <Button
            variant="danger"
            disabled={bank.busy || !bank.state}
            onClick={async() => {
              if(await bank.change({frozen:true})){setModal(null);setToast("卡片已挂失");recordCardAction('卡片已挂失');}
            }}
          >
            确认模拟挂失
          </Button>
        </div>
      </Dialog>
      <Dialog
        open={modal === "unfreeze"}
        onOpenChange={(open) => !open && setModal(null)}
        title="确认恢复这张卡？"
        description="恢复后支付与转账能力将重新开启"
      >
        <div className="warning-box"><CircleAlert size={22}/><p>请确认卡片已找回且近期交易无异常。</p></div>
        <div className="form-grid"><Button variant="secondary" onClick={()=>setModal(null)}>暂不恢复</Button><Button disabled={bank.busy} onClick={async()=>{if(await bank.change({frozen:false})){setModal(null);setToast("卡片已恢复");recordCardAction('卡片已恢复');}}}>确认恢复卡片</Button></div>
      </Dialog>
      <Dialog
        open={modal === "cardControl"}
        onOpenChange={(open) => {if(!open){setModal(null);setPendingControl(null);}}}
        title={`确认${pendingControl?.enabled?'开启':'关闭'}${pendingControl?.title||'支付功能'}？`}
        description="请核对变更前后状态和支付影响"
      >
        <div className="warning-box"><ShieldCheck size={22}/><p>{pendingControl?.title}：当前{pendingControl&&controls[pendingControl.key]?'开启':'关闭'} → 拟{pendingControl?.enabled?'开启':'关闭'}。关闭境外交易将拦截境外渠道付款；夜间保护与无卡支付也会按设置限制付款。</p></div>
        <div className="form-grid"><Button variant="secondary" onClick={()=>{setModal(null);setPendingControl(null);}}>取消</Button><Button disabled={bank.busy||!pendingControl} onClick={async()=>{if(!pendingControl)return;const {title,key,enabled}=pendingControl;if(await bank.change({controls:{...controls,[key]:enabled}})){setModal(null);setPendingControl(null);const text=`${title}已${enabled?'开启':'关闭'}`;setToast(text);recordCardAction(text);}}}>确认{pendingControl?.enabled?'开启':'关闭'}</Button></div>
      </Dialog>
      <Dialog
        open={modal === "help"}
        onOpenChange={(open) => !open && setModal(null)}
        title="可以帮你做什么"
        description="不用找菜单，先告诉我你想做什么。"
      >
        <StewardGuide stewardName={steward.name} onChoose={prompt=>{
          if(mode==='native'){setChatDraft(prompt);if(elderMode)setElderChatOpen(true);}
          else setInput(current=>current.trim()?`${current}；${prompt}`:prompt);
          go('home');
        }}/>
      </Dialog>
      <Dialog
        open={modal === "voice"}
        onOpenChange={(open) => !open && setModal(null)}
        title={`和${steward.name}语音对话`}
        description="连续语音在 AI 原生模式可用。模式选择仍在设置中，方案与核对入口留在同一首页。"
      >
        <div className="voice-demo">
          <Mic size={32} />
          <p>在设置中选择 AI 原生模式，回到首页点输入框旁的麦克风。开启前会说明录音与处理方式。</p>
          <Button
            className="full-width"
            onClick={() => {
              setModal(null);
              go('settings');
            }}
          >
            打开设置
          </Button>
        </div>
      </Dialog>
      <Dialog
        open={modal === "attach"}
        onOpenChange={(open) => !open && setModal(null)}
        title="添加账单"
        description="本地选择界面演示，文件不会上传或解析。"
      >
        <label className="upload-zone">
          <FileText size={32} />
          <strong>选择账单文件</strong>
          <span>支持 CSV、PDF</span>
          <input
            type="file"
            accept=".csv,.pdf"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                setAttachment(file.name);
                setModal(null);
                setToast("已选择文件，此原型不会上传或读取内容");
              }
            }}
          />
        </label>
      </Dialog>
      <Dialog open={!!cardTransfer} onOpenChange={open=>{if(!open)setCardTransfer(null);}} title="智能转账" description={`${bankCards.find(card=>card.id===cardTransfer?.cardId)?.name??''} · 尾号 ${bankCards.find(card=>card.id===cardTransfer?.cardId)?.last4??''}`}>
        {cardTransfer&&<SmartTransfers key={cardTransfer.cardId} cardId={cardTransfer.cardId} initial={cardTransfer.initial} onDone={()=>{void bank.refresh();}}/>}
      </Dialog>
      <Dialog open={!!bankIntent} onOpenChange={open=>{if(!open)setBankIntent(null);}} title="智能转账" description="转账、预约和AA收款 · 常用卡8888">
        {bankIntent&&<SmartTransfers initial={bankIntent} onDone={setBankReceipt}/>}
      </Dialog>
    </div>
  );
}
