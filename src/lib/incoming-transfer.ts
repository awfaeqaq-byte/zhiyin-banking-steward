import {bankCards, bankRecipients, validBankSnapshot, type BankRecipientId} from './bank-transfer';

export type IncomingTransfer = {
  id: string; status: 'received'; amount: number;
  senderName: string; senderLast4: string; recipientLast4: string;
  remark: string; completedAt: number;
};
export function validIncomingTransfer(value: unknown): value is IncomingTransfer {
  const r = value as IncomingTransfer | undefined;
  return !!r && r.status === 'received' && typeof r.id === 'string' && /^[\w-]{1,80}$/.test(r.id)
    && Number.isSafeInteger(r.amount) && r.amount > 0
    && typeof r.senderName === 'string' && r.senderName.trim().length > 0 && r.senderName.length <= 30
    && /^\d{4}$/.test(r.senderLast4) && /^\d{4}$/.test(r.recipientLast4)
    && typeof r.remark === 'string' && r.remark.length <= 80
    && Number.isSafeInteger(r.completedAt) && r.completedAt > 0;
}
/** Project only an executed transfer backed by both sides of the sandbox ledger. */
export function incomingFromLedger(snapshot: unknown, receivedTotal: number, id: string, recipientId: BankRecipientId, senderName: string, asOf: number): IncomingTransfer | null {
  if (!validBankSnapshot(snapshot) || !Number.isSafeInteger(receivedTotal) || receivedTotal < 0) return null;
  const matches = snapshot.transactions.filter(item => item.id === id && item.recipientId === recipientId);
  if (matches.length !== 1) return null;
  const r = matches[0], recipient = bankRecipients.find(item => item.id === recipientId);
  const card = bankCards.find(item => item.id === (r.sourceAccountId === 'demo-8888' ? 'primary' : r.sourceAccountId));
  if (!recipient || !card || receivedTotal < r.amount || r.completedAt > asOf) return null;
  if (r.executeAt !== undefined) {
    const scheduled = snapshot.schedules?.find(item => item.id === r.id);
    if (!scheduled || scheduled.status !== 'completed' || scheduled.amount !== r.amount || scheduled.recipientId !== recipientId
      || scheduled.executeAt !== r.executeAt || r.completedAt < r.executeAt) return null;
  }
  const result = {id: r.id, status: 'received' as const, amount: r.amount, senderName, senderLast4: card.last4,
    recipientLast4: recipient.accountLast4, remark: r.remark || '', completedAt: r.completedAt};
  return validIncomingTransfer(result) ? result : null;
}
