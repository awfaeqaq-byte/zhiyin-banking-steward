import { useAlipayStore } from '@/apps/Alipay/state';
import { useWechatStore } from '@/apps/Wechat/state';
import { getWechatPayBackend } from '@/apps/Wechat/pay-ledger/backend';
import type { WechatPayTransaction } from '@/apps/Wechat/types';
import * as TimeService from '@/os/TimeService';

export type FinancialProvider = 'alipay' | 'wechat_pay';
export type FinancialScope = 'balance' | 'transactions' | 'autopay';

// Shared-ledger refunds are also produced by FoodDelivery, beyond Wechat's legacy category union.
type FinancialWechatTransaction = Omit<WechatPayTransaction, 'category'> & {
  category: WechatPayTransaction['category'] | 'refund';
};

type Dependencies = {
  nowIso: () => string;
  readAlipay: () => {
    balance: { total: number };
    transferRecords: Array<Record<string, unknown>>;
    subscriptions: Array<Record<string, unknown>>;
  };
  readWechatPay: () => { subscriptions: Array<Record<string, unknown>> };
  readWechatWallet: () => { balanceCents: number };
  readWechatLedger: () => Promise<FinancialWechatTransaction[]>;
};

const categoryLabels: Record<string, string> = {
  dining: '餐饮', transport: '出行', travel: '出行', shopping: '购物', apparel: '购物',
  department: '购物', digital: '购物', home: '生活', lifeService: '生活',
  publicService: '生活', medical: '医疗', education: '教育', refund: '退款',
  transferRedPacket: '转账', friendPayment: '转账', accountDepositWithdraw: '转账',
  income: '收入', other: '其他', transfer: '转账',
};

const TRANSACTION_RESPONSE_LIMIT = 5_000;

const defaults: Dependencies = {
  nowIso: () => TimeService.getDate().toISOString(),
  readAlipay: () => {
    const state = useAlipayStore.getState();
    return {
      balance: state.balance,
      transferRecords: state.transferRecords as unknown as Array<Record<string, unknown>>,
      subscriptions: state.subscriptions as unknown as Array<Record<string, unknown>>,
    };
  },
  readWechatPay: () => ({
    subscriptions: useWechatStore.getState().subscriptions as unknown as Array<Record<string, unknown>>,
  }),
  readWechatWallet: () => ({ balanceCents: useWechatStore.getState().wallet.balanceCents }),
  readWechatLedger: async () => {
    const backend = getWechatPayBackend();
    if (backend.getTransactionHistory) return backend.getTransactionHistory();
    // Older partner adapters expose monthly queries only. Include the preceding
    // year so ordinary monthly/annual patterns are not limited to today's month.
    const today = TimeService.getDate();
    const ledgers = await Promise.all(Array.from({ length: 13 }, (_, offset) => {
      const month = TimeService.fromLocalParts(today.getFullYear(), today.getMonth() - offset, 1);
      return backend.getLedger({
        month: `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}`,
      });
    }));
    return ledgers.flatMap(ledger => ledger.transactions);
  },
};

function cents(value: unknown) {
  const amount = typeof value === 'number' && Number.isFinite(value) ? Math.round(value * 100) : 0;
  return Number.isSafeInteger(amount) ? amount : 0;
}

function nonNegativeCents(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return undefined;
  const scaled = value * 100;
  const amount = Math.round(scaled);
  return Number.isSafeInteger(amount) && Math.abs(scaled - amount) <= 1e-7 ? amount : undefined;
}

