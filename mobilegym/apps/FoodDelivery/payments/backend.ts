import * as TimeService from '../../../os/TimeService';
import { useAlipayStore } from '../../Alipay/state';
import type { AlipayBalance, AlipayTransferRecord } from '../../Alipay/types';
import { useWechatStore } from '../../Wechat/state';
import type { WechatPayLedgerData, WechatPayTransaction, WechatWalletData } from '../../Wechat/types';
import { progressOrder, refundOrder, type FoodDeliveryPaymentMethod, type OrderRecord } from '../orderModel';
import { useFoodDeliveryStore } from '../state';
import {bankFunding,type BankFundingBackend,type FundingSource} from './bank';

export type FoodDeliveryPaymentSnapshot = {
  orders: OrderRecord[];
  wechat: {
    wallet: WechatWalletData;
    payLedger: WechatPayLedgerData;
  };
  alipay: {
    balance: AlipayBalance;
    transferRecords: AlipayTransferRecord[];
  };
};

export type FoodDeliveryPaymentResult = {
  order: OrderRecord;
  recordId: string;
  alreadyProcessed: boolean;
};

export interface FoodDeliveryPaymentBackend {
  pay(orderId: string, method: FoodDeliveryPaymentMethod, now?: number, funding?:FundingSource): Promise<FoodDeliveryPaymentResult>;
  refund(orderId: string, reason: string, now?: number): Promise<FoodDeliveryPaymentResult>;
  getSnapshot(): Promise<FoodDeliveryPaymentSnapshot>;
}

const PAYMENT_LABEL: Record<FoodDeliveryPaymentMethod, string> = {
  wechat_pay: '微信支付',
  alipay: '支付宝',
};

const cloneOrder = (order: OrderRecord): OrderRecord => ({
  ...order,
  lines: order.lines.map(line => ({ ...line })),
  rider: { ...order.rider },
});

const cloneSnapshot = (snapshot: FoodDeliveryPaymentSnapshot): FoodDeliveryPaymentSnapshot => ({
  orders: snapshot.orders.map(cloneOrder),
  wechat: {
    wallet: {
      ...snapshot.wechat.wallet,
      transfers: snapshot.wechat.wallet.transfers.map(transfer => ({ ...transfer })),
    },
    payLedger: {
      ...snapshot.wechat.payLedger,
      transactions: snapshot.wechat.payLedger.transactions.map(transaction => ({ ...transaction })),
      monthlyHistory: snapshot.wechat.payLedger.monthlyHistory.map(item => ({ ...item })),
      settings: { ...snapshot.wechat.payLedger.settings },
    },
  },
  alipay: {
    balance: { ...snapshot.alipay.balance },
    transferRecords: snapshot.alipay.transferRecords.map(record => ({ ...record })),
  },
});

const merchantName = (order: OrderRecord) => order.lines[0]?.storeName || '好食送外卖';
const paymentRecordId = (method: FoodDeliveryPaymentMethod, orderId: string) =>
  `fooddelivery-payment-${method === 'wechat_pay' ? 'wechat' : 'alipay'}-${orderId}`;
const refundRecordId = (method: FoodDeliveryPaymentMethod, orderId: string) =>
  `fooddelivery-refund-${method === 'wechat_pay' ? 'wechat' : 'alipay'}-${orderId}`;

function findOrder(snapshot: FoodDeliveryPaymentSnapshot, orderId: string) {
  const index = snapshot.orders.findIndex(order => order.id === orderId);
  if (index < 0) throw new Error('未找到外卖订单');
  return { index, order: snapshot.orders[index] };
}

function completeOrderPayment(order: OrderRecord, method: FoodDeliveryPaymentMethod, recordId: string, paidAt: number) {
  let nextOrder = order;
  if (nextOrder.status === 'PENDING_PAYMENT') nextOrder = progressOrder(nextOrder, 'pay');
  if (nextOrder.status === 'PAID') nextOrder = progressOrder(nextOrder, 'accept');
  return { ...nextOrder, paymentMethod: method, paymentRecordId: recordId, paidAt };
}

