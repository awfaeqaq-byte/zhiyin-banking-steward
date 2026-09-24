import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  ArrowRight,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  CreditCard,
  ContactRound,
  Fingerprint,
  History,
  LoaderCircle,
  Mic,
  Pencil,
  Plus,
  Send,
  ShieldCheck,
  X,
} from "lucide-react";
import { Button } from "./ui/button";
import { Dialog } from "./ui/dialog";
import { Disclosure } from "./ui/disclosure";
import { PhoneContactPicker } from "./phone-contact-picker";
import {
  AVAILABLE,
  CASH,
  CONTACTS,
  DEMO_DATE,
  DEMO_TODAY,
  LIVING_BUDGET,
  calculateFunds,
  cents,
  dateLabel,
  loadWorkspace,
  makeTask,
  money,
  parseInstruction,
  validatePlan,
  type Contact,
  type Plan,
  type Task,
} from "../lib/native-banking";
import "./native-banking.css";

type NativeProps = {
  visible: boolean;
  name: string;
  frozen: boolean;
  limit: number;
  historyOpen: boolean;
  onHistoryClose: () => void;
  onNavigate: (page: "assets" | "spending" | "plan" | "cards") => void;
  onAttach: () => void;
};
type Panel = "edit" | "authorize" | "voice" | "cancel" | "revise" | null;
const EXAMPLE = "下周五给妈妈转2000，再帮我留够信用卡还款的钱";

