import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { BadgePercent, Check, ChevronDown, Plus, Search, ShieldCheck } from 'lucide-react';
import { useWechatGestures } from '../../../hooks/useWechatGestures';
import { useWechatPayLedger, useWechatPayTransaction } from '../../../pay-ledger/useWechatPayLedger';
import type { WechatPayCategory, WechatPayTransaction } from '../../../types';
import { categoryMeta, LedgerLoading, LedgerTabBar, MiniAppHeader, money } from './shared';
import { useWechatStore } from '../../../state';
import {
  getWechatPayDateKey,
  getWechatPayDateTimeLabel,
  getWechatPayMonthKey,
  getWechatPayTimeLabel,
} from '../../../pay-ledger/dateKeys';

const monthLabel = (month: string) => `${Number(month.slice(5))}月`;
const dateLabel = (date: string) => `${Number(date.slice(5, 7))}月${Number(date.slice(8, 10))}日`;
const categories = Object.entries(categoryMeta).filter(([id]) => id !== 'income') as Array<[WechatPayCategory, typeof categoryMeta[WechatPayCategory]]>;

const ErrorState: React.FC<{ message: string; retry: () => void }> = ({ message, retry }) => (
  <div className="px-5 py-16 text-center">
    <p className="text-[14px] text-[#777]">{message}</p>
    <button onClick={retry} className="mt-4 h-10 px-5 rounded-[8px] bg-[#40b983] text-white text-[14px]">重新加载</button>
  </div>
);

const TransactionRow: React.FC<{ item: WechatPayTransaction }> = ({ item }) => {
  const { bindTap } = useWechatGestures();
  const meta = categoryMeta[item.category];
  const Icon = meta.icon;
  return (
    <button {...bindTap<HTMLButtonElement>('wechatPay.transaction.open', { params: { id: item.id } })} className="w-full min-h-[72px] px-4 flex items-center text-left border-t border-[#f0f0f0] active:bg-[#f6f6f6]">
      <span className={`w-10 h-10 rounded-full grid place-items-center shrink-0 ${item.direction === 'income' ? 'bg-[#ecf7f1] text-[#40b983]' : 'bg-[#40b983] text-white'}`}><Icon size={20} /></span>
      <span className="ml-3 min-w-0 flex-1">
        <strong className="block text-[16px] font-normal truncate">{meta.label}</strong>
        <small className="block text-[12px] text-[#a1a1a1] mt-1 truncate">{getWechatPayTimeLabel(item.occurredAt)}｜{item.merchant}</small>
      </span>
      <strong className="ml-3 text-[17px] font-medium tabular-nums">{item.direction === 'expense' ? '−' : '+'}{(item.amountCents / 100).toFixed(2)}</strong>
    </button>
  );
};

