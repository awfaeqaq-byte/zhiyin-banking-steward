import { describe, expect, it } from 'vitest';
import { createOrder, type CartLine } from '../apps/FoodDelivery/orderModel';
import {buildOccasionFoodOrder} from '../apps/Zhiyin/occasion-food';
import type {OccasionPlan} from '../../src/lib/occasion-plans';
import {
  createMemoryFoodDeliveryPaymentBackend,
  type FoodDeliveryPaymentSnapshot,
} from '../apps/FoodDelivery/payments/backend';

const meal: CartLine = {
  storeId: 'shop-1',
  storeName: '橙子小馆·现炒便当',
  dishId: 'meal-burger-01',
  dishName: '炭香牛肉堡套餐',
  unitPrice: 2680,
  quantity: 2,
};

const NOW = new Date('2026-09-17T12:30:00+08:00').getTime();

function seed(overrides: Partial<FoodDeliveryPaymentSnapshot> = {}): FoodDeliveryPaymentSnapshot {
  return {
    orders: [createOrder({ id: 'order-1', storeId: 'shop-1', lines: [meal] })],
    wechat: {
      wallet: { balanceCents: 20_000, transfers: [] },
      payLedger: { transactions: [], monthlyHistory: [], settings: { dailyReport: true, includeManualRecords: true } },
    },
    alipay: {
      balance: { total: 200, dailyIncome: 0 },
      transferRecords: [],
    },
    ...overrides,
  };
}