function applyPayment(
  rawSnapshot: FoodDeliveryPaymentSnapshot,
  orderId: string,
  method: FoodDeliveryPaymentMethod,
  now: number,
  funding:FundingSource='balance',
) {
  const snapshot = cloneSnapshot(rawSnapshot);
  const { index, order } = findOrder(snapshot, orderId);
  if(order.pendingBankMethod && (method!==order.pendingBankMethod || funding!=='bank_8888'))throw new Error('上一笔银行卡付款结果待核对，请用原付款方式重试');
  if(order.fundingSource && order.fundingSource!==funding)throw new Error('订单付款账户不一致');
  if(!['wechat_pay','alipay'].includes(method) || !['balance','bank_8888'].includes(funding))throw new Error('付款方式无效');
  if(!Number.isSafeInteger(order.payable) || order.payable<=0)throw new Error('订单金额无效');
  if(order.occasionId&&funding!=='bank_8888')throw new Error('筹备订单须使用对应预留预算的银行卡');
  if (order.paymentMethod && order.paymentMethod !== method) {
    throw new Error(`订单已使用${PAYMENT_LABEL[order.paymentMethod]}`);
  }

  const recordId = paymentRecordId(method, orderId);
  const linkedId = order.bankPaymentId ?? `fooddelivery:payment:${orderId}`;
  const existingWechat = snapshot.wechat.payLedger.transactions.find(
    record => record.id === recordId || record.linkedId === linkedId,
  );
  const existingAlipay = snapshot.alipay.transferRecords.find(
    record => record.id === recordId || record.linkedId === linkedId,
  );
  const existingRecord = method === 'wechat_pay' ? existingWechat : existingAlipay;
  if (order.paymentRecordId === recordId || existingRecord) {
    const paidAt = method === 'wechat_pay'
      ? Date.parse(existingWechat?.occurredAt ?? '') || order.paidAt || now
      : existingAlipay?.timestamp ?? order.paidAt ?? now;
    const completed = completeOrderPayment(order, method, recordId, paidAt);
    snapshot.orders[index] = completed;
    return { snapshot, result: { order: cloneOrder(completed), recordId, alreadyProcessed: true } };
  }

  if (order.status !== 'PENDING_PAYMENT') throw new Error('当前订单状态不支持支付');
  const name = merchantName(order);

  if (method === 'wechat_pay') {
    if (funding==='balance' && snapshot.wechat.wallet.balanceCents < order.payable) throw new Error('微信零钱不足');
    const record: WechatPayTransaction = {
      id: recordId,
      linkedId,
      direction: 'expense',
      amountCents: order.payable,
      category: 'dining',
      merchant: name,
      occurredAt: TimeService.fromTimestamp(now).toISOString(),
      note: `外卖订单 ${order.id}`,
      source: 'wechat_pay',
      fundingSource:funding,
    };
    if(funding==='balance')snapshot.wechat.wallet.balanceCents -= order.payable;
    snapshot.wechat.payLedger.transactions.unshift(record);
  } else {
    const balanceCents = Math.round(snapshot.alipay.balance.total * 100);
    if (funding==='balance' && balanceCents < order.payable) throw new Error('支付宝余额不足');
    const record: AlipayTransferRecord = {
      id: recordId,
      linkedId,
      counterpartyName: name,
      counterpartyAvatar: '',
      displayTitle: name,
      delta: -order.payable / 100,
      timestamp: now,
      description: '外卖订单支付',
      note: `外卖订单 ${order.id}`,
      kind: 'payment',
      category: 'dining',
      detailTimeLabel: '支付时间',
      paymentMethod: funding==='bank_8888'?'常用卡 · 8888':'余额',
      fundingSource:funding,
      productDescription: order.lines.map(line => line.dishName).join('、'),
      orderId: order.id,
      merchantOrderId: order.id,
      payeeFullName: name,
      includeInBudget: true,
    };
    if(funding==='balance')snapshot.alipay.balance.total = (balanceCents - order.payable) / 100;
    snapshot.alipay.transferRecords.unshift(record);
  }

  const completed = {...completeOrderPayment(order, method, recordId, now),fundingSource:funding,pendingBankMethod:undefined};
  snapshot.orders[index] = completed;
  return { snapshot, result: { order: cloneOrder(completed), recordId, alreadyProcessed: false } };
}

