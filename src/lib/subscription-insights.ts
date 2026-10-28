import type {
  ConnectedFinancialSource,
  ExternalFinancialProvider,
  FinancialAutopay,
} from "./financial-connections";

const DAY = 86_400_000;
export const RENEWAL_REMINDER_WINDOW_DAYS = 14;

export type SubscriptionFlag = "possible_duplicate";
export type DuplicateDecision = "keep" | "later" | "review";
export type DuplicatePreferences = Record<string, { decision: "keep" } | { decision: "later"; until: number }>;
export const EMPTY_DUPLICATE_PREFERENCES: DuplicatePreferences = {};
export function duplicateGroupKey(items: Array<{ key: string }>) {
  return encodeURIComponent(JSON.stringify([...new Set(items.map(item => item.key))].sort()));
}
export function subscriptionGroups(items: SubscriptionInsight[]) {
  const groups = new Map<string, SubscriptionInsight[]>();
  for (const item of items) groups.set(item.category, [...(groups.get(item.category) || []), item]);
  return [...groups.values()].filter(group => group.length > 1);
}
export type SubscriptionInsight = FinancialAutopay & {
  key: string;
  provider: ExternalFinancialProvider;
  providerName: string;
  daysUntilCharge: number | null;
  urgency: "urgent" | "upcoming" | "scheduled";
  flags: SubscriptionFlag[];
  category: string;
};

export type SubscriptionInsights = {
  items: SubscriptionInsight[];
  upcoming: SubscriptionInsight[];
  upcomingAmount: number;
  possibleDuplicateCount: number;
};

function categoryOf(item: FinancialAutopay) {
  const text = `${item.title}${item.merchant || ""}`.toLowerCase();
  if (/音乐|黑胶|绿钻|qq音乐|网易云/.test(text)) return "音乐会员";
  if (/视频|影视|优酷|爱奇艺|腾讯视频|芒果/.test(text)) return "视频会员";
  if (/外卖|吃货|饿了么|美团/.test(text)) return "外卖会员";
  if (/话费|联通|移动|电信/.test(text)) return "通信缴费";
  return item.title.replace(/vip|会员|连续|包月|自动续费/gi, "").trim() || item.title;
}

export function buildSubscriptionInsights(
  connections: Partial<Record<ExternalFinancialProvider, ConnectedFinancialSource>>,
  now = Date.now(),
  preferences: DuplicatePreferences = {},
): SubscriptionInsights {
  const items = (Object.entries(connections) as Array<[ExternalFinancialProvider, ConnectedFinancialSource]>)
    .flatMap(([provider, source]) => source.scopes.includes("autopay")
      ? source.autopays.filter(item => !source.cancelledAutopayIds?.includes(item.id)).map(item => {
        const daysUntilCharge = typeof item.nextChargeAt === "number"
          ? Math.max(0, Math.ceil((item.nextChargeAt - now) / DAY)) : null;
        return {
          ...item,
          key: `${provider}:${item.id}`,
          provider,
          providerName: provider === "wechat_pay" ? "微信支付" : "支付宝",
          daysUntilCharge,
          urgency: daysUntilCharge !== null && daysUntilCharge <= 3
            ? "urgent" as const
            : daysUntilCharge !== null && daysUntilCharge <= RENEWAL_REMINDER_WINDOW_DAYS
              ? "upcoming" as const : "scheduled" as const,
          flags: [] as SubscriptionFlag[],
          category: categoryOf(item),
        };
      }) : []);

  for (const group of subscriptionGroups(items)) {
    const preference = preferences[duplicateGroupKey(group)];
    if (preference?.decision === "keep" || (preference?.decision === "later" && preference.until > now)) continue;
    group.forEach(item => item.flags.push("possible_duplicate"));
  }
  items.sort((a, b) => (a.nextChargeAt ?? Number.MAX_SAFE_INTEGER) - (b.nextChargeAt ?? Number.MAX_SAFE_INTEGER));
  const upcoming = items.filter(
    item => item.daysUntilCharge !== null && item.daysUntilCharge <= RENEWAL_REMINDER_WINDOW_DAYS,
  );
  return {
    items,
    upcoming,
    upcomingAmount: upcoming.reduce((sum, item) => sum + item.amount, 0),
    possibleDuplicateCount: items.filter(item => item.flags.includes("possible_duplicate")).length,
  };
}

export function renewalTimingLabel(item: SubscriptionInsight) {
  if (item.daysUntilCharge === null) return `按${item.cycle || "周期"}续费`;
  if (item.daysUntilCharge === 0) return "预计今天扣费";
  return `${item.daysUntilCharge} 天后扣费`;
}
