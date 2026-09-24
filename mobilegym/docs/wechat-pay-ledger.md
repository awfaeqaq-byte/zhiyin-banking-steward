# WeChat Pay ledger

This is the simulated WeChat Pay ledger used by both WeChat pages and Zhiyin's authorized transaction reads. It does not execute payments.

## Entry and routes

Open the **WeChat Pay** service row in the WeChat chat list (`/`, transition `wechatPay.open`). The service feed links to the ledger and report settings. Routes are declared in [`navigation.declaration.ts`](../apps/Wechat/navigation.declaration.ts) and registered in [`WechatApp.tsx`](../apps/Wechat/WechatApp.tsx).

| Route | Purpose |
| --- | --- |
| `/wechat-pay` | Service feed, daily report and latest non-manual expense |
| `/wechat-pay/ledger` | Monthly ledger, category filtering and search; `?search=1` opens search |
| `/wechat-pay/stats` | Daily, monthly and category statistics |
| `/wechat-pay/settings` | Daily-report and manual-record settings |
| `/wechat-pay/add` | Add an expense or income record |
| `/wechat-pay/transaction/:id` | Transaction detail by ID |
| `/wechat-pay/offers` | Offer demo |

## Default data and backend contract

[`apps/Wechat/data/pay-ledger-defaults.json`](../apps/Wechat/data/pay-ledger-defaults.json) is the replaceable seed: `transactions`, `monthlyHistory`, and `settings`. [`data/index.ts`](../apps/Wechat/data/index.ts) clones it into the WeChat default state as `payLedger`. Changing the seed changes initial data; it does not overwrite an already persisted ledger. Monetary values use integer cents.

[`WechatPayBackend`](../apps/Wechat/pay-ledger/backend.ts) is the asynchronous boundary consumed by the [`ledger hooks`](../apps/Wechat/pay-ledger/useWechatPayLedger.ts):

| Method | Contract |
| --- | --- |
| `getLedger({ month, category?, search? })` | `month` is `YYYY-MM`. Returns filtered transactions, income/expense/count summary, daily groups, expense categories, monthly totals, and settings. Search matches merchant or note. |
| `getTransaction(id)` | Returns one transaction or `null`, independently of month and list filters. |
| `addTransaction(input)` | Accepts `NewWechatPayTransaction` (transaction fields except `id` and `source`); returns the saved manual record. |
| `updateSettings(updates)` | Merges a partial `WechatPayLedgerSettings` and returns the resulting settings. |

The default adapter reads and updates the WeChat store. `getWechatPayBackend()` returns the active adapter; `configureWechatPayBackend(adapter)` installs an override, and `configureWechatPayBackend(null)` restores the store adapter. Install an override before loading pages or requesting data; changing it does not automatically refresh mounted consumers.

For deterministic tests, use a fresh in-memory adapter:

```ts
import {
  configureWechatPayBackend,
  createMemoryWechatPayBackend,
  type WechatPayLedgerSeed,
} from '@/apps/Wechat/pay-ledger/backend';
import defaults from '@/apps/Wechat/data/pay-ledger-defaults.json';

configureWechatPayBackend(
  createMemoryWechatPayBackend(defaults as WechatPayLedgerSeed),
);
// Run the scenario; restore the default adapter in test cleanup.
configureWechatPayBackend(null);
```

An HTTP integration implements the same four methods and is installed with `configureWechatPayBackend`. No HTTP ledger implementation or endpoint contract is supplied by this feature. Use the platform NetworkService (`netJson` / `netFetch`) for transport and preserve the typed results, cent units, filtering, and validation behavior. Page components need no transport-specific code.

## Manual records and settings

The add form collects direction, amount, merchant/description, category and date. It converts yuan to cents and saves through the backend; successful saves refresh the hook and return to the preceding page. The built-in adapters require positive safe-integer cents, a nonblank merchant and a parseable timestamp. They trim merchant/note text, force income records into the `income` category, and assign a `manual-...` ID plus `source: 'manual'`.

| Setting | Current behavior |
| --- | --- |
| `includeManualRecords` | Defaults to `true`. When `false`, manual records are excluded from `getLedger` transactions and derived summaries, daily/category groups and the queried month's total. Records are not deleted and remain retrievable by ID. |
| `dailyReport` | Defaults to `true`. When `false`, the service feed shows the report-disabled state with a re-enable action. Ledger access and aggregation remain available; this is not a scheduled notification service. |

Monthly history retains seeded totals for other months; the queried month's total is recalculated from that month's records, respecting `includeManualRecords` but ignoring category/search filters. The current demo feed uses September 2026 and the September 14 daily report; statistics/settings also initially query September 2026. These fixture dates are implementation details, not a general reporting policy.

## Zhiyin integration and consent

[`apps/Zhiyin/finance-access.ts`](../apps/Zhiyin/finance-access.ts) reads WeChat transactions through `getWechatPayBackend().getLedger(...)`, using the current simulated month from `TimeService`. It maps up to 40 records into Zhiyin's signed-cent transaction format. Consequently, backend overrides and `includeManualRecords` apply to Zhiyin reads too. With fixture data, keep simulated time aligned with the month being demonstrated. Balance and automatic-payment data remain separate from this ledger transaction read.

Sharing the ledger does not merge authorization flows. Zhiyin requests scopes in its own connection UI; [`partner-authorization.ts`](../apps/Zhiyin/partner-authorization.ts) then opens the provider's separate consent Activity using `ACTION_FINANCIAL_DATA_CONSENT` (WeChat route `/pay/data-authorization`). [`phone-session.ts`](../apps/Zhiyin/phone-session.ts) only loads the source after that Activity returns `OK`. Transaction data is read only when the requested scopes include `transactions`. Ledger settings and manual entry do not authorize cross-app access or payment execution.

## Verification references

Existing focused coverage lives in [`tests/wechat-pay-backend.test.ts`](../tests/wechat-pay-backend.test.ts) and [`tests/zhiyin-finance-access.test.ts`](../tests/zhiyin-finance-access.test.ts). They are the starting point when changing aggregation, settings, fixtures or the shared read adapter.
