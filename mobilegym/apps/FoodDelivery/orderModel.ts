export type OrderStatus =
  | 'PENDING_PAYMENT'
  | 'PAID'
  | 'ACCEPTED'
  | 'PREPARING'
  | 'READY_FOR_DELIVERY'
  | 'DELIVERY_ASSIGNED'
  | 'DELIVERING'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'REFUNDING'
  | 'REFUNDED';

export type CartLine = {
  storeId: string;
  storeName: string;
  dishId: string;
  dishName: string;
  unitPrice: number;
  quantity: number;
};

export type FoodDeliveryPaymentMethod = 'wechat_pay' | 'alipay';

export type OrderRecord = {
  occasionId?:string;
  deliveryAt?:number;
  note?:string;
  id: string;
  storeId: string;
  lines: CartLine[];
  status: OrderStatus;
  itemTotal: number;
  deliveryFee: number;
  discount: number;
  payable: number;
  address: string;
  contact: string;
  rider: { name: string; phone: string };
  paymentMethod?: FoodDeliveryPaymentMethod;
  fundingSource?: 'balance' | 'bank_8888';
  pendingBankMethod?: FoodDeliveryPaymentMethod;
  bankPaymentId?: string;
  paymentRecordId?: string;
  paidAt?: number;
  refundReason?: string;
  refundRecordId?: string;
  refundedAt?: number;
};

export function addCartItem(lines: CartLine[], item: CartLine): CartLine[] {
  const existing = lines.find(line => line.storeId === item.storeId && line.dishId === item.dishId);
  if (!existing) return [...lines, { ...item }];
  return lines.map(line =>
    line.storeId === item.storeId && line.dishId === item.dishId
      ? { ...line, quantity: line.quantity + item.quantity }
      : line,
  );
}

export function setCartQuantity(lines: CartLine[], dishId: string, quantity: number): CartLine[] {
  if (quantity <= 0) return lines.filter(line => line.dishId !== dishId);
  return lines.map(line => line.dishId === dishId ? { ...line, quantity } : line);
}

export function calculateCart(
  lines: CartLine[],
  fees: { deliveryFee: number; discount: number },
) {
  const itemTotal = lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0);
  return {
    itemTotal,
    deliveryFee: fees.deliveryFee,
    discount: fees.discount,
    payable: Math.max(0, itemTotal + fees.deliveryFee - fees.discount),
  };
}

export function createOrder(input: {
  id: string;
  storeId: string;
  lines: CartLine[];
  deliveryFee?: number;
  discount?: number;
  address?: string;
  contact?: string;
}): OrderRecord {
  if (input.lines.length === 0) throw new Error('购物车为空');
  const totals = calculateCart(input.lines, {
    deliveryFee: input.deliveryFee ?? 300,
    discount: input.discount ?? 500,
  });
  return {
    ...input,
    lines: input.lines.map(line => ({ ...line })),
    ...totals,
    status: 'PENDING_PAYMENT',
    address: input.address ?? '江湾金融中心 A 座 12 层',
    contact: input.contact ?? '林晓 138****6608',
    rider: { name: '陈师傅', phone: '156****2037' },
  };
}

export type OrderEvent = 'pay' | 'accept' | 'start_preparing' | 'ready' | 'assign' | 'dispatch' | 'deliver';

const NEXT_STATUS: Partial<Record<OrderStatus, Partial<Record<OrderEvent, OrderStatus>>>> = {
  PENDING_PAYMENT: { pay: 'PAID' },
  PAID: { accept: 'ACCEPTED' },
  ACCEPTED: { start_preparing: 'PREPARING' },
  PREPARING: { ready: 'READY_FOR_DELIVERY' },
  READY_FOR_DELIVERY: { assign: 'DELIVERY_ASSIGNED' },
  DELIVERY_ASSIGNED: { dispatch: 'DELIVERING' },
  DELIVERING: { deliver: 'COMPLETED' },
};

export function progressOrder(
  order: OrderRecord,
  event: OrderEvent,
): OrderRecord {
  const status = NEXT_STATUS[order.status]?.[event];
  if (!status) throw new Error('当前订单状态不支持该操作');
  return { ...order, status };
}

export function refundOrder(order: OrderRecord, reason: string): OrderRecord {
  if (['PENDING_PAYMENT', 'CANCELLED', 'REFUNDED'].includes(order.status)) {
    throw new Error('当前订单状态不支持退款');
  }
  return { ...order, status: 'REFUNDED', refundReason: reason };
}
