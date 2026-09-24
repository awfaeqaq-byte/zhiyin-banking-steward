const MAIN_SCROLL = [{ name: 'main', direction: 'vertical', description: '页面主内容区' }] as const;

export const NAVIGATION_DECLARATION = {
  app: 'fooddelivery',
  routes: [
    {
      path: '/', component: 'HomePage', params: {}, entryPoint: 'home', scrollContainers: MAIN_SCROLL,
      uiStates: [{ id: 'fooddelivery.home.base', search: {}, description: '外卖首页' }], queryParams: {}, description: '外卖首页',
    },
    {
      path: '/merchant/:merchantId', component: 'MerchantPage', params: { merchantId: 'string' }, entryPoint: 'none', scrollContainers: MAIN_SCROLL,
      uiStates: [{
        id: 'fooddelivery.merchant.base', search: {}, description: '商家点餐页',
        actions: [
          { id: 'fooddelivery.merchant.item.add', label: '加入菜品', behavior: 'other', scope: 'item', paramsSchema: { productId: 'string' } },
          { id: 'fooddelivery.merchant.item.increase', label: '增加菜品数量', behavior: 'other', scope: 'item', paramsSchema: { productId: 'string' } },
          { id: 'fooddelivery.merchant.item.decrease', label: '减少菜品数量', behavior: 'other', scope: 'item', paramsSchema: { productId: 'string' } },
        ],
      }], queryParams: {}, description: '商家点餐',
    },
    {
      path: '/cart', component: 'CartPage', params: {}, entryPoint: 'none', scrollContainers: MAIN_SCROLL,
      uiStates: [{
        id: 'fooddelivery.cart.base', search: {}, description: '购物车',
        actions: [
          { id: 'fooddelivery.cart.item.increase', label: '增加商品数量', behavior: 'other', scope: 'item', paramsSchema: { productId: 'string' } },
          { id: 'fooddelivery.cart.item.decrease', label: '减少商品数量', behavior: 'other', scope: 'item', paramsSchema: { productId: 'string' } },
        ],
      }], queryParams: {}, description: '购物车',
    },
    {
      path: '/checkout', component: 'CheckoutPage', params: {}, entryPoint: 'none', scrollContainers: MAIN_SCROLL,
      uiStates: [{ id: 'fooddelivery.checkout.base', search: {}, description: '确认订单' }], queryParams: {}, description: '确认订单',
    },
    {
      path: '/payment', component: 'PaymentPage', params: {}, entryPoint: 'none', scrollContainers: MAIN_SCROLL,
      uiStates: [{
        id: 'fooddelivery.payment.base', search: {}, description: '支付收银台',
        actions: [
          { id: 'fooddelivery.payment.method.wechat', label: '选择微信支付', behavior: 'other' },
          { id: 'fooddelivery.payment.method.alipay', label: '选择支付宝', behavior: 'other' },
          { id: 'fooddelivery.payment.funding.select.balance', label: '使用平台余额', behavior: 'select' },
          { id: 'fooddelivery.payment.funding.select.bank', label: '使用常用卡8888', behavior: 'select' },
        ],
      }], queryParams: { orderId: 'string' }, description: '支付页',
    },
    {
      path: '/orders/:orderId', component: 'OrderTrackingPage', params: { orderId: 'string' }, entryPoint: 'both', scrollContainers: MAIN_SCROLL,
      uiStates: [{
        id: 'fooddelivery.order.base', search: {}, description: '订单追踪',
        actions: [
          { id: 'fooddelivery.order.status.advance', label: '模拟推进配送状态', behavior: 'other' },
          { id: 'fooddelivery.order.refund.submit', label: '申请测试退款', behavior: 'submit' },
        ],
      }], queryParams: {}, description: '订单追踪',
    },
  ],
  transitions: [
    { id: 'fooddelivery.home.openMerchant', from: '/', to: '/merchant/:merchantId', search: {}, searchParams: {}, mode: 'push', params: { merchantId: 'string' }, label: '打开商家', ui: { placement: 'content', icon: 'store', gesture: 'tap' } },
    { id: 'fooddelivery.home.openCart', from: '/', to: '/cart', search: {}, searchParams: {}, mode: 'push', params: {}, label: '打开购物车', ui: { placement: 'topbar', icon: 'cart', gesture: 'tap' } },
    { id: 'fooddelivery.merchant.openCart', from: '/merchant/:merchantId', to: '/cart', search: {}, searchParams: {}, mode: 'push', params: {}, label: '打开购物车', ui: { placement: 'content', icon: 'cart', gesture: 'tap' } },
    { id: 'fooddelivery.cart.openCheckout', from: '/cart', to: '/checkout', search: {}, searchParams: {}, mode: 'push', params: {}, label: '去结算', ui: { placement: 'content', icon: 'check', gesture: 'tap' } },
    { id: 'fooddelivery.checkout.submit', from: '/checkout', to: '/payment', search: {}, searchParams: { orderId: 'string' }, mode: 'push', params: {}, label: '提交订单', ui: { placement: 'content', icon: 'submit', gesture: 'tap' } },
    { id: 'fooddelivery.payment.complete', from: '/payment', to: '/orders/:orderId', search: {}, searchParams: {}, mode: 'replace', params: { orderId: 'string' }, label: '确认支付', ui: { placement: 'content', icon: 'wallet', gesture: 'tap' } },
  ],
  capabilities: { historyBack: true },
} as const;

export type TransitionId = (typeof NAVIGATION_DECLARATION.transitions)[number]['id'];
