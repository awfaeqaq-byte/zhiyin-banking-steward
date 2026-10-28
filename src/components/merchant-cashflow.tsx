import {useId} from 'react';
import type {MerchantState} from '../lib/merchant';
import './merchant-cashflow.css';

const DAY = 86400000;
const SHANGHAI_OFFSET = 8 * 60 * 60 * 1000;
const amount = (fen: number) => (fen / 100).toLocaleString('zh-CN', {minimumFractionDigits: 2, maximumFractionDigits: 2});
const axisAmount = (fen: number) => {
    const yuan = fen / 100;
    if (Math.abs(yuan) >= 100000000) return `${Number((yuan / 100000000).toFixed(1))}亿`;
    if (Math.abs(yuan) >= 10000) return `${Number((yuan / 10000).toFixed(1))}万`;
    return Number(yuan.toFixed(Math.abs(yuan) >= 10 ? 0 : 2)).toLocaleString('zh-CN');
};

/** Seven Shanghai calendar days; cash follows its payment/refund event, not order creation. */
export function MerchantCashflow({state, now = Date.now()}: {state: MerchantState; now?: number}) {
    const id = useId();
    const today = Math.floor((now + SHANGHAI_OFFSET) / DAY) * DAY - SHANGHAI_OFFSET;
    const from = today - 6 * DAY;
    const days = Array.from({length: 7}, (_, index) => {
        const start = from + index * DAY;
        const localDate = new Date(start + SHANGHAI_OFFSET);
        const month = localDate.getUTCMonth() + 1;
        const date = localDate.getUTCDate();
        return {start, label: `${month}/${date}`, fullLabel: `${month}月${date}日`, collected: 0, refunded: 0, expense: 0};
    });
    const addEvent = (timestamp: number | undefined, value: number, field: 'collected' | 'refunded' | 'expense') => {
        if (timestamp === undefined || timestamp < from || timestamp > now) return;
        const day = days[Math.floor((timestamp - from) / DAY)];
        if (day) day[field] += value;
    };
    state.orders.forEach(order => {
        addEvent(order.paidAt, order.total, 'collected');
        addEvent(order.refundedAt, order.total, 'refunded');
    });
    state.expenses.forEach(expense => addEvent(expense.occurredAt, expense.amount, 'expense'));
    const values = days.flatMap(day => [day.collected - day.refunded, day.expense]);
    const hasEvents = days.some(day => day.collected || day.refunded || day.expense);
    const max = Math.max(0, ...values), min = Math.min(0, ...values);
    const upper = max * 1.12, lower = min * 1.12;
    const span = upper - lower || 100;
    const y = (value: number) => 144 - ((value - lower) / span) * 120;
    const baseline = y(0);
    const ticks = [0];
    if (max > 0) ticks.unshift(upper);
    if (max > 0 && min === 0) ticks.splice(1, 0, upper / 2);
    if (min < 0) ticks.push(lower);
    return <section className="merchant-cashflow" aria-labelledby={`${id}-heading`}>
        <header className="merchant-cashflow-heading">
            <h3 id={`${id}-heading`}>近 7 天收支</h3>
            <span>{days[0].label} — {days[6].label}</span>
        </header>
        <div className="merchant-cashflow-legend" aria-hidden="true">
            <span><i/>净收款</span><span><i/>已记支出</span><small>元</small>
        </div>
        <div className="merchant-cashflow-plot">
            <svg viewBox="0 0 320 176" role="img" aria-labelledby={`${id}-chart-title ${id}-chart-desc`}>
                <title id={`${id}-chart-title`}>每日净收款与已记支出柱状图</title>
                <desc id={`${id}-chart-desc`}>{hasEvents ? '按实际收款、退款及支出日期汇总。负净收款在零线下方，可展开每日明细查看金额。' : '近七天尚无收付记录。'}</desc>
                {ticks.map(tick => <g key={tick} className="merchant-cashflow-grid" data-zero={tick === 0}>
                    <line x1="44" x2="316" y1={y(tick)} y2={y(tick)}/>
                    <text x="36" y={y(tick) + 4} textAnchor="end">{axisAmount(tick)}</text>
                </g>)}
                {days.map((day, index) => {
                    const net = day.collected - day.refunded;
                    const x = 44 + (index + .5) * (272 / 7);
                    return <g key={day.start}>
                        {net !== 0 && <rect className="merchant-cashflow-bar merchant-cashflow-net" x={x - 11} y={Math.min(y(net), baseline)} width="9" height={Math.abs(y(net) - baseline)} rx="2">
                            <title>{day.fullLabel}，净收款 {amount(net)} 元</title>
                        </rect>}
                        {day.expense !== 0 && <rect className="merchant-cashflow-bar merchant-cashflow-expense" x={x + 2} y={y(day.expense)} width="9" height={baseline - y(day.expense)} rx="2">
                            <title>{day.fullLabel}，已记支出 {amount(day.expense)} 元</title>
                        </rect>}
                        <text className="merchant-cashflow-date" data-today={index === 6} x={x} y="166" textAnchor="middle">{index === 6 ? '今天' : day.label}</text>
                    </g>;
                })}
            </svg>
            {!hasEvents && <div className="merchant-cashflow-empty"><strong>还没有收付记录</strong><span>登记收款或支出后，在这里查看每日变化</span></div>}
        </div>
        <p className="merchant-cashflow-note">按实际收付时间 · 净收款已扣除当日退款</p>
        {min < 0 && <p className="merchant-cashflow-note">净收款为负的日期，退款多于收款。</p>}
        <details className="merchant-cashflow-detail">
            <summary>查看每日明细</summary>
            <table>
                <caption>近 7 天每日收支明细，单位元</caption>
                <thead><tr><th scope="col">日期</th><th scope="col">净收款</th><th scope="col">已记支出</th></tr></thead>
                <tbody>{days.map(day => <tr key={day.start}><th scope="row">{day.fullLabel}</th><td>{amount(day.collected - day.refunded)}</td><td>{amount(day.expense)}</td></tr>)}</tbody>
            </table>
        </details>
    </section>;
}
