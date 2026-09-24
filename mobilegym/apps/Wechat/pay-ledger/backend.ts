import * as TimeService from '@/os/TimeService';
import { getWechatPayDateKey, getWechatPayMonthKey } from './dateKeys';
import { useWechatStore } from '../state';
import type {
  WechatPayCategory,
  WechatPayLedgerData,
  WechatPayLedgerSettings,
  WechatPayTransaction,
} from '../types';

export type WechatPayLedgerSeed = WechatPayLedgerData;

export type WechatPayLedgerQuery = {
  month: string;
  category?: WechatPayCategory | 'all';
  search?: string;
};

export type WechatPayLedgerResult = {
  transactions: WechatPayTransaction[];
  summary: { expenseCents: number; incomeCents: number; count: number };
  daily: Array<{ date: string; expenseCents: number; incomeCents: number; count: number }>;
  categories: Array<{ category: WechatPayCategory; expenseCents: number; count: number }>;
  monthly: Array<{ month: string; expenseCents: number }>;
  settings: WechatPayLedgerSettings;
};

export type NewWechatPayTransaction = Omit<WechatPayTransaction, 'id' | 'source'>;

export interface WechatPayBackend {
  getLedger(query: WechatPayLedgerQuery): Promise<WechatPayLedgerResult>;
  /** Read-only history across months; optional for existing external adapters. */
  getTransactionHistory?(): Promise<WechatPayTransaction[]>;
  getTransaction(id: string): Promise<WechatPayTransaction | null>;
  addTransaction(input: NewWechatPayTransaction): Promise<WechatPayTransaction>;
  updateSettings(updates: Partial<WechatPayLedgerSettings>): Promise<WechatPayLedgerSettings>;
}

function cloneSeed(seed: WechatPayLedgerSeed): WechatPayLedgerSeed {
  return {
    transactions: seed.transactions.map(item => ({ ...item })),
    monthlyHistory: seed.monthlyHistory.map(item => ({ ...item })),
    settings: { ...seed.settings },
  };
}

function transactionHistory(seed: WechatPayLedgerSeed): WechatPayTransaction[] {
  return seed.transactions
    .filter(item => seed.settings.includeManualRecords || item.source !== 'manual')
    .filter(item => Number.isFinite(Date.parse(item.occurredAt)))
    .sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt))
    .map(item => ({ ...item }));
}

function validateTransaction(input: NewWechatPayTransaction): NewWechatPayTransaction {
  if (!Number.isSafeInteger(input.amountCents) || input.amountCents <= 0) {
    throw new Error('金额必须大于 0');
  }
  if (!input.merchant.trim()) throw new Error('请输入交易说明');
  if (!Number.isFinite(Date.parse(input.occurredAt))) throw new Error('交易时间无效');
  return {
    ...input,
    merchant: input.merchant.trim().slice(0, 60),
    note: input.note?.trim().slice(0, 120),
    category: input.direction === 'income' ? 'income' : input.category,
  };
}

