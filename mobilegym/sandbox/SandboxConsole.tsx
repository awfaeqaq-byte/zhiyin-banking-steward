import React, { useEffect, useState } from 'react';
import {
  Check,
  ChevronRight,
  MessageCircle,
  RotateCcw,
  ShieldCheck,
  X,
} from 'lucide-react';
import { resetWechatChats, type SandboxActionResult } from './actions';
import './sandbox-console.css';
import { FinanceTestPanel } from './FinanceTestPanel';
import { ModelConfigPanel } from './ModelConfigPanel';
import { consoleStrings } from './res/strings';
import { StewardResetPanel } from './StewardResetPanel';

export type SandboxConsolePhase = 'idle' | 'confirming' | 'running' | 'success' | 'error';

type SandboxConsoleViewProps = {
  isOpen: boolean;
  phase: SandboxConsolePhase;
  result?: SandboxActionResult;
  onOpen: () => void;
  onClose: () => void;
  onRequestReset: () => void;
  onCancelReset: () => void;
  onConfirmReset: () => void;
  triggerRef?: React.Ref<HTMLButtonElement>;
  closeButtonRef?: React.Ref<HTMLButtonElement>;
  confirmationRef?: React.Ref<HTMLDivElement>;
  stewardBusy?: boolean;
  onStewardBusyChange?: (busy: boolean) => void;
};

export function SandboxConsoleView({
  isOpen,
  phase,
  result,
  onOpen,
  onClose,
  onRequestReset,
  onCancelReset,
  onConfirmReset,
  triggerRef,
  closeButtonRef,
  confirmationRef,
  stewardBusy = false,
  onStewardBusyChange,
}: SandboxConsoleViewProps) {
  const [modelOpen, setModelOpen] = useState(false);
  const [financeOpen, setFinanceOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className={`sandbox-console-trigger${isOpen ? ' is-hidden' : ''}`}
        aria-label="打开沙箱控制台"
        aria-expanded={isOpen}
        onClick={onOpen}
        ref={triggerRef}
      >
        <ShieldCheck size={17} aria-hidden="true" />
        <span>沙箱控制台</span>
      </button>

      <aside
        className={`sandbox-console-panel${isOpen ? ' is-open' : ''}`}
        aria-label="沙箱控制台"
        aria-hidden={!isOpen}
        inert={!isOpen ? true : undefined}
        data-design-seed="sandbox-console-operator-drawer-v1"
      >
        <header className="sandbox-console-header">
          <div>
            <div className="sandbox-console-title-row">
              <h1>沙箱控制台</h1>
              <span className="sandbox-console-environment">
                <i aria-hidden="true" />本地环境
              </span>
            </div>
            <p>准备和复位演示数据，不改变手机内的产品界面。</p>
          </div>
          <button type="button" className="sandbox-console-close" aria-label="关闭沙箱控制台" onClick={onClose} ref={closeButtonRef}>
            <X size={20} aria-hidden="true" />
          </button>
        </header>

        <div className="sandbox-console-body">
          <details className="sandbox-category" name="sandbox-category" onToggle={event=>setModelOpen(event.currentTarget.open)}>
            <summary><span>模型配置<small>服务地址、模型与密钥</small></span></summary>
            <ModelConfigPanel active={isOpen && modelOpen} />
          </details>
          <details className="sandbox-category" name="sandbox-category" onToggle={event=>setFinanceOpen(event.currentTarget.open)}>
            <summary><span>财务测试<small>场景、余额、时间与扣费</small></span></summary>
            <FinanceTestPanel active={isOpen && financeOpen} disabled={stewardBusy || phase === 'running' || phase === 'confirming'} />
          </details>
          <details className="sandbox-category" name="sandbox-category">
            <summary><span>{consoleStrings.steward.category}<small>{consoleStrings.steward.categoryHint}</small></span></summary>
            <StewardResetPanel disabled={phase === 'running' || phase === 'confirming'} onBusyChange={onStewardBusyChange} />
          </details>
          <details className="sandbox-category" name="sandbox-category">
            <summary><span>聊天与数据<small>恢复微信初始聊天</small></span></summary>
          <section className="sandbox-console-section" aria-labelledby="sandbox-app-data-title">
            <div className="sandbox-console-section-heading">
              <h2 id="sandbox-app-data-title">应用数据</h2>
            </div>

            <div className="sandbox-console-operation">
              <div className="sandbox-console-operation-main">
                <div className="sandbox-console-app-icon" aria-hidden="true">
                  <MessageCircle size={23} strokeWidth={2.2} />
                </div>
                <div className="sandbox-console-operation-copy">
                  <div className="sandbox-console-operation-title">
                    <strong>微信聊天</strong>
                    <span>已连接</span>
                  </div>
                  <p>会话列表、消息记录与待处理 AI 回复</p>
                </div>
              </div>

              {phase === 'idle' && (
                <button type="button" className="sandbox-console-action" disabled={stewardBusy} onClick={onRequestReset}>
                  <RotateCcw size={17} aria-hidden="true" />
                  <span>恢复初始聊天</span>
                  <ChevronRight size={17} aria-hidden="true" />
                </button>
              )}

              {(phase === 'confirming' || phase === 'running') && (
                <div
                  className="sandbox-console-confirmation"
                  role="alertdialog"
                  aria-labelledby="sandbox-reset-title"
                  aria-describedby="sandbox-reset-description"
                  tabIndex={-1}
                  ref={confirmationRef}
                >
                  <div className="sandbox-console-confirmation-icon" aria-hidden="true">
                    <RotateCcw size={18} />
                  </div>
                  <div>
                    <h3 id="sandbox-reset-title">仅恢复会话列表与消息</h3>
                    <p id="sandbox-reset-description">会停止尚未完成的联系人回复。不会影响微信零钱、账单、联系人和其他应用。</p>
                  </div>
                  <div className="sandbox-console-confirmation-actions">
                    <button type="button" onClick={onCancelReset} disabled={phase === 'running'}>取消</button>
                    <button type="button" className="is-danger" onClick={onConfirmReset} disabled={phase === 'running'}>
                      {phase === 'running' ? <><span className="sandbox-console-spinner" />正在恢复</> : '确认恢复'}
                    </button>
                  </div>
                </div>
              )}

              {phase === 'success' && result && (
                <div className="sandbox-console-result" role="status">
                  <span className="sandbox-console-result-icon"><Check size={17} aria-hidden="true" /></span>
                  <div>
                    <strong>微信聊天已恢复</strong>
                    <p>{result.conversations} 个会话 · {result.restoredMessages} 条初始消息</p>
                  </div>
                  <button type="button" onClick={onRequestReset}>再次恢复</button>
                </div>
              )}

              {phase === 'error' && (
                <div className="sandbox-console-error" role="alert">
                  <strong>恢复失败</strong>
                  <p>请刷新页面后重试；其他数据没有被修改。</p>
                  <button type="button" onClick={onRequestReset}>重试</button>
                </div>
              )}
            </div>
          </section>
          </details>

          <footer className="sandbox-console-footer">
            <ShieldCheck size={16} aria-hidden="true" />
            <span>{consoleStrings.boundary}</span>
          </footer>
        </div>
      </aside>
    </>
  );
}

