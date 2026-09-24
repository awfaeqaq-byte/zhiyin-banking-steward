import * as TimeService from '@/os/TimeService';
import { useWechatStore } from '../state';
import type { WechatWalletData, WechatWalletTransfer } from '../types';

export type { WechatWalletData, WechatWalletTransfer } from '../types';

export type NewWechatWalletTransfer = {
  peerWxid: string;
  peerName: string;
  amountCents: number;
  note?: string;
};

export interface WechatWalletBackend {
  getWallet(): Promise<WechatWalletData>;
  createTransfer(input: NewWechatWalletTransfer): Promise<WechatWalletTransfer>;
  createIncomingTransfer(input: NewWechatWalletTransfer): Promise<WechatWalletTransfer>;
  markTransferReceived(id: string): Promise<WechatWalletTransfer>;
  refundTransfer(id: string): Promise<WechatWalletTransfer>;
}

let sequence = 0;

function cloneWallet(wallet: WechatWalletData): WechatWalletData {
  return {
    balanceCents: wallet.balanceCents,
    transfers: wallet.transfers.map(transfer => ({ ...transfer })),
  };
}

function validateTransfer(input: NewWechatWalletTransfer, balanceCents?: number): NewWechatWalletTransfer {
  if (!input.peerWxid.trim() || !input.peerName.trim()) throw new Error('收款人信息无效');
  if (!Number.isSafeInteger(input.amountCents) || input.amountCents <= 0) throw new Error('请输入有效金额');
  if (input.amountCents > 20000000) throw new Error('单笔转账金额不能超过 20 万元');
  if (balanceCents !== undefined && input.amountCents > balanceCents) throw new Error('零钱余额不足');
  return {
    ...input,
    peerWxid: input.peerWxid.trim(),
    peerName: input.peerName.trim().slice(0, 40),
    note: input.note?.trim().slice(0, 60) || undefined,
  };
}

function newTransfer(input: NewWechatWalletTransfer, direction: WechatWalletTransfer['direction']): WechatWalletTransfer {
  sequence += 1;
  return {
    ...input,
    id: `wx-transfer-${TimeService.now()}-${sequence}`,
    direction,
    status: 'pending',
    createdAt: TimeService.getDate().toISOString(),
  };
}

export function createMemoryWechatWalletBackend(initialWallet: WechatWalletData): WechatWalletBackend {
  let wallet = cloneWallet(initialWallet);
  return {
    async getWallet() {
      return cloneWallet(wallet);
    },
    async createTransfer(rawInput) {
      const input = validateTransfer(rawInput, wallet.balanceCents);
      const transfer = newTransfer(input, 'outgoing');
      wallet = {
        balanceCents: wallet.balanceCents - transfer.amountCents,
        transfers: [transfer, ...wallet.transfers],
      };
      return { ...transfer };
    },
    async createIncomingTransfer(rawInput) {
      const input = validateTransfer(rawInput);
      const transfer = newTransfer(input, 'incoming');
      wallet = { ...wallet, transfers: [transfer, ...wallet.transfers] };
      return { ...transfer };
    },
    async markTransferReceived(id) {
      const current = wallet.transfers.find(transfer => transfer.id === id);
      if (!current) throw new Error('未找到这笔转账');
      if (current.status !== 'pending') return { ...current };
      const updated: WechatWalletTransfer = {
        ...current,
        status: 'received',
        receivedAt: TimeService.getDate().toISOString(),
      };
      wallet = {
        balanceCents: wallet.balanceCents + (current.direction === 'incoming' ? current.amountCents : 0),
        transfers: wallet.transfers.map(transfer => transfer.id === id ? updated : transfer),
      };
      return { ...updated };
    },
    async refundTransfer(id) {
      const current = wallet.transfers.find(transfer => transfer.id === id);
      if (!current) throw new Error('未找到这笔转账');
      if (current.status !== 'pending') return { ...current };
      if (current.direction !== 'incoming') throw new Error('不能退还自己发起的转账');
      const updated: WechatWalletTransfer = { ...current, status: 'refunded' };
      wallet = {
        ...wallet,
        transfers: wallet.transfers.map(transfer => transfer.id === id ? updated : transfer),
      };
      return { ...updated };
    },
  };
}

const storeBackend: WechatWalletBackend = {
  async getWallet() {
    return cloneWallet(useWechatStore.getState().wallet);
  },
  async createTransfer(rawInput) {
    const state = useWechatStore.getState();
    const input = validateTransfer(rawInput, state.wallet.balanceCents);
    const transfer = newTransfer(input, 'outgoing');
    state.addWalletTransfer(transfer);
    return { ...transfer };
  },
  async createIncomingTransfer(rawInput) {
    const input = validateTransfer(rawInput);
    const transfer = newTransfer(input, 'incoming');
    useWechatStore.getState().addWalletTransfer(transfer);
    return { ...transfer };
  },
  async markTransferReceived(id) {
    const current = useWechatStore.getState().wallet.transfers.find(transfer => transfer.id === id);
    if (!current) throw new Error('未找到这笔转账');
    if (current.status !== 'pending') return { ...current };
    const updated = { ...current, status: 'received' as const, receivedAt: TimeService.getDate().toISOString() };
    useWechatStore.getState().updateWalletTransfer(updated);
    return updated;
  },
  async refundTransfer(id) {
    const current = useWechatStore.getState().wallet.transfers.find(transfer => transfer.id === id);
    if (!current) throw new Error('未找到这笔转账');
    if (current.status !== 'pending') return { ...current };
    if (current.direction !== 'incoming') throw new Error('不能退还自己发起的转账');
    const updated = { ...current, status: 'refunded' as const };
    useWechatStore.getState().updateWalletTransfer(updated);
    return updated;
  },
};

let backendOverride: WechatWalletBackend | null = null;

/** Swap this adapter for a persistent HTTP backend during integration tests or deployment. */
export function configureWechatWalletBackend(backend: WechatWalletBackend | null) {
  backendOverride = backend;
}

export function getWechatWalletBackend(): WechatWalletBackend {
  return backendOverride || storeBackend;
}
