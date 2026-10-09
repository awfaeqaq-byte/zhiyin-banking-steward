import { useEffect, useMemo, useState, type ReactNode, type FormEvent } from "react";
import {useStewardMemory} from './lib/use-steward-memory';
import {MemoryManager} from './components/memory-manager';
import {useBankAccount} from './lib/use-bank-account';
import {SmartTransfers,type SmartIntent} from './components/smart-transfers';
import {bankRecipients,type BankReceipt} from './lib/bank-transfer';
import {money as bankMoney} from './lib/native-banking';
import {
  ArrowLeft,
  ArrowRight,
  ArrowRightLeft,
  Bell,
  BellRing,
  Check,
  CheckCheck,
  CheckCircle2,
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
  LockKeyhole,
  MessageCircle,
  Mic,
  Moon,
  PieChart,
  Plane,
  Plus,
  Send,
  Settings2,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
  UserRound,
  Users,
  Wallet,
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
import { StewardWorkspaces } from "./components/steward-workspaces";
import { WealthOperationMvp } from "./components/wealth-operation-mvp";
import { BillReports } from "./components/bill-reports";
import { CardApplicationPanel } from "./components/card-application";
import {OverseasPaymentDemo} from './components/overseas-payment-demo';
import {parseCardIntent} from './lib/card-intent';
import { AgentAutomationCenter } from "./components/agent-automation-center";
import { FinancialFocusRules } from "./components/financial-focus-rules";
import { FundingInsights } from "./components/funding-insights";
import {automationServerRequest,automationTemplates,type AutomationRun,type AutomationServerSnapshot} from './lib/agent-automations';
import { type DuplicatePreferences, type DuplicateDecision } from "./lib/subscription-insights";
import { fundingReferenceTime } from "./lib/funding-forecast";
import { FundingPlan } from "./components/funding-plan";
import {TaskCalendar} from './components/task-calendar';
import {GroupAA} from './components/group-aa';
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
  | "spending"
  | "plan"
  | "risk"
  | "cards"
  | "profile"
  | "settings"
  | "connections"
  | "funding"
  | "tasks"
  | "group-aa"
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
      {end || <ChevronRight size={18} aria-hidden="true" />}
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
  const [mode, setMode] = useState<"classic" | "native">(() =>
    read<string>("zhiyin-mode", "classic") === "native" ? "native" : "classic",
  );
  const [page, setPage] = useState<Page>("home");
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
  const [automationSnapshot,setAutomationSnapshot]=useState<AutomationServerSnapshot>(emptyAutomationSnapshot);
  const [transferStep, setTransferStep] = useState(0);
  const [amount, setAmount] = useState("2000");
  const [recipient, setRecipient] = useState("妈妈");
  const [contactPickerOpen, setContactPickerOpen] = useState(false);
  const [transferDate, setTransferDate] = useState("2026-09-18");
  const [transferError, setTransferError] = useState("");
  const [savedPlan, setSavedPlan] = useState(false);
  const [readNotifications, setReadNotifications] = useState(false);
  const bank=useBankAccount();
  const frozen=bank.state?.frozen ?? false;
  const controls=useMemo(()=>bank.state?.controls || {overseas:false,contactless:true,night:true},[bank.state]);
  const [bankIntent,setBankIntent]=useState<SmartIntent|null>(null);
  const [taskDraft,setTaskDraft]=useState<ReminderDraft|null>(null);
  const [taskDate,setTaskDate]=useState<number>();
  const [bankReceipt,setBankReceipt]=useState<BankReceipt|null>(null);
  const memory=useStewardMemory();
  const limit=String((bank.state?.limit ?? 2000000)/100);
  const [draftLimit, setDraftLimit] = useState(limit);
  const [pendingControl,setPendingControl]=useState<{key:'overseas'|'contactless'|'night';title:string;enabled:boolean}|null>(null);
  const [lastCardAction,setLastCardAction]=useState<string>(()=>read('zhiyin-last-card-action',''));
  function recordCardAction(text:string){const value=`${text} · ${new Date().toLocaleString('zh-CN')}`;setLastCardAction(value);save('zhiyin-last-card-action',value);}
  const [investment, setInvestment] = useState("30000");
  const [term, setTerm] = useState("12");
  const [detailPlan, setDetailPlan] = useState(false);
  const [speak, setSpeak] = useState<StewardId | null>(null);
  const [attachment, setAttachment] = useState("");
  const [privacy, setPrivacy] = useState({
    notifications: true,
    analytics: false,
  });
  const {
    connections, setConnections, refresh: refreshSubscriptions,
    refreshing: subscriptionsRefreshing, error: subscriptionRefreshError,
    setError: setSubscriptionRefreshError,
  } = useSubscriptionSync(() => read("zhiyin-connections", {}));
  const [disabledSubscriptionReminders, setDisabledSubscriptionReminders] = useState<string[]>(
    () => read("zhiyin-disabled-subscription-reminders", []),
  );
  const [subscriptionActionTarget, setSubscriptionActionTarget] = useState<string | null>(null);
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
    save("zhiyin-mode", mode);
  }, [mode]);
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
    if (next !== page) setPageHistory((history) => [...history, page]);
    setPage(next);
    setModal(null);
    document.querySelector(".workspace")?.scrollTo({ top: 0 });
    window.scrollTo({ top: 0 });
  }
  function goBack() {
    setPage(pageHistory.at(-1) || "home");
    setPageHistory((history) => history.slice(0, -1));
    setModal(null);
    window.scrollTo({ top: 0 });
    document.querySelector(".workspace")?.scrollTo({ top: 0 });
  }
  function openCardIntent(instruction?:string){
    const intent=instruction?parseCardIntent(instruction):null;
    go('cards');
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
    return false;
  });
  usePhoneBridge();
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
    page === "profile" || page === "settings" || page === "connections" || page === "subscriptions" || page === "cards"
      ? "profile"
      : ["assets", "funding"].includes(page)
        ? "assets"
        : "home";
  const balance = hidden ? "¥ •••,•••.••" : bank.state ? bankMoney(24424032+bank.state.balance) : "待读取";
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
  function Note({ children }: { children: ReactNode }) {
    return (
      <div className="steward-note">
        <Avatar size="small" />
        <div>
          <strong>
            {steward.name}
            <span>的贴心提示</span>
          </strong>
          <p>{children}</p>
        </div>
      </div>
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
  function BankCard() {
    return (
      <button
        className={`bank-card ${frozen ? "frozen" : ""}`}
        onClick={() => go("cards")}
        aria-label="查看常用卡 8888"
      >
        <div className="bank-card-top">
          <span>
            <Landmark size={23} />
            知银 · 演示账户
          </span>
          <span>储蓄卡</span>
        </div>
        <div className="card-chip">
          <span />
          <span />
        </div>
        <div className="card-number">
          •••• &nbsp; •••• &nbsp; •••• &nbsp; 8888
        </div>
        <div className="bank-card-bottom">
          <span>叶先生</span>
          <span>
            {frozen ? "已挂失" : "常用账户"} <ArrowUpRightIcon />
          </span>
        </div>
        <div className="card-rings" aria-hidden="true" />
      </button>
    );
  }
  function ArrowUpRightIcon() {
    return (
      <ArrowRight size={15} className="diagonal-arrow" aria-hidden="true" />
    );
  }
  return (
    <div className={`app-shell mode-${mode} ${mode === "native" && page === "home" ? "native-chat-shell" : ""}`}>
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
          自动任务
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
            交互演示 · 虚拟账户
          </div>
        </div>
      </aside>
      <div className="workspace">
        {page === "home" && (
          <header className={`topbar ${mode === "native" ? "fixed-chat-header" : ""}`}>
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
                    className="native-header-link"
                    onClick={() => go("assets")}
                  >
                    资产
                  </button>
                  <button
                    className="native-header-link"
                    onClick={() => go("plan")}
                  >
                    资金规划
                  </button>
                  <button
                    className="native-header-link"
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
          className={`main-content page-${page} ${page === "home" ? "home-content" : "is-detail-page"}`}
        >
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
                        整体稳健 <span className="subtle-divider">/</span>{" "}
                        常用卡 8888
                      </span>
                      <button onClick={() => go("assets")}>
                        查看资产 <ArrowRight size={17} />
                      </button>
                    </div>
                  </section>
                  <section className="quick-section">
                    <h2>
                      从一件小事开始<span>你可以这样问</span>
                    </h2>
                    <div className="quick-actions">
                      <Row
                        icon={ArrowRightLeft}
                        title="给妈妈转 2000 元，下周五到账"
                        subtitle="转账与付款"
                        onClick={() => openTransfer()}
                      />
                      <Row
                        icon={PieChart}
                        title="分析这个月的钱花在哪"
                        subtitle="消费分析"
                        onClick={() => go("spending")}
                      />
                      <Row
                        icon={TrendingUp}
                        title="帮我选一个稳妥的理财方案"
                        subtitle="个性化规划"
                        onClick={() => go("plan")}
                      />
                      <Row
                        icon={CalendarDays}
                        title="定时分析账单与理财情况"
                        subtitle="定时任务"
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
              <Heading title="我的资产" subtitle="每一笔，都心中有数" />
              <div className="detail-grid assets-layout">
                <div>
                  <section className="account-summary asset-overview" aria-label="演示账户资产概览">
                    <div className="section-line">
                      <span>总资产（元）<span className="asset-demo-label">演示账户</span></span>
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
                        整体稳健
                      </span>
                      <span>银行余额来自沙箱账本</span>
                    </div>
                  </section>
                  <button className="asset-funding-entry" onClick={() => go("funding")}>
                    <CalendarDays size={20} aria-hidden="true" />
                    <span><strong>近期资金安排</strong><small>微信、支付宝余额能否覆盖续费？</small></span>
                    <ArrowRight size={18} aria-hidden="true" />
                  </button>
                  <h2 className="section-title">资产分布</h2>
                  <div className="surface asset-distribution">
                    <Row
                      icon={Wallet}
                      title="活期与现金"
                      subtitle="随时可用，灵活安排"
                      end={<strong>{hidden ? "••••" : bank.state ? num(bank.state.balance/100) : "待读取"}</strong>}
                    />
                    <Row
                      icon={TrendingUp}
                      title="理财资产"
                      subtitle="偏稳健 · 3 项持有"
                      onClick={() => go("plan")}
                      end={<strong>{hidden ? "••••" : "¥184,240.32"}</strong>}
                    />
                    <Row
                      icon={LockKeyhole}
                      title="定期存款"
                      subtitle="下次到期 2026年12月"
                      end={<strong>{hidden ? "••••" : "¥60,000.00"}</strong>}
                    />
                  </div>
                </div>
                <div>
                  <h2 className="section-title">分析与规划</h2>
                  <div className="surface">
                    <Row
                      icon={PieChart}
                      title="授权账单报告"
                      subtitle="查看月度、年度收支与分类"
                      onClick={() => go("spending")}
                    />
                    <Row
                      icon={ShieldCheck}
                      title="理财风险测评与持仓"
                      subtitle="核对适当性、产品和沙箱持仓"
                      onClick={() => go("risk")}
                    />
                    <Row
                      icon={CalendarDays}
                      title="自动任务"
                      subtitle="账单月报 · 理财周检 · 异常复核"
                      onClick={() => go("automations")}
                    />
                  </div>
                </div>
              </div>
            </>
          )}
          {page === "spending" && (
            <>
              <Heading title="我的账单" subtitle="按授权账单生成月度与年度报告" />
              <BillReports connections={connections} onConnect={() => go("connections")} />
            </>
          )}
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
                onAsk={(prompt) => { setChatDraft(prompt); go("home"); }}
              />
              <div className="detail-grid">
                <div>
                  <div className="plan-inputs">
                    <label>
                      计划投入（元）
                      <input
                        type="number"
                        min="1000"
                        max="1000000"
                        value={investment}
                        onChange={(e) => setInvestment(e.target.value)}
                      />
                    </label>
                    <label>
                      计划持有
                      <select
                        value={term}
                        onChange={(e) => setTerm(e.target.value)}
                        aria-label="计划持有时间"
                      >
                        <option value="6">6 个月</option>
                        <option value="12">12 个月</option>
                        <option value="24">24 个月</option>
                      </select>
                    </label>
                  </div>
                  <h2 className="section-title">资产配置建议</h2>
                  <div className="surface allocation-panel">
                    <div className="allocation-bar">
                      <span style={{ flex: 30 }} />
                      <span style={{ flex: 50 }} />
                      <span className="neutral-segment" style={{ flex: 20 }} />
                    </div>
                    <div className="legend three">
                      {["现金管理", "固收理财", "低波动基金"].map((c, i) => (
                        <div key={c}>
                          <span>
                            <i className={`dot-${i === 2 ? 3 : i}`} />
                            {c}
                          </span>
                          <strong>{[30, 50, 20][i]}%</strong>
                          <small>
                            {num(
                              Math.max(0, Number(investment)) *
                                [0.3, 0.5, 0.2][i],
                            )}
                          </small>
                        </div>
                      ))}
                    </div>
                    <p className="fine-print">
                      资产配置为演示方案，不代表收益承诺。
                    </p>
                  </div>
                  <Note>
                    {stewardId === "ningning"
                      ? "这份演示方案先保留一部分灵活资金；若有大额支出计划，还需增加留存。"
                      : "这套演示配置保留了 30% 的流动性，尚未使用未经确认的个人偏好。"}
                    {term === "6"
                      ? "持有时间较短，优先确认产品赎回规则。"
                      : "稳健的规划，也要给生活留一点余地。"}
                  </Note>
                </div>
                <div className="surface plan-reasons">
                  <Row
                    icon={ShieldCheck}
                    title="风险等级"
                    end={<span className="pill">待本次确认</span>}
                  />
                  <Row
                    icon={Target}
                    title="你的目标"
                    end={<strong>稳健增值</strong>}
                  />
                  <div className="reason-content">
                    <h3>为什么这样安排</h3>
                    <ol>
                      <li>投入金额和持有期限以你上方填写的条件为准。</li>
                      <li>大额支出计划尚未确认，暂优先保留流动性。</li>
                      <li>风险承受范围由你在下方本次主动选择。</li>
                    </ol>
                    {detailPlan && (
                      <div className="expanded-plan">
                        <h3>执行前还需要确认</h3>
                        <p>
                          核对产品风险揭示、持有期限和赎回规则。实际申购前，仍需完成风险测评和本人授权。
                        </p>
                        <p>
                          建议每月复盘一次；大额支出计划变化时，重新评估配置。
                        </p>
                      </div>
                    )}
                  </div>
                  <Button
                    className="full-width"
                    onClick={() => setDetailPlan(!detailPlan)}
                  >
                    {detailPlan ? "收起方案详情" : "查看完整方案"}
                    <ChevronDown size={17} />
                  </Button>
                  <Button
                    variant="ghost"
                    className="full-width"
                    onClick={() => {
                      setSavedPlan(true);
                      setToast("方案已收藏，可在“我的”中查看");
                    }}
                  >
                    {savedPlan ? "已收藏这份方案" : "收藏这份方案"}
                  </Button>
                  <WealthOperationMvp amount={investment} term={term} availableBalance={bank.state?.balance} />
                </div>
              </div>
            </>
          )}
          {page === "risk" && (
            <>
              <Heading title="理财风险测评与持仓" subtitle="根据本人答题与沙箱状态核对产品和操作" />
              <WealthOperationMvp amount={investment} term={term} availableBalance={bank.state?.balance} />
            </>
          )}
          {page === "cards" && (
            <>
              <Heading
                title="常用卡 · 8888"
                subtitle="每一项权限，都由你掌握"
              />
              <div className="detail-grid">
                <div>
                  <BankCard />
                  <div className="card-status">
                    <ShieldCheck size={19} />
                    <span>
                      {!bank.state?'账户状态待读取':frozen
                        ? "此演示卡已挂失，支付功能已关闭"
                        : "卡片状态正常，安全保护已开启"}
                    </span>
                  </div>
                  <section className="surface bank-ledger" aria-label="银行卡余额与流水">
                    <div className="section-line"><h3>可用余额</h3><button className="text-link" onClick={()=>void bank.refresh()}>刷新账户</button></div>
                    <strong>{bank.state?bankMoney(bank.state.balance):'等待读取账户'}</strong>
                    <Button disabled={!bank.state || bank.busy} onClick={()=>setBankIntent({recipientId:'mom',amount:0})}>智能转账与AA收款</Button>
                    {bank.error&&<p role="alert">{bank.error}</p>}
                    <h3>银行转账账单</h3>
                    {!!bank.state?.collections?.length&&<div className="bank-ledger-list">{[...bank.state.collections].reverse().map(c=><details key={c.id}><summary><span>AA收款 · {bankRecipients.find(r=>r.id===c.recipientId)?.name}<small>{new Date(c.completedAt).toLocaleString('zh-CN')}</small></span><strong>+{bankMoney(c.amount)}</strong></summary><p>已到账 · 常用卡8888 · 入账后余额 {bankMoney(c.balanceAfter)}</p><small>回执 {c.id}</small></details>)}</div>}
                    {bank.state?.transactions.length?<div className="bank-ledger-list">{[...bank.state.transactions].reverse().map(t=><details key={t.id}><summary><span>转给{bankRecipients.find(r=>r.id===t.recipientId)?.name}<small>{new Date(t.completedAt).toLocaleString('zh-CN')}</small></span><strong>−{bankMoney(t.amount)}</strong></summary><p>已完成 · 付款卡8888 · 收款尾号{bankRecipients.find(r=>r.id===t.recipientId)?.accountLast4}</p><p>交易后余额 {bankMoney(t.balanceAfter)}</p><small>回执 {t.id}</small></details>)}</div>:<p className="fine-print left">尚无银行沙箱转账记录。</p>}
                    {!!bank.state?.payments?.length&&<div className="bank-ledger-list">{[...bank.state.payments].reverse().map(p=><details key={p.id}><summary><span>{p.merchant}<small>{p.channel==='wechat'?'微信支付':p.channel==='alipay'?'支付宝':'境外沙箱支付'} · {new Date(p.completedAt).toLocaleString('zh-CN')}</small></span><strong>−{bankMoney(p.amount)}</strong></summary><p>付款卡8888 · 交易后余额 {bankMoney(p.balanceAfter)}</p>{p.refundedAt!==undefined&&<p>已原路退款 +{bankMoney(p.amount)} · {new Date(p.refundedAt).toLocaleString('zh-CN')}</p>}<small>{p.channel==='overseas'?'沙箱交易回执':'关联订单'} {p.id}</small></details>)}</div>}
                  </section>
                  <div className="explanation">
                    <h3>用卡小贴士</h3>
                    <p>
                      不常使用的交易方式可以随时关闭。若发现卡片遗失，请立即挂失，并核对近期交易。
                    </p>
                  </div>
                </div>
                <div>
                  <section className="surface card-settings">
                    <Row
                      icon={CreditCard}
                      title="单笔支付限额"
                      subtitle={num(Number(limit))}
                      onClick={() => {
                        setDraftLimit(limit);
                        setModal("limit");
                      }}
                    />
                    {(
                      [
                        { key: "overseas", title: "境外交易", icon: Plane },
                        { key: "contactless", title: "无卡支付", icon: Wallet },
                        { key: "night", title: "夜间保护", icon: Moon },
                      ] as const
                    ).map((item) => (
                      <Row
                        key={item.key}
                        icon={item.icon}
                        title={item.title}
                        subtitle={
                          item.key === "night" && controls.night
                            ? "23:00 — 06:00"
                            : controls[item.key]
                              ? "已开启"
                              : "已关闭"
                        }
                        end={
                          <Switch
                            label={item.title}
                            checked={controls[item.key]}
                            disabled={!bank.state || bank.busy}
                            onCheckedChange={async(value) => {
                              setPendingControl({key:item.key,title:item.title,enabled:value});setModal('cardControl');
                            }}
                          />
                        }
                      />
                    ))}
                  </section>
                  <OverseasPaymentDemo bank={bank.state} onRefresh={bank.refresh}/>
                  <Button
                    variant="danger"
                    className="full-width spaced"
                    disabled={frozen || !bank.state || bank.busy}
                    onClick={() => setModal("freeze")}
                  >
                    <CircleAlert size={19} />
                    {frozen ? "此卡已挂失" : "挂失这张卡"}
                  </Button>
                  {frozen && (
                    <Button
                      variant="secondary"
                      className="full-width spaced"
                      disabled={bank.busy}
                      onClick={() => setModal("unfreeze")}
                    >
                      恢复演示卡（仅用于重新体验）
                    </Button>
                  )}
                  <p className="fine-print">
                    设置保存到银行沙箱。挂失、单笔限额、夜间保护和无卡支付会拦截相应付款；境外交易开关会拦截上方的境外沙箱渠道。不影响真实银行账户。
                  </p>
                  {lastCardAction&&<div className="card-action-receipt" role="status"><CheckCircle2 size={18}/><span><strong>最近卡片变更</strong><small>{lastCardAction}</small></span></div>}
                  <CardApplicationPanel bank={bank.state} onRefresh={bank.refresh}/>
                </div>
              </div>
            </>
          )}
          {page === "profile" && (
            <>
              <Heading title="我的" subtitle="熟悉你的习惯，也尊重你的边界" />
              <div className="profile-layout">
                <section className="surface profile-identity" aria-label="个人资料与私人管家">
                  <div className="profile-person">
                    <span className="user-avatar"><UserRound size={28} aria-hidden="true" /></span>
                    <div><h2>叶先生</h2><p>手机 138 **** 6688</p></div>
                    <span className="pill">演示用户</span>
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
                  <h2 id="profile-services-title" className="section-title">由你来管理</h2>
                  <div className="surface">
                    <Row icon={CreditCard} title="银行卡与安全"
                      subtitle={!bank.state?'账户状态待读取':frozen?'常用卡 8888 · 已挂失':'常用卡 8888 · 状态正常'}
                      onClick={() => go("cards")} />
                    <Row icon={FileText} title="我的账单"
                      subtitle="全部流水 · 分类 · 商户与时间"
                      onClick={() => go("spending")} />
                    <Row icon={Link2} title="数据连接"
                      subtitle={Object.keys(connections).length
                        ? `已连接 ${Object.keys(connections).length} 个支付账户`
                        : "连接微信支付、支付宝"}
                      onClick={() => go("connections")} />
                    <Row icon={CalendarDays} title="订阅与续费"
                      subtitle={subscriptionInsights.items.length
                        ? `已识别 ${subscriptionInsights.items.length} 项自动续费`
                        : "自动识别、提醒与取消"}
                      onClick={() => go("subscriptions")} />
                    <Row icon={CalendarDays} title="任务日历" subtitle="提醒、预约转账与续费安排" onClick={()=>go('tasks')}/>
                    <Row icon={Users} title="微信群智能AA" subtitle="选择群成员，按费用灵活分摊" onClick={()=>go('group-aa')}/>
                    <Row icon={CalendarDays} title="定时任务"
                      subtitle="月报 · 周检 · 异常复核"
                      onClick={() => go("automations")} />
                    <Row icon={Settings2} title="设置"
                      subtitle={`使用模式 · ${mode === "classic" ? "经典款" : "AI 原生"}`}
                      onClick={() => go("settings")} />
                  </div>
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
                    <Row icon={ShieldCheck} title="隐私与授权" subtitle="你始终拥有数据的控制权"
                      onClick={() => setModal("privacy")} />
                    <Row icon={FileText} title="我的收藏方案" subtitle={savedPlan ? "1 份方案" : "暂未收藏"}
                      onClick={() => savedPlan ? go("plan") : setToast("还没有收藏，先去看看为你准备的理财方案吧")} />
                    <Row icon={CircleHelp} title="帮助与使用指南" onClick={() => setModal("help")} />
                  </div>
                </section>
              </div>
              <div className="profile-brand">
                <Landmark size={22} aria-hidden="true" />
                <strong>知银</strong>
                <span>知你所需，认真对待每一笔。</span>
                <small>交互原型 v0.1 · 所有账户数据均为演示</small>
              </div>
            </>
          )}
          {page === "settings" && (
            <>
              <Heading title="设置" subtitle="选择适合你的使用方式" />
              <div className="settings-content">
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
                      className={`mode-option ${mode === value ? "selected" : ""}`}
                    >
                      <input
                        type="radio"
                        name="usage-mode"
                        value={value}
                        checked={mode === value}
                        aria-describedby="mode-help"
                        onChange={() => {
                          setMode(value);
                          setToast(`已切换为${title}，返回首页即可体验`);
                        }}
                      />
                      <span>
                        <strong>{title}</strong>
                        <small>{description}</small>
                      </span>
                      {mode === value && <Check size={19} aria-hidden="true" />}
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
                      onClick={() => go("connections")}
                    />
                  </div>
                </section>
              </div>
            </>
          )}
          {page === "connections" && (
            <>
              <Heading
                title="数据连接"
                subtitle="把分散的资金信息，放回同一张图里"
              />
              <DataConnections
                connections={connections}
                onConnect={connectFinancialSource}
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
                onConnect={() => go("connections")}
                selectedKey={subscriptionActionTarget}
                onSelectionConsumed={() => setSubscriptionActionTarget(null)}
              />
            </>
          )}
          {page === 'tasks' && <><Heading title="任务日历"/><TaskCalendar initialDate={taskDate} schedules={bank.state?.schedules??[]} sources={Object.values(connections).filter((s):s is NonNullable<typeof s>=>!!s)} bankError={bank.error} sourceError={subscriptionRefreshError} draft={taskDraft} onDraftConsumed={()=>setTaskDraft(null)} onOpenTransfers={()=>setBankIntent({kind:'records'})} onOpenSubscription={(source,id)=>{setSubscriptionActionTarget(`${source}:${id}`);go('subscriptions');}}/></>}
          {page === 'group-aa' && <><Heading title="微信群智能AA"/><GroupAA/></>}
          {page === "funding" && (
            <>
              <Heading title="近期资金安排" subtitle="分开核对每个账户，留足接下来的续费" />
              <FundingPlan connections={connections} refreshing={subscriptionsRefreshing}
                refreshError={subscriptionRefreshError} onRefresh={refreshSubscriptions}
                onConnect={() => go("connections")} onOpenSubscriptions={() => go("subscriptions")} />
            </>
          )}
          {page === "automations" && (
            <>
              <Heading title="定时任务" subtitle={`由${steward.name}按时检查，发现变化后再请你决定`} />
              <FinancialFocusRules stewardName={steward.name} />
              <AgentAutomationCenter stewardName={steward.name} connections={connections} availableBalance={bank.state?.balance}
                onOpenBills={() => go("spending")} onOpenWealth={() => go("plan")} onOpenCards={() => go("cards")}
                onSnapshotChange={setAutomationSnapshot}
                onDiscussRun={(run:AutomationRun)=>{
                  setChatDraft(`我想继续了解“${automationTemplates[run.kind].title}”：${run.summary.replace(/[。；;]+$/,'')}。请结合这次检查的依据，告诉我最需要先处理什么。`);
                  go('home');
                }} />
            </>
          )}
          {mode === "native" && page === "home" && (
            <StewardWorkspaces
              memory={memory}
              duplicatePreferences={duplicatePreferences}
              onDuplicatePreference={changeDuplicatePreference}
              stewardName={steward.name}
              stewardImage={steward.image}
              connections={connections}
              disabledReminders={disabledSubscriptionReminders}
              recurringReviews={recurringReviews}
              refreshSubscriptions={refreshSubscriptions}
              refreshError={subscriptionRefreshError}
              refreshing={subscriptionsRefreshing}
              onToggleReminder={toggleSubscriptionReminder}
              onOpenSubscriptions={() => go("subscriptions")}
              onOpenFunding={() => go("funding")}
              onOpenTasks={date=>{setTaskDate(date);go('tasks');}}
              onOpenGroupAA={()=>go('group-aa')}
              onPrepareTask={draft=>{setTaskDraft(draft);go('tasks');}}
              onOpenWealth={() => go("plan")}
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
                : "账户与操作均为演示，你可以放心体验"}
            </span>
          </div>
        )}
        <nav
          className="bottom-nav"
          aria-label="主导航"
          hidden={mode === "native"}
        >
          {nav.map(({ page: p, label, icon: Icon }) => (
            <button
              aria-current={activeNav === p ? "page" : undefined}
              key={p}
              className={activeNav === p ? "active" : ""}
              onClick={() => go(p)}
            >
              <span>
                <Icon size={23} />
              </span>
              {label}
            </button>
          ))}
        </nav>
      </div>
      {toast && (
        <div className="toast" role="status">
          <Check size={18} />
          {toast}
          <button
            className="icon-control"
            aria-label="关闭提示"
            onClick={() => setToast("")}
          >
            <X size={15} />
          </button>
        </div>
      )}
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
            ? "演示流程已完成，未发生真实扣款。"
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
                  setToast("预约已撤销（演示）");
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
                  : "确认后仅更新本地演示状态，不会连接银行。"}
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
                        ? "演示卡已挂失，请先在银行卡页面恢复。"
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
          setToast(`已匹配${nextRecipient}的演示收款账户`);
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
              go("connections");
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
        <p className="fine-print left">演示可选范围：¥100 — ¥50,000</p>
        {bank.error&&<p role="alert">{bank.error}</p>}
        <Button
          className="full-width"
          disabled={!bank.state || bank.busy || Number(draftLimit) < 100 || Number(draftLimit) > 50000}
          onClick={async() => {
            if(await bank.change({limit:Math.round(Number(draftLimit)*100)})){setModal(null);setToast("单笔限额已更新（银行沙箱）");recordCardAction(`单笔限额已调整为 ${num(Number(draftLimit))}`);}
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
              if(await bank.change({frozen:true})){setModal(null);setToast("演示卡已挂失");recordCardAction('演示卡已挂失');}
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
        description="恢复后沙箱支付与转账能力将重新开启"
      >
        <div className="warning-box"><CircleAlert size={22}/><p>请确认卡片已找回且近期交易无异常。</p></div>
        <div className="form-grid"><Button variant="secondary" onClick={()=>setModal(null)}>暂不恢复</Button><Button disabled={bank.busy} onClick={async()=>{if(await bank.change({frozen:false})){setModal(null);setToast("沙箱卡已恢复，可以重新体验转账流程");recordCardAction('演示卡已恢复');}}}>确认恢复演示卡</Button></div>
      </Dialog>
      <Dialog
        open={modal === "cardControl"}
        onOpenChange={(open) => {if(!open){setModal(null);setPendingControl(null);}}}
        title={`确认${pendingControl?.enabled?'开启':'关闭'}${pendingControl?.title||'支付功能'}？`}
        description="请核对变更前后状态和支付影响"
      >
        <div className="warning-box"><ShieldCheck size={22}/><p>{pendingControl?.title}：当前{pendingControl&&controls[pendingControl.key]?'开启':'关闭'} → 拟{pendingControl?.enabled?'开启':'关闭'}。夜间保护与无卡支付会影响沙箱付款；境外交易目前仅保存偏好。</p></div>
        <div className="form-grid"><Button variant="secondary" onClick={()=>{setModal(null);setPendingControl(null);}}>取消</Button><Button disabled={bank.busy||!pendingControl} onClick={async()=>{if(!pendingControl)return;const {title,key,enabled}=pendingControl;if(await bank.change({controls:{...controls,[key]:enabled}})){setModal(null);setPendingControl(null);const text=`${title}已${enabled?'开启':'关闭'}（银行沙箱）`;setToast(text);recordCardAction(text);}}}>确认{pendingControl?.enabled?'开启':'关闭'}</Button></div>
      </Dialog>
      <Dialog
        open={modal === "help"}
        onOpenChange={(open) => !open && setModal(null)}
        title="认识你的个人银行管家"
        description="不用找菜单，先告诉我你想做什么。"
      >
        <div className="guide-steps">
          <Row
            icon={MessageCircle}
            title="说出需求"
            subtitle="像聊天一样，描述转账、查账或规划需求。"
            end={<span>1</span>}
          />
          <Row
            icon={FileText}
            title="核对方案"
            subtitle="我整理信息，你可以修改金额、日期与收款人。"
            end={<span>2</span>}
          />
          <Row
            icon={ShieldCheck}
            title="由你确认"
            subtitle="需要资金操作时，始终等待你最后授权。"
            end={<span>3</span>}
          />
        </div>
        <Button
          className="full-width spaced"
          onClick={() => {
            setModal(null);
            go("home");
          }}
        >
          开始体验
          <ArrowRight size={18} />
        </Button>
      </Dialog>
      <Dialog
        open={modal === "voice"}
        onOpenChange={(open) => !open && setModal(null)}
        title="试试用一句话办理"
        description="语音输入界面演示，当前不会开启麦克风。"
      >
        <div className="voice-demo">
          <Mic size={32} />
          <p>“给妈妈转 2000 元，下周五到账”</p>
          <Button
            className="full-width"
            onClick={() => {
              setInput("给妈妈转 2000 元，下周五到账");
              setModal(null);
            }}
          >
            使用这句示例
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
      <Dialog open={!!bankIntent} onOpenChange={open=>{if(!open)setBankIntent(null);}} title="智能转账" description="转账、预约和AA收款 · 常用卡8888 · 沙箱资金">
        {bankIntent&&<SmartTransfers initial={bankIntent} onDone={setBankReceipt}/>}
      </Dialog>
    </div>
  );
}
