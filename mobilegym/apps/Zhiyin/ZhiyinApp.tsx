import React, { useEffect, useRef, useState } from 'react';
import { MemoryRouter, Navigate, Route, Routes } from 'react-router-dom';
import { useOS } from '@/os/OSContext';
import {useActivityContext} from '@/os/ActivityContext';
import { useAppNavigationHandler } from '@/os/hooks/useAppNavigationHandler';
import { useTriggerGestures } from '@/os/hooks/useTriggerGestures';
import { useAppStrings } from '@/os/useAppStrings';
import { createPhoneSession } from './phone-session';
import {accessGroupAA} from './group-aa-access';
import {accessOccasionFood} from './occasion-food-access';
import {accessFoodOrder} from './food-order-access';
import { loadZhiyinContacts } from './contact-access';
import { loadFinancialSource } from './finance-access';
import { requestPartnerAuthorization } from './partner-authorization';
import { hasFinancialGrant, revokeFinancialGrant } from './financial-grants';
import { cancelZhiyinAutopay } from './subscription-control';
import { isAppActive } from './active-state';
import { manifest } from './manifest';
import { strings } from './res/strings';
import { stringsEn } from './res/strings.en';
import { IcLauncher, IcRetry } from './res/icons';
import './zhiyin.css';

const FRAME_URL = `${import.meta.env.BASE_URL}zhiyin/index.html?phone=mobilegym`;

function ZhiyinFrame() {
  const s = useAppStrings(strings, stringsEn);
  const { state, goHome } = useOS();
  const {activityId}=useActivityContext();
  const isForeground = isAppActive(state, manifest.id);
  const active = useRef(false);
  active.current = isForeground;
  const frame = useRef<HTMLIFrameElement>(null);
  const session = useRef<ReturnType<typeof createPhoneSession> | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const { bindTap } = useTriggerGestures();

  useEffect(() => {
    const connection = createPhoneSession({
      origin: window.location.origin,
      peer: () => frame.current?.contentWindow ?? null,
      onStatus: setStatus, onExit: goHome, isActive: () => active.current,
      loadContacts: loadZhiyinContacts,
      groupAA:accessGroupAA,
      occasionFood:accessOccasionFood,
      foodOrder:accessFoodOrder,
      loadFinancialSource,
      authorizeFinancialSource: requestPartnerAuthorization,
      hasFinancialAuthorization: hasFinancialGrant,
      revokeFinancialAuthorization: revokeFinancialGrant,
      cancelFinancialAutopay: cancelZhiyinAutopay,
    });
    session.current = connection;
    window.addEventListener('message', connection.receive);
    connection.ping();
    return () => {
      window.removeEventListener('message', connection.receive);
      connection.dispose();
      session.current = null;
    };
  }, [goHome]);

  useEffect(() => {
    if (isForeground && status === 'ready') session.current?.foreground();
    if(!isForeground)frame.current?.contentWindow?.postMessage({type:'zhiyin-voice-stop'},window.location.origin);
  }, [isForeground, status]);
  useEffect(()=>{
    if(!isForeground)return;
    const intent=window.__OS__?.getIntentPayload?.(activityId);
    if(intent?.action==='ACTION_SEND'&&intent.type==='text/plain'&&intent.data?.__callerAppId==='wechat')session.current?.share(intent.data.wechatShare);
  },[state,isForeground,status,activityId]);

  useAppNavigationHandler(manifest.id, {
    onBack: () => session.current?.back() ?? false,
    onNavigate: (_path, navigate) => navigate('/'),
    onBackground: () => { frame.current?.contentWindow?.blur(); },
  });

  return (
    <div className="zhiyin-phone-app pt-10" data-status-bar-foreground="dark" data-navigation-bar-foreground="dark">
      <div className="zhiyin-phone-viewport">
        <iframe
          ref={frame} src={FRAME_URL} title={s.app_name}
          className="zhiyin-phone-frame" tabIndex={status === 'ready' ? 0 : -1}
          sandbox="allow-scripts allow-same-origin allow-forms"
          allow="microphone; autoplay"
          onLoad={() => session.current?.ping()}
        />
        {status !== 'ready' && (
          <div className="zhiyin-phone-status" role="status" aria-live="polite">
            <IcLauncher size={36} aria-hidden="true" />
            <strong>{status === 'error' ? s.load_error : s.loading}</strong>
            {status === 'error' && <>
              <p>{s.load_help}</p>
              <button {...bindTap({ kind: 'action', id: 'zhiyin.webview.reload' }, {
                onTrigger: () => {
                  session.current?.reload();
                  if (frame.current) frame.current.src = FRAME_URL;
                },
              })}>
                <IcRetry size={18} aria-hidden="true" />{s.retry}
              </button>
            </>}
          </div>
        )}
      </div>
      {/* Keep edge gestures in the OS document; iframe events do not bubble across documents. */}
      {(['left', 'right'] as const).map(side => <div
        key={side} className={`zhiyin-phone-edge zhiyin-phone-edge-${side}`} aria-hidden="true"
        onPointerDown={event => event.currentTarget.setPointerCapture(event.pointerId)}
      />)}
    </div>
  );
}

export default function ZhiyinApp() {
  return <MemoryRouter><Routes>
    <Route path="/" element={<ZhiyinFrame />} />
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes></MemoryRouter>;
}