describe('外卖跨应用真实支付后端', () => {
  it.each(['wechat_pay','alipay'] as const)('筹备订单通过%s绑定同一预算；幂等支付和原路退款，不能偷换微信零钱',async method=>{
    const plan:OccasionPlan={id:'birthday',status:'reserved',title:'生日',recipient:'爱人',budget:100000,prepareAt:NOW,deliverAt:NOW+86400000,address:'测试地址',contact:'叶先生',note:'低甜',productIds:['cake-light'],createdAt:NOW,updatedAt:NOW,orders:[{productId:'cake-light',orderId:'ZY-birthday-cake-light',paymentId:'occasion:birthday:cake-light',amount:20600,merchant:'好食送 · 生日精选',createdAt:NOW}]};
    const inputs:Array<{id:string;occasionId?:string;amount:number}>=[],refunds:string[]=[];
    const backend=createMemoryFoodDeliveryPaymentBackend(seed({orders:[buildOccasionFoodOrder(plan,plan.orders[0])]}),{async pay(p){inputs.push(p);},async refund(id){refunds.push(id);}});
    await expect(backend.pay(plan.orders[0].orderId,method,NOW,'balance')).rejects.toThrow(/预算/);
    await backend.pay(plan.orders[0].orderId,method,NOW,'bank_8888');await backend.pay(plan.orders[0].orderId,method,NOW,'bank_8888');
    expect(inputs).toHaveLength(1);expect(inputs[0]).toMatchObject({id:'occasion:birthday:cake-light',occasionId:'birthday',amount:20600});
    await backend.refund(plan.orders[0].orderId,'取消',NOW+1);await backend.refund(plan.orders[0].orderId,'取消',NOW+2);expect(refunds).toEqual(['occasion:birthday:cake-light']);
    const data=await backend.getSnapshot();expect(data.wechat.wallet.balanceCents).toBe(20000);expect(data.alipay.balance.total).toBe(200);
    expect(method==='wechat_pay'?data.wechat.payLedger.transactions.length:data.alipay.transferRecords.length).toBe(2);
  });
  it.each(['wechat_pay', 'alipay'] as const)('通过%s使用银行卡只扣银行卡，退款也不增加平台余额', async method => {
    let bankBalance = 10000;
    const receipts = new Set<string>();
    const bank = {
      async pay(input: {id:string;amount:number}) { if(!receipts.has(input.id)){bankBalance-=input.amount;receipts.add(input.id);} },
      async refund(id:string) { if(receipts.delete(id))bankBalance+=5160; },
    };
    const backend = createMemoryFoodDeliveryPaymentBackend(seed(), bank);
    await backend.pay('order-1', method, NOW, 'bank_8888');
    await backend.pay('order-1', method, NOW, 'bank_8888');
    expect(bankBalance).toBe(4840);
    let snapshot=await backend.getSnapshot();
    expect(snapshot.wechat.wallet.balanceCents).toBe(20000);
    expect(snapshot.alipay.balance.total).toBe(200);
    expect(snapshot.orders[0].fundingSource).toBe('bank_8888');
    expect(snapshot.orders[0].bankPaymentId).toMatch(/^fooddelivery:/);
    const record=method==='wechat_pay'?snapshot.wechat.payLedger.transactions[0]:snapshot.alipay.transferRecords[0];
    expect(record.fundingSource).toBe('bank_8888');
    await backend.refund('order-1','取消',NOW+1);
    await backend.refund('order-1','取消',NOW+2);
    snapshot=await backend.getSnapshot();
    expect(bankBalance).toBe(10000);
    expect(snapshot.wechat.wallet.balanceCents).toBe(20000);
    expect(snapshot.alipay.balance.total).toBe(200);
  });
  it('银行失败不记成功，未知结果锁定付款渠道，原请求可以安全重试', async()=>{
    let attempts=0;
    const backend=createMemoryFoodDeliveryPaymentBackend(seed(),{
      async pay(){if(++attempts===1)throw new Error('网络中断');},async refund(){},
    });
    await expect(backend.pay('order-1','wechat_pay',NOW,'bank_8888')).rejects.toThrow('网络中断');
    expect((await backend.getSnapshot()).wechat.payLedger.transactions).toHaveLength(0);
    await expect(backend.pay('order-1','alipay',NOW,'balance')).rejects.toThrow(/核对/);
    await backend.pay('order-1','wechat_pay',NOW,'bank_8888');
    expect((await backend.getSnapshot()).orders[0].status).toBe('ACCEPTED');
  });
  it('使用微信支付会扣微信零钱、写入微信账单并完成订单', async () => {
    const backend = createMemoryFoodDeliveryPaymentBackend(seed());
    const result = await backend.pay('order-1', 'wechat_pay', NOW);
    const snapshot = await backend.getSnapshot();

    expect(result.alreadyProcessed).toBe(false);
    expect(snapshot.wechat.wallet.balanceCents).toBe(14_840);
    expect(snapshot.wechat.payLedger.transactions).toHaveLength(1);
    expect(snapshot.wechat.payLedger.transactions[0]).toMatchObject({
      id: 'fooddelivery-payment-wechat-order-1',
      linkedId: 'fooddelivery:payment:order-1',
      direction: 'expense',
      amountCents: 5160,
      category: 'dining',
      merchant: '橙子小馆·现炒便当',
      source: 'wechat_pay',
    });
    expect(snapshot.orders[0]).toMatchObject({
      status: 'ACCEPTED',
      paymentMethod: 'wechat_pay',
      paymentRecordId: 'fooddelivery-payment-wechat-order-1',
      paidAt: NOW,
    });
  });

  it('使用支付宝会扣余额、写入支付宝账单并记录同一个订单号', async () => {
    const backend = createMemoryFoodDeliveryPaymentBackend(seed());
    await backend.pay('order-1', 'alipay', NOW);
    const snapshot = await backend.getSnapshot();

    expect(snapshot.alipay.balance.total).toBe(148.4);
    expect(snapshot.alipay.transferRecords).toHaveLength(1);
    expect(snapshot.alipay.transferRecords[0]).toMatchObject({
      id: 'fooddelivery-payment-alipay-order-1',
      linkedId: 'fooddelivery:payment:order-1',
      delta: -51.6,
      kind: 'payment',
      category: 'dining',
      paymentMethod: '余额',
      orderId: 'order-1',
      merchantOrderId: 'order-1',
      includeInBudget: true,
    });
    expect(snapshot.orders[0]).toMatchObject({
      status: 'ACCEPTED',
      paymentMethod: 'alipay',
      paymentRecordId: 'fooddelivery-payment-alipay-order-1',
    });
  });

  it('余额不足时不会改动订单、余额或账单', async () => {
    const snapshot = seed();
    snapshot.wechat.wallet.balanceCents = 100;
    const backend = createMemoryFoodDeliveryPaymentBackend(snapshot);

    await expect(backend.pay('order-1', 'wechat_pay', NOW)).rejects.toThrow('微信零钱不足');
    expect(await backend.getSnapshot()).toEqual(snapshot);
  });

  it('重复确认支付只扣一次，不能在支付后改用另一支付渠道', async () => {
    const backend = createMemoryFoodDeliveryPaymentBackend(seed());
    await backend.pay('order-1', 'wechat_pay', NOW);
    const repeated = await backend.pay('order-1', 'wechat_pay', NOW + 1000);
    const snapshot = await backend.getSnapshot();

    expect(repeated.alreadyProcessed).toBe(true);
    expect(snapshot.wechat.wallet.balanceCents).toBe(14_840);
    expect(snapshot.wechat.payLedger.transactions).toHaveLength(1);
    await expect(backend.pay('order-1', 'alipay', NOW + 2000)).rejects.toThrow('订单已使用微信支付');
  });

  it('退款会原路退回余额、写入退款账单，并且重复退款不重复入账', async () => {
    const backend = createMemoryFoodDeliveryPaymentBackend(seed());
    await backend.pay('order-1', 'alipay', NOW);
    const refunded = await backend.refund('order-1', '商家缺货', NOW + 60_000);
    const repeated = await backend.refund('order-1', '再次申请', NOW + 120_000);
    const snapshot = await backend.getSnapshot();

    expect(refunded.alreadyProcessed).toBe(false);
    expect(repeated.alreadyProcessed).toBe(true);
    expect(snapshot.alipay.balance.total).toBe(200);
    expect(snapshot.alipay.transferRecords).toHaveLength(2);
    expect(snapshot.alipay.transferRecords[0]).toMatchObject({
      id: 'fooddelivery-refund-alipay-order-1',
      linkedId: 'fooddelivery:refund:order-1',
      delta: 51.6,
      kind: 'refund',
      category: 'refund',
      orderId: 'order-1',
    });
    expect(snapshot.orders[0]).toMatchObject({
      status: 'REFUNDED',
      refundReason: '商家缺货',
      refundRecordId: 'fooddelivery-refund-alipay-order-1',
      refundedAt: NOW + 60_000,
    });
  });

  it('微信支付退款会回补微信零钱并生成一笔收入账单', async () => {
    const backend = createMemoryFoodDeliveryPaymentBackend(seed());
    await backend.pay('order-1', 'wechat_pay', NOW);
    await backend.refund('order-1', '用户取消', NOW + 60_000);
    const snapshot = await backend.getSnapshot();

    expect(snapshot.wechat.wallet.balanceCents).toBe(20_000);
    expect(snapshot.wechat.payLedger.transactions[0]).toMatchObject({
      id: 'fooddelivery-refund-wechat-order-1',
      linkedId: 'fooddelivery:refund:order-1',
      direction: 'income',
      amountCents: 5160,
      category: 'dining',
    });
  });

  it('支付宝余额不足时也不改动任何状态', async () => {
    const snapshot = seed();
    snapshot.alipay.balance.total = 1;
    const backend = createMemoryFoodDeliveryPaymentBackend(snapshot);

    await expect(backend.pay('order-1', 'alipay', NOW)).rejects.toThrow('支付宝余额不足');
    expect(await backend.getSnapshot()).toEqual(snapshot);
  });

  it('不存在的订单和未支付订单不会进入退款流程', async () => {
    const backend = createMemoryFoodDeliveryPaymentBackend(seed());

    await expect(backend.pay('missing', 'wechat_pay', NOW)).rejects.toThrow('未找到外卖订单');
    await expect(backend.refund('order-1', '误操作', NOW)).rejects.toThrow('订单尚未支付');
  });
});
