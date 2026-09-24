import type {
  ConnectedFinancialSource,
  ExternalFinancialProvider,
  FinancialTransaction,
} from "./financial-connections";
import { formatCny } from "./financial-connections";

const DAY = 86_400_000;
const CHINA_OFFSET = 8 * 60 * 60 * 1000;
const DATE_TOLERANCE_DAYS = 3;
const CYCLES = [{ months: 1, label: "月" }, { months: 3, label: "季" }, { months: 12, label: "年" }] as const;
const PROVIDERS: ExternalFinancialProvider[] = ["wechat_pay", "alipay"];

export type RecurringCandidate = {
  key: string;
  provider: ExternalFinancialProvider;
  providerName: string;
  title: string;
  /** Positive integer cents, based on the latest observed charge, not an agreed renewal price. */
  amount: number;
  cycle: "月" | "季" | "年";
  estimatedNextChargeAt: number;
  confidence: "high" | "medium";
  evidenceSummary: string;
  evidence: Array<{ id: string; occurredAt: string; amount: number }>;
};

type Connections = Partial<Record<ExternalFinancialProvider, ConnectedFinancialSource>>;
type ObservedPayment = { transaction: FinancialTransaction; timestamp: number; month: number; day: number };

function normalizeTitle(title: string) {
  return title.normalize("NFKC").toLowerCase().replace(/[\s\p{P}\p{S}]/gu, "");
}

function merchantIdentity(title: string) {
  const normalized = normalizeTitle(title);
  // Remove only generic suffixes; names sharing a category (e.g. two music services) stay distinct.
  return normalized.replace(/(?:自动续费|自动扣费|续费|扣费|扣款|连续包月|连续包季|连续包年|包月|包季|包年|会员服务|会员|月度|季度|年度|月卡|季卡|年卡|vip)+$/g, "") || normalized;
}

function lastDayOfMonth(month: number) {
  return new Date(Date.UTC(Math.floor(month / 12), month % 12 + 1, 0)).getUTCDate();
}

function validTimestamp(date: string, now: number) {
  const calendar = /^(\d{4})-(\d{2})-(\d{2})(?:$|T)/.exec(date);
  if (!calendar) return null;
  const [, yearText, monthText, dayText] = calendar;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  if (year < 1000 || month < 1 || month > 12 || day < 1 || day > lastDayOfMonth(year * 12 + month - 1)) return null;
  const time = /T(\d{2}):(\d{2})(?::(\d{2}))?/.exec(date);
  if (time && (Number(time[1]) > 23 || Number(time[2]) > 59 || Number(time[3] || 0) > 59)) return null;
  const timestamp = Date.parse(date);
  return Number.isFinite(timestamp) && timestamp <= now ? timestamp : null;
}

function isRefund(transaction: FinancialTransaction) {
  return transaction.kind === "refund" || /^(退款|退还)/.test(transaction.title) || /退款|退还/.test(transaction.category);
}

function isExpense(transaction: FinancialTransaction) {
  return Number.isSafeInteger(transaction.amount) && transaction.amount < 0
    && !["refund", "income", "transfer"].includes(transaction.kind || "")
    && !isRefund(transaction)
    && !/^(转账|转给|收到转账|信用卡还款|还信用卡|提现|发红包)/.test(transaction.title)
    && !/^(转账|还款|收入|工资|提现|红包|理财|投资)/.test(transaction.category);
}

function knownAgreementCharge(transaction: FinancialTransaction, source: ConnectedFinancialSource) {
  if (!source.scopes.includes("autopay")) return false;
  const match = /^(?:alipay-)?subscription:(.+):\d+$/.exec(transaction.linkedId || "");
  return !!match && (source.autopays.some(item => item.id === match[1]) || (source.cancelledAutopayIds || []).includes(match[1]));
}

