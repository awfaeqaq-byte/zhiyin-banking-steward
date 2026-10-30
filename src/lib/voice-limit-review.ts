import {validBankSnapshot, type BankSnapshot} from './bank-transfer';

export type VoiceLimitReview = {
  kind: 'payment_limit'; cardId: 'primary'; before: BankSnapshot;
  limit: number; createdAt: number; expiresAt: number;
};
export function validVoiceLimitReview(value: unknown): value is VoiceLimitReview {
  const r = value as VoiceLimitReview | undefined;
  return !!r && r.kind === 'payment_limit' && r.cardId === 'primary'
    && validBankSnapshot(r.before) && (r.before.cardId ?? 'primary') === r.cardId
    && Number.isSafeInteger(r.limit) && r.limit >= 10000 && r.limit <= 5000000
    && Number.isSafeInteger(r.createdAt) && r.createdAt > 0
    && Number.isSafeInteger(r.expiresAt) && r.expiresAt > r.createdAt && r.expiresAt <= r.createdAt + 300000;
}
export function verifyVoiceLimit(review: VoiceLimitReview, value: unknown): BankSnapshot {
  const before = review.before;
  if (!validBankSnapshot(value) || (value.cardId ?? 'primary') !== review.cardId
    || value.revision !== before.revision + 1 || value.limit !== review.limit
    || value.balance !== before.balance || value.frozen !== before.frozen
    || (['night','overseas','contactless'] as const).some(key => value.controls[key] !== before.controls[key])
    || (['transactions','payments','schedules'] as const).some(key => JSON.stringify(value[key] ?? []) !== JSON.stringify(before[key] ?? []))) {
    throw new Error('限额或账户状态尚未核实，请重新核对；不会重复提交调整。');
  }
  return value;
}