export const WechatPayLedgerPage: React.FC = () => {
  const location = useLocation();
  const { bindTap } = useWechatGestures();
  const ledgerTransactions = useWechatStore(state => state.payLedger.transactions);
  const monthlyHistory = useWechatStore(state => state.payLedger.monthlyHistory);
  const latestLedgerMonth = ledgerTransactions[0]
    ? getWechatPayMonthKey(ledgerTransactions[0].occurredAt)
    : '2026-09';
  const [month, setMonth] = useState(latestLedgerMonth);
  const [category, setCategory] = useState<WechatPayCategory | 'all'>('all');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [search, setSearch] = useState('');
  const searchMode = new URLSearchParams(location.search).has('search');
  const { data, loading, error, refresh } = useWechatPayLedger({ month, category, search });
  const monthOptions = useMemo(() => Array.from(new Set([
    latestLedgerMonth,
    month,
    ...ledgerTransactions.map(item => getWechatPayMonthKey(item.occurredAt)),
    ...monthlyHistory.map(item => item.month),
  ])).slice(0, 3), [latestLedgerMonth, ledgerTransactions, month, monthlyHistory]);
  useEffect(() => setMonth(latestLedgerMonth), [latestLedgerMonth]);
  const grouped = useMemo(() => {
    const groups = new Map<string, WechatPayTransaction[]>();
    for (const item of data?.transactions || []) {
      const date = getWechatPayDateKey(item.occurredAt);
      groups.set(date, [...(groups.get(date) || []), item]);
    }
    return [...groups.entries()];
  }, [data]);

  return (
    <div className="min-h-full bg-[#f3f4f3] text-[#191919]">
      <MiniAppHeader title="记账本">
        <div className="mt-4 flex items-center justify-between gap-3">
          <button onClick={() => setFiltersOpen(open => !open)} aria-expanded={filtersOpen} className="h-10 px-3 rounded-[6px] bg-white/12 flex items-center gap-2 text-[15px] active:bg-white/20">
            {category === 'all' ? '全部类型' : categoryMeta[category].label}<ChevronDown size={17} />
          </button>
          <div className="text-right text-[13px] leading-6 text-white/80">
            <strong className="block text-white text-[18px] font-medium">{monthLabel(month)}支出 {money(data?.summary.expenseCents || 0)}</strong>
            <span>入账 {money(data?.summary.incomeCents || 0)}</span>
          </div>
        </div>
        {searchMode && (
          <label className="mt-3 h-10 px-3 rounded-[8px] bg-white flex items-center gap-2 text-[#777]">
            <Search size={17} />
            <input autoFocus value={search} onChange={event => setSearch(event.target.value)} placeholder="搜索交易说明" className="flex-1 min-w-0 bg-transparent outline-none text-[#191919] text-[14px]" />
          </label>
        )}
        {filtersOpen && (
          <div className="mt-3 p-2 rounded-[10px] bg-white text-[#191919] grid grid-cols-3 gap-1 shadow-[0_8px_24px_rgba(0,0,0,0.12)]">
            <button onClick={() => { setCategory('all'); setFiltersOpen(false); }} className={`h-9 rounded-[7px] text-[13px] ${category === 'all' ? 'bg-[#eaf7f1] text-[#22875d]' : 'active:bg-[#f2f2f2]'}`}>全部</button>
            {categories.map(([id, meta]) => <button key={id} onClick={() => { setCategory(id); setFiltersOpen(false); }} className={`h-9 rounded-[7px] text-[13px] ${category === id ? 'bg-[#eaf7f1] text-[#22875d]' : 'active:bg-[#f2f2f2]'}`}>{meta.label}</button>)}
          </div>
        )}
      </MiniAppHeader>

      <div className="px-4 pt-4 pb-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            {monthOptions.map(value => <button key={value} onClick={() => setMonth(value)} className={`h-8 px-3 rounded-full text-[13px] ${month === value ? 'bg-[#191919] text-white' : 'bg-white text-[#666]'}`}>{monthLabel(value)}</button>)}
          </div>
          <button {...bindTap<HTMLButtonElement>('wechatPay.add.open')} className="h-9 px-3 rounded-full bg-white text-[#2b8b64] flex items-center gap-1.5 text-[13px] shadow-[0_2px_8px_rgba(0,0,0,0.06)]"><Plus size={16} />记一笔</button>
        </div>

        {loading && <LedgerLoading />}
        {error && <ErrorState message={error} retry={refresh} />}
        {!loading && !error && grouped.length === 0 && (
          <div className="py-20 text-center"><p className="text-[15px]">没有符合条件的账单</p><p className="text-[13px] text-[#888] mt-2">换个类型，或记下第一笔现金收支。</p></div>
        )}
        {!loading && !error && grouped.map(([date, items]) => {
          const expense = items.filter(item => item.direction === 'expense').reduce((sum, item) => sum + item.amountCents, 0);
          const income = items.filter(item => item.direction === 'income').reduce((sum, item) => sum + item.amountCents, 0);
          return (
            <section key={date} className="mb-3 bg-white rounded-[14px] overflow-hidden shadow-[0_2px_12px_rgba(0,0,0,0.04)]">
              <div className="h-14 px-4 flex items-center justify-between">
                <h2 className="text-[17px] font-medium">{dateLabel(date)}{date === '2026-09-14' ? ' 昨天' : ''}</h2>
                <span className="text-[13px] text-[#777]">出 {money(expense).slice(1)}　入 {money(income).slice(1)}</span>
              </div>
              {items.map(item => <TransactionRow key={item.id} item={item} />)}
            </section>
          );
        })}
      </div>
      <LedgerTabBar active="ledger" />
    </div>
  );
};

