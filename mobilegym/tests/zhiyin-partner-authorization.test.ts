import { describe, expect, it, vi } from 'vitest';
import { requestPartnerAuthorization } from '../apps/Zhiyin/partner-authorization';

describe('Zhiyin partner authorization', () => {
  it('opens WeChat Pay as a result activity and resolves only after partner approval', async () => {
    let respond: ((result: { resultCode: 'OK' | 'CANCELED' | 'FAILED' }) => void) | undefined;
    const startActivityForResult = vi.fn((_appId, _intent, callback) => {
      respond = callback;
      return true;
    });

    const recordGrant = vi.fn();
    const pending = requestPartnerAuthorization(
      'wechat_pay',
      ['balance', 'transactions'],
      { startActivityForResult },
      recordGrant,
    );

    expect(startActivityForResult).toHaveBeenCalledWith(
      'wechat',
      expect.objectContaining({
        action: 'ACTION_FINANCIAL_DATA_CONSENT',
        scheme: 'weixin',
        data: expect.objectContaining({ clientName: '知银', scopes: ['balance', 'transactions'] }),
      }),
      expect.any(Function),
    );
    respond?.({ resultCode: 'OK' });
    await expect(pending).resolves.toBe(true);
    expect(recordGrant).toHaveBeenCalledWith('wechat_pay', ['balance', 'transactions']);
  });

  it('treats a declined or unavailable partner activity as no authorization', async () => {
    const unavailable = { startActivityForResult: vi.fn(() => false) };
    await expect(requestPartnerAuthorization('alipay', ['balance'], unavailable)).resolves.toBe(false);

    let respond: ((result: { resultCode: 'OK' | 'CANCELED' | 'FAILED' }) => void) | undefined;
    const canceled = {
      startActivityForResult: vi.fn((_appId, _intent, callback) => {
        respond = callback;
        return true;
      }),
    };
    const pending = requestPartnerAuthorization('alipay', ['balance'], canceled);
    respond?.({ resultCode: 'CANCELED' });
    await expect(pending).resolves.toBe(false);
  });
});
