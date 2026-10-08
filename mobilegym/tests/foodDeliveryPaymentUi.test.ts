import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as orderModel from '../apps/FoodDelivery/orderModel';

const paymentSource = readFileSync(
  new URL('../apps/FoodDelivery/pages/PaymentPage.tsx', import.meta.url),
  'utf8',
);
const trackingSource = readFileSync(
  new URL('../apps/FoodDelivery/pages/OrderTrackingPage.tsx', import.meta.url),
  'utf8',
);

describe('外卖支付界面契约', () => {
  it('银行卡订单显示渠道和资金账户，退款去向为银行卡而非平台余额', () => {
    for (const channel of ['微信支付', '支付宝']) {
      expect(orderModel.getOrderPaymentDisplay({ fundingSource: 'bank_8888' }, channel, '常用卡 · 8888')).toEqual({
        paymentLabel: `${channel} · 常用卡 · 8888`, refundLabel: '常用卡 · 8888',
      });
      expect(orderModel.getOrderPaymentDisplay({ fundingSource: 'balance' }, channel, '常用卡 · 8888')).toEqual({
        paymentLabel: channel, refundLabel: channel,
      });
    }
    expect(trackingSource).toContain('getOrderPaymentDisplay');
    expect(trackingSource).toContain('refundLabel');
  });
  it('付款账户与支付渠道分开选择，待核对订单恢复原方式',()=>{
    expect(paymentSource).toContain('fundingSource');
    expect(paymentSource).toContain('pendingBankMethod');
    expect(paymentSource).toContain("'bank_8888'");
    expect(paymentSource).toContain('funding_bank');
  });
  it('收银台提供支付宝和微信支付，并展示对应实时余额', () => {
    expect(paymentSource).toContain('微信支付');
    expect(paymentSource).toContain('支付宝');
    expect(paymentSource).toContain('useWechatStore');
    expect(paymentSource).toContain('useAlipayStore');
    expect(paymentSource).not.toContain('好食钱包（测试）');
    expect(paymentSource).not.toContain('模拟银行卡');
  });

  it('支付按钮具备忙碌状态、错误播报和沙箱资金提示', () => {
    expect(paymentSource).toContain('aria-busy');
    expect(paymentSource).toContain('role="alert"');
    expect(paymentSource).toContain('沙箱中的余额');
    expect(paymentSource).toContain('getFoodDeliveryPaymentBackend');
  });

  it('订单页通过支付后端原路退款并展示支付渠道', () => {
    expect(trackingSource).toContain('getFoodDeliveryPaymentBackend');
    expect(trackingSource).toContain('原路退回');
    expect(trackingSource).toContain('paymentMethod');
  });
});
