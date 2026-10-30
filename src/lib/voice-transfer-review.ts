import {validTransfer, validBankSnapshot, type BankDraft, type BankSchedule} from './bank-transfer';

export type VoiceTransferReview = {kind: 'scheduled_transfer'; draft: BankDraft};
export function validVoiceTransferReview(value: unknown): value is VoiceTransferReview {
  const review = value as VoiceTransferReview | undefined;
  if (!review || review.kind !== 'scheduled_transfer' || !review.draft) return false;
  const d = review.draft;
  return validTransfer(d) && typeof d.id === 'string' && /^[\w-]{1,80}$/.test(d.id)
    && Number.isSafeInteger(d.executeAt) && d.executeAt! > d.createdAt
    && Number.isSafeInteger(d.balance) && d.balance >= d.amount
    && Number.isSafeInteger(d.revision) && d.revision >= 0
    && Number.isFinite(d.createdAt) && Number.isFinite(d.expiresAt) && d.expiresAt > d.createdAt
    && (d.sourceAccountId === 'demo-8888' || d.sourceAccountId === 'primary') && !d.review;
}
export function verifyVoiceSchedule(review: VoiceTransferReview, value: unknown): BankSchedule {
  if (!validBankSnapshot(value)) throw new Error('预约记录暂未读到，请重新核对原预约，勿重复提交。');
  const d = review.draft, item = value.schedules?.find(s => s.id === d.id);
  if (!item || item.status !== 'pending' || item.recipientId !== d.recipientId || item.amount !== d.amount
    || item.executeAt !== d.executeAt || (item.remark || '') !== (d.remark || '')
    || !['demo-8888', 'primary'].includes(item.sourceAccountId || '')
    || value.balance !== d.balance || value.transactions.some(t => t.id === d.id)) {
    throw new Error('原预约的时间、金额或未扣款状态尚未核实，请重新核对，勿重复提交。');
  }
  return item;
}
export const voiceScheduleTime = (at: number) => new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
}).format(at);
