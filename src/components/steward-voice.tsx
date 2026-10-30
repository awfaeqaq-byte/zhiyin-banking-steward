import {useEffect, useRef, useState} from 'react';
import {createPortal} from 'react-dom';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import {ArrowDown, Captions, Mic, MicOff, Phone, PhoneOff, ShieldCheck, Volume2, AudioLines} from 'lucide-react';
import {createVoiceConnection} from '../lib/voice-connection';
import {initialVoiceState, type VoiceBusiness} from '../lib/realtime-voice';
import type {VoiceContextLoader, VoiceTurn} from '../lib/voice-conversation';
import {usePhoneBack} from '../lib/phone-bridge';
import {VoiceWealthReview} from './voice-wealth-review';
import {validVoiceWealthReview, type VoiceWealthReview as WealthReview} from '../lib/voice-wealth-review';
import {VoiceTransferReview} from './voice-transfer-review';
import {validVoiceTransferReview, type VoiceTransferReview as TransferReview} from '../lib/voice-transfer-review';
import {VoiceLimitReview} from './voice-limit-review';
import {validVoiceLimitReview, type VoiceLimitReview as LimitReview} from '../lib/voice-limit-review';
import {VoiceExpenseRecord} from './voice-expense-record';
import {readVoiceExpenseRecord,type VoiceExpenseRecord as ExpenseRecord} from '../lib/voice-expense-record';
import {VoiceCakeReview} from './voice-cake-review';
import {validVoiceCakeReview,type VoiceCakeReview as CakeReview} from '../lib/voice-cake-review';
import {VoiceMerchantReport} from './voice-merchant-report';
import {readVoiceMerchantReport,type VoiceMerchantReport as MerchantReport} from '../lib/voice-merchant-report';
import './steward-voice.css';

