import React, { useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  Banknote, Bus, CircleDollarSign, Gift, GraduationCap, MoreHorizontal,
  PieChart, ReceiptText, Settings, ShoppingBag, Utensils, Wrench, X,
} from 'lucide-react';
import { useWechatGestures } from '../../../hooks/useWechatGestures';
import type { WechatPayCategory } from '../../../types';

export const categoryMeta: Record<WechatPayCategory, { label: string; icon: LucideIcon }> = {
  shopping: { label: '购物', icon: ShoppingBag },
  transport: { label: '交通', icon: Bus },
  dining: { label: '餐饮', icon: Utensils },
  life: { label: '生活缴费', icon: CircleDollarSign },
  service: { label: '服务', icon: Wrench },
  education: { label: '教育', icon: GraduationCap },
  entertainment: { label: '娱乐', icon: PieChart },
  gift: { label: '红包', icon: Gift },
  transfer: { label: '转账', icon: Banknote },
  other: { label: '其他', icon: CircleDollarSign },
  income: { label: '收入', icon: Banknote },
};

export const money = (cents: number, options?: { sign?: boolean }) => {
  const prefix = options?.sign ? (cents > 0 ? '+' : '') : '';
  return `${prefix}¥${(cents / 100).toFixed(2)}`;
};

export const MiniAppHeader: React.FC<{ title: string; children?: React.ReactNode; compact?: boolean }> = ({ title, children, compact }) => {
  const { bindBack } = useWechatGestures();
  const [moreOpen, setMoreOpen] = useState(false);
  return (
    <header className={`${compact ? 'pb-5' : 'pb-6'} relative pt-10 px-5 text-white bg-[#40b983]`}>
      <div className="h-12 flex items-center justify-between">
        <button {...bindBack<HTMLButtonElement>()} aria-label="返回微信支付" className="w-10 h-10 -ml-2 grid place-items-center rounded-full active:bg-black/10">
          <X size={20} />
        </button>
        <h1 className="text-[19px] font-medium">{title}</h1>
        <button onClick={() => setMoreOpen(open => !open)} aria-label="更多" aria-expanded={moreOpen} className="w-[72px] h-9 rounded-full bg-black/10 flex items-center justify-around active:bg-black/15">
          <MoreHorizontal size={21} /><span className="h-5 w-px bg-white/20" /><span className="w-4 h-4 rounded-full border-2 border-white grid place-items-center"><span className="w-1.5 h-1.5 rounded-full bg-white" /></span>
        </button>
      </div>
      {moreOpen && (
        <div role="status" className="absolute z-30 top-[80px] right-5 w-48 rounded-[10px] bg-[#2c2c2c] px-4 py-3 text-left text-[12px] leading-5 text-white shadow-[0_8px_24px_rgba(0,0,0,0.22)]">
          <strong className="block text-[14px] font-medium">微信记账本</strong>
          <span className="text-white/70">账单来自可替换的数据适配器</span>
        </div>
      )}
      {children}
    </header>
  );
};

export const LedgerTabBar: React.FC<{ active: 'ledger' | 'stats' | 'settings' }> = ({ active }) => {
  const { bindTap } = useWechatGestures();
  const items = [
    { id: 'ledger' as const, label: '明细', icon: ReceiptText, transition: 'wechatPay.ledger.open' as const },
    { id: 'stats' as const, label: '统计', icon: PieChart, transition: 'wechatPay.stats.open' as const },
    { id: 'settings' as const, label: '设置', icon: Settings, transition: 'wechatPay.settings.open' as const },
  ];
  return (
    <nav className="sticky bottom-0 z-20 h-[68px] bg-white/95 border-t border-[#e8e8e8] grid grid-cols-3 backdrop-blur-sm" aria-label="记账本导航">
      {items.map(item => {
        const Icon = item.icon;
        const isActive = active === item.id;
        const tapProps = isActive ? {} : bindTap<HTMLButtonElement>(item.transition);
        return (
          <button key={item.id} {...tapProps} aria-current={isActive ? 'page' : undefined} className={`flex flex-col items-center justify-center gap-1 text-[12px] ${isActive ? 'text-[#40b983]' : 'text-[#292929]'} active:bg-[#f4f4f4]`}>
            <Icon size={23} strokeWidth={isActive ? 2.2 : 1.8} />{item.label}
          </button>
        );
      })}
    </nav>
  );
};

export const LedgerLoading = () => (
  <div className="p-5 space-y-3" aria-label="正在加载账单">
    {[0, 1, 2].map(item => <div key={item} className="h-[68px] rounded-[12px] bg-[#f2f3f2] animate-pulse" />)}
  </div>
);
