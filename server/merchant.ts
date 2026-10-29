import {applyFundingOperation} from './merchant-funding';
import { existsSync, readFileSync, writeFileSync, renameSync, openSync, closeSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { emptyMerchantState, validMerchantState, validMerchantMenu, type MerchantState, type MerchantMenuItem, type MerchantOrder } from '../src/lib/merchant';
type Applied = {
    requestId: string;
    body: string;
    orderId?: string;
};
type Account = {
    state: MerchantState;
    ownerRequests: Applied[];
    orderRequests: Applied[];
};
type Disk = {
    version: 1;
    accounts: Record<string, Account>;
};
class MerchantError extends Error {
    constructor(message: string, readonly status = 400) { super(message); }
}
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const validScope = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(v);
const validId = (v: unknown): v is string => typeof v === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(v);
function field(v: unknown, max: number, label: string) { if (typeof v !== 'string' || !v.trim() || v.length > max || [...v].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127))
    throw new MerchantError(`${label}格式不正确`); return v.trim(); }
function integer(v: unknown, min: number, max: number, label: string) { if (!Number.isSafeInteger(v) || Number(v) < min || Number(v) > max)
    throw new MerchantError(`${label}超出有效范围`); return Number(v); }
function requestId(v: unknown) { if (!validId(v))
    throw new MerchantError('请求标识无效'); return v; }