export function buildWechatPayLedgerResult(
  seed: WechatPayLedgerSeed,
  query: WechatPayLedgerQuery,
): WechatPayLedgerResult {
  const keyword = query.search?.trim().toLocaleLowerCase('zh-CN') || '';
  const transactions = seed.transactions
    .filter(item => seed.settings.includeManualRecords || item.source !== 'manual')
    .filter(item => getWechatPayMonthKey(item.occurredAt) === query.month)
    .filter(item => !query.category || query.category === 'all' || item.category === query.category)
    .filter(item => !keyword || `${item.merchant} ${item.note || ''}`.toLocaleLowerCase('zh-CN').includes(keyword))
    .sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt));

  const summary = transactions.reduce((acc, item) => {
    if (item.direction === 'expense') acc.expenseCents += item.amountCents;
    else acc.incomeCents += item.amountCents;
    acc.count += 1;
    return acc;
  }, { expenseCents: 0, incomeCents: 0, count: 0 });

  const dailyMap = new Map<string, WechatPayLedgerResult['daily'][number]>();
  const categoryMap = new Map<WechatPayCategory, WechatPayLedgerResult['categories'][number]>();
  for (const item of transactions) {
    const date = getWechatPayDateKey(item.occurredAt);
    const daily = dailyMap.get(date) || { date, expenseCents: 0, incomeCents: 0, count: 0 };
    if (item.direction === 'expense') daily.expenseCents += item.amountCents;
    else daily.incomeCents += item.amountCents;
    daily.count += 1;
    dailyMap.set(date, daily);

    if (item.direction === 'expense') {
      const category = categoryMap.get(item.category) || { category: item.category, expenseCents: 0, count: 0 };
      category.expenseCents += item.amountCents;
      category.count += 1;
      categoryMap.set(item.category, category);
    }
  }

  const monthly = seed.monthlyHistory
    .filter(item => item.month !== query.month)
    .concat({ month: query.month, expenseCents: seed.transactions
      .filter(item => seed.settings.includeManualRecords || item.source !== 'manual')
      .filter(item => item.direction === 'expense' && getWechatPayMonthKey(item.occurredAt) === query.month)
      .reduce((sum, item) => sum + item.amountCents, 0) })
    .sort((a, b) => a.month.localeCompare(b.month));

  return {
    transactions,
    summary,
    daily: [...dailyMap.values()].sort((a, b) => b.date.localeCompare(a.date)),
    categories: [...categoryMap.values()].sort((a, b) => b.expenseCents - a.expenseCents),
    monthly,
    settings: { ...seed.settings },
  };
}

let manualSequence = 0;

export function createMemoryWechatPayBackend(initialSeed: WechatPayLedgerSeed): WechatPayBackend {
  let seed = cloneSeed(initialSeed);
  return {
    async getLedger(query) {
      return buildWechatPayLedgerResult(seed, query);
    },
    async getTransactionHistory() {
      return transactionHistory(seed);
    },
    async getTransaction(id) {
      const transaction = seed.transactions.find(item => item.id === id);
      return transaction ? { ...transaction } : null;
    },
    async addTransaction(rawInput) {
      const input = validateTransaction(rawInput);
      manualSequence += 1;
      const transaction: WechatPayTransaction = {
        ...input,
        id: `manual-${TimeService.now()}-${manualSequence}`,
        source: 'manual',
      };
      seed = { ...seed, transactions: [transaction, ...seed.transactions] };
      return { ...transaction };
    },
    async updateSettings(updates) {
      seed = { ...seed, settings: { ...seed.settings, ...updates } };
      return { ...seed.settings };
    },
  };
}

const storeBackend: WechatPayBackend = {
  async getLedger(query) {
    return buildWechatPayLedgerResult(useWechatStore.getState().payLedger, query);
  },
  async getTransactionHistory() {
    return transactionHistory(useWechatStore.getState().payLedger);
  },
  async getTransaction(id) {
    const transaction = useWechatStore.getState().payLedger.transactions.find(item => item.id === id);
    return transaction ? { ...transaction } : null;
  },
  async addTransaction(rawInput) {
    const input = validateTransaction(rawInput);
    manualSequence += 1;
    const transaction: WechatPayTransaction = {
      ...input,
      id: `manual-${TimeService.now()}-${manualSequence}`,
      source: 'manual',
    };
    useWechatStore.getState().addPayLedgerTransaction(transaction);
    return transaction;
  },
  async updateSettings(updates) {
    useWechatStore.getState().updatePayLedgerSettings(updates);
    return { ...useWechatStore.getState().payLedger.settings };
  },
};

let backendOverride: WechatPayBackend | null = null;

/** Swap this adapter for an HTTP backend or deterministic fixture in later tests. */
export function configureWechatPayBackend(backend: WechatPayBackend | null) {
  backendOverride = backend;
}

export function getWechatPayBackend(): WechatPayBackend {
  return backendOverride || storeBackend;
}