function dateLabel(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '近期';
  const date = TimeService.fromTimestamp(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function alipayTransactions(records: Array<Record<string, unknown>>) {
  const valid = records.filter(record => (
    typeof record.id === 'string' && typeof record.delta === 'number' &&
    Number.isSafeInteger(Math.round(record.delta * 100)) &&
    typeof record.timestamp === 'number' && Number.isFinite(record.timestamp) &&
    Number.isFinite(TimeService.fromTimestamp(record.timestamp).getTime())
  )).sort((a, b) => Number(b.timestamp) - Number(a.timestamp));
  const transactions = valid.slice(0, TRANSACTION_RESPONSE_LIMIT).map((record) => {
    const kind = record.kind === 'refund' ? 'refund'
      : record.kind === 'salary' ? 'income'
        : ['transfer', 'recharge', 'withdrawal', 'redPacket'].includes(String(record.kind)) ? 'transfer'
          : 'payment';
    const linkedId = typeof record.linkedId === 'string' ? record.linkedId : record.orderId;
    return {
      id: String(record.id).slice(0, 80),
      title: String(record.displayTitle || record.counterpartyName || '支付宝交易').slice(0, 80),
      amount: cents(record.delta),
      category: categoryLabels[String(record.category)] || (kind === 'transfer' ? '转账' : kind === 'refund' ? '退款' : '其他'),
      occurredAt: dateLabel(record.timestamp),
      kind,
      ...(typeof linkedId === 'string' ? { linkedId: linkedId.slice(0, 100) } : {}),
    };
  });
  return {
    transactions,
    transactionCoverage: {
      total: records.length,
      returned: transactions.length,
      invalid: records.length - valid.length,
      complete: valid.length <= TRANSACTION_RESPONSE_LIMIT && valid.length === records.length,
      ...(transactions.length ? {
        from: transactions.at(-1)?.occurredAt,
        to: transactions[0]?.occurredAt,
      } : {}),
    },
  };
}

function cancelledAutopayIds(records: Array<Record<string, unknown>>) {
  return [...new Set(records.flatMap(record => (
    record.autoRenew === false && typeof record.id === 'string' ? [record.id.slice(0, 80)] : []
  )))].slice(0, 1_000);
}

function autopays(records: Array<Record<string, unknown>>) {
  const active = records.filter(record => record?.autoRenew === true);
  const valid = active.flatMap((record) => {
    const amount = nonNegativeCents(record.price);
    if (
      typeof record.id !== 'string' || !record.id.trim() || record.id.length > 80 ||
      typeof record.membershipType !== 'string' || !record.membershipType.trim() ||
      typeof record.billingCycle !== 'string' || !record.billingCycle.trim() ||
      amount === undefined
    ) return [];
    return [{
      id: record.id,
      title: record.membershipType.slice(0, 80),
      merchant: String(record.source || '合作商户').slice(0, 80),
      amount,
      cycle: record.billingCycle.slice(0, 30),
      ...(typeof record.createdAt === 'number' && Number.isFinite(record.createdAt)
        ? { createdAt: record.createdAt } : {}),
      ...(typeof record.nextChargeAt === 'number' && Number.isFinite(record.nextChargeAt)
        ? { nextChargeAt: record.nextChargeAt } : {}),
      ...(typeof record.lastChargedAt === 'number' && Number.isFinite(record.lastChargedAt)
        ? { lastChargedAt: record.lastChargedAt } : {}),
    }];
  });
  return {
    autopays: valid.slice(0, 1_000),
    autopaysIncomplete: valid.length !== active.length || valid.length > 1_000,
  };
}

function wechatTransactions(records: FinancialWechatTransaction[]) {
  const valid = records.filter(record => (
    typeof record.id === 'string' && typeof record.merchant === 'string' &&
    Number.isSafeInteger(record.amountCents) && record.amountCents > 0 &&
    ['expense', 'income'].includes(record.direction) &&
    typeof record.occurredAt === 'string' && Number.isFinite(Date.parse(record.occurredAt))
  )).sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt));
  const transactions = valid.slice(0, TRANSACTION_RESPONSE_LIMIT).map(record => {
    const isInvalidLegacyLink =
      (record.linkedId === 'order-hema' && (!record.merchant.includes('盒马') || record.amountCents !== 13_200)) ||
      (record.linkedId === 'order-didi' && (!record.merchant.includes('滴滴') || record.amountCents !== 4_800));
    return {
      id: record.id.slice(0, 80),
      title: record.merchant.slice(0, 80),
      amount: record.direction === 'expense' ? -record.amountCents : record.amountCents,
      category: categoryLabels[record.category] || '其他',
      occurredAt: record.occurredAt.slice(0, 10),
      kind: record.category === 'refund' ? 'refund'
        : record.category === 'transfer' ? 'transfer'
          : record.direction === 'income' ? 'income' : 'payment',
      ...(record.linkedId && !isInvalidLegacyLink ? { linkedId: record.linkedId.slice(0, 100) } : {}),
    };
  });
  return {
    transactions,
    transactionCoverage: {
      total: records.length,
      returned: transactions.length,
      invalid: records.length - valid.length,
      complete: valid.length <= TRANSACTION_RESPONSE_LIMIT && valid.length === records.length,
      ...(transactions.length ? {
        from: transactions.at(-1)?.occurredAt,
        to: transactions[0]?.occurredAt,
      } : {}),
    },
  };
}

export async function loadFinancialSource(
  provider: FinancialProvider,
  requestedScopes: FinancialScope[],
  dependencies: Dependencies = defaults,
) {
  const scopes = [...new Set(requestedScopes)].filter(scope => ['balance', 'transactions', 'autopay'].includes(scope));
  if (!scopes.length) return { status: 'denied' as const };

  if (provider === 'alipay') {
    const state = dependencies.readAlipay();
    const balance = nonNegativeCents(state.balance.total);
    const transactionData = scopes.includes('transactions') ? alipayTransactions(state.transferRecords) : undefined;
    return {
      status: 'granted' as const,
      source: {
        provider, displayName: '支付宝', accountMasked: '叶先生', syncedAt: dependencies.nowIso(),
        ...(scopes.includes('balance') && balance !== undefined ? { balance } : {}),
        transactions: transactionData?.transactions || [],
        ...(transactionData ? { transactionCoverage: transactionData.transactionCoverage } : {}),
        ...(scopes.includes('autopay') ? autopays(state.subscriptions) : { autopays: [] }),
        ...(scopes.includes('autopay') ? { cancelledAutopayIds: cancelledAutopayIds(state.subscriptions) } : {}),
      },
    };
  }

  const state = dependencies.readWechatPay();
  const wallet = dependencies.readWechatWallet();
  const ledger = scopes.includes('transactions') ? await dependencies.readWechatLedger() : [];
  const transactionData = scopes.includes('transactions') ? wechatTransactions(ledger) : undefined;
  return {
    status: 'granted' as const,
    source: {
      provider, displayName: '微信支付', accountMasked: '叶先生', syncedAt: dependencies.nowIso(),
      ...(scopes.includes('balance') && Number.isSafeInteger(wallet.balanceCents) && wallet.balanceCents >= 0
        ? { balance: wallet.balanceCents } : {}),
      transactions: transactionData?.transactions || [],
      ...(transactionData ? { transactionCoverage: transactionData.transactionCoverage } : {}),
      ...(scopes.includes('autopay') ? autopays(state.subscriptions) : { autopays: [] }),
      ...(scopes.includes('autopay') ? { cancelledAutopayIds: cancelledAutopayIds(state.subscriptions) } : {}),
    },
  };
}
