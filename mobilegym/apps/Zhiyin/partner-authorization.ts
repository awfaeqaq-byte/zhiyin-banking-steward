import type { ActivityResult, IntentPayload } from '@/os/types/manifest';
import type { FinancialProvider, FinancialScope } from './finance-access';
import { storeFinancialGrant } from './financial-grants';

type PartnerAuthorizationOS = {
  startActivityForResult: (
    appId: string,
    intent: IntentPayload,
    callback: (result: ActivityResult) => void,
  ) => boolean;
};

const targets: Record<FinancialProvider, { appId: string; scheme: string }> = {
  wechat_pay: { appId: 'wechat', scheme: 'weixin' },
  alipay: { appId: 'alipay', scheme: 'alipays' },
};

export function requestPartnerAuthorization(
  provider: FinancialProvider,
  scopes: FinancialScope[],
  os: PartnerAuthorizationOS | undefined = window.__OS__,
  recordGrant: (provider: FinancialProvider, scopes: FinancialScope[]) => boolean | void = storeFinancialGrant,
): Promise<boolean> {
  if (!os?.startActivityForResult) return Promise.resolve(false);
  const target = targets[provider];
  return new Promise((resolve) => {
    const launched = os.startActivityForResult(
      target.appId,
      {
        action: 'ACTION_FINANCIAL_DATA_CONSENT',
        scheme: target.scheme,
        data: { clientId: 'zhiyin', clientName: '知银', scopes },
      },
      (result) => {
        const approved = result.resultCode === 'OK';
        const persisted = approved ? recordGrant(provider, scopes) !== false : false;
        resolve(approved && persisted);
      },
    );
    if (!launched) resolve(false);
  });
}
