import {
  ArrowRight,
  ArrowRightLeft,
  BellRing,
  CircleHelp,
  Eye,
  EyeOff,
  MessageCircle,
  RefreshCw,
  ShieldCheck,
  Wallet,
  FileText,
} from 'lucide-react';
import type { BankSnapshot } from '../lib/bank-transfer';
import './elder-mode.css';

type Props = {
  stewardName: string;
  stewardImage: string;
  bank: BankSnapshot | null;
  bankError: string;
  hidden: boolean;
  onToggleHidden: () => void;
  onAssets: () => void;
  onTransfer: () => void;
  onBills: () => void;
  onSubscriptions: () => void;
  onChat: () => void;
  onHelp: () => void;
  onRefresh: () => void;
};

const formatAmount = (cents: number) =>
  (cents / 100).toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

export function ElderHome(props: Props) {
  // An unsuccessful refresh must not present an older snapshot as current.
  const bank = props.bankError ? null : props.bank;
  const total = bank?.assetSummary?.total ?? bank?.balance;
  const shortcuts = [
    { label: '查余额', detail: '账户里有多少钱', Icon: Wallet, onClick: props.onAssets },
    { label: '转账汇款', detail: '先填信息，再核对', Icon: ArrowRightLeft, onClick: props.onTransfer },
    { label: '看账单', detail: '查收入、查支出', Icon: FileText, onClick: props.onBills },
    { label: '扣费提醒', detail: '查看自动续费', Icon: BellRing, onClick: props.onSubscriptions },
  ];

  return (
    <section className="elder-dashboard" aria-label="长辈版首页">
      <header className="elder-hero">
        <img src={props.stewardImage} alt="" />
        <div>
          <p className="elder-eyebrow">知银 · 您的银行管家</p>
          <h1>您好，我是{props.stewardName}</h1>
          <p>想办什么，点下面就好。</p>
        </div>
      </header>

      <section className="elder-assets" aria-labelledby="elder-assets-title">
        <div className="elder-assets-top">
          <h2 id="elder-assets-title">{bank?.assetSummary ? '我的总资产' : '银行卡余额'}<span>（元）</span></h2>
          <button
            type="button"
            className="elder-privacy-button"
            aria-label={props.hidden ? '显示资产金额' : '隐藏资产金额'}
            aria-pressed={props.hidden}
            onClick={props.onToggleHidden}
          >
            {props.hidden ? <EyeOff size={24} aria-hidden="true" /> : <Eye size={24} aria-hidden="true" />}
            <span>{props.hidden ? '显示金额' : '隐藏金额'}</span>
          </button>
        </div>
        <div className="elder-amount" aria-live="polite" aria-atomic="true">
          {props.hidden ? <span aria-label="金额已隐藏">••••</span> : total === undefined ? '—' : formatAmount(total)}
        </div>
        {props.bankError ? (
          <div className="elder-assets-status elder-assets-error" role="status">
            <p>暂时没能读到账户金额。</p>
            <button type="button" onClick={props.onRefresh}><RefreshCw size={22} aria-hidden="true" />重新读取</button>
          </div>
        ) : !bank ? (
          <p className="elder-assets-status" role="status">正在读取账户金额…</p>
        ) : (
          <div className="elder-assets-footer">
            <span>演示账户</span>
            <button type="button" onClick={props.onAssets}>查看详情<ArrowRight size={22} aria-hidden="true" /></button>
          </div>
        )}
      </section>

      <section className="elder-services" aria-labelledby="elder-services-title">
        <h2 id="elder-services-title">您想办理什么？</h2>
        <div className="elder-shortcuts">
          {shortcuts.map(({ label, detail, Icon, onClick }) => (
            <button type="button" key={label} aria-label={label} onClick={onClick}>
              <span className="elder-shortcut-icon"><Icon size={29} strokeWidth={1.8} aria-hidden="true" /></span>
              <strong>{label}</strong>
              <span className="elder-shortcut-detail">{detail}</span>
            </button>
          ))}
        </div>
      </section>

      <div className="elder-home-actions">
        <button type="button" className="elder-chat-action" onClick={props.onChat}>
          <MessageCircle size={28} aria-hidden="true" />
          <span>和{props.stewardName}聊聊</span>
          <ArrowRight size={26} aria-hidden="true" />
        </button>
        <button type="button" className="elder-help-action" onClick={props.onHelp}>
          <CircleHelp size={24} aria-hidden="true" />使用帮助
        </button>
      </div>
      <p className="elder-home-note"><ShieldCheck size={23} aria-hidden="true" /><span>转账前会请您核对，确认后才办理。</span></p>
    </section>
  );
}