function applyRefund(
  rawSnapshot: FoodDeliveryPaymentSnapshot,
  orderId: string,
  reason: string,
  now: number,
) {
  const snapshot = cloneSnapshot(rawSnapshot);
  const { index, order } = findOrder(snapshot, orderId);
  const method = order.paymentMethod;
  if (!method) throw new Error('订单尚未支付，不能退款');

  const recordId = refundRecordId(method, orderId);
  const linkedId = `fooddelivery:refund:${orderId}`;
  const existingWechat = snapshot.wechat.payLedger.transactions.find(
    record => record.id === recordId || record.linkedId === linkedId,
  );
  const existingAlipay = snapshot.alipay.transferRecords.find(
    record => record.id === recordId || record.linkedId === linkedId,
  );
  const existingRecord = method === 'wechat_pay' ? existingWechat : existingAlipay;
  if (order.refundRecordId === recordId || existingRecord) {
    const refundedAt = method === 'wechat_pay'
      ? Date.parse(existingWechat?.occurredAt ?? '') || order.refundedAt || now
      : existingAlipay?.timestamp ?? order.refundedAt ?? now;
    const refunded = {
      ...order,
      status: 'REFUNDED' as const,
      refundReason: order.refundReason || reason,
      refundRecordId: recordId,
      refundedAt,
    };
    snapshot.orders[index] = refunded;
    return { snapshot, result: { order: cloneOrder(refunded), recordId, alreadyProcessed: true } };
  }

  const refunded = {
    ...refundOrder(order, reason),
    refundRecordId: recordId,
    refundedAt: now,
  };
  const name = merchantName(order);
  if (method === 'wechat_pay') {
    const record: WechatPayTransaction = {
      id: recordId,
      linkedId,
      direction: 'income',
      amountCents: order.payable,
      category: 'dining',
      merchant: name,
      occurredAt: TimeService.fromTimestamp(now).toISOString(),
      note: `外卖订单 ${order.id} 原路退款`,
      source: 'wechat_pay',
    };
    record.fundingSource=order.fundingSource??'balance';
    if(order.fundingSource!=='bank_8888')snapshot.wechat.wallet.balanceCents += order.payable;
    snapshot.wechat.payLedger.transactions.unshift(record);
  } else {
    const balanceCents = Math.round(snapshot.alipay.balance.total * 100);
    const record: AlipayTransferRecord = {
      id: recordId,
      linkedId,
      counterpartyName: name,
      counterpartyAvatar: '',
      displayTitle: `${name}退款`,
      delta: order.payable / 100,
      timestamp: now,
      description: '外卖订单退款',
      note: reason,
      kind: 'refund',
      category: 'refund',
      detailTimeLabel: '支付时间',
      paymentMethod: '原路退回余额',
      productDescription: `订单 ${order.id} 退款`,
      orderId: order.id,
      merchantOrderId: order.id,
      includeInBudget: false,
    };
    record.fundingSource=order.fundingSource??'balance';
    if(order.fundingSource==='bank_8888')record.paymentMethod='原路退回常用卡 · 8888';
    else snapshot.alipay.balance.total = (balanceCents + order.payable) / 100;
    snapshot.alipay.transferRecords.unshift(record);
  }

  snapshot.orders[index] = refunded;
  return { snapshot, result: { order: cloneOrder(refunded), recordId, alreadyProcessed: false } };
}

export function createMemoryFoodDeliveryPaymentBackend(
  initialSnapshot: FoodDeliveryPaymentSnapshot,
  bank:BankFundingBackend=bankFunding,
): FoodDeliveryPaymentBackend {
  let snapshot = cloneSnapshot(initialSnapshot);
  return createPaymentBackend(()=>cloneSnapshot(snapshot),next=>{snapshot=next;},bank);
}