export const WechatPayStatisticsPage: React.FC = () => {
  const { data, loading, error, refresh } = useWechatPayLedger({ month: '2026-09' });
  const [selectedDate, setSelectedDate] = useState('2026-09-14');
  const daily = [...(data?.daily || [])].reverse();
  const maxDaily = Math.max(...daily.map(item => item.expenseCents), 1);
  const maxMonth = Math.max(...(data?.monthly || []).map(item => item.expenseCents), 1);
  const categoryTotal = data?.categories.reduce((sum, item) => sum + item.expenseCents, 0) || 1;
  const selected = daily.find(item => item.date === selectedDate) || daily.at(-1);
  let degree = 0;
  const gradient = (data?.categories || []).map((item, index) => {
    const start = degree;
    degree += item.expenseCents / categoryTotal * 360;
    const colors = ['#40b983', '#69c69c', '#8bd4b1', '#a8dec4', '#c5ead8', '#d9f1e5'];
    return `${colors[index % colors.length]} ${start}deg ${degree}deg`;
  }).join(', ');

  return (
    <div className="min-h-full bg-white text-[#191919]">
      <MiniAppHeader title="账单统计" compact />
      {loading && <LedgerLoading />}
      {error && <ErrorState message={error} retry={refresh} />}
      {!loading && !error && data && <main className="px-5 py-6 space-y-10">
        <section>
          <div className="flex items-end justify-between">
            <div><h2 className="text-[22px] font-medium">每日对比</h2><p className="text-[13px] text-[#888] mt-1">点按柱形查看当天支出</p></div>
            {selected && <div className="rounded-[10px] bg-[#242424] px-3 py-2 text-white text-right"><small className="block text-white/70">{dateLabel(selected.date)}</small><strong className="text-[#57cf98] tabular-nums">{money(selected.expenseCents)}</strong></div>}
          </div>
          <div className="h-[180px] mt-6 flex items-end gap-2 border-b border-[#e7e7e7]">
            {daily.map(item => <button key={item.date} onClick={() => setSelectedDate(item.date)} aria-label={`${dateLabel(item.date)}支出${money(item.expenseCents)}`} className="h-full flex-1 flex items-end justify-center group"><span className={`w-full max-w-5 rounded-t-[3px] transition-[height,background-color] duration-200 ${selectedDate === item.date ? 'bg-[#40b983]' : 'bg-[#ccecdf] group-active:bg-[#83d3ae]'}`} style={{ height: `${Math.max(5, item.expenseCents / maxDaily * 100)}%` }} /></button>)}
          </div>
        </section>

        <section className="pt-8 border-t border-[#eeeeee]">
          <h2 className="text-[22px] font-medium">月度对比</h2>
          <div className="h-[210px] mt-6 flex items-end gap-4 border-b border-[#e7e7e7]">
            {data.monthly.slice(-6).map(item => <div key={item.month} className="flex-1 h-full flex flex-col justify-end items-center gap-2"><span className={`w-full max-w-8 rounded-t-[4px] ${item.month === '2026-09' ? 'bg-[#40b983]' : 'bg-[#c3e7d5]'}`} style={{ height: `${Math.max(8, item.expenseCents / maxMonth * 82)}%` }} /><span className="text-[12px] text-[#777]">{monthLabel(item.month)}</span></div>)}
          </div>
        </section>

        <section className="pt-8 border-t border-[#eeeeee]">
          <h2 className="text-[22px] font-medium">支出构成</h2>
          <div className="mt-6 flex items-center gap-6">
            <div className="relative w-36 h-36 rounded-full shrink-0" style={{ background: `conic-gradient(${gradient || '#e8e8e8 0deg 360deg'})` }}><span className="absolute inset-[29px] rounded-full bg-white grid place-items-center text-center"><small className="text-[11px] text-[#888]">9月支出</small><strong className="text-[15px]">{money(data.summary.expenseCents)}</strong></span></div>
            <div className="min-w-0 flex-1 space-y-3">{data.categories.slice(0, 5).map(item => <div key={item.category} className="flex items-center justify-between gap-3 text-[13px]"><span className="truncate">{categoryMeta[item.category].label}</span><strong className="tabular-nums">{Math.round(item.expenseCents / categoryTotal * 100)}%</strong></div>)}</div>
          </div>
        </section>
      </main>}
      <LedgerTabBar active="stats" />
    </div>
  );
};

