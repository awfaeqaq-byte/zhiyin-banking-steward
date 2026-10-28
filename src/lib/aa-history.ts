import type {ExpenseBook, ExpenseEntry} from './expense-notebook';
import {entryAllocations} from './expense-notebook';
import {collectionProgress, expenseActivityClosed} from './expense-follow-up';
import {calculateGroupAA, validAAGroup} from './group-aa';
import {sourceExpenseNet, validSceneExpenseSource} from './scene-expenses';

export type AAHistoryStatus = 'pending' | 'collecting' | 'settled' | 'attention';
export type AAHistorySummary = {
  status: AAHistoryStatus;
  label: string;
  /** Original recorded expenses, including preserved records for refunded orders. */
  total: number;
  /** Recorded expenses not yet published for collection; fully refunded orders are excluded. */
  pendingTotal: number;
  /** Verified historical receipts, never an assertion that cancelled payments were refunded. */
  collected: number;
  collectTotal: number;
  updatedAt: number;
  entryCount: number;
};

const labels: Record<AAHistoryStatus, string> = {
  pending: '待结算',
  collecting: '收款中',
  settled: '已结清',
  attention: '需核对',
};
const recordedAmount = (entry: ExpenseEntry) =>
  Number.isSafeInteger(entry.amount) && entry.amount > 0 ? entry.amount : 0;
const timestamp = (value: number | undefined) =>
  Number.isFinite(value) && value! > 0 ? value! : 0;

/** Read-only history summary using the same receipt validation as the active AA workflow. */
export function aaHistorySummary(book: ExpenseBook): AAHistorySummary {
  let needsAttention = !validAAGroup(book.group);
  let collected = 0;
  let collectTotal = 0;
  let collecting = false;
  let pendingTotal = 0;
  let updatedAt = timestamp(book.at);
  const batches = new Map(book.batches.map(batch => [batch.id, batch]));
  const entries = new Map(book.entries.map(entry => [entry.id, entry]));
  if (batches.size !== book.batches.length || entries.size !== book.entries.length) needsAttention = true;

  for (const entry of book.entries) {
    updatedAt = Math.max(updatedAt, timestamp(entry.at), timestamp(entry.source?.checkedAt));
    try {
      entryAllocations(book.group, entry);
      if (entry.source && !validSceneExpenseSource(entry.source)) needsAttention = true;
    } catch {
      needsAttention = true;
    }
    const batch = entry.batchId ? batches.get(entry.batchId) : undefined;
    if (entry.batchId && (!batch || !batch.entryIds.includes(entry.id))) needsAttention = true;
    const net = entry.source ? sourceExpenseNet(entry.source) : entry.amount;
    const fullyRefunded = !!entry.source && net === 0;
    if (entry.source && net !== entry.amount && (batch || !fullyRefunded)) needsAttention = true;
    if ((!batch || batch.status === 'prepared') && !fullyRefunded) pendingTotal += recordedAmount(entry);
  }

  for (const batch of book.batches) {
    updatedAt = Math.max(updatedAt, timestamp(batch.at), timestamp(batch.receipt?.createdAt));
    if (batch.sourceChanged || !batch.entryIds.length ||
      new Set(batch.entryIds).size !== batch.entryIds.length ||
      batch.entryIds.some(id => entries.get(id)?.batchId !== batch.id)) needsAttention = true;
    try {
      const expected = calculateGroupAA(book.group, batch.plan);
      if (batch.status === 'prepared') continue;
      if (batch.status !== 'published') {
        needsAttention = true;
        continue;
      }
      collectTotal += expected.collectAmount;
      if (!batch.receipt) {
        needsAttention = true;
        continue;
      }
      const progress = collectionProgress(book, batch, batch.receipt);
      collected += progress.paid;
      if (progress.cancelled) needsAttention = true;
      else if (!progress.complete) collecting = true;
    } catch {
      needsAttention = true;
    }
  }

  let status: AAHistoryStatus = 'pending';
  if (needsAttention) status = 'attention';
  else {
    try {
      if (expenseActivityClosed(book)) status = 'settled';
      else if (collecting) status = 'collecting';
    } catch {
      status = 'attention';
    }
  }
  return {
    status,
    label: labels[status],
    total: book.entries.reduce((sum, entry) => sum + recordedAmount(entry), 0),
    pendingTotal,
    collected,
    collectTotal,
    updatedAt,
    entryCount: book.entries.length,
  };
}

export function filterAAHistory(
  books: ExpenseBook[],
  query: string,
  status: 'all' | AAHistoryStatus = 'all',
): ExpenseBook[] {
  const search = query.trim().toLocaleLowerCase();
  return books.map(book => ({book, summary: aaHistorySummary(book)}))
    .filter(({book, summary}) => {
      if (status !== 'all' && summary.status !== status) return false;
      if (!search) return true;
      const participantIds = new Set([
        ...book.participants,
        ...book.entries.flatMap(entry => [entry.payerId, ...entry.fixed.map(part => part.memberId), ...entry.shares.map(part => part.memberId)]),
      ]);
      return [book.title, book.group.name,
        ...book.group.members.filter(member => participantIds.has(member.id)).map(member => member.name),
      ].some(value => value.toLocaleLowerCase().includes(search));
    })
    .sort((a, b) => b.summary.updatedAt - a.summary.updatedAt || a.book.id.localeCompare(b.book.id))
    .map(({book}) => book);
}