export function NativeBanking({
  visible,
  name,
  frozen,
  limit,
  historyOpen,
  onHistoryClose,
  onNavigate,
  onAttach,
}: NativeProps) {
  const [workspace, setWorkspace] = useState(loadWorkspace);
  const task = workspace.tasks.find((t) => t.id === workspace.activeId);
  const [input, setInput] = useState("");
  const [feedback, setFeedback] = useState("");
  const [panel, setPanel] = useState<Panel>(null);
  const [contactPickerOpen, setContactPickerOpen] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [details, setDetails] = useState(false);
  const [changesOpen, setChangesOpen] = useState(false);
  const [draft, setDraft] = useState({
    amount: "2000",
    date: DEMO_DATE,
    recipient: "妈妈" as Contact,
    reserve: "12000",
  });
  const [editError, setEditError] = useState("");
  const [editScope, setEditScope] = useState<"all" | "amount" | "date">("all");
  const [voiceText, setVoiceText] = useState("");
  const [recording, setRecording] = useState(false);
  const [voiceReady, setVoiceReady] = useState(false);
  const [voiceCancel, setVoiceCancel] = useState(false);
  const pointerStart = useRef<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const funds = task ? calculateFunds(task.amount, task.reserve) : null;
  const ongoing = [...workspace.tasks]
    .reverse()
    .find((item) => item.status !== "cancelled");
  const otherReservation = workspace.tasks.some(
    (item) => item.status === "reserved" && item.id !== task?.id,
  );
  const blocking = task
    ? otherReservation
      ? "演示中已有一笔预约，请先撤销该预约，再授权其他安排。"
      : validatePlan(task, limit, frozen)
    : "";

  useEffect(() => {
    try {
      localStorage.setItem("zhiyin-native-v1", JSON.stringify(workspace));
    } catch {
      /* The in-memory experience remains available when storage is blocked. */
    }
  }, [workspace]);
  useEffect(() => {
    if (!processing) return;
    const timer = setTimeout(() => setProcessing(false), 500);
    return () => clearTimeout(timer);
  }, [processing, task?.revision, task?.id]);
  useEffect(() => {
    if (!visible) {
      setPanel(null);
      setContactPickerOpen(false);
      setRecording(false);
    }
  }, [visible]);

  function updateTask(next: Task) {
    setWorkspace((w) => ({
      ...w,
      tasks: w.tasks.map((t) => (t.id === next.id ? next : t)),
    }));
  }
  function applyPlan(plan: Plan, message: string) {
    if (!task || task.status !== "draft") return;
    const delta = plan.amount - task.amount;
    const change = delta
      ? `转账${delta > 0 ? "增加" : "减少"} ${money(Math.abs(delta))}，自由资金相应${delta > 0 ? "减少" : "增加"} ${money(Math.abs(delta))}`
      : plan.date !== task.date
        ? `执行日期已改为 ${dateLabel(plan.date)}`
        : "收款人或还款预算已更新";
    updateTask({
      ...task,
      ...plan,
      revision: task.revision + 1,
      messages: [...task.messages, message],
      changes: [...task.changes, change],
    });
    setFeedback("");
    setDetails(false);
    setPanel(null);
  }
  function send(text: string) {
    const value = text.trim();
    if (!value) return;
    setInput("");
    setFeedback("");
    if (/资产|银行卡|挂失/.test(value)) {
      onNavigate(/卡|挂失/.test(value) ? "cards" : "assets");
      return;
    }
    if (/消费|账单分析|花在哪/.test(value)) {
      onNavigate("spending");
      return;
    }
    if (/理财|投资/.test(value)) {
      onNavigate("plan");
      return;
    }
    const parsed = parseInstruction(value);
    if (parsed.error) {
      setFeedback(parsed.error);
      return;
    }
    if (!Object.keys(parsed).length) {
      setFeedback(
        "这版是本地交互演示。试试“给妈妈转2000元”“改成3000”或“看看我的资产”。",
      );
      return;
    }
    if (task?.status === "draft") {
      applyPlan({ ...task, ...parsed }, value);
      return;
    }
    if (workspace.tasks.some((t) => t.status === "reserved")) {
      setFeedback(
        "当前已有一笔演示预约，请从“事务”打开它，选择“修改预约”或“撤销预约”后再安排。",
      );
      return;
    }
    if (!parsed.recipient || !parsed.amount) {
      setFeedback(
        "请告诉我收款人和金额，例如“给妈妈转2000元”，我再为你准备方案。",
      );
      return;
    }
    const next = makeTask(
      {
        recipient: parsed.recipient,
        amount: parsed.amount,
        date: parsed.date || DEMO_DATE,
        reserve: parsed.reserve ?? 0,
      },
      value,
    );
    setWorkspace((w) => ({
      tasks: [...w.tasks, next].slice(-30),
      activeId: next.id,
    }));
    setProcessing(true);
    setDetails(false);
    setChangesOpen(false);
  }
  function submit(e: FormEvent) {
    e.preventDefault();
    send(input);
  }
  function openEdit(scope: "all" | "amount" | "date" = "all") {
    if (!task) return;
    setEditScope(scope);
    setDraft({
      amount: String(task.amount / 100),
      reserve: String(task.reserve / 100),
      date: task.date,
      recipient: task.recipient,
    });
    setEditError("");
    setPanel("edit");
  }
  function saveEdit(e: FormEvent) {
    e.preventDefault();
    const amount = cents(draft.amount);
    const reserve = cents(draft.reserve);
    if (amount === null || reserve === null) {
      setEditError("金额请使用数字，最多保留两位小数。");
      return;
    }
    const next: Plan = { ...draft, amount, reserve };
    // Invalid funding can be shown as a preview, but never authorized.
    const invalid = validatePlan(next, Number.MAX_SAFE_INTEGER, false);
    if (invalid && !invalid.includes("还款预算")) {
      setEditError(invalid);
      return;
    }
    applyPlan(
      next,
      editScope === "amount"
        ? `转账金额改为 ${money(amount)}`
        : editScope === "date"
          ? `执行日期改为 ${dateLabel(next.date)}`
          : `修改安排：给${next.recipient}转 ${money(amount)}，${dateLabel(next.date)}执行，保留还款预算 ${money(reserve)}`,
    );
  }
  function openVoice() {
    setVoiceText(task?.status === "draft" ? "改成3000" : EXAMPLE);
    setVoiceReady(false);
    setVoiceCancel(false);
    setRecording(false);
    setPanel("voice");
  }
  function finishVoice(cancel: boolean) {
    if (pointerStart.current === null) return;
    pointerStart.current = null;
    setRecording(false);
    if (cancel) {
      setVoiceCancel(false);
      setVoiceReady(false);
      return;
    }
    setVoiceReady(true);
  }
  function confirmAuthorization() {
    if (!task || task.status !== "draft") return;
    const error = blocking;
    if (error) {
      setFeedback(error);
      setPanel(null);
      return;
    }
    updateTask({
      ...task,
      status: "reserved",
      reservation: `DEMO-${task.date.replaceAll("-", "")}-${task.id.slice(0, 6).toUpperCase()}`,
    });
    setPanel(null);
    setFeedback("演示预约已记录。不会发生真实扣款，也不会自动执行。");
  }

  return (
    <section className="native-root" hidden={!visible} aria-label="AI 原生管家">
      {!task ? (
        <div className="native-quiet">
          <h1>下午好，叶先生。</h1>
          <p>
            {ongoing
              ? ongoing.status === "draft"
                ? "你有一份安排等待确认。"
                : "预约已记录，可随时查看后续。"
              : name === "宁宁"
                ? "今天没有需要处理的事项。"
                : "资金安排正常，暂无待处理事项。"}
          </p>
          <span>需要时，直接告诉我就好。</span>
          <button
            className="native-example"
            onClick={() =>
              ongoing
                ? setWorkspace((w) => ({ ...w, activeId: ongoing.id }))
                : send(EXAMPLE)
            }
          >
            {ongoing ? "继续上次安排" : "试着安排一笔转账"}{" "}
            <ArrowRight size={16} />
          </button>
        </div>
      ) : (
        <div className="native-conversation">
          <div className="native-messages" aria-label="本次事务的指令记录">
            {task.messages.length > 1 && (
              <button
                className="native-subtle-link"
                aria-expanded={changesOpen}
                aria-controls="native-instruction-history"
                onClick={() => setChangesOpen(!changesOpen)}
              >
                <History size={14} />{" "}
                {changesOpen
                  ? "收起"
                  : `查看前 ${task.messages.length - 1} 条指令`}
              </button>
            )}
            <Disclosure
              open={changesOpen}
              id="native-instruction-history"
              className="native-history-reveal"
            >
              {task.messages.slice(0, -1).map((m, i) => (
                <p key={i} className="native-user-message native-old-message">
                  {m}
                </p>
              ))}
            </Disclosure>
            <p
              className="native-user-message native-latest-message"
              key={`${task.id}-${task.revision}`}
            >
              {task.messages.at(-1)}
            </p>
          </div>
          <article
            key={task.id}
            className={`native-task ${task.status === "reserved" ? "is-reserved" : ""}`}
            aria-label="当前事务"
          >
            <span className="native-task-node" aria-hidden="true" />
            <div className="native-task-title">
              <h2>
                {task.status === "reserved"
                  ? "已预约，等待执行"
                  : task.status === "cancelled"
                    ? "预约已撤销"
                    : "转账与资金安排"}
              </h2>
              <span className="native-state">
                {task.status === "draft"
                  ? processing
                    ? "整理中"
                    : "待授权"
                  : "演示凭证"}
              </span>
            </div>
            {task.status === "draft" ? (
              <>
                <div className="native-plan-summary">
                  <button
                    onClick={() => openEdit("amount")}
                    aria-label="修改转账金额"
                  >
                    给{task.recipient}转{" "}
                    <strong key={task.amount}>{money(task.amount)}</strong>
                    <Pencil size={15} />
                  </button>
                  <button
                    onClick={() => openEdit("date")}
                    aria-label="修改执行日期"
                  >
                    {dateLabel(task.date)}执行 <Pencil size={14} />
                  </button>
                </div>
                {processing ? (
                  <div className="native-organizing" role="status">
                    <p>
                      同时考虑信用卡还款预算{" "}
                      <strong>{money(task.reserve)}</strong>
                    </p>
                    <span>
                      <ShieldCheck size={17} />
                      演示收款账户已匹配 · 尾号 {CONTACTS[task.recipient]}
                    </span>
                    <div>
                      <LoaderCircle size={17} className="native-spinner" />
                      正在整理这笔安排对可用资金的影响…
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="native-conclusion">
                      {blocking
                        ? "这笔安排还需要调整。"
                        : task.reserve
                          ? "按当前余额测算，转账后仍足够覆盖本期还款。"
                          : "这笔转账在当前可安排资金范围内。"}
                    </p>
                    <div
                      className={`native-free ${funds!.free < 0 ? "negative" : ""}`}
                      key={`${task.id}-${task.revision}`}
                    >
                      <span>
                        {funds!.free < 0
                          ? "当前资金不足以覆盖这份安排"
                          : "本次安排后，预计可自由使用"}
                      </span>
                      <strong data-testid="native-free">
                        {funds!.free < 0
                          ? `还差 ${money(-funds!.free)}`
                          : money(funds!.free)}
                      </strong>
                    </div>
                    {funds!.free < 0 ? (
                      <div className="native-shortfall">
                        <p>
                          当前可安排 <strong>{money(AVAILABLE)}</strong>
                        </p>
                        <p>
                          转账与还款预算合计{" "}
                          <strong>{money(task.amount + task.reserve)}</strong>
                        </p>
                        <span>请降低转账金额，或核对还款预算后再授权。</span>
                      </div>
                    ) : (
                      <div className="native-funds">
                        <div className="native-funds-total">
                          <strong>{money(AVAILABLE)}</strong>
                          <span>本次可安排资金</span>
                        </div>
                        <div
                          className="native-funds-bar"
                          role="img"
                          aria-label={`转账 ${money(task.amount)}，还款预算 ${money(task.reserve)}，自由资金 ${money(funds!.free)}`}
                        >
                          <span
                            style={{
                              transform: `translateX(0%) scaleX(${task.amount / AVAILABLE})`,
                            }}
                          />
                          <span
                            style={{
                              transform: `translateX(${(task.amount / AVAILABLE) * 100}%) scaleX(${task.reserve / AVAILABLE})`,
                            }}
                          />
                          <span
                            style={{
                              transform: `translateX(${((task.amount + task.reserve) / AVAILABLE) * 100}%) scaleX(${funds!.free / AVAILABLE})`,
                            }}
                          />
                        </div>
                        <div className="native-funds-legend">
                          <div>
                            <i />
                            <strong>{money(task.amount)}</strong>
                            <span>转账</span>
                          </div>
                          <div>
                            <i />
                            <strong>{money(task.reserve)}</strong>
                            <span>还款预算</span>
                          </div>
                          <div>
                            <i />
                            <strong>{money(funds!.free)}</strong>
                            <span>自由资金</span>
                          </div>
                        </div>
                      </div>
                    )}
                    {!!task.changes.length && (
                      <p
                        className="native-change"
                        key={task.revision}
                        role="status"
                      >
                        <Check size={15} />
                        {task.changes.at(-1)}
                      </p>
                    )}
                    {blocking && (
                      <p className="native-warning" role="alert">
                        {blocking}
                      </p>
                    )}
                    <div className="native-task-actions">
                      <Button
                        disabled={!!blocking}
                        onClick={() => setPanel("authorize")}
                      >
                        前往授权 <ArrowRight size={17} />
                      </Button>
                      <Button variant="secondary" onClick={() => openEdit()}>
                        修改安排
                      </Button>
                    </div>
                    <button
                      className="native-subtle-link"
                      aria-expanded={details}
                      aria-controls="native-calculation-details"
                      onClick={() => setDetails(!details)}
                    >
                      <ChevronDown
                        size={15}
                        className={details ? "turned" : ""}
                      />
                      {details ? "收起计算依据" : "查看计算依据"}
                    </button>
                    <Disclosure open={details} id="native-calculation-details">
                      <div className="native-evidence">
                        <p>
                          活期与现金 {money(CASH)} − 其他生活预算{" "}
                          {money(LIVING_BUDGET)} = 本次可安排资金{" "}
                          {money(AVAILABLE)}。
                        </p>
                        <p>
                          {money(AVAILABLE)} − 转账 {money(task.amount)} −
                          还款预算 {money(task.reserve)} = {money(funds!.free)}
                          。
                        </p>
                        <p>
                          这是基于演示账户的资金规划，不会锁定余额。后续支出变化时需要重新核对。
                        </p>
                        <p>
                          收款账户：{task.recipient} · 尾号{" "}
                          {CONTACTS[task.recipient]}；付款卡：8888。
                        </p>
                      </div>
                    </Disclosure>
                  </>
                )}
              </>
            ) : (
              <div
                className="native-receipt"
                data-state={task.status}
                key={task.status}
              >
                <div className="native-receipt-icon">
                  <CheckCheck size={24} />
                </div>
                <h3>
                  {money(task.amount)} <ArrowRight size={19} /> {task.recipient}
                  <span>尾号 {CONTACTS[task.recipient]}</span>
                </h3>
                <p>{dateLabel(task.date)}执行</p>
                <div className="native-receipt-track">
                  <span className="complete">已授权</span>
                  <span>
                    {task.status === "cancelled" ? "已撤销" : "等待执行"}
                  </span>
                  <span>到账后通知</span>
                </div>
                <details>
                  <summary>预约详情</summary>
                  <p>预约编号 {task.reservation || "—"}</p>
                  <p>演示付款账户：常用卡 · 8888</p>
                  <p>保留还款预算 {money(task.reserve)}，资金未锁定。</p>
                  <p>本原型不调度真实交易，不会自动扣款。</p>
                </details>
                {task.status === "reserved" ? (
                  <div className="native-task-actions">
                    <Button
                      variant="secondary"
                      onClick={() => setPanel("revise")}
                    >
                      修改预约
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => setPanel("cancel")}
                    >
                      撤销预约
                    </Button>
                  </div>
                ) : (
                  <Button
                    variant="secondary"
                    className="full-width"
                    onClick={() => {
                      setWorkspace((w) => ({ ...w, activeId: null }));
                      setFeedback("");
                    }}
                  >
                    开始新的安排
                  </Button>
                )}
                <p className="native-receipt-note">
                  {task.status === "reserved"
                    ? "已记录本地演示预约，未发生真实转账。"
                    : "这笔演示预约不会执行，资金未扣除。"}
                </p>
              </div>
            )}
          </article>
        </div>
      )}
      {feedback && (
        <p className="native-feedback" role="status">
          {feedback}
          <button aria-label="关闭管家提示" onClick={() => setFeedback("")}>
            <X size={15} />
          </button>
        </p>
      )}
      <div className="native-composer-wrap">
        <form className="native-composer" onSubmit={submit}>
          <button
            type="button"
            className="icon-control"
            aria-label="添加附件"
            onClick={onAttach}
          >
            <Plus size={23} />
          </button>
          <label htmlFor="native-request" className="sr-only">
            和{name}说点什么
          </label>
          <input
            ref={inputRef}
            id="native-request"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={`和${name}说点什么…`}
            autoComplete="off"
            maxLength={300}
          />
          <button
            type="button"
            className="native-voice-button"
            aria-label="语音修改演示"
            onClick={openVoice}
          >
            <Mic size={23} />
          </button>
          {input.trim() && (
            <button className="native-send" aria-label="发送需求">
              <Send size={20} />
            </button>
          )}
        </form>
        <div className="native-demo-caption">
          <span>交互演示 · 2026.09.13</span>
          <span>资金操作始终由你授权</span>
        </div>
      </div>

      <Dialog
        open={visible && panel === "edit"}
        onOpenChange={(open) => !open && setPanel(null)}
        title={
          editScope === "amount"
            ? "修改转账金额"
            : editScope === "date"
              ? "修改执行日期"
              : "修改安排"
        }
        description="修改会更新原事务，不会新建转账或自动执行。"
        className="native-sheet"
      >
        <form onSubmit={saveEdit} className="native-edit-form">
          {editScope === "all" && (
            <>
              <label className="field">
                收款人
                <select
                  value={draft.recipient}
                  onChange={(e) =>
                    setDraft({ ...draft, recipient: e.target.value as Contact })
                  }
                >
                  {Object.keys(CONTACTS).map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>
              <Button
                type="button"
                variant="secondary"
                className="contact-picker-trigger"
                onClick={() => setContactPickerOpen(true)}
              >
                <ContactRound size={18} />从手机通讯录选择
              </Button>
            </>
          )}
          {editScope !== "date" && (
            <div className={editScope === "all" ? "form-grid" : ""}>
              <label className="field">
                转账金额（元）
                <input
                  autoFocus
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={draft.amount}
                  onChange={(e) =>
                    setDraft({ ...draft, amount: e.target.value })
                  }
                />
              </label>
              {editScope === "all" && (
                <label className="field">
                  还款预算（元）
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={draft.reserve}
                    onChange={(e) =>
                      setDraft({ ...draft, reserve: e.target.value })
                    }
                  />
                </label>
              )}
            </div>
          )}
          {editScope !== "amount" && (
            <label className="field">
              执行日期
              <input
                type="date"
                autoFocus={editScope === "date"}
                min={DEMO_TODAY}
                max="2026-12-31"
                value={draft.date}
                onChange={(e) => setDraft({ ...draft, date: e.target.value })}
              />
            </label>
          )}
          {editError && (
            <p role="alert" className="native-warning">
              {editError}
            </p>
          )}
          <Button className="full-width">更新这份安排</Button>
          <Button
            type="button"
            variant="ghost"
            className="full-width"
            onClick={() => {
              setPanel(null);
              setTimeout(() => inputRef.current?.focus(), 0);
            }}
          >
            也可以直接说出修改
          </Button>
        </form>
      </Dialog>
      <PhoneContactPicker
        open={visible && contactPickerOpen}
        onOpenChange={setContactPickerOpen}
        onSelect={(recipient) => {
          setDraft((current) => ({ ...current, recipient }));
          setEditError("");
        }}
      />
      <Dialog
        open={visible && panel === "authorize"}
        onOpenChange={(open) => !open && setPanel(null)}
        title="授权预约转账"
        description="前端授权演示 · 不会调用面容识别或连接银行"
        className="native-sheet native-authorize"
      >
        {task && (
          <>
            <div className="native-auth-amount">{money(task.amount)}</div>
            <dl className="native-auth-details">
              <div>
                <dt>付款账户</dt>
                <dd>常用卡 · 8888</dd>
              </div>
              <div>
                <dt>收款账户</dt>
                <dd>
                  {task.recipient} · 尾号 {CONTACTS[task.recipient]}
                </dd>
              </div>
              <div>
                <dt>执行日期</dt>
                <dd>{dateLabel(task.date)}</dd>
              </div>
              <div>
                <dt>备注</dt>
                <dd>生活费</dd>
              </div>
            </dl>
            <p className="native-auth-safety">
              <ShieldCheck size={18} />
              演示账户已匹配，实际交易仍需银行核验
            </p>
            {blocking && (
              <p className="native-warning" role="alert">
                {blocking}
              </p>
            )}
            <Button
              disabled={!!blocking || task.status !== "draft"}
              className="full-width"
              onClick={confirmAuthorization}
            >
              <Fingerprint size={23} />
              确认模拟授权
            </Button>
            <Button
              variant="ghost"
              className="full-width"
              onClick={() => setPanel(null)}
            >
              返回修改
            </Button>
            <p className="fine-print">
              本次仅授权演示预约，不会锁定还款资金。
              <br />
              执行日期指计划发起日期，不承诺实际到账时间。
            </p>
          </>
        )}
      </Dialog>
      <Dialog
        open={visible && panel === "voice"}
        onOpenChange={(open) => {
          if (!open) {
            setPanel(null);
            setRecording(false);
            pointerStart.current = null;
          }
        }}
        title="用一句话修改安排"
        description="语音交互演示，不开启麦克风。识别示例可编辑后提交。"
        className="native-sheet native-voice-sheet"
      >
        <label className="field">
          {recording ? "正在模拟识别…" : "识别内容"}
          <input
            value={voiceText}
            aria-label="语音识别内容"
            onChange={(e) => setVoiceText(e.target.value)}
          />
        </label>
        <div className={`native-voice-stage ${recording ? "recording" : ""}`}>
          <span className="native-wave" aria-hidden="true">
            {[0, 1, 2, 3, 4].map((i) => (
              <i key={i} style={{ animationDelay: `${i * 90}ms` }} />
            ))}
          </span>
          <button
            className="native-hold"
            aria-label="按住体验语音识别"
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              pointerStart.current = e.clientY;
              setRecording(true);
              setVoiceReady(false);
              setVoiceCancel(false);
            }}
            onPointerMove={(e) => {
              if (pointerStart.current !== null)
                setVoiceCancel(pointerStart.current - e.clientY > 60);
            }}
            onPointerUp={(e) =>
              finishVoice(
                pointerStart.current !== null &&
                  pointerStart.current - e.clientY > 60,
              )
            }
            onPointerCancel={() => finishVoice(true)}
            onKeyDown={(e) => {
              if (e.key === " " || e.key === "Enter") {
                e.preventDefault();
                pointerStart.current = 0;
                setRecording(true);
              }
            }}
            onKeyUp={(e) => {
              if (e.key === " " || e.key === "Enter") finishVoice(false);
            }}
          >
            <Mic size={31} />
          </button>
          <span className="native-wave" aria-hidden="true">
            {[4, 3, 2, 1, 0].map((i) => (
              <i key={i} style={{ animationDelay: `${i * 90}ms` }} />
            ))}
          </span>
        </div>
        <p className="native-voice-help">
          {voiceCancel
            ? "松开取消，不修改方案"
            : recording
              ? "松开完成识别，上滑取消"
              : voiceReady
                ? "识别已完成，核对后发送"
                : "按住体验，或直接编辑上方示例"}
        </p>
        <Button
          className="full-width"
          disabled={!voiceText.trim() || recording}
          onClick={() => {
            setPanel(null);
            send(voiceText);
          }}
        >
          发送识别内容
        </Button>
      </Dialog>
      <Dialog
        open={visible && (panel === "cancel" || panel === "revise")}
        onOpenChange={(open) => !open && setPanel(null)}
        title={panel === "revise" ? "修改已预约的安排？" : "撤销这笔预约？"}
        description={
          panel === "revise"
            ? "旧演示预约将撤销。修改后需要重新授权，才会形成新的预约。"
            : "仅撤销本地演示预约，不涉及真实资金。"
        }
        className="native-sheet"
      >
        <p className="native-cancel-summary">
          {task &&
            `${money(task.amount)} → ${task.recipient} · ${dateLabel(task.date)}`}
        </p>
        <div className="form-grid">
          <Button variant="secondary" onClick={() => setPanel(null)}>
            保留预约
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              if (!task) return;
              if (panel === "revise") {
                updateTask({
                  ...task,
                  status: "draft",
                  reservation: undefined,
                  revision: task.revision + 1,
                  changes: [
                    ...task.changes,
                    "原演示预约已撤销，修改后需重新授权",
                  ],
                });
                setPanel(null);
                setFeedback("原演示预约已撤销，可以修改这份安排。");
              } else {
                updateTask({ ...task, status: "cancelled" });
                setPanel(null);
                setFeedback("");
              }
            }}
          >
            {panel === "revise" ? "撤销旧预约并修改" : "确认撤销演示预约"}
          </Button>
        </div>
      </Dialog>
      <Dialog
        open={visible && historyOpen}
        onOpenChange={(open) => !open && onHistoryClose()}
        title="我的事务"
        description="每件事都有来处，也有后续。仅记录本浏览器中的原生模式演示事务。"
        className="native-sheet"
      >
        <div className="native-history">
          {workspace.tasks.length ? (
            [...workspace.tasks].reverse().map((t) => (
              <button
                key={t.id}
                onClick={() => {
                  setWorkspace((w) => ({ ...w, activeId: t.id }));
                  onHistoryClose();
                  setFeedback("");
                  setProcessing(false);
                }}
              >
                <CreditCard size={20} />
                <span>
                  <strong>
                    {money(t.amount)} → {t.recipient}
                  </strong>
                  <small>
                    {dateLabel(t.date)} ·{" "}
                    {t.status === "draft"
                      ? "待授权"
                      : t.status === "reserved"
                        ? "已预约"
                        : "已撤销"}
                  </small>
                </span>
                <ChevronRight size={17} />
              </button>
            ))
          ) : (
            <div className="native-empty-history">
              <History size={30} />
              <p>还没有事务</p>
              <span>说出需求后，安排与预约会留在这里。</span>
            </div>
          )}
        </div>
        <Button
          className="full-width spaced"
          variant="secondary"
          onClick={() => {
            setWorkspace((w) => ({ ...w, activeId: null }));
            onHistoryClose();
            setFeedback("");
          }}
        >
          回到对话首页
        </Button>
      </Dialog>
    </section>
  );
}