const SwitchRow: React.FC<{ title: string; description: string; checked: boolean; onChange: () => void }> = ({ title, description, checked, onChange }) => (
  <div className="min-h-[76px] px-4 py-3 flex items-center gap-3 border-t first:border-t-0 border-[#eeeeee]">
    <div className="min-w-0 flex-1"><strong className="block text-[16px] font-normal">{title}</strong><span className="block text-[12px] text-[#888] mt-1 leading-5">{description}</span></div>
    <button role="switch" aria-checked={checked} aria-label={title} onClick={onChange} className={`w-[50px] h-[30px] rounded-full p-[2px] transition-colors duration-200 ${checked ? 'bg-[#40b983]' : 'bg-[#d7d7d7]'}`}><span className={`block w-[26px] h-[26px] rounded-full bg-white shadow-[0_1px_4px_rgba(0,0,0,0.18)] transition-transform duration-200 ${checked ? 'translate-x-5' : 'translate-x-0'}`} /></button>
  </div>
);

export const WechatPayLedgerSettingsPage: React.FC = () => {
  const { data, loading, error, refresh, updateSettings } = useWechatPayLedger({ month: '2026-09' });
  return (
    <div className="min-h-full bg-[#f3f4f3] text-[#191919]">
      <MiniAppHeader title="记账设置" compact />
      {loading && <LedgerLoading />}
      {error && <ErrorState message={error} retry={refresh} />}
      {!loading && !error && data && <main className="px-4 py-5 space-y-4">
        <section className="bg-white rounded-[14px] overflow-hidden">
          <SwitchRow title="记账日报" description="每天上午生成前一日收支摘要" checked={data.settings.dailyReport} onChange={() => void updateSettings({ dailyReport: !data.settings.dailyReport })} />
          <SwitchRow title="包含手动记账" description="统计中计入你补充的现金等其他收支" checked={data.settings.includeManualRecords} onChange={() => void updateSettings({ includeManualRecords: !data.settings.includeManualRecords })} />
        </section>
        <section className="bg-white rounded-[14px] overflow-hidden">
          <div className="px-4 py-4 flex gap-3"><ShieldCheck size={20} className="text-[#40b983] shrink-0" /><div><strong className="block text-[15px] font-medium">数据来源与授权</strong><p className="text-[12px] leading-5 text-[#888] mt-1">当前使用本地演示账本；接入合作数据接口后，知银等服务仍需在双方分别取得你的授权。</p></div></div>
        </section>
        <p className="px-2 text-[12px] leading-5 text-[#999]">测试数据可在开发配置中替换，后续接入合作接口不需要改动这些页面。</p>
      </main>}
      <LedgerTabBar active="settings" />
    </div>
  );
};

