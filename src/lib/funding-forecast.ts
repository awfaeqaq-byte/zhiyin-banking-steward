import type { ConnectedFinancialSource, ExternalFinancialProvider, FinancialAutopay } from "./financial-connections";

export type FundingHorizonDays = 7 | 14 | 30;

export type FundingCharge = {
  id: string;
  title: string;
  amount: number;
  chargeAt: number;
  projectedBalance: number | null;
};

export type FundingAccountForecast = {
  provider: ExternalFinancialProvider;
  providerName: string;
  balance: number | null;
  charges: FundingCharge[];
  upcomingTotal: number;
  /** Overdue charges assume payment is still due; their deficit is conditional, not a verified lower bound. */
  shortfall: number | null;
  firstShortfallAt: number | null;
  status: "shortfall" | "covered" | "unknown";
  warnings: string[];
};

export type FundingForecast = {
  horizonDays: FundingHorizonDays;
  from: number;
  to: number;
  knownBalanceTotal: number;
  upcomingTotal: number;
  shortfallTotal: number;
  coverageIncomplete: boolean;
  accounts: FundingAccountForecast[];
};

type Connections = Partial<Record<ExternalFinancialProvider, ConnectedFinancialSource>>;
const PROVIDERS = ["wechat_pay", "alipay"] as const;
const PROVIDER_NAMES = { wechat_pay: "微信支付", alipay: "支付宝" };
const DAY_MS = 86_400_000;
const SHANGHAI_OFFSET = 8 * 60 * 60 * 1000;

function validTimestamp(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && Number.isFinite(new Date(value).getTime());
}

function validCents(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

/** Snapshot time follows the sandbox clock; no permission is inferred from data presence. */
export function fundingReferenceTime(connections: Connections, fallback = Date.now()): number {
  const times = PROVIDERS.flatMap(provider => {
    const source = connections[provider];
    if (!source || source.provider !== provider || !source.scopes.some(scope => scope === "balance" || scope === "autopay")) return [];
    const timestamp = Date.parse(source.syncedAt);
    return validTimestamp(timestamp) ? [timestamp] : [];
  });
  return times.length ? Math.max(...times) : fallback;
}

function deduplicatedContracts(source: ConnectedFinancialSource, warnings: string[]): FinancialAutopay[] {
  const contracts = new Map<string, FinancialAutopay>();
  const conflicted = new Set<string>();
  const cancelled = new Set(source.cancelledAutopayIds || []);
  for (const contract of source.autopays) {
    if (!contract.id || !contract.id.trim()) {
      warnings.push("存在缺少签约标识的自动续费，暂未计入。");
      continue;
    }
    if (cancelled.has(contract.id)) continue;
    const previous = contracts.get(contract.id);
    if (previous && (previous.amount !== contract.amount || previous.nextChargeAt !== contract.nextChargeAt || previous.title !== contract.title)) {
      conflicted.add(contract.id);
      continue;
    }
    contracts.set(contract.id, contract);
  }
  for (const id of conflicted) {
    contracts.delete(id);
    warnings.push("同一自动续费的签约数据存在冲突，请核实后再测算。");
  }
  return [...contracts.values()];
}

function forecastAccount(
  provider: ExternalFinancialProvider,
  source: ConnectedFinancialSource,
  from: number,
  to: number,
): FundingAccountForecast {
  const warnings: string[] = [];
  const balanceAuthorized = source.scopes.includes("balance");
  const autopayAuthorized = source.scopes.includes("autopay");
  const balance = balanceAuthorized && validCents(source.balance) ? source.balance : null;
  if (!balanceAuthorized) warnings.push("余额读取尚未授权，无法判断该平台是否充足。");
  else if (balance === null) warnings.push("平台余额缺失或无效，无法判断是否充足。");
  if (!autopayAuthorized) warnings.push("自动续费读取尚未授权，扣费计划不完整。");
  else if (source.autopaysIncomplete) warnings.push("自动续费签约数据不完整，部分扣费尚未计入。");

  const charges: FundingCharge[] = [];
  if (autopayAuthorized) {
    for (const contract of deduplicatedContracts(source, warnings)) {
      const title = contract.title.trim() || "未命名自动续费";
      if (!validTimestamp(contract.nextChargeAt)) {
        warnings.push(`${title}的下次扣费日期未知，暂未计入。`);
        continue;
      }
      if (contract.nextChargeAt < from) {
        warnings.push(`${title}已到期，扣款状态待核实；本次按该笔仍需支付测算。`);
      }
      if (contract.nextChargeAt > to) continue;
      if (!validCents(contract.amount) || contract.amount === 0) {
        warnings.push(`${title}的扣费金额未知或无效，暂未计入。`);
        continue;
      }
      charges.push({ id: contract.id, title, amount: contract.amount, chargeAt: contract.nextChargeAt, projectedBalance: null });
    }
  }

  charges.sort((a, b) => a.chargeAt - b.chargeAt || a.id.localeCompare(b.id));
  let upcomingTotal = 0;
  let firstShortfallAt: number | null = null;
  for (const charge of charges) {
    upcomingTotal += charge.amount;
    if (balance !== null && upcomingTotal > balance && firstShortfallAt === null) firstShortfallAt = charge.chargeAt;
    if (balance !== null && warnings.length === 0) charge.projectedBalance = balance - upcomingTotal;
  }
  const knownDeficit = balance === null ? 0 : Math.max(0, upcomingTotal - balance);
  const shortfall = knownDeficit > 0 ? knownDeficit : warnings.length ? null : 0;
  return {
    provider, providerName: PROVIDER_NAMES[provider], balance, charges, upcomingTotal,
    shortfall, firstShortfallAt,
    status: knownDeficit > 0 ? "shortfall" : warnings.length ? "unknown" : "covered",
    warnings: [...new Set(warnings)],
  };
}

/** Only each authorized contract's known next charge is projected; no transfer or debit is executed. */
export function buildFundingForecast(connections: Connections, now = Date.now(), horizonDays: FundingHorizonDays = 7): FundingForecast {
  if (!validTimestamp(now) || ![7, 14, 30].includes(horizonDays)) throw new RangeError("Invalid funding forecast date or horizon");
  const from = Math.floor((now + SHANGHAI_OFFSET) / DAY_MS) * DAY_MS - SHANGHAI_OFFSET;
  const to = from + (horizonDays + 1) * DAY_MS - 1;
  const accounts = PROVIDERS.flatMap(provider => {
    const source = connections[provider];
    return source && source.provider === provider ? [forecastAccount(provider, source, from, to)] : [];
  });
  return {
    horizonDays, from, to, accounts,
    knownBalanceTotal: accounts.reduce((total, account) => total + (account.balance ?? 0), 0),
    upcomingTotal: accounts.reduce((total, account) => total + account.upcomingTotal, 0),
    shortfallTotal: accounts.reduce((total, account) => total + (account.shortfall ?? 0), 0),
    coverageIncomplete: accounts.length === 0 || accounts.some(account => account.warnings.length > 0),
  };
}
