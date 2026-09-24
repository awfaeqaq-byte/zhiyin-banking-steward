import type { FinancialProvider, FinancialScope } from './finance-access';

const STORAGE_KEY = 'zhiyin-financial-grants-v1';
const validScopes: FinancialScope[] = ['balance', 'transactions', 'autopay'];

export type GrantStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
type GrantState = Partial<Record<FinancialProvider, FinancialScope[]>>;

function defaultStorage(): GrantStorage | undefined {
  try {
    return typeof window === 'undefined' ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

function read(storage: GrantStorage | undefined): GrantState {
  if (!storage) return {};
  try {
    const parsed = JSON.parse(storage.getItem(STORAGE_KEY) || '{}') as Record<string, unknown>;
    const state: GrantState = {};
    (['alipay', 'wechat_pay'] as const).forEach((provider) => {
      const scopes = parsed[provider];
      if (Array.isArray(scopes)) {
        state[provider] = scopes.filter(
          (scope): scope is FinancialScope => validScopes.includes(scope as FinancialScope),
        );
      }
    });
    return state;
  } catch {
    return {};
  }
}

export function storeFinancialGrant(
  provider: FinancialProvider,
  scopes: FinancialScope[],
  storage: GrantStorage | undefined = defaultStorage(),
) {
  if (!storage) return false;
  try {
    const state = read(storage);
    state[provider] = [...new Set(scopes)].filter(scope => validScopes.includes(scope));
    storage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export function hasFinancialGrant(
  provider: FinancialProvider,
  scopes: FinancialScope[],
  storage: GrantStorage | undefined = defaultStorage(),
) {
  const granted = read(storage)[provider] || [];
  return scopes.length > 0 && scopes.every(scope => granted.includes(scope));
}

export function revokeFinancialGrant(
  provider: FinancialProvider,
  storage: GrantStorage | undefined = defaultStorage(),
) {
  if (!storage) return false;
  try {
    const state = read(storage);
    delete state[provider];
    storage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}