export function SandboxConsole() {
  const [isOpen, setIsOpen] = useState(false);
  const [phase, setPhase] = useState<SandboxConsolePhase>('idle');
  const [result, setResult] = useState<SandboxActionResult>();
  const [stewardBusy, setStewardBusy] = useState(false);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const closeButtonRef = React.useRef<HTMLButtonElement>(null);
  const confirmationRef = React.useRef<HTMLDivElement>(null);
  const hasOpenedRef = React.useRef(false);

  useEffect(() => {
    if (isOpen) {
      hasOpenedRef.current = true;
      window.requestAnimationFrame(() => closeButtonRef.current?.focus());
      return;
    }
    if (hasOpenedRef.current) {
      window.requestAnimationFrame(() => triggerRef.current?.focus());
    }
  }, [isOpen]);

  useEffect(() => {
    if (phase === 'confirming') {
      window.requestAnimationFrame(() => confirmationRef.current?.focus());
    }
  }, [phase]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && phase !== 'running' && !stewardBusy) setIsOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, phase, stewardBusy]);

  const close = () => {
    if (phase === 'running' || stewardBusy) return;
    setIsOpen(false);
    window.setTimeout(() => {
      setPhase('idle');
      setResult(undefined);
    }, 220);
  };

  const confirmReset = () => {
    setPhase('running');
    window.setTimeout(() => {
      try {
        setResult(resetWechatChats());
        setPhase('success');
      } catch (error) {
        console.error('[SandboxConsole] Failed to reset WeChat chats:', error);
        setPhase('error');
      }
    }, 260);
  };

  return (
    <SandboxConsoleView
      isOpen={isOpen}
      phase={phase}
      result={result}
      onOpen={() => setIsOpen(true)}
      onClose={close}
      onRequestReset={() => setPhase('confirming')}
      onCancelReset={() => setPhase(result ? 'success' : 'idle')}
      onConfirmReset={confirmReset}
      triggerRef={triggerRef}
      closeButtonRef={closeButtonRef}
      confirmationRef={confirmationRef}
      stewardBusy={stewardBusy}
      onStewardBusyChange={setStewardBusy}
    />
  );
}

export default SandboxConsole;
