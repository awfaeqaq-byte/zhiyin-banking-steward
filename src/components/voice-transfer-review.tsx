import {useEffect, useRef, useState} from 'react';
import {CalendarClock, Check, Clock3} from 'lucide-react';
import {bankRequest, bankRecipients} from '../lib/bank-transfer';
import {verifyVoiceSchedule, voiceScheduleTime, type VoiceTransferReview as Review} from '../lib/voice-transfer-review';
import {voiceMoney} from '../lib/voice-wealth-review';

export function VoiceTransferReview({review, onCancel, onResult}: {review: Review; onCancel: () => void; onResult: (text: string) => void}) {
  const [stage, setStage] = useState<'ready' | 'submitting' | 'checking' | 'uncertain' | 'done'>('ready');
  const [error, setError] = useState(''), [expired, setExpired] = useState(Date.now() >= review.draft.expiresAt);
  const started = useRef(false), checking = useRef(false);
  const d = review.draft, recipient = bankRecipients.find(p => p.id === d.recipientId)!;
  useEffect(() => { const timer = setInterval(() => setExpired(Date.now() >= d.expiresAt), 1000); return () => clearInterval(timer); }, [d.expiresAt]);
  async function checkResult() {
    if (checking.current) return;
    checking.current = true; setStage('checking'); setError('');
    try {
      verifyVoiceSchedule(review, await bankRequest()); setStage('done');
      onResult(`已预约${voiceScheduleTime(d.executeAt!)}给${recipient.name}转${voiceMoney(d.amount)}，备注“${d.remark || '无'}”。现在还没有扣款，等待到时执行。`);
      window.dispatchEvent(new Event('zhiyin-bank-updated'));
    } catch (cause) { setStage('uncertain'); setError(cause instanceof Error ? cause.message : '预约结果未核实，请查原预约，勿重复提交。'); }
    finally { checking.current = false; }
  }
  async function confirm() {
    if (started.current || Date.now() >= d.expiresAt) { setExpired(Date.now() >= d.expiresAt); return; }
    started.current = true; setStage('submitting');
    try { await bankRequest({type: 'schedule', draftId: d.id, authorized: true}); }
    catch { /* Response loss is followed by a read, never another submission. */ }
    await checkResult();
  }
  const done = stage === 'done', busy = stage === 'submitting' || stage === 'checking';
  return <section className="voice-wealth-review" data-stage={stage} aria-label={done ? '预约转账结果' : '预约转账方案'}>
    <div className="voice-wealth-heading"><span className="voice-wealth-icon">{done ? <Check size={18}/> : <CalendarClock size={18}/>}</span><strong>{done ? `给${recipient.name}的生活费已安排` : `给${recipient.name}的生活费`}</strong><span className="voice-wealth-badge">{done ? '预约成功' : busy ? '正在核对' : stage === 'uncertain' ? '结果待核实' : '待你确认'}</span></div>
    <div className="voice-wealth-amount">{voiceMoney(d.amount)}<small>{done ? '预约金额' : '转账金额'}</small></div>
    <dl className="voice-wealth-facts">
      <div><dt>收款人</dt><dd>{recipient.name} · 尾号 {recipient.accountLast4}</dd></div>
      <div><dt>付款账户</dt><dd>常用卡 8888</dd></div>
      <div><dt>执行时间</dt><dd>{voiceScheduleTime(d.executeAt!)}</dd></div>
      <div><dt>转账备注</dt><dd>{d.remark || '无'}</dd></div>
    </dl>
    <div className="voice-wealth-protected"><Clock3 size={17}/><div><strong>{done ? '等待执行，当前未扣款' : '到时再转，现在不扣款'}</strong><span>{done ? '执行结果以到时回执为准' : '确认后创建预约，到时再核对账户并执行'}</span></div></div>
    {error && <p className="voice-wealth-error" role="alert">{error}</p>}
    {stage === 'ready' && <><p className="voice-wealth-note">{expired ? '方案已过期，请取消后重新核对。' : '请核对收款人、金额和执行时间。'}</p><div className="voice-wealth-actions"><button type="button" onClick={onCancel}>暂不预约</button><button type="button" className="voice-wealth-confirm" disabled={expired} onClick={() => void confirm()}>确认预约 {voiceMoney(d.amount)}</button></div></>}
    {busy && <p className="voice-wealth-note" role="status">{stage === 'submitting' ? '正在创建预约…' : '正在核对原预约…'}</p>}
    {stage === 'uncertain' && <button type="button" className="voice-wealth-recheck" onClick={() => void checkResult()}>重新核对预约</button>}
    {done && <p className="voice-wealth-note">本地沙箱预约 · 尚未转出</p>}
  </section>;
}
