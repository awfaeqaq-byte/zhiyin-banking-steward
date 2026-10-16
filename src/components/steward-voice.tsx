import {useEffect, useRef, useState} from 'react';
import {createPortal} from 'react-dom';
import {ArrowDown, Mic, MicOff, PhoneOff, Volume2, AudioLines} from 'lucide-react';
import {createVoiceConnection} from '../lib/voice-connection';
import {initialVoiceState, type VoiceBusiness} from '../lib/realtime-voice';
import type {VoiceContextLoader, VoiceTurn} from '../lib/voice-conversation';
import {usePhoneBack} from '../lib/phone-bridge';
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
      business: (...args) => callbacks.current.reviewing
        ? Promise.resolve({text: '用户正在核对方案。本次没有修改、没有授权或执行。可以解释已有结果；如需改金额、对象或时间，请先返回修改，不能代替本人点击。'})
        : callbacks.current.onRequest(...args),
      onState: setState,
    });
    connection.current = current;
    const stop = () => current.stop('已停止收音，原有事项保留在首页。');
    const hidden = () => { if (document.visibilityState === 'hidden') stop(); };
    const background = (event: MessageEvent) => {
      if (event.source === window.parent && event.origin === window.location.origin && event.data?.type === 'zhiyin-voice-stop') stop();
    };
    document.addEventListener('visibilitychange', hidden);
    window.addEventListener('message', background);
    window.addEventListener('zhiyin-memory-context-reset', stop);
    return () => {
      current.stop();
      document.removeEventListener('visibilitychange', hidden);
      window.removeEventListener('message', background);
      window.removeEventListener('zhiyin-memory-context-reset', stop);
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
    const locate = () => setReviewHost([...document.querySelectorAll('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]')].at(-1) ?? null);
    locate();
    const observer = new MutationObserver(locate);
    observer.observe(document.body, {childList: true, subtree: true});
    return () => observer.disconnect();
  }, [active]);

  function minimize() { setOpen(false); entry.current?.focus(); }
  usePhoneBack(() => { minimize(); return true; }, 120, open && !inReview);
  const status = state.phase === 'connecting' ? '正在连接…'
    : state.muted ? '麦克风已静音'
    : state.userSpeaking ? '我在听'
    : state.phase === 'speaking' ? stewardName + '正在回应'
    : state.phase === 'working' ? '正在整理，你可以继续说'
    : '正在聆听';
  const clock = String(Math.floor(seconds / 60)).padStart(2, '0') + ':' + String(seconds % 60).padStart(2, '0');
  const controls = <>
    <button type="button" className="voice-control" aria-label={state.muted ? '恢复麦克风' : '静音麦克风'} aria-pressed={state.muted} onClick={() => connection.current?.setMuted(!state.muted)}>
      {state.muted ? <MicOff size={22} aria-hidden="true"/> : <Mic size={22} aria-hidden="true"/>}<span>{state.muted ? '恢复收音' : '静音'}</span>
    </button>
    <button type="button" className="voice-control voice-end" aria-label="结束对话" onClick={() => connection.current?.stop('通话已结束，原有事项保留。')}>
      <PhoneOff size={22} aria-hidden="true"/><span>结束通话</span>
    </button>
  </>;
  const compact = <section className="voice-call-bar" aria-label={inReview ? '核对中的语音通话' : '持续语音通话'}>
    {!inReview && <button type="button" className="voice-resume" aria-label="展开语音通话" onClick={() => setOpen(true)}><AudioLines size={20} aria-hidden="true"/><span>和{stewardName}通话中<small>{clock} · {state.muted ? '已静音' : state.pending ? '事项处理中，仍在听' : '可以继续说'}</small></span></button>}
    {inReview && <p><strong>{stewardName}仍在线</strong><span>你来核对确认，我陪你看。</span></p>}
    <div className="voice-compact-controls">{controls}</div>
  </section>;

  return <div className="steward-voice">
    <button ref={entry} type="button" className="voice-entry" aria-label={'和' + stewardName + '语音对话'} aria-expanded={open && !inReview} disabled={!enabled || disabled && !active || inReview && !active} onClick={() => open ? minimize() : setOpen(true)}>
      <AudioLines size={22} aria-hidden="true"/>
    </button>
    {active && (!open || inReview) && (inReview && reviewHost ? createPortal(<div className="voice-review-dock">{compact}</div>, reviewHost) : compact)}
    {open && !inReview && createPortal(<div className="voice-call-root"><section className="voice-call-stage" role="region" aria-label="语音对话" onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); minimize(); } }}>
      <header className="voice-call-heading">
        <div><strong>和{stewardName}通话</strong><span>{active && state.phase !== 'connecting' ? clock : '你的个人银行管家'}</span></div>
        <button type="button" className="voice-minimize" aria-label="收起语音面板" onClick={minimize}><ArrowDown size={21} aria-hidden="true"/><span>回首页</span></button>
      </header>
      <div className="voice-call-body">
        <div className="voice-presence" data-speaking={state.phase === 'speaking' || state.userSpeaking}><img src={stewardImage} alt={stewardName}/><span aria-hidden="true"/></div>
        <h2>{stewardName}</h2>
        <p className="voice-status" role="status" aria-atomic="true">{active ? status : state.error ? '语音尚未连接' : '像打电话一样，直接说就好'}</p>
        {!active && <p className="voice-consent">开启后，音频、近期对话、已确认偏好和必要的业务结果会发送至阿里云百炼处理。本项目不保存原始录音。</p>}
        {active && !state.heard && !state.answer && <p className="voice-call-hint">不需要逐句发送，也可以随时打断我。</p>}
        <div className="voice-captions">
          {state.heard && <p><span>你</span>{state.heard}</p>}
          {state.answer && active && <p><span>{stewardName}</span>{state.answer}</p>}
        </div>
        {state.error && <p className="voice-error" role="alert">{state.error}</p>}
        {state.notice && <p className="voice-notice">{state.notice}</p>}
        {state.pending > 0 && state.phase !== 'working' && <p className="voice-pending">还有事项在后台整理，结果会留在首页。</p>}
      </div>
      <footer className="voice-call-footer">
        <p>{active ? '回首页看方案不会挂断，资金操作仍需你确认。' : '普通交谈直接回应，办理时才调用业务能力。'}</p>
        <div className="voice-controls">{active ? controls : <button type="button" className="voice-start" aria-label="开始语音对话" disabled={disabled || !enabled} onClick={() => void connection.current?.start()}><Mic size={22} aria-hidden="true"/>开始通话</button>}
          {state.notice.includes('声音') && <button type="button" className="voice-control" onClick={() => void connection.current?.play()}><Volume2 size={22} aria-hidden="true"/><span>播放声音</span></button>}
        </div>
        <small>离开知银或切到后台会停止收音 · 单次最多5分钟</small>
      </footer>
    </section></div>, entry.current?.closest('.app-shell') ?? document.body)}
  </div>;
}
