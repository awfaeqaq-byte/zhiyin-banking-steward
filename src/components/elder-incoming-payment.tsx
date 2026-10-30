import {useState} from 'react';
import {Check, ChevronDown, ChevronUp, Volume2} from 'lucide-react';
import {validIncomingTransfer, type IncomingTransfer} from '../lib/incoming-transfer';
import './elder-incoming-payment.css';

export function ElderIncomingPayment({receipt, stewardName, onRead}: {receipt: IncomingTransfer; stewardName: string; onRead?: (receipt: IncomingTransfer) => Promise<void>}) {
  const [details, setDetails] = useState(false), [speaking, setSpeaking] = useState(false), [error, setError] = useState('');
  if (!validIncomingTransfer(receipt)) return null;
  const amount = (receipt.amount / 100).toLocaleString('zh-CN', {minimumFractionDigits: 2, maximumFractionDigits: 2});
  const at = new Intl.DateTimeFormat('zh-CN', {timeZone: 'Asia/Shanghai', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false}).format(receipt.completedAt);
  async function read() {
    if (!onRead || speaking) return;
    setSpeaking(true); setError('');
    try { await onRead(receipt); }
    catch { setError('声音暂时没能播放，文字仍可查看。您也可以再听一遍。'); }
    finally { setSpeaking(false); }
  }
  return <section className="elder-incoming" aria-label="收款到账提醒">
    <div className="elder-incoming-status"><Check size={22} aria-hidden="true"/><span>已到账</span></div>
    <h2>收到{receipt.senderName}的{receipt.remark || '转账'}</h2>
    <p className="elder-incoming-amount"><strong>+{amount}</strong><span>元</span></p>
    <p className="elder-incoming-reassurance">钱已到账，不用再操作</p>
    {onRead && <button type="button" className="elder-incoming-speak" disabled={speaking} onClick={() => void read()}><Volume2 size={25} aria-hidden="true"/>{speaking ? `${stewardName}正在播报` : `听${stewardName}说一遍`}</button>}
    {error && <p className="elder-incoming-error" role="status">{error}</p>}
    <button type="button" className="elder-incoming-details-toggle" aria-expanded={details} onClick={() => setDetails(value => !value)}>{details ? '收起详情' : '查看这笔钱'}{details ? <ChevronUp size={26} aria-hidden="true"/> : <ChevronDown size={26} aria-hidden="true"/>}</button>
    {details && <section className="elder-incoming-details" aria-label="收款详情"><dl>
      <div><dt>谁转来的</dt><dd>{receipt.senderName}</dd></div>
      <div><dt>什么时候</dt><dd>{at}</dd></div>
      <div><dt>收到哪张卡</dt><dd>尾号 {receipt.recipientLast4}</dd></div>
      <div><dt>转账备注</dt><dd>{receipt.remark || '无'}</dd></div>
    </dl></section>}
  </section>;
}
