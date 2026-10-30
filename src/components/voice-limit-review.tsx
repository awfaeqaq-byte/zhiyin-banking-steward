import {useEffect, useRef, useState} from 'react';
import {Check, ShieldCheck} from 'lucide-react';
import {bankCards, bankRequest} from '../lib/bank-transfer';
import {verifyVoiceLimit, type VoiceLimitReview as Review} from '../lib/voice-limit-review';
import {voiceMoney} from '../lib/voice-wealth-review';

export function VoiceLimitReview({review, onCancel, onResult}: {review: Review; onCancel: () => void; onResult: (text: string) => void}) {
  const [stage,setStage] = useState<'ready'|'submitting'|'checking'|'uncertain'|'done'>('ready');
  const [error,setError] = useState(''), [expired,setExpired] = useState(Date.now() >= review.expiresAt);
  const started = useRef(false), checking = useRef(false);
  const card = bankCards.find(item => item.id === review.cardId)!;
  useEffect(() => { const timer = setInterval(() => setExpired(Date.now() >= review.expiresAt),1000); return () => clearInterval(timer); }, [review.expiresAt]);
  async function checkResult() {
    if (checking.current) return;
    checking.current = true; setStage('checking'); setError('');
    try {
      verifyVoiceLimit(review, await bankRequest(undefined,review.cardId));
      setStage('done'); onResult(`单笔支付限额已调整为${voiceMoney(review.limit)}，现在生效。`);
      window.dispatchEvent(new Event('zhiyin-bank-updated'));
    } catch (cause) { setStage('uncertain'); setError(cause instanceof Error ? cause.message : '限额暂未核实，请重新核对。'); }
    finally { checking.current = false; }
  }
  async function confirm() {
    if (started.current || Date.now() >= review.expiresAt) { setExpired(Date.now() >= review.expiresAt); return; }
    started.current = true; setStage('submitting');
    try { await bankRequest({type:'settings',revision:review.before.revision,limit:review.limit},review.cardId); }
    catch { /* A lost response is followed by a read, never another write. */ }
    await checkResult();
  }
  const done = stage === 'done', busy = stage === 'submitting' || stage === 'checking';
  return <section className="voice-wealth-review" data-stage={stage} aria-label={done ? '单笔支付限额结果' : '单笔支付限额方案'}>
    <div className="voice-wealth-heading"><span className="voice-wealth-icon">{done ? <Check size={18}/> : <ShieldCheck size={18}/>}</span><strong>单笔支付限额</strong><span className="voice-wealth-badge">{done ? '已生效' : busy ? '正在核对' : stage === 'uncertain' ? '待核实' : '待你确认'}</span></div>
    <div className="voice-wealth-amount">{voiceMoney(review.limit)}<small>{done ? '当前限额 / 笔' : '调整为 / 笔'}</small></div>
    <dl className="voice-wealth-facts"><div><dt>适用卡片</dt><dd>{card.name} · 尾号 {card.last4}</dd></div><div><dt>原单笔限额</dt><dd>{voiceMoney(review.before.limit)}</dd></div><div><dt>生效时间</dt><dd>{done ? '已立即生效' : '确认后立即生效'}</dd></div></dl>
    <div className="voice-wealth-protected"><ShieldCheck size={17}/><div><strong>单笔超过此金额将被拦截</strong><span>仅调整本卡限额，其他安全保护保持不变</span></div></div>
    {error && <p className="voice-wealth-error" role="alert">{error}</p>}
    {stage === 'ready' && <><p className="voice-wealth-note">{expired ? '方案已过期，请取消后重新核对。' : '请核对卡片与限额后确认。'}</p><div className="voice-wealth-actions"><button type="button" onClick={onCancel}>暂不调整</button><button type="button" className="voice-wealth-confirm" disabled={expired} onClick={() => void confirm()}>确认调整为 {voiceMoney(review.limit)}</button></div></>}
    {busy && <p className="voice-wealth-note" role="status">正在核对银行卡限额…</p>}
    {stage === 'uncertain' && <button type="button" className="voice-wealth-recheck" onClick={() => void checkResult()}>重新核对限额</button>}
    {done && <p className="voice-wealth-note">已读取银行卡最新限额 · 本次未扣款</p>}
  </section>;
}
