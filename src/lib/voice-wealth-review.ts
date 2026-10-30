import {validWealthSnapshot, wealthProducts, type RedemptionDraft, type RedemptionReceipt, type WealthHolding} from './wealth-operation';

/** A prepared business result, never an instruction extracted from model prose. */
export type VoiceWealthReview = {
  kind: 'wealth_redemption';
  draft: RedemptionDraft;
  holding: WealthHolding;
  protectedHoldings: WealthHolding[];
};

export function validVoiceWealthReview(value: unknown): value is VoiceWealthReview {
  const review = value as VoiceWealthReview | undefined;
  if (!review || review.kind !== 'wealth_redemption' || !review.draft || !review.holding || !Array.isArray(review.protectedHoldings)) return false;
  const {draft, holding, protectedHoldings} = review;
  return validWealthSnapshot({version: 1, receipts: [], holdings: [holding, ...protectedHoldings]})
    && !holding.redeemedAt && protectedHoldings.every(item => !item.redeemedAt && item.id !== holding.id)
    && new Set(protectedHoldings.map(item => item.id)).size === protectedHoldings.length
    && typeof draft.id === 'string' && draft.id.length > 0 && draft.id.length <= 80
    && draft.holdingId === holding.id && draft.amount === holding.principal
    && Number.isSafeInteger(draft.fee) && draft.fee >= 0 && draft.fee < draft.amount
    && Number.isFinite(draft.createdAt) && Number.isFinite(draft.expiresAt) && draft.expiresAt > draft.createdAt;
}

export function verifyVoiceRedemption(review: VoiceWealthReview, value: unknown): RedemptionReceipt {
  if (!validWealthSnapshot(value)) throw new Error('账户复查未完成，请重新核对结果，勿重复赎回。');
  const receipt = value.redemptions?.find(item => item.id === review.draft.id);
  const holding = value.holdings?.find(item => item.id === review.holding.id);
  if (!receipt || receipt.holdingId !== review.holding.id || receipt.amount !== review.draft.amount
    || receipt.fee !== review.draft.fee || holding?.redeemedAt !== receipt.completedAt) {
    throw new Error('原赎回回执与持仓尚未核实，请重新核对结果，勿重复赎回。');
  }
  for (const original of review.protectedHoldings) {
    const current = value.holdings?.find(item => item.id === original.id);
    if (!current || current.redeemedAt || current.productId !== original.productId || current.principal !== original.principal
      || current.units !== original.units || current.purchasedAt !== original.purchasedAt) {
      throw new Error('赎回回执已收到，长期持仓复查未通过。请核对原持仓，勿重复赎回。');
    }
  }
  return receipt;
}

export const voiceWealthProductName = (holding: WealthHolding) => wealthProducts.find(item => item.id === holding.productId)!.name;
export const voiceMoney = (cents: number) => new Intl.NumberFormat('zh-CN', {style: 'currency', currency: 'CNY'}).format(cents / 100);