const defaultMenu = (): MerchantMenuItem[] => [
    { id: 'rice', name: '招牌炒饭', category: '主食', price: 2200, available: true },
    { id: 'noodles', name: '番茄鸡蛋面', category: '主食', price: 1800, available: true },
    { id: 'chicken', name: '宫保鸡丁', category: '热菜', price: 3200, available: true },
    { id: 'greens', name: '清炒时蔬', category: '热菜', price: 1600, available: true },
    { id: 'lemon-tea', name: '柠檬茶', category: '饮品', price: 800, available: true },
    { id: 'plum-juice', name: '酸梅汤', category: '饮品', price: 600, available: true },
];
function validApplied(v: unknown): v is Applied[] { return Array.isArray(v) && v.length <= 30000 && v.every(item => record(item) && validId(item.requestId) && typeof item.body === 'string' && item.body.length <= 65536 && (item.orderId === undefined || validId(item.orderId))) && new Set(v.map(item => item.requestId)).size === v.length; }
function validDisk(v: unknown): v is Disk { return record(v) && v.version === 1 && record(v.accounts) && Object.entries(v.accounts).every(([scope, account]) => validScope(scope) && record(account) && validMerchantState(account.state) && validApplied(account.ownerRequests) && validApplied(account.orderRequests)); }
/** Local sandbox scope separation, not a production authentication boundary. */
export function createMerchantStore(root: string) {
    const file = join(root, '.zhiyin-merchant.local.json');
    function load(): Disk {
        if (!existsSync(file))
            return { version: 1, accounts: {} };
        try {
            const value: unknown = JSON.parse(readFileSync(file, 'utf8'));
            if (validDisk(value))
                return value;
        }
        catch { /* Preserve unreadable data; never replace it with an empty store. */ }
        throw new MerchantError('小店账本暂不可读，原记录已保留', 503);
    }
    function mutate<T>(update: (disk: Disk) => {
        result: T;
        changed: boolean;
    }): T {
        let lock: number;
        try {
            lock = openSync(file + '.lock', 'wx', 0o600);
        }
        catch {
            throw new MerchantError('小店记录正在保存，请稍后重试', 503);
        }
        const temp = file + `.${randomUUID()}.tmp`;
        try {
            const disk = load(), { result, changed } = update(disk);
            if (changed) {
                if (!validDisk(disk))
                    throw new MerchantError('小店账本更新无法核对，原记录已保留', 503);
                writeFileSync(temp, JSON.stringify(disk), { mode: 0o600, flag: 'wx' });
                renameSync(temp, file);
            }
            return result;
        }
        catch (error) {
            if (error instanceof MerchantError)
                throw error;
            throw new MerchantError('小店记录保存失败，请稍后重试', 503);
        }
        finally {
            closeSync(lock);
            if (existsSync(temp))
                unlinkSync(temp);
            unlinkSync(file + '.lock');
        }
    }
    function get(scope: string): MerchantState { if (!validScope(scope))
        throw new MerchantError('缺少有效的小店标识'); return load().accounts[scope]?.state ?? emptyMerchantState(); }
    function find(disk: Disk, token: string) { const account = Object.values(disk.accounts).find(account => account.state.shop?.publicToken === token); if (!account?.state.shop)
        throw new MerchantError('这家小店的点餐页不存在', 404); return account; }
    return {
        get,
        publicMenu(token: string) { const { state } = find(load(), token); return { shop: { name: state.shop!.name, menu: state.shop!.menu.filter(item => item.available) } }; },
        change(scope: string, input: unknown): MerchantState {
            if (!validScope(scope))
                throw new MerchantError('缺少有效的小店标识');
            if (!record(input))
                throw new MerchantError('请求内容无效');
            const rid = requestId(input.requestId), fingerprint = JSON.stringify(input);
            return mutate(disk => {
                const account = disk.accounts[scope] ?? { state: emptyMerchantState(), ownerRequests: [], orderRequests: [] };
                const previous = account.ownerRequests.find(request => request.requestId === rid);
                if (previous) {
                    if (previous.body !== fingerprint)
                        throw new MerchantError('同一请求标识不能用于不同操作', 409);
                    return { result: account.state, changed: false };
                }
                if (!Number.isSafeInteger(input.revision) || input.revision !== account.state.revision)
                    throw new MerchantError('小店记录已变化，请刷新后重试', 409);
                if (account.ownerRequests.length >= 30000)
                    throw new MerchantError('小店记录已达到当前容量上限');
                const state = account.state, now = Date.now();
                switch (input.type) {
                    case 'create-shop': {
                        if (state.shop)
                            throw new MerchantError('小店已创建');
                        if (Object.keys(disk.accounts).length >= 1000)
                            throw new MerchantError('当前环境的小店数量已达上限');
                        state.shop = { id: randomUUID(), name: field(input.name, 60, '店名'), publicToken: randomBytes(24).toString('hex'), menu: defaultMenu(), createdAt: now };
                        break;
                    }
                    case 'save-menu': {
                        if (!state.shop)
                            throw new MerchantError('请先创建小店');
                        if (!validMerchantMenu(input.menu))
                            throw new MerchantError('菜单信息无效，最多 100 道菜，价格必须为正整数分');
                        state.shop.menu = input.menu.map(item => ({ id: item.id, name: item.name.trim(), category: item.category.trim(), price: item.price, available: item.available }));
                        break;
                    }
                    case 'record-payment':
                    case 'cancel-order':
                    case 'record-refund': {
                        const order = state.orders.find(order => order.id === input.orderId);
                        if (!order)
                            throw new MerchantError('订单不存在');
                        if (input.type === 'record-payment') {
                            if (order.status !== 'pending')
                                throw new MerchantError('只有待收款订单可记录收款');
                            order.status = 'paid';
                            order.paidAt = now;
                        }
                        else if (input.type === 'cancel-order') {
                            if (order.status !== 'pending')
                                throw new MerchantError('只有待收款订单可取消，已收款订单请记录退款');
                            order.status = 'cancelled';
                        }
                        else {
                            if (order.status !== 'paid')
                                throw new MerchantError('只有已收款订单可记录退款');
                            order.status = 'refunded';
                            order.refundedAt = now;
                        }
                        break;
                    }
                    case 'add-expense': {
                        if (!state.shop)
                            throw new MerchantError('请先创建小店');
                        if (state.expenses.length >= 10000)
                            throw new MerchantError('经营支出已达到当前容量上限');
                        state.expenses.push({ id: randomUUID(), title: field(input.title, 80, '支出名称'), category: field(input.category, 30, '支出分类'), amount: integer(input.amount, 1, 100000000, '支出金额'), occurredAt: integer(input.occurredAt, 0, now, '支出时间') });
                        break;
                    }
                    default: {
                        try {applyFundingOperation(state, input, now);} catch (error) {throw new MerchantError(error instanceof Error ? error.message : '资金安排未保存');}
                    }
                }
                state.revision++;
                account.ownerRequests.push({ requestId: rid, body: fingerprint });
                disk.accounts[scope] = account;
                return { result: state, changed: true };
            });
        },
        order(token: string, input: unknown): {
            order: MerchantOrder;
        } {
            if (!record(input))
                throw new MerchantError('点餐内容无效');
            const rid = requestId(input.requestId), fingerprint = JSON.stringify(input);
            return mutate(disk => {
                const account = find(disk, token), previous = account.orderRequests.find(request => request.requestId === rid);
                if (previous) {
                    if (previous.body !== fingerprint)
                        throw new MerchantError('同一请求标识不能用于不同订单', 409);
                    const order = account.state.orders.find(order => order.id === previous.orderId);
                    if (!order)
                        throw new MerchantError('订单记录暂不可读', 503);
                    return { result: { order }, changed: false };
                }
                const state = account.state, shop = state.shop!;
                if (state.orders.length >= 10000)
                    throw new MerchantError('小店订单已达到当前容量上限');
                const table = field(input.table, 30, '桌号');
                if (!Array.isArray(input.items) || !input.items.length || input.items.length > 100)
                    throw new MerchantError('请选择 1 至 100 种菜品');
                const ids = new Set<string>();
                const items = input.items.map(item => {
                    if (!record(item) || !validId(item.menuItemId) || ids.has(item.menuItemId))
                        throw new MerchantError('菜品信息无效或存在重复菜品');
                    ids.add(item.menuItemId);
                    const menu = shop.menu.find(menu => menu.id === item.menuItemId && menu.available);
                    if (!menu)
                        throw new MerchantError('部分菜品已停售，请刷新菜单后重试');
                    const quantity = integer(item.quantity, 1, 99, '菜品数量'), amount = integer(quantity * menu.price, 1, 100000000, '菜品金额');
                    return { menuItemId: menu.id, name: menu.name, quantity, unitPrice: menu.price, amount };
                });
                const total = integer(items.reduce((sum, item) => sum + item.amount, 0), 1, 100000000, '订单金额');
                const order: MerchantOrder = { id: randomUUID(), table, items, total, status: 'pending', createdAt: Date.now() };
                state.orders.push(order);
                state.revision++;
                account.orderRequests.push({ requestId: rid, body: fingerprint, orderId: order.id });
                return { result: { order }, changed: true };
            });
        },
    };
}
export function merchantMiddleware(root: string) {
    const store = createMerchantStore(root);
    return async (req: IncomingMessage, res: ServerResponse) => {
        const send = (status: number, data: unknown) => { res.statusCode = status; res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Content-Type-Options', 'nosniff'); res.end(JSON.stringify(data)); };
        try {
            if (!['GET', 'POST'].includes(req.method ?? ''))
                return send(405, { error: '仅支持读取与提交' });
            if (req.headers['sec-fetch-site'] === 'cross-site')
                return send(403, { error: '仅允许同源访问' });
            if (req.headers.origin) {
                let origin: URL;
                try {
                    origin = new URL(req.headers.origin);
                }
                catch {
                    return send(403, { error: '来源无效' });
                }
                if (!['http:', 'https:'].includes(origin.protocol) || origin.host !== req.headers.host)
                    return send(403, { error: '仅允许同源访问' });
            }
            const pathname = new URL(req.url ?? '/', 'http://localhost').pathname;
            const isOwner = pathname === '/owner', publicMatch = pathname.match(/^\/public\/([a-zA-Z0-9_-]{20,100})(\/orders)?$/);
            if (!isOwner && !publicMatch)
                return send(404, { error: '小店接口不存在' });
            let scope: string | undefined;
            if (isOwner) {
                if (req.headers['x-zhiyin-merchant'] !== '1')
                    return send(403, { error: '请求格式无效' });
                const value = req.headers['x-zhiyin-expense-scope'];
                if (!validScope(value))
                    return send(400, { error: '缺少有效的小店标识' });
                scope = value;
            }
            if (req.method === 'GET') {
                if (isOwner)
                    return send(200, store.get(scope!));
                if (publicMatch![2])
                    return send(405, { error: '请提交点餐内容' });
                return send(200, store.publicMenu(publicMatch![1]));
            }
            if (!isOwner && !publicMatch![2])
                return send(405, { error: '请使用订单提交接口' });
            if (!req.headers['content-type']?.startsWith('application/json'))
                return send(403, { error: '请求格式无效' });
            const chunks: Buffer[] = [];
            let bytes = 0;
            for await (const chunk of req) {
                const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
                bytes += buffer.byteLength;
                if (bytes > 65536)
                    return send(413, { error: '小店请求内容过大' });
                chunks.push(buffer);
            }
            let input: unknown;
            try {
                input = JSON.parse(Buffer.concat(chunks).toString('utf8'));
            }
            catch {
                return send(400, { error: '请求内容格式无效' });
            }
            return isOwner ? send(200, store.change(scope!, input)) : send(200, store.order(publicMatch![1], input));
        }
        catch (error) {
            if (error instanceof MerchantError)
                return send(error.status, { error: error.message });
            return send(503, { error: '小店服务暂不可用，请稍后重试' });
        }
    };
}
