import {render, screen, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {expect, it} from 'vitest';
import {emptyMerchantState, type MerchantOrder, type MerchantState} from '../../src/lib/merchant';
import {MerchantCashflow} from '../../src/components/merchant-cashflow';

const now = Date.parse('2026-10-23T12:00:00+08:00');
const at = (date: string) => Date.parse(date);
const order = (id: string, total: number, paidAt?: number, refundedAt?: number): MerchantOrder => ({
    id, table: '1', items: [{menuItemId: 'tea', name: '茶', quantity: 1, unitPrice: total, amount: total}],
    total, createdAt: at('2026-10-01T10:00:00+08:00'),
    status: refundedAt !== undefined ? 'refunded' : paidAt !== undefined ? 'paid' : 'pending', paidAt, refundedAt,
});
const state = (orders: MerchantOrder[] = [], expenses: MerchantState['expenses'] = []): MerchantState => ({...emptyMerchantState(), orders, expenses});
async function table() {
    await userEvent.setup().click(screen.getByText('查看每日明细'));
    return screen.getByRole('table', {name: '近 7 天每日收支明细，单位元'});
}

it('展示真实空态及连续七天，不给待付款订单虚构收入', async () => {
    render(<MerchantCashflow state={state([order('pending', 9900)])} now={now}/>);
    expect(screen.getByRole('heading', {name: '近 7 天收支'})).toBeInTheDocument();
    expect(screen.getByText('还没有收付记录')).toBeInTheDocument();
    const rows = within(await table()).getAllByRole('row');
    expect(rows).toHaveLength(8);
    expect(rows[1]).toHaveTextContent('10月17日');
    expect(rows[7]).toHaveTextContent('10月23日');
    expect(within(rows[7]).getAllByRole('cell').map(cell => cell.textContent)).toEqual(['0.00', '0.00']);
});

it('按北京时间自然日记录收付，排除七天前和当前时刻之后的事件', async () => {
    render(<MerchantCashflow now={now} state={state([
        order('before', 400, at('2026-10-16T23:59:59+08:00')),
        order('start', 1800, at('2026-10-17T00:00:00+08:00')),
        order('day-end', 1200, at('2026-10-22T15:59:59Z')),
        order('today', 3000, at('2026-10-22T16:00:00Z')),
        order('future', 100000, now + 1),
    ], [{id: 'expense', title: '进货', category: '采购', amount: 800, occurredAt: now}])}/>);
    const rows = within(await table()).getAllByRole('row');
    expect(rows[1]).toHaveTextContent('18.00');
    expect(rows[6]).toHaveTextContent('12.00');
    expect(within(rows[7]).getAllByRole('cell').map(cell => cell.textContent)).toEqual(['30.00', '8.00']);
    expect(screen.queryByText('还没有收付记录')).not.toBeInTheDocument();
});

it('退款按退款当天抵减，跨日退款可显示负净收款', async () => {
    render(<MerchantCashflow now={now} state={state([
        order('refunded', 5000, at('2026-10-20T10:00:00+08:00'), now),
        order('old-payment-refund', 3000, at('2026-10-10T10:00:00+08:00'), now),
    ])}/>);
    const rows = within(await table()).getAllByRole('row');
    expect(rows[4]).toHaveTextContent('50.00');
    expect(rows[7]).toHaveTextContent('-80.00');
    expect(screen.getByText('净收款为负的日期，退款多于收款。')).toBeInTheDocument();
    expect(screen.getByRole('img', {name: /每日净收款与已记支出柱状图/})).toBeInTheDocument();
});

it('当天收款与退款相抵仍然保留真实收付记录状态', async () => {
    render(<MerchantCashflow now={now} state={state([order('same-day', 2000, now - 1000, now)])}/>);
    expect(screen.queryByText('还没有收付记录')).not.toBeInTheDocument();
    const rows = within(await table()).getAllByRole('row');
    expect(within(rows[7]).getAllByRole('cell').map(cell => cell.textContent)).toEqual(['0.00', '0.00']);
    expect(screen.getByText(/净收款已扣除当日退款/)).toBeInTheDocument();
});

it('大额数据的精确值保留在明细，图表坐标保持有限值', async () => {
    const {container} = render(<MerchantCashflow now={now} state={state([order('large', 100000000, now)])}/>);
    expect(within(await table()).getByText('1,000,000.00')).toBeInTheDocument();
    for (const rect of container.querySelectorAll('svg rect')) {
        expect(Number.isFinite(Number(rect.getAttribute('height')))).toBe(true);
        expect(Number(rect.getAttribute('height'))).toBeGreaterThanOrEqual(0);
    }
    expect(container.querySelector('svg')?.innerHTML).not.toMatch(/NaN|Infinity/);
});

it('仅有跨期退款时仍从零线向下绘制，不把退款丢掉', async () => {
    const {container} = render(<MerchantCashflow now={now} state={state([
        order('only-refund', 12000, at('2026-10-10T10:00:00+08:00'), now),
    ])}/>);
    expect(within(await table()).getByText('-120.00')).toBeInTheDocument();
    const zeroLine = container.querySelector('[data-zero="true"] line')!;
    const refundBar = container.querySelector('.merchant-cashflow-net')!;
    expect(Number(refundBar.getAttribute('y'))).toBe(Number(zeroLine.getAttribute('y1')));
    expect(Number(refundBar.getAttribute('height'))).toBeGreaterThan(0);
});

it('支出按发生日期记入，未来支出不提前显示', async () => {
    render(<MerchantCashflow now={now} state={state([], [
        {id: 'past', title: '进货', category: '采购', amount: 1250, occurredAt: at('2026-10-18T14:00:00+08:00')},
        {id: 'future', title: '进货', category: '采购', amount: 300000, occurredAt: now + 1},
    ])}/>);
    const rows = within(await table()).getAllByRole('row');
    expect(within(rows[2]).getAllByRole('cell').map(cell => cell.textContent)).toEqual(['0.00', '12.50']);
    expect(within(rows[7]).getAllByRole('cell').map(cell => cell.textContent)).toEqual(['0.00', '0.00']);
    expect(screen.queryByText('还没有收付记录')).not.toBeInTheDocument();
});
