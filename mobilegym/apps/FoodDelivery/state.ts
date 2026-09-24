import { createAppStoreWithActions } from '../../os/createAppStore';
import { FOOD_DELIVERY_CONFIG } from './data';
import {
  addCartItem,
  createOrder,
  progressOrder,
  setCartQuantity,
  type CartLine,
  type OrderRecord,
} from './orderModel';

type Product = (typeof FOOD_DELIVERY_CONFIG.merchant.products)[number];

interface FoodDeliveryState {
  cart: CartLine[];
  orders: OrderRecord[];
  activeOrderId: string | null;
}

interface FoodDeliveryActions {
  addProduct: (product: Product) => void;
  changeQuantity: (productId: string, delta: number) => void;
  placeOrder: () => string;
  advanceOrder: (orderId: string) => void;
}

const initialState: FoodDeliveryState = {
  cart: [],
  orders: FOOD_DELIVERY_CONFIG.orders as OrderRecord[],
  activeOrderId: null,
};

export const useFoodDeliveryStore = createAppStoreWithActions<FoodDeliveryState, FoodDeliveryActions>(
  'fooddelivery',
  initialState,
  (set, get) => ({
    addProduct: product => set(state => ({
      cart: addCartItem(state.cart, {
        storeId: FOOD_DELIVERY_CONFIG.merchant.id,
        storeName: FOOD_DELIVERY_CONFIG.merchant.name,
        dishId: product.id,
        dishName: product.name,
        unitPrice: product.price,
        quantity: 1,
      }),
    })),
    changeQuantity: (productId, delta) => set(state => {
      const current = state.cart.find(line => line.dishId === productId)?.quantity ?? 0;
      return { cart: setCartQuantity(state.cart, productId, current + delta) };
    }),
    placeOrder: () => {
      const state = get();
      const id = `HS${String(state.orders.length + 1).padStart(6, '0')}`;
      const order = createOrder({
        id,
        storeId: FOOD_DELIVERY_CONFIG.merchant.id,
        lines: state.cart,
        deliveryFee: FOOD_DELIVERY_CONFIG.merchant.deliveryFee,
        discount: FOOD_DELIVERY_CONFIG.merchant.discount,
        address: FOOD_DELIVERY_CONFIG.user.address,
        contact: `${FOOD_DELIVERY_CONFIG.user.name} ${FOOD_DELIVERY_CONFIG.user.phone}`,
      });
      set({ orders: [order, ...state.orders], activeOrderId: id, cart: [] });
      return id;
    },
    advanceOrder: orderId => set(state => ({
      orders: state.orders.map(order => {
        if (order.id !== orderId) return order;
        if (order.status === 'ACCEPTED') return progressOrder(order, 'start_preparing');
        if (order.status === 'PREPARING') return progressOrder(order, 'ready');
        if (order.status === 'READY_FOR_DELIVERY') return progressOrder(order, 'assign');
        if (order.status === 'DELIVERY_ASSIGNED') return progressOrder(order, 'dispatch');
        if (order.status === 'DELIVERING') return progressOrder(order, 'deliver');
        return order;
      }),
    })),
  }),
);
