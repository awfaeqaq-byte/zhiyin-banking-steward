import React, { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useShallow } from 'zustand/react/shallow';
import { IcNavBack } from '../../res/icons';
import { WechatSmartImage } from '../../components/WechatSmartImage';
import { useWechatStore } from '../../state';
import { useWechatGestures } from '../../hooks/useWechatGestures';
import { getWechatWalletBackend } from '../../wallet/backend';
import { resolveChatPeerByWxid } from '../../utils/resolveChatPeer';

const NUMBER_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '⌫', '0', '.'];

function toAmountCents(value: string): number {
  if (!/^\d+(\.\d{0,2})?$/.test(value)) return 0;
  return Math.round(Number(value) * 100);
}

function normalizeAmount(value: string): string {
  const cleaned = value.replace(/[^\d.]/g, '');
  const [integer = '', ...decimalParts] = cleaned.split('.');
  const normalizedInteger = integer.replace(/^0+(?=\d)/, '').slice(0, 6);
  if (decimalParts.length === 0) return normalizedInteger;
  return `${normalizedInteger || '0'}.${decimalParts.join('').slice(0, 2)}`;
}

export const TransferPage: React.FC = () => {
  const { id = '' } = useParams<{ id: string }>();
  const { contacts, chats, balanceCents } = useWechatStore(useShallow(state => ({
    contacts: state.contacts,
    chats: state.chats,
    balanceCents: state.wallet.balanceCents,
  })));
  const { bindBack, back } = useWechatGestures();
  const peer = useMemo(() => {
    const contact = resolveChatPeerByWxid(id, contacts);
    if (contact) return contact;
    const chat = chats.find(item => item.id === id);
    return chat?.user;
  }, [chats, contacts, id]);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [showNote, setShowNote] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const amountCents = toAmountCents(amount);

  const pressKey = (key: string) => {
    if (submitting) return;
    setError('');
    if (key === '⌫') {
      setAmount(value => value.slice(0, -1));
      return;
    }
    if (!/^[\d.]$/.test(key)) return;
    setAmount(value => {
      if (key === '.' && value.includes('.')) return value;
      if (key === '.' && !value) return '0.';
      const next = value === '0' && key !== '.' ? key : `${value}${key}`;
      const [integer, decimals = ''] = next.split('.');
      if (integer.length > 6 || decimals.length > 2) return value;
      return next;
    });
  };

  const submit = async () => {
    if (!peer || amountCents <= 0 || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      const backend = getWechatWalletBackend();
      const transfer = await backend.createTransfer({
        peerWxid: peer.wxid,
        peerName: peer.name,
        amountCents,
        note,
      });
      window.setTimeout(() => {
        void backend.markTransferReceived(transfer.id);
      }, 1400);
      back();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '转账失败，请稍后重试');
      setSubmitting(false);
    }
  };

  if (!peer) {
    return <div className="h-full bg-[#ededed] pt-20 text-center text-gray-500">未找到收款人</div>;
  }

  return (
    <div className="h-full bg-[#ededed] flex flex-col" data-status-bar-foreground="dark">
      <div className="h-[88px] pt-10 px-4 flex items-center shrink-0">
        <button type="button" {...bindBack<HTMLButtonElement>()} aria-label="返回聊天" className="-ml-1 p-1 active:opacity-50">
          <IcNavBack size={28} />
        </button>
      </div>

      <div className="px-7 pb-5 flex items-center gap-4 shrink-0">
        <div className="min-w-0 flex-1">
          <div className="text-[18px] font-medium text-black">转账给 {peer.name}</div>
          <div className="mt-1 text-[14px] text-gray-500">微信号：{peer.wxid}</div>
        </div>
        <WechatSmartImage src={peer.avatar} alt="" className="w-14 h-14 rounded-[6px] object-cover" />
      </div>

      <div className="bg-white rounded-t-[14px] px-7 pt-7 flex-1 min-h-0 flex flex-col">
        <label htmlFor="wechat-transfer-amount" className="text-[16px] text-black">转账金额</label>
        <div className="flex items-end mt-6 border-b border-gray-100 pb-2">
          <span className="text-[50px] leading-none font-medium mr-3">¥</span>
          <input
            id="wechat-transfer-amount"
            inputMode="decimal"
            aria-describedby="wechat-transfer-balance wechat-transfer-error"
            value={amount}
            onChange={event => {
              setError('');
              setAmount(normalizeAmount(event.target.value));
            }}
            placeholder="0"
            className="min-w-0 flex-1 h-[58px] text-[52px] leading-none font-medium overflow-hidden outline-none bg-transparent placeholder:text-transparent"
          />
        </div>

        {showNote ? (
          <div className="mt-5 flex items-center gap-3">
            <input
              autoFocus
              value={note}
              maxLength={60}
              onChange={event => setNote(event.target.value)}
              placeholder="添加转账说明"
              className="flex-1 min-w-0 text-[16px] outline-none border-b border-gray-200 py-2"
            />
            <span className="text-[12px] text-gray-400">{note.length}/60</span>
          </div>
        ) : (
          <button type="button" onClick={() => setShowNote(true)} className="self-start mt-5 text-[16px] text-[#576b95] active:opacity-60">
            添加转账说明
          </button>
        )}

        <div className="mt-4 min-h-6 text-[13px]">
          {error ? <span id="wechat-transfer-error" role="alert" className="text-[#fa5151]">{error}</span> : (
            <span id="wechat-transfer-balance" className="text-gray-400">零钱余额 ¥{(balanceCents / 100).toFixed(2)}</span>
          )}
        </div>
      </div>

      <div className="flex bg-[#f7f7f7] border-t border-gray-200 shrink-0 pb-4">
        <div className="grid grid-cols-3 flex-1">
          {NUMBER_KEYS.map((key, index) => (
            <button
              key={`${key}-${index}`}
              type="button"
              onClick={() => pressKey(key)}
              className="h-[58px] bg-white text-black border-r border-b border-gray-100 text-[23px] active:brightness-95"
            >
              {key}
            </button>
          ))}
        </div>
        <button
          type="button"
          disabled={amountCents <= 0 || submitting}
          onClick={submit}
          className="w-1/4 bg-[#07c160] text-white text-[19px] disabled:bg-[#9be6b8] active:brightness-95 disabled:active:brightness-100"
        >
          {submitting ? '处理中' : '转账'}
        </button>
      </div>
    </div>
  );
};