export const WechatPayAddTransactionPage: React.FC = () => {
  const { back } = useWechatGestures();
  const { addTransaction } = useWechatPayLedger({ month: '2026-09' });
  const [direction, setDirection] = useState<'expense' | 'income'>('expense');
  const [amount, setAmount] = useState('');
  const [merchant, setMerchant] = useState('');
  const [category, setCategory] = useState<WechatPayCategory>('shopping');
  const [date, setDate] = useState('2026-09-15');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const amountCents = Math.round(Number(amount) * 100);
    setSaving(true);
    setError('');
    try {
      await addTransaction({ direction, amountCents, category, merchant, occurredAt: `${date}T12:00:00+08:00` });
      back();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '保存失败，请稍后重试。');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-full bg-[#f3f4f3] text-[#191919]">
      <MiniAppHeader title="记一笔" compact />
      <form onSubmit={submit} className="px-4 py-5 space-y-4">
        <div className="p-1 rounded-[10px] bg-[#e6e8e7] grid grid-cols-2"><button type="button" onClick={() => setDirection('expense')} className={`h-10 rounded-[8px] text-[14px] ${direction === 'expense' ? 'bg-white shadow-sm' : ''}`}>支出</button><button type="button" onClick={() => setDirection('income')} className={`h-10 rounded-[8px] text-[14px] ${direction === 'income' ? 'bg-white shadow-sm' : ''}`}>收入</button></div>
        <label className="block bg-white rounded-[14px] px-4 py-5"><span className="block text-[13px] text-[#777]">金额</span><span className="mt-2 flex items-center gap-2"><strong className="text-[30px] font-medium">¥</strong><input inputMode="decimal" value={amount} onChange={event => setAmount(event.target.value)} placeholder="0.00" className="min-w-0 flex-1 text-[36px] outline-none tabular-nums" /></span></label>
        <div className="bg-white rounded-[14px] overflow-hidden">
          <label className="h-14 px-4 flex items-center border-b border-[#eeeeee]"><span className="w-20 text-[14px]">说明</span><input value={merchant} onChange={event => setMerchant(event.target.value)} placeholder="例如：便利店" className="flex-1 min-w-0 outline-none text-[14px]" /></label>
          <label className="h-14 px-4 flex items-center border-b border-[#eeeeee]"><span className="w-20 text-[14px]">分类</span><select value={direction === 'income' ? 'income' : category} onChange={event => setCategory(event.target.value as WechatPayCategory)} disabled={direction === 'income'} className="flex-1 bg-transparent outline-none text-[14px]">{direction === 'income' ? <option value="income">收入</option> : categories.map(([id, meta]) => <option key={id} value={id}>{meta.label}</option>)}</select></label>
          <label className="h-14 px-4 flex items-center"><span className="w-20 text-[14px]">日期</span><input type="date" value={date} onChange={event => setDate(event.target.value)} className="flex-1 bg-transparent outline-none text-[14px]" /></label>
        </div>
        {error && <p role="alert" className="text-[13px] text-[#d54941]">{error}</p>}
        <button type="submit" disabled={saving} className="w-full h-12 rounded-[9px] bg-[#40b983] text-white text-[16px] font-medium disabled:opacity-50 active:bg-[#359f70]">{saving ? '正在保存…' : '保存记录'}</button>
      </form>
    </div>
  );
};

export const WechatPayTransactionPage: React.FC = () => {
  const { id } = useParams();
  const { data: item, loading } = useWechatPayTransaction(id);
  const meta = item ? categoryMeta[item.category] : null;
  return (
    <div className="min-h-full bg-[#f3f4f3] text-[#191919]">
      <MiniAppHeader title="交易详情" compact />
      {loading && <LedgerLoading />}
      {!loading && !item && <div className="py-20 text-center text-[14px] text-[#777]">没有找到这笔交易</div>}
      {item && meta && <main className="px-4 py-6"><section className="bg-white rounded-[14px] overflow-hidden"><div className="py-8 text-center border-b border-[#eeeeee]"><span className="text-[15px] text-[#777]">{item.merchant}</span><strong className="block text-[36px] font-medium mt-3 tabular-nums">{item.direction === 'expense' ? '−' : '+'}{money(item.amountCents)}</strong></div><dl className="px-4 py-2 text-[14px]">{[['交易类型', meta.label], ['交易时间', getWechatPayDateTimeLabel(item.occurredAt)], ['数据来源', item.source === 'manual' ? '手动记账' : '微信支付'], ['交易单号', item.id]].map(([label, value]) => <div key={label} className="min-h-12 py-3 flex gap-4 border-b last:border-0 border-[#eeeeee]"><dt className="w-20 text-[#888] shrink-0">{label}</dt><dd className="flex-1 text-right break-all">{value}</dd></div>)}</dl></section></main>}
    </div>
  );
};

export const WechatPayOffersPage: React.FC = () => {
  const [revealed, setRevealed] = useState(false);
  return <div className="min-h-full bg-[#f3f4f3] text-[#191919]"><MiniAppHeader title="摇优惠" compact /><main className="px-4 py-8"><section className="bg-white rounded-[14px] px-5 py-10 text-center"><span className="mx-auto w-16 h-16 rounded-full bg-[#eaf7f1] text-[#40b983] grid place-items-center"><BadgePercent size={30} /></span><h2 className="text-[20px] font-medium mt-5">看看今天有什么优惠</h2><p className="text-[13px] text-[#888] mt-2">演示环境不会生成虚假优惠券。</p><button onClick={() => setRevealed(true)} className="mt-6 w-full h-12 rounded-[9px] bg-[#40b983] text-white text-[16px]">摇一摇</button>{revealed && <p className="mt-5 inline-flex items-center gap-2 text-[14px] text-[#35825f]"><Check size={17} />今天暂无可用优惠</p>}</section></main></div>;
};