function collectPayments(connections: Connections, now: number) {
  const refunds = new Set<string>();
  for (const provider of PROVIDERS) {
    const source = connections[provider];
    if (!source?.scopes.includes("transactions")) continue;
    for (const transaction of source.transactions) {
      if (isRefund(transaction) && transaction.linkedId && validTimestamp(transaction.occurredAt, now) !== null) {
        refunds.add(`id:${provider}:${transaction.linkedId}`);
        refunds.add(`linked:${transaction.linkedId}`);
      }
    }
  }

  const seenIds = new Set<string>();
  const seenLinks = new Set<string>();
  return PROVIDERS.flatMap(provider => {
    const source = connections[provider];
    if (!source?.scopes.includes("transactions")) return [];
    const groups = new Map<string, ObservedPayment[]>();
    for (const transaction of source.transactions) {
      const timestamp = validTimestamp(transaction.occurredAt, now);
      if (timestamp === null || !transaction.id || !isExpense(transaction)) continue;
      const id = `id:${provider}:${transaction.id}`;
      if (seenIds.has(id) || (transaction.linkedId && seenLinks.has(transaction.linkedId))) continue;
      seenIds.add(id);
      if (transaction.linkedId) seenLinks.add(transaction.linkedId);
      if (refunds.has(id) || (transaction.linkedId && refunds.has(`linked:${transaction.linkedId}`))) continue;
      if (knownAgreementCharge(transaction, source)) continue;
      const merchant = normalizeTitle(transaction.title);
      if (!merchant) continue;
      const calendar = new Date(timestamp + CHINA_OFFSET);
      const payments = groups.get(merchant) || [];
      payments.push({
        transaction, timestamp,
        month: calendar.getUTCFullYear() * 12 + calendar.getUTCMonth(), day: calendar.getUTCDate(),
      });
      groups.set(merchant, payments);
    }
    return [...groups].map(([merchant, payments]) => ({ provider, source, merchant, payments }));
  });
}

function inferCalendarDay(payments: ObservedPayment[]) {
  // Fit a billing day to all records, clamping 29/30/31 to shorter months (including leap years).
  let best = { day: 1, totalError: Infinity, maxError: Infinity };
  for (let day = 1; day <= 31; day += 1) {
    const errors = payments.map(payment => Math.abs(payment.day - Math.min(day, lastDayOfMonth(payment.month))));
    const totalError = errors.reduce((sum, error) => sum + error, 0);
    if (totalError <= best.totalError) best = { day, totalError, maxError: Math.max(...errors) };
  }
  return best;
}

function matchesKnownAutopay(source: ConnectedFinancialSource, title: string, amount: number) {
  if (!source.scopes.includes("autopay")) return false;
  const identity = merchantIdentity(title);
  return source.autopays.some(autopay => Number.isSafeInteger(autopay.amount)
    && Math.abs(autopay.amount - amount) <= Math.max(1, amount * 0.05)
    && [autopay.title, autopay.merchant].some(name => name && merchantIdentity(name) === identity));
}

/** Infer candidates from the entire merchant history, never from a convenient subset of bills. */
export function buildRecurringCandidates(connections: Connections, now = Date.now()): RecurringCandidate[] {
  if (!Number.isFinite(now)) return [];
  const candidates: RecurringCandidate[] = [];
  for (const { provider, source, merchant, payments } of collectPayments(connections, now)) {
    if (payments.length < 3) continue;
    payments.sort((a, b) => a.timestamp - b.timestamp || a.transaction.id.localeCompare(b.transaction.id));
    const cycle = CYCLES.find(({ months }) => payments.every((payment, index) => index === 0
      || payment.month - payments[index - 1].month === months));
    if (!cycle) continue;
    const amounts = payments.map(payment => Math.abs(payment.transaction.amount)).sort((a, b) => a - b);
    const median = amounts[Math.floor(amounts.length / 2)];
    const amountDeviation = Math.max(...amounts.map(amount => Math.abs(amount - median))) / median;
    if (amountDeviation > 0.05) continue;
    const billingDay = inferCalendarDay(payments);
    if (billingDay.maxError > DATE_TOLERANCE_DAYS) continue;
    const latest = payments[payments.length - 1];
    const nextMonth = latest.month + cycle.months;
    const estimatedNextChargeAt = Date.UTC(
      Math.floor(nextMonth / 12), nextMonth % 12, Math.min(billingDay.day, lastDayOfMonth(nextMonth)),
    ) - CHINA_OFFSET;
    // Keep a just-overdue estimate visible briefly, but never forecast missing charges into the future.
    if (now - estimatedNextChargeAt > DATE_TOLERANCE_DAYS * DAY) continue;
    const amount = Math.abs(latest.transaction.amount);
    const title = latest.transaction.title.trim();
    if (matchesKnownAutopay(source, title, amount)) continue;
    candidates.push({
      key: `${provider}:${merchant}:${cycle.label}`,
      provider, providerName: provider === "wechat_pay" ? "微信支付" : "支付宝", title, amount,
      cycle: cycle.label, estimatedNextChargeAt,
      confidence: payments.length >= 4 && amountDeviation <= 0.02 && billingDay.maxError <= 1 ? "high" : "medium",
      evidenceSummary: `${payments.length} 笔支出日期和金额相近，疑似按${cycle.label}重复扣费；金额按最近一笔 ${formatCny(amount)} 估算，尚未确认自动续费。`,
      evidence: payments.map(({ transaction: { id, occurredAt, amount: originalAmount } }) => ({ id, occurredAt, amount: originalAmount })),
    });
  }
  return candidates.sort((a, b) => a.estimatedNextChargeAt - b.estimatedNextChargeAt || a.key.localeCompare(b.key));
}
