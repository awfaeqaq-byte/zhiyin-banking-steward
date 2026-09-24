import { describe, expect, it } from 'vitest';
import {
  createMemoryWechatWalletBackend,
  type WechatWalletData,
} from '../apps/Wechat/wallet/backend';

const walletSeed: WechatWalletData = {
  balanceCents: 32860,
  transfers: [],
};

describe('WechatWalletBackend', () => {
  it('returns persisted balance and transfer history', async () => {
    const backend = createMemoryWechatWalletBackend(walletSeed);

    await expect(backend.getWallet()).resolves.toEqual(walletSeed);
  });

  it('creates an outgoing transfer and deducts the wallet exactly once', async () => {
    const backend = createMemoryWechatWalletBackend(walletSeed);

    const transfer = await backend.createTransfer({
      peerWxid: 'wxid_zhangwei',
      peerName: '张伟',
      amountCents: 3000,
      note: '晚饭',
    });
    const wallet = await backend.getWallet();

    expect(transfer).toEqual(expect.objectContaining({
      direction: 'outgoing',
      amountCents: 3000,
      status: 'pending',
    }));
    expect(wallet.balanceCents).toBe(29860);
    expect(wallet.transfers).toHaveLength(1);
  });

  it('does not mutate the wallet when the balance is insufficient', async () => {
    const backend = createMemoryWechatWalletBackend(walletSeed);

    await expect(backend.createTransfer({
      peerWxid: 'wxid_zhangwei',
      peerName: '张伟',
      amountCents: 40000,
    })).rejects.toThrow('零钱余额不足');
    await expect(backend.getWallet()).resolves.toEqual(walletSeed);
  });

  it('updates receipt status without charging the wallet again', async () => {
    const backend = createMemoryWechatWalletBackend(walletSeed);
    const transfer = await backend.createTransfer({
      peerWxid: 'wxid_zhangwei',
      peerName: '张伟',
      amountCents: 1000,
    });

    const received = await backend.markTransferReceived(transfer.id);
    const wallet = await backend.getWallet();

    expect(received.status).toBe('received');
    expect(received.receivedAt).toBeTruthy();
    expect(wallet.balanceCents).toBe(31860);
  });

  it('credits an incoming contact transfer only after the user receives it', async () => {
    const backend = createMemoryWechatWalletBackend(walletSeed);

    const transfer = await backend.createIncomingTransfer({
      peerWxid: 'wxid_zhangwei',
      peerName: '张伟',
      amountCents: 3500,
      note: 'AA收款',
    });
    expect(transfer).toEqual(expect.objectContaining({
      direction: 'incoming',
      status: 'pending',
      amountCents: 3500,
    }));
    await expect(backend.getWallet()).resolves.toEqual(expect.objectContaining({ balanceCents: 32860 }));

    await backend.markTransferReceived(transfer.id);
    await expect(backend.getWallet()).resolves.toEqual(expect.objectContaining({ balanceCents: 36360 }));

    await backend.markTransferReceived(transfer.id);
    await expect(backend.getWallet()).resolves.toEqual(expect.objectContaining({ balanceCents: 36360 }));
  });

  it('lets the user return a pending incoming transfer without changing the balance', async () => {
    const backend = createMemoryWechatWalletBackend(walletSeed);
    const transfer = await backend.createIncomingTransfer({
      peerWxid: 'wxid_zhangwei',
      peerName: '张伟',
      amountCents: 8800,
      note: '代垫饭钱',
    });

    const refunded = await backend.refundTransfer(transfer.id);

    expect(refunded.status).toBe('refunded');
    await expect(backend.getWallet()).resolves.toEqual(expect.objectContaining({ balanceCents: 32860 }));
    await expect(backend.markTransferReceived(transfer.id)).resolves.toEqual(expect.objectContaining({ status: 'refunded' }));
  });
});
