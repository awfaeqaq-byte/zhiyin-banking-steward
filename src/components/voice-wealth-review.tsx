import {useEffect, useRef, useState} from 'react';
import {ArrowDownLeft, Check, ShieldCheck} from 'lucide-react';
import {wealthRequest, type RedemptionReceipt} from '../lib/wealth-operation';
import {verifyVoiceRedemption, voiceMoney, voiceWealthProductName, type VoiceWealthReview as Review} from '../lib/voice-wealth-review';

export function VoiceWealthReview({review, onCancel, onResult}: {review: Review; onCancel: () => void; onResult: (text: string) => void}) {
  const [stage, setStage] = useState<'ready' | 'submitting' | 'checking' | 'uncertain' | 'done'>('ready');
  const [expired, setExpired] = useState(Date.now() >= review.draft.expiresAt);
  const [error, setError] = useState('');
  const started = useRef(false), checking = useRef(false);
  useEffect(() => {
    const timer = setInterval(() => setExpired(Date.now() >= review.draft.expiresAt), 1000);
    return () => clearInterval(timer);
  }, [review.draft.expiresAt]);
  async function checkResult() {
    if (checking.current) return;
    checking.current = true; setStage('checking'); setError('');
    try {
      verifyVoiceRedemption(review, await wealthRequest());
      setStage('done');
      onResult(`旅费 ${voiceMoney(review.draft.amount - review.draft.fee)} 已到账常用卡 8888。${review.protectedHoldings.length ? '长期那笔保留不动，持仓已复查。' : '持仓与回执已复查。'}`);
      window.dispatchEvent(new Event('zhiyin-bank-updated'));
    } catch (cause) {
      setStage('uncertain'); setError(cause instanceof Error ? cause.message : '结果复查未完成，请重新核对，勿重复赎回。');
    } finally { checking.current = false; }
  }
  async function confirm() {
    if (started.current || Date.now() >= review.draft.expiresAt) { setExpired(Date.now() >= review.draft.expiresAt); return; }
    started.current = true; setStage('submitting'); setError('');
    try { await wealthRequest<RedemptionReceipt>({type: 'confirm-redemption', draftId: review.draft.id, authorized: true}); }
    catch { /* A missing response is uncertain, not permission to send again. */ }
    await checkResult();
  }
  const done = stage === 'done', busy = stage === 'submitting' || stage === 'checking';
  return <section className="voice-wealth-review" data-stage={stage} aria-label={done ? '旅费赎回结果' : '旅费赎回方案'}>
    <div className="voice-wealth-heading"><span className="voice-wealth-icon">{done ? <Check size={18}/> : <ArrowDownLeft size={18}/>}</span><strong>{done ? '旅费已准备好' : '这趟旅行的旅费'}</strong><span className="voice-wealth-badge">{done ? '已到账' : busy ? '正在核对' : stage === 'uncertain' ? '结果待核实' : '待你确认'}</span></div>
    <div className="voice-wealth-amount">{voiceMoney(review.draft.amount - review.draft.fee)}<small>{done ? '实际到账' : '预计到账'}</small></div>
    <dl className="voice-wealth-facts">
      <div><dt>赎回来源</dt><dd>{voiceWealthProductName(review.holding)}</dd></div>
      <div><dt>赎回费用</dt><dd>{voiceMoney(review.draft.fee)}</dd></div>
      <div><dt>到账账户</dt><dd>常用卡 8888</dd></div>
      {!done && <div><dt>到账时间</dt><dd>确认后即时到账</dd></div>}
    </dl>
    {review.protectedHoldings.length > 0 && <div className="voice-wealth-protected"><ShieldCheck size={17}/><div><strong>{done ? '长期持仓未变动' : '长期那笔，保留不动'}</strong>{review.protectedHoldings.map(item => <span key={item.id}>{voiceWealthProductName(item)}<b>{voiceMoney(item.principal)}</b></span>)}</div></div>}
    {error && <p className="voice-wealth-error" role="alert">{error}</p>}
    {stage === 'ready' && <><p className="voice-wealth-note">{expired ? '方案已过期，请取消后重新核对。' : '仅赎回这笔完整持仓，点击后执行。'}</p><div className="voice-wealth-actions"><button type="button" onClick={onCancel}>暂不赎回</button><button type="button" className="voice-wealth-confirm" disabled={expired} onClick={() => void confirm()}>确认赎回 {voiceMoney(review.draft.amount)}</button></div></>}
    {busy && <p className="voice-wealth-note" role="status">{stage === 'submitting' ? '正在提交这笔赎回…' : '正在复查到账和保留持仓…'}</p>}
    {stage === 'uncertain' && <button type="button" className="voice-wealth-recheck" onClick={() => void checkResult()}>重新核对结果</button>}
    {done && <p className="voice-wealth-note">到账和持仓已核对 · 本地沙箱回执</p>}
  </section>;
}
