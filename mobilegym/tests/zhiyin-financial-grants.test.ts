import { describe, expect, it } from 'vitest';
import {
  hasFinancialGrant,
  revokeFinancialGrant,
  storeFinancialGrant,
} from '../apps/Zhiyin/financial-grants';

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  };
}

describe('Zhiyin financial authorization grants', () => {
  it('persists only the scopes approved by the payment provider', () => {
    const storage = memoryStorage();
    storeFinancialGrant('wechat_pay', ['balance', 'autopay'], storage);

    expect(hasFinancialGrant('wechat_pay', ['autopay'], storage)).toBe(true);
    expect(hasFinancialGrant('wechat_pay', ['balance', 'transactions'], storage)).toBe(false);
    expect(hasFinancialGrant('alipay', ['autopay'], storage)).toBe(false);
  });

  it('revokes the provider grant when Zhiyin disconnects the source', () => {
    const storage = memoryStorage();
    storeFinancialGrant('alipay', ['balance', 'transactions', 'autopay'], storage);
    expect(revokeFinancialGrant('alipay', storage)).toBe(true);
    expect(hasFinancialGrant('alipay', ['autopay'], storage)).toBe(false);
  });

  it('reports when the provider grant cannot be persisted or revoked', () => {
    const storage = {
      getItem: () => null,
      setItem: () => { throw new Error('storage unavailable'); },
      removeItem: () => undefined,
    };
    expect(storeFinancialGrant('alipay', ['autopay'], storage)).toBe(false);
    expect(revokeFinancialGrant('alipay', storage)).toBe(false);
  });
});
