import {createHash} from 'node:crypto';
import {occasionProducts} from '../src/lib/occasion-plans';
import {validSceneExpenseSource, type SceneExpenseSource} from '../src/lib/scene-expenses';
import type {BankSnapshot} from '../src/lib/bank-transfer';
import type {Workspace} from '../src/lib/workspaces';
import type {SceneFlow} from '../src/lib/scene-flow';

const sourceId = (kind: string, paymentId: string) => `source-${createHash('sha256').update(`${kind}:${paymentId}`).digest('hex')}`;
type Input = {members: Workspace[]; scene: Pick<SceneFlow, 'id' | 'workspaceIds' | 'links' | 'orders' | 'error'>; account: BankSnapshot; checkedAt: number};

/** Pure receipt extraction; all joins use task/order/payment identities, never model amounts. */
export function sceneExpenseFacts({members, scene, account, checkedAt}: Input): SceneExpenseSource[] {
  const owned = members.filter(member => member.status === 'active' && scene.workspaceIds.includes(member.id) && (member.id === scene.id || member.sceneId === scene.id));
  const memberIds = new Set(owned.map(member => member.id)), sources: SceneExpenseSource[] = [];
  for (const plan of account.occasions || []) {
    if (!memberIds.has(plan.id)) continue;
    for (const order of plan.orders) {
      const payment = account.payments?.find(item => item.id === order.paymentId && item.occasionId === plan.id);
      if (!payment) continue;
      if (payment.amount !== order.amount || payment.merchant !== order.merchant) throw new Error('原订单与付款金额无法核对，请保留原记录');
      sources.push({id: sourceId('bank', payment.id), workspaceId: plan.id, orderId: order.orderId, paymentId: payment.id, kind: 'occasion', title: occasionProducts.find(item => item.id === order.productId)?.name || plan.title, merchant: payment.merchant, paidAmount: payment.amount, refundedAmount: payment.refundedAt === undefined ? 0 : payment.amount, paidAt: payment.completedAt, checkedAt});
    }
  }
  // Failed platform reads retain saved entries but cannot create fresh import candidates.
  if (!scene.error) for (const order of scene.orders) {
    const payment = order.payment;
    if (!payment || payment.amount === 0 || !memberIds.has(order.taskId) || !scene.links.some(link => link.kind === 'food_order' && link.channel === 'food' && link.id === order.id && link.workspaceId === order.taskId)) continue;
    const owner = owned.find(item => item.id === order.taskId)!;
    if (owner.progress?.food?.orderId !== order.id) continue;
    sources.push({id: sourceId('food', payment.id), workspaceId: order.taskId, orderId: order.id, paymentId: payment.id, kind: 'food', title: owner.title, merchant: payment.merchant, paidAmount: payment.amount, refundedAmount: payment.refundedAmount, paidAt: payment.paidAt, checkedAt: order.checkedAt});
  }
  if (!sources.every(validSceneExpenseSource) || new Set(sources.map(source => source.id)).size !== sources.length || new Set(sources.map(source => source.paymentId)).size !== sources.length) throw new Error('订单实付来源无法核对');
  return sources;
}
