// Monetary values are integer cents. All dates and balances are demo fixtures.
export const DEMO_TODAY = "2026-09-13";
export const DEMO_DATE = "2026-09-18";
export const CASH = 4230000;
export const LIVING_BUDGET = 1194000;
export const AVAILABLE = CASH - LIVING_BUDGET;
export const CONTACTS = { 妈妈: "6621", 爸爸: "7316" } as const;
export type Contact = keyof typeof CONTACTS;
export type Plan = {
  amount: number;
  recipient: Contact;
  date: string;
  reserve: number;
};
export type Instruction = Partial<Plan> & { error?: string };
export type Task = Plan & {
  id: string;
  status: "draft" | "reserved" | "cancelled";
  revision: number;
  messages: string[];
  changes: string[];
  reservation?: string;
};
export type NativeWorkspace = { tasks: Task[]; activeId: string | null };

export function money(cents: number) {
  return `¥${(cents / 100).toLocaleString("zh-CN", { maximumFractionDigits: 2 })}`;
}
export function cents(value: string): number | null {
  if (!/^\d+(\.\d{1,2})?$/.test(value.trim())) return null;
  const result = Math.round(Number(value) * 100);
  return Number.isSafeInteger(result) ? result : null;
}
export function dateLabel(date: string) {
  const value = new Date(`${date}T12:00:00`);
  return `${value.getMonth() + 1}月${value.getDate()}日（周${"日一二三四五六"[value.getDay()]}）`;
}
export function validDate(date: string) {
  if (!/^2026-\d{2}-\d{2}$/.test(date)) return false;
  const parsed = new Date(`${date}T12:00:00Z`);
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === date &&
    date >= DEMO_TODAY
  );
}
export function calculateFunds(amount: number, reserve: number) {
  return {
    available: AVAILABLE,
    afterTransfer: AVAILABLE - amount,
    free: AVAILABLE - amount - reserve,
  };
}
export function makeTask(plan: Plan, message = ""): Task {
  return {
    ...plan,
    id: crypto.randomUUID(),
    status: "draft",
    revision: 0,
    messages: message ? [message] : [],
    changes: [],
  };
}
export function validatePlan(plan: Plan, limit: number, frozen: boolean) {
  if (frozen) return "付款卡已挂失，请在资产中的银行卡管理恢复演示卡。";
  if (!Number.isSafeInteger(plan.amount) || plan.amount < 1)
    return "转账金额至少为 0.01 元，最多保留两位小数。";
  if (!Number.isSafeInteger(plan.reserve) || plan.reserve < 0)
    return "请输入有效的还款预算。";
  if (!Object.hasOwn(CONTACTS, plan.recipient)) return "请重新选择收款人。";
  if (!validDate(plan.date))
    return "请选择演示日期 2026 年 9 月 13 日或之后的有效日期。";
  if (plan.amount > limit)
    return `这笔金额超过单笔支付限额 ${money(limit)}，请修改金额或在银行卡中调整限额。`;
  if (calculateFunds(plan.amount, plan.reserve).free < 0)
    return "本次安排不足以覆盖还款预算，请降低转账金额或重新核对预算。";
  return "";
}

// A deliberately bounded local intent parser, not a connected language model.
export function parseInstruction(raw: string): Instruction {
  const text = raw.trim().replace(/，/g, ",");
  const result: Instruction = {};
  const recipient = text.match(/给\s*([^\s,，。\d]+?)\s*转/);
  if (recipient) {
    if (!Object.hasOwn(CONTACTS, recipient[1]))
      return { error: "演示通讯录仅有妈妈和爸爸，请明确选择其中一位收款人。" };
    result.recipient = recipient[1] as Contact;
  }
  const amount = text.match(
    /(?:转(?:账)?(?:金额)?\s*|(?:金额)?改(?:成|为)\s*)(-?\d+(?:\.\d+)?)/,
  );
  if (amount) {
    const parsed = cents(amount[1]);
    if (parsed === null || parsed < 1)
      return { error: "金额需大于 0，且最多保留两位小数，例如“改成 3000”。" };
    result.amount = parsed;
  }
  const explicit = text.match(
    /(?:(\d{4})[年-])?(\d{1,2})[月-](\d{1,2})(?:日|号)?/,
  );
  if (explicit) {
    const date = `${explicit[1] || "2026"}-${explicit[2].padStart(2, "0")}-${explicit[3].padStart(2, "0")}`;
    if (!validDate(date))
      return {
        error:
          "这个日期不在有效演示范围内，请使用 2026 年 9 月 13 日或之后的日期。",
      };
    result.date = date;
  } else if (/周五|星期五/.test(text)) result.date = DEMO_DATE;
  else if (/周四|星期四/.test(text)) result.date = "2026-09-17";
  if (/信用卡|还款/.test(text)) result.reserve = 1200000;
  return result;
}

export function loadWorkspace(): NativeWorkspace {
  const empty = { tasks: [], activeId: null };
  try {
    const stored = JSON.parse(
      localStorage.getItem("zhiyin-native-v1") || "null",
    );
    if (!stored || !Array.isArray(stored.tasks)) return empty;
    const tasks: Task[] = stored.tasks
      .filter(
        (t: Task) =>
          t &&
          typeof t.id === "string" &&
          ["draft", "reserved", "cancelled"].includes(t.status) &&
          Number.isSafeInteger(t.amount) &&
          t.amount > 0 &&
          Number.isSafeInteger(t.reserve) &&
          t.reserve >= 0 &&
          Object.hasOwn(CONTACTS, t.recipient) &&
          validDate(t.date) &&
          Number.isInteger(t.revision) &&
          Array.isArray(t.messages) &&
          t.messages.every((v) => typeof v === "string") &&
          Array.isArray(t.changes) &&
          t.changes.every((v) => typeof v === "string") &&
          (t.reservation === undefined || typeof t.reservation === "string"),
      )
      .slice(-30);
    return {
      tasks,
      activeId: tasks.some((t) => t.id === stored.activeId)
        ? stored.activeId
        : null,
    };
  } catch {
    return empty;
  }
}