// Serialize same-page operations. The durable pending method survives reloads;
// the bank's order key makes a lost response safe to replay.
function createPaymentBackend(read:()=>FoodDeliveryPaymentSnapshot,commit:(s:FoodDeliveryPaymentSnapshot)=>void,bank:BankFundingBackend):FoodDeliveryPaymentBackend {
  let tail:Promise<unknown>=Promise.resolve();
  const serial=<T,>(fn:()=>Promise<T>)=>{const result=tail.then(fn);tail=result.catch(()=>{});return result;};
  return {
    pay:(orderId,method,now=TimeService.now(),funding='balance')=>serial(async()=>{
      const first=applyPayment(read(),orderId,method,now,funding);
      if(first.result.alreadyProcessed)return first.result;
      if(funding==='bank_8888'){
        const snapshot=read();const {order,index}=findOrder(snapshot,orderId);
        const bankPaymentId=order.bankPaymentId??`fooddelivery:${crypto.randomUUID()}`;
        snapshot.orders[index]={...order,pendingBankMethod:method,bankPaymentId};commit(snapshot);
        try{await bank.pay({id:bankPaymentId,channel:method==='wechat_pay'?'wechat':'alipay',amount:order.payable,merchant:merchantName(order),...(order.occasionId?{occasionId:order.occasionId}:{})});}
        catch(error){
          if(error instanceof Error && error.name==='BankRejection'){
            const latest=read();const target=findOrder(latest,orderId);latest.orders[target.index]={...target.order,pendingBankMethod:undefined};commit(latest);
          }
          throw error;
        }
      }
      const applied=applyPayment(read(),orderId,method,now,funding);
      commit(applied.snapshot);return applied.result;
    }),
    refund:(orderId,reason,now=TimeService.now())=>serial(async()=>{
      const first=applyRefund(read(),orderId,reason,now);
      if(first.result.alreadyProcessed)return first.result;
      if(first.result.order.fundingSource==='bank_8888'){
        if(!first.result.order.bankPaymentId)throw new Error('缺少原银行付款编号，请核对后退款');
        await bank.refund(first.result.order.bankPaymentId);
      }
      const applied=applyRefund(read(),orderId,reason,now);commit(applied.snapshot);return applied.result;
    }),
    async getSnapshot(){return read();},
  };
}

function getStoreSnapshot(): FoodDeliveryPaymentSnapshot {
  const food = useFoodDeliveryStore.getState();
  const wechat = useWechatStore.getState();
  const alipay = useAlipayStore.getState();
  return cloneSnapshot({
    orders: food.orders,
    wechat: { wallet: wechat.wallet, payLedger: wechat.payLedger },
    alipay: { balance: alipay.balance, transferRecords: alipay.transferRecords },
  });
}

function commitStoreSnapshot(snapshot: FoodDeliveryPaymentSnapshot) {
  useWechatStore.setState({ wallet: snapshot.wechat.wallet, payLedger: snapshot.wechat.payLedger });
  useAlipayStore.setState({ balance: snapshot.alipay.balance, transferRecords: snapshot.alipay.transferRecords });
  useFoodDeliveryStore.setState({ orders: snapshot.orders });
}

const storeBackend=createPaymentBackend(getStoreSnapshot,commitStoreSnapshot,bankFunding);

let backendOverride: FoodDeliveryPaymentBackend | null = null;

/** Swap this adapter for an HTTP implementation without changing the checkout UI. */
export function configureFoodDeliveryPaymentBackend(backend: FoodDeliveryPaymentBackend | null) {
  backendOverride = backend;
}

export function getFoodDeliveryPaymentBackend(): FoodDeliveryPaymentBackend {
  return backendOverride || storeBackend;
}

export function getFoodDeliveryPaymentMethodLabel(method?: FoodDeliveryPaymentMethod) {
  return method ? PAYMENT_LABEL[method] : '未支付';
}
