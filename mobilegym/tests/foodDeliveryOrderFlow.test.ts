import { describe, expect, it } from 'vitest';
import {
  addCartItem,
  calculateCart,
  createOrder,
  progressOrder,
  refundOrder,
  setCartQuantity,
  type CartLine,
} from '../apps/FoodDelivery/orderModel';
import { NAVIGATION_DECLARATION } from '../apps/FoodDelivery/navigation.declaration';

const burger: CartLine = {
  storeId: 'shop-1',
  storeName: '橙子小馆',
  dishId: 'meal-burger-01',
  dishName: '炭香牛肉堡套餐',
  unitPrice: 2680,
  quantity: 1,
};

describe('好食送外卖订单链路', () => {
  it('购物车累加同一菜品，并统一计算配送费与优惠', () => {
    const cart = addCartItem(addCartItem([], burger), burger);
    expect(cart).toEqual([{ ...burger, quantity: 2 }]);
    expect(calculateCart(cart, { deliveryFee: 300, discount: 500 })).toEqual({
      itemTotal: 5360,
      deliveryFee: 300,
      discount: 500,
      payable: 5160,
    });
  });

  it('购物车为空时不允许创建订单', () => {
    expect(() => createOrder({ id: 'order-1', merchantId: 'shop-1', lines: [] })).toThrow(
      '购物车为空',
    );
  });

  it('购物车数量可修改，减到零时移除菜品', () => {
    expect(setCartQuantity([burger], burger.dishId, 3)).toEqual([{ ...burger, quantity: 3 }]);
    expect(setCartQuantity([burger], burger.dishId, 0)).toEqual([]);
  });

  it('订单从待支付逐步进入配送和已送达', () => {
    const pending = createOrder({ id: 'order-1', storeId: 'shop-1', lines: [burger] });
    const paid = progressOrder(pending, 'pay');
    const accepted = progressOrder(paid, 'accept');
    const preparing = progressOrder(accepted, 'start_preparing');
    const ready = progressOrder(preparing, 'ready');
    const assigned = progressOrder(ready, 'assign');
    const delivering = progressOrder(assigned, 'dispatch');
    const delivered = progressOrder(delivering, 'deliver');

    expect([pending.status, paid.status, accepted.status, preparing.status, ready.status, assigned.status, delivering.status, delivered.status]).toEqual([
      'PENDING_PAYMENT',
      'PAID',
      'ACCEPTED',
      'PREPARING',
      'READY_FOR_DELIVERY',
      'DELIVERY_ASSIGNED',
      'DELIVERING',
      'COMPLETED',
    ]);
  });

  it('已送达订单可按测试数据规则退款，退款后不可再推进配送', () => {
    const pending = createOrder({ id: 'order-1', storeId: 'shop-1', lines: [burger] });
    const delivered = ['pay', 'accept', 'start_preparing', 'ready', 'assign', 'dispatch', 'deliver']
      .reduce((order, event) => progressOrder(order, event as Parameters<typeof progressOrder>[1]), pending);
    const refunded = refundOrder(delivered, '商家缺货');

    expect(refunded.status).toBe('REFUNDED');
    expect(refunded.refundReason).toBe('商家缺货');
    expect(() => progressOrder(refunded, 'deliver')).toThrow('当前订单状态不支持该操作');
  });

  it('待支付订单不能走售后退款', () => {
    const pending = createOrder({ id: 'order-2', storeId: 'shop-1', lines: [burger] });
    expect(() => refundOrder(pending, '测试取消')).toThrow('当前订单状态不支持退款');
  });

  it('导航声明包含首期六个核心页面', () => {
    expect(NAVIGATION_DECLARATION.routes.map(route => route.path)).toEqual([
      '/',
      '/merchant/:merchantId',
      '/cart',
      '/checkout',
      '/payment',
      '/orders/:orderId',
    ]);
  });
});
