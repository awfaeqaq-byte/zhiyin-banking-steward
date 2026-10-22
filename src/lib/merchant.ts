/** Amounts are integer fen. A submitted order is not a receipt. */
export type MerchantMenuItem = {
    id: string;
    name: string;
    category: string;
    price: number;
    available: boolean;
};
export type MerchantShop = {
    id: string;
    name: string;
    publicToken: string;
    menu: MerchantMenuItem[];
    createdAt: number;
};
export type MerchantOrderItem = {
    menuItemId: string;
    name: string;
    quantity: number;
    unitPrice: number;
    amount: number;
};
export type MerchantOrder = {
    id: string;
    table: string;
    items: MerchantOrderItem[];
    total: number;
    status: 'pending' | 'paid' | 'cancelled' | 'refunded';
    createdAt: number;
    paidAt?: number;
    refundedAt?: number;
};
export type MerchantExpense = {
    id: string;
    title: string;
    category: string;
    amount: number;
    occurredAt: number;
};
export type MerchantState = {
    version: 1;
    revision: number;
    shop: MerchantShop | null;
    orders: MerchantOrder[];
    expenses: MerchantExpense[];
};
export type MerchantPeriod = 'today' | 'week' | 'all';
export type MerchantSummary = {
    period: MerchantPeriod;
    from: number;
    to: number;
    orderCount: number;
    pendingTotal: number;
    collectedTotal: number;
    refundedTotal: number;
    netCollected: number;
    expenseTotal: number;
    cashDifference: number;
    dishes: Array<{
        id: string;
        name: string;
        quantity: number;
        amount: number;
    }>;
};
export type MerchantOperation = {
    type: 'create-shop';
    name: string;
} | {
    type: 'save-menu';
    menu: MerchantMenuItem[];
} | {
    type: 'record-payment' | 'cancel-order' | 'record-refund';
    orderId: string;
} | {
    type: 'add-expense';
    title: string;
    category: string;
    amount: number;
    occurredAt: number;
};
export const emptyMerchantState = (): MerchantState => ({ version: 1, revision: 0, shop: null, orders: [], expenses: [] });
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown, max: number): value is string => typeof value === 'string' && value.trim().length > 0 && value.length <= max && ![...value].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127);
const id = (value: unknown): value is string => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(value);
const money = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) > 0 && Number(value) <= 100000000;
const timestamp = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0 && Number(value) <= 8640000000000000;
export function validMerchantMenu(menu: unknown): menu is MerchantMenuItem[] {
    return Array.isArray(menu) && menu.length <= 100 && menu.every(item => record(item) && id(item.id) && text(item.name, 60) && text(item.category, 30) && money(item.price) && typeof item.available === 'boolean') && new Set(menu.map(item => item.id)).size === menu.length;
}
export function validMerchantOrder(order: unknown): order is MerchantOrder {
    if (!record(order) || !id(order.id) || !text(order.table, 30) || !Array.isArray(order.items) || !order.items.length || order.items.length > 100 || !money(order.total) || !timestamp(order.createdAt) || !['pending', 'paid', 'cancelled', 'refunded'].includes(String(order.status)))
        return false;
    if (!order.items.every(item => record(item) && id(item.menuItemId) && text(item.name, 60) && Number.isSafeInteger(item.quantity) && Number(item.quantity) > 0 && Number(item.quantity) <= 99 && money(item.unitPrice) && money(item.amount) && item.amount === Number(item.unitPrice) * Number(item.quantity)))
        return false;
    if (new Set(order.items.map(item => item.menuItemId)).size !== order.items.length || order.total !== order.items.reduce((sum, item) => sum + item.amount, 0))
        return false;
    if (order.status === 'paid' || order.status === 'refunded') {
        if (!timestamp(order.paidAt) || order.paidAt < order.createdAt)
            return false;
    }
    else if (order.paidAt !== undefined)
        return false;
    return order.status === 'refunded' ? timestamp(order.refundedAt) && order.refundedAt >= Number(order.paidAt) : order.refundedAt === undefined;
}
export function validMerchantState(value: unknown): value is MerchantState {
    if (!record(value) || value.version !== 1 || !Number.isSafeInteger(value.revision) || Number(value.revision) < 0 || !Array.isArray(value.orders) || !Array.isArray(value.expenses))
        return false;
    if (value.shop !== null && (!record(value.shop) || !id(value.shop.id) || !text(value.shop.name, 60) || !id(value.shop.publicToken) || value.shop.publicToken.length < 20 || !timestamp(value.shop.createdAt) || !validMerchantMenu(value.shop.menu)))
        return false;
    if (value.shop === null && (value.orders.length || value.expenses.length))
        return false;
    return value.orders.length <= 10000 && value.orders.every(validMerchantOrder) && new Set(value.orders.map(order => order.id)).size === value.orders.length && value.expenses.length <= 10000 && value.expenses.every(expense => record(expense) && id(expense.id) && text(expense.title, 80) && text(expense.category, 30) && money(expense.amount) && timestamp(expense.occurredAt)) && new Set(value.expenses.map(expense => expense.id)).size === value.expenses.length;
}
/** Cash uses event dates; a later refund appears in its actual refund period.
 * Rankings include only orders paid in the period that remain unrefunded now.
 * cashDifference is cash in minus recorded cash out, never accounting profit. */
export function merchantSummary(state: MerchantState, period: MerchantPeriod, now = Date.now()): MerchantSummary {
    const day = 86400000, offset = 8 * 60 * 60 * 1000;
    const midnight = Math.floor((now + offset) / day) * day - offset;
    const from = period === 'all' ? 0 : midnight - (period === 'week' ? 6 * day : 0);
    const inPeriod = (date: number | undefined) => date !== undefined && date >= from && date <= now;
    const orders = state.orders.filter(order => inPeriod(order.createdAt) && order.status !== 'cancelled');
    const collectedTotal = state.orders.filter(order => inPeriod(order.paidAt)).reduce((sum, order) => sum + order.total, 0);
    const refundedTotal = state.orders.filter(order => inPeriod(order.refundedAt)).reduce((sum, order) => sum + order.total, 0);
    const expenseTotal = state.expenses.filter(expense => inPeriod(expense.occurredAt)).reduce((sum, expense) => sum + expense.amount, 0);
    const dishes = new Map<string, MerchantSummary['dishes'][number]>();
    for (const order of state.orders.filter(order => order.status === 'paid' && inPeriod(order.paidAt))) {
        for (const item of order.items) {
            const previous = dishes.get(item.menuItemId);
            dishes.set(item.menuItemId, { id: item.menuItemId, name: item.name, quantity: (previous?.quantity ?? 0) + item.quantity, amount: (previous?.amount ?? 0) + item.amount });
        }
    }
    const netCollected = collectedTotal - refundedTotal;
    return { period, from, to: now, orderCount: orders.length, pendingTotal: orders.filter(order => order.status === 'pending').reduce((sum, order) => sum + order.total, 0), collectedTotal, refundedTotal, netCollected, expenseTotal, cashDifference: netCollected - expenseTotal, dishes: [...dishes.values()].sort((a, b) => b.quantity - a.quantity || b.amount - a.amount || a.id.localeCompare(b.id)) };
}