// Operate: a call, not a dictation popover. Keep the incumbent teal/white world.
// Avatar and real turn states lead; returning to the homepage minimizes without
// hanging up. Review controls dock inside the existing authorization dialog.
type Props = {
  stewardName: string; stewardImage: string; onRequest: VoiceBusiness;
  getContext?: VoiceContextLoader; onTurn?: (turn: VoiceTurn) => void;
  disabled?: boolean; enabled?: boolean; reviewing?: boolean;
  onActiveChange?: (active: boolean) => void;
};
export function StewardVoice({
  stewardName, stewardImage, onRequest, getContext, onTurn,
  disabled = false, enabled = true, reviewing = false, onActiveChange,
}: Props) {
  const [open, setOpen] = useState(false), [state, setState] = useState(initialVoiceState);
  const [reviewHost, setReviewHost] = useState<Element | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [captionsVisible, setCaptionsVisible] = useState(true);
  const [wealthReview, setWealthReview] = useState<WealthReview | TransferReview | LimitReview | CakeReview>();
  const wealthReviewRef = useRef(wealthReview); wealthReviewRef.current = wealthReview;
  const [operationAnswer, setOperationAnswer] = useState('');
  const [expenseRecord,setExpenseRecord] = useState<ExpenseRecord>();
  const [merchantReport,setMerchantReport] = useState<MerchantReport>();
  const connection = useRef<ReturnType<typeof createVoiceConnection>>();
  const callbacks = useRef({onRequest, getContext, onTurn, reviewing});
  const inReview = reviewing || !!reviewHost;
  callbacks.current = {onRequest, getContext, onTurn, reviewing: inReview};
  const entry = useRef<HTMLButtonElement>(null), beganAt = useRef(0);
  const active = state.phase !== 'idle' && state.phase !== 'error';

  useEffect(() => {
    const current = createVoiceConnection({
      stewardName, getContext: async () => callbacks.current.getContext?.() ?? {recent: [], preferences: []},
      onTurn: turn => callbacks.current.onTurn?.(turn),
      business: async (...args) => {
        if (callbacks.current.reviewing) return {text: '用户正在核对方案。本次没有修改、没有授权或执行。可以解释已有结果；如需改金额、对象或时间，请先返回修改，不能代替本人点击。'};
        if (wealthReviewRef.current) return {text: '请在当前语音页面点击方案上的确认按钮。口头确认不会执行；如需修改，请先取消当前方案。'};
        setOperationAnswer('');
        setExpenseRecord(undefined);
        setMerchantReport(undefined);
        const result = await callbacks.current.onRequest(...args);
        if (!args[2].aborted && (validVoiceWealthReview(result.review) || validVoiceTransferReview(result.review) || validVoiceLimitReview(result.review) || validVoiceCakeReview(result.review))) {
          wealthReviewRef.current = result.review;
          setWealthReview(result.review);
        }
        if (!args[2].aborted && readVoiceExpenseRecord(result.expense)) setExpenseRecord(result.expense);
        if (!args[2].aborted && readVoiceMerchantReport(result.merchant)) setMerchantReport(result.merchant);
        return result;
      },
      onState: setState,
    });
    connection.current = current;
    const stop = () => current.stop('已停止收音，原有事项保留在首页。');
    const reset = () => { stop(); wealthReviewRef.current = undefined; setWealthReview(undefined); setExpenseRecord(undefined); setMerchantReport(undefined); setOperationAnswer(''); };
    const hidden = () => { if (document.visibilityState === 'hidden') stop(); };
    const background = (event: MessageEvent) => {
      if (event.source === window.parent && event.origin === window.location.origin && event.data?.type === 'zhiyin-voice-stop') stop();
    };
    document.addEventListener('visibilitychange', hidden);
    window.addEventListener('message', background);
    window.addEventListener('zhiyin-memory-context-reset', reset);
    return () => {
      current.stop();
      document.removeEventListener('visibilitychange', hidden);
      window.removeEventListener('message', background);
      window.removeEventListener('zhiyin-memory-context-reset', reset);
    };
  }, [stewardName]);
  useEffect(() => { if (!enabled) { connection.current?.stop('已离开首页，收音已停止。'); setOpen(false); } }, [enabled]);
  useEffect(() => { onActiveChange?.(active); return () => onActiveChange?.(false); }, [active, onActiveChange]);
  useEffect(() => {
    if (!active) { beganAt.current = 0; setSeconds(0); return; }
    if (state.phase === 'connecting') return;
    beganAt.current ||= Date.now();
    const timer = window.setInterval(() => setSeconds(Math.floor((Date.now() - beganAt.current) / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, [active, state.phase]);
  useEffect(() => {
    if (!active) { setReviewHost(null); return; }
    // Join the modal's own focus scope, rather than putting unreachable call
    // controls behind Radix's aria-hidden background and pointer-event lock.
    const locate = () => setReviewHost([...document.querySelectorAll('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]')].filter(element => !element.matches('.voice-call-root')).at(-1) ?? null);
    locate();
    const observer = new MutationObserver(locate);
    observer.observe(document.body, {childList: true, subtree: true});
    return () => observer.disconnect();
  }, [active]);

  function minimize() { setOpen(false); entry.current?.focus(); }
  usePhoneBack(() => { minimize(); return true; }, 120, open && !inReview);
  const connecting = state.phase === 'connecting';
  const playbackBlocked = state.notice.includes('声音');
  const speaking = active && !connecting && (
    state.phase === 'speaking' && !playbackBlocked || state.userSpeaking && !state.muted
  );
  const showAnswer = active || !!state.error;
  const hasCaptions = captionsVisible && !!(state.heard || showAnswer && state.answer);
  const status = state.phase === 'connecting' ? '正在连接…'
    : state.muted ? '麦克风已静音'
    : state.userSpeaking ? '我在听'
    : state.phase === 'speaking' ? stewardName + '正在回应'
    : state.phase === 'working' ? '正在整理，你可以继续说'
    : '正在聆听';
  const clock = String(Math.floor(seconds / 60)).padStart(2, '0') + ':' + String(seconds % 60).padStart(2, '0');
  const muteControl = <button type="button" className="voice-control" aria-label={state.muted ? '恢复麦克风' : '静音麦克风'} aria-pressed={state.muted} onClick={() => connection.current?.setMuted(!state.muted)}>
    <span className="voice-control-icon">{state.muted ? <MicOff size={24} aria-hidden="true"/> : <Mic size={24} aria-hidden="true"/>}</span><span className="voice-control-label">{state.muted ? '恢复收音' : '静音'}</span>
  </button>;
  const endControl = <button type="button" className="voice-control voice-end" aria-label={connecting ? '取消连接' : '结束对话'} onClick={() => connection.current?.stop(connecting ? '已取消连接。' : '通话已结束，原有事项保留。')}>
    <span className="voice-control-icon"><PhoneOff size={24} aria-hidden="true"/></span><span className="voice-control-label">{connecting ? '取消连接' : '结束通话'}</span>
  </button>;
  const controls = <>
    {!connecting && muteControl}{endControl}
  </>;
  const compact = <section className="voice-call-bar" aria-label={inReview ? '核对中的语音通话' : '持续语音通话'}>
    {!inReview && <button type="button" className="voice-resume" aria-label="展开语音通话" onClick={() => setOpen(true)}><img src={stewardImage} alt=""/><span>{state.error ? '语音连接中断' : connecting ? '正在连接…' : '和' + stewardName + '通话中'}<small>{state.error ? '查看原因并重试' : connecting ? '接通后就可以说话' : clock + ' · ' + (state.muted ? '已静音' : state.pending ? '事项处理中，仍在听' : '可以继续说')}</small></span></button>}
    {inReview && <p><strong>{connecting ? '正在连接…' : stewardName + '仍在线'}</strong><span>{connecting ? '接通后就可以说话' : '你来核对确认，我陪你看。'}</span></p>}
    {active && <div className="voice-compact-controls">{controls}</div>}
  </section>;

  return <div className="steward-voice">
    <button ref={entry} type="button" className="voice-entry" aria-label={'和' + stewardName + '语音对话'} aria-expanded={open && !inReview} disabled={!enabled || disabled && !active || inReview && !active} onClick={() => open ? minimize() : setOpen(true)}>
      <AudioLines size={22} aria-hidden="true"/>
    </button>
    {(active || enabled && !!state.error && !inReview) && (!open || inReview) && (inReview && reviewHost ? createPortal(<div className="voice-review-dock">{compact}</div>, reviewHost) : compact)}
    {open && !inReview && <DialogPrimitive.Root open onOpenChange={next => { if (!next) minimize(); }}><DialogPrimitive.Portal container={entry.current?.closest('.app-shell') ?? document.body}><DialogPrimitive.Content asChild aria-label="语音通话" aria-labelledby={undefined} aria-describedby={undefined} onCloseAutoFocus={event => { event.preventDefault(); entry.current?.focus(); }}><div className="voice-call-root"><section className="voice-call-stage" data-phase={state.phase} role="region" aria-label="语音对话" onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); minimize(); } }}>
      <header className="voice-call-heading">
        <div><strong><AudioLines size={18} aria-hidden="true"/>语音对话</strong><span>{active && !connecting ? <><i aria-hidden="true"/>{clock}</> : '你的个人银行管家'}</span></div>
        <button type="button" className="voice-minimize" aria-label="收起语音面板" onClick={minimize}><ArrowDown size={21} aria-hidden="true"/><span>回首页</span></button>
      </header>
      <div className="voice-call-body" data-has-captions={hasCaptions} data-has-operation={!!wealthReview || !!expenseRecord || !!merchantReport}>
        <div className="voice-call-person">
          <div className="voice-presence" data-motion={speaking ? 'speaking' : 'quiet'}><img src={stewardImage} alt={stewardName}/><span aria-hidden="true"/></div>
          <DialogPrimitive.Title asChild><h2>{stewardName}<span>AI</span></h2></DialogPrimitive.Title>
          <p className="voice-status" role="status" aria-atomic="true">{active ? status : state.error ? '语音尚未连接' : '像打电话一样，直接说就好'}</p>
          <div className="voice-activity" data-motion={speaking ? 'speaking' : 'quiet'} aria-hidden="true">{[0, 1, 2, 3, 4].map(bar => <i key={bar}/>)}</div>
          {connecting && <p className="voice-call-hint">接通后就可以说话，请稍等一下。</p>}
          {active && !connecting && !state.heard && !state.answer && <p className="voice-call-hint">不需要逐句发送，也可以随时打断我。</p>}
          {active && !connecting && !captionsVisible && <p className="voice-call-hint">字幕已关闭，仍可正常交谈。</p>}
        </div>
        {hasCaptions && <section className="voice-captions" aria-label="通话字幕">
          {state.heard && <p className="voice-caption-user"><span>你</span>{state.heard}</p>}
          {(operationAnswer || state.answer && showAnswer) && <p className="voice-caption-steward"><span>{stewardName}</span>{operationAnswer || state.answer}</p>}
        </section>}
        {wealthReview?.kind === 'wealth_redemption' && <VoiceWealthReview key={wealthReview.draft.id} review={wealthReview} onCancel={() => { wealthReviewRef.current = undefined; setWealthReview(undefined); setOperationAnswer('好，这笔先不赎回，没有提交这笔操作。'); }} onResult={setOperationAnswer}/>}
        {wealthReview?.kind === 'scheduled_transfer' && <VoiceTransferReview key={wealthReview.draft.id} review={wealthReview} onCancel={() => { wealthReviewRef.current = undefined; setWealthReview(undefined); setOperationAnswer('好，先不预约，没有提交这笔操作。'); }} onResult={setOperationAnswer}/>}
        {wealthReview?.kind === 'payment_limit' && <VoiceLimitReview key={wealthReview.createdAt} review={wealthReview} onCancel={() => { wealthReviewRef.current = undefined; setWealthReview(undefined); setOperationAnswer('好，先不调整，限额没有修改。'); }} onResult={setOperationAnswer}/>}
        {wealthReview?.kind === 'cake_preorder' && <VoiceCakeReview key={wealthReview.id} review={wealthReview} onCancel={() => { wealthReviewRef.current = undefined; setWealthReview(undefined); setOperationAnswer('好，蛋糕先不预订，没有提交订单或付款。'); }} onResult={setOperationAnswer}/>}
        {expenseRecord && <VoiceExpenseRecord record={expenseRecord}/>}
        {merchantReport && <VoiceMerchantReport report={merchantReport}/>}
        {state.error && <p className="voice-error" role="alert">{state.error}</p>}
        {state.notice && <p className="voice-notice">{state.notice}</p>}
        {state.pending > 0 && state.phase !== 'working' && <p className="voice-pending">还有事项在后台整理，结果会留在首页。</p>}
      </div>
      <footer className="voice-call-footer">
        {!active && <p className="voice-consent"><ShieldCheck size={17} aria-hidden="true"/><span>开启后，音频、近期对话、已确认偏好和必要的业务结果会发送至阿里云百炼处理。本项目不保存原始录音。</span></p>}
        {active && <p className="voice-return-hint">{merchantReport ? '小店的事，随时交代。' : expenseRecord ? '随口交代，我会接着记。' : wealthReview ? '就在这里核对，我陪你看。' : connecting ? '连接时也可以收起，回首页查看。' : '回首页看方案，通话会继续。'}</p>}
        <div className="voice-controls">{active ? <>
          {!connecting && <>{muteControl}<button type="button" className="voice-control voice-caption-toggle" aria-label={captionsVisible ? '关闭字幕' : '显示字幕'} aria-pressed={captionsVisible} onClick={() => setCaptionsVisible(value => !value)}><span className="voice-control-icon"><Captions size={24} aria-hidden="true"/></span><span className="voice-control-label">{captionsVisible ? '字幕已开' : '字幕已关'}</span></button></>}
          {endControl}
        </> : <button type="button" className="voice-start" aria-label="开始语音对话" disabled={disabled || !enabled} onClick={() => void connection.current?.start()}><Phone size={21} aria-hidden="true"/>{state.error ? '重新连接' : '开始通话'}</button>}
        </div>
        {active && playbackBlocked && <button type="button" className="voice-playback" onClick={() => void connection.current?.play()}><Volume2 size={19} aria-hidden="true"/>播放声音</button>}
        <p className="voice-confirmation"><ShieldCheck size={14} aria-hidden="true"/>资金操作仍需你确认</p>
        <small>切到后台会停止收音 · 每次最多 5 分钟</small>
      </footer>
    </section></div></DialogPrimitive.Content></DialogPrimitive.Portal></DialogPrimitive.Root>}
  </div>;
}
