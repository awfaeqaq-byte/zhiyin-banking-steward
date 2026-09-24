# Sandbox finance testing console

Open the existing sandbox console from its floating button (bottom-right on mobile).
This tool changes local simulated app data, not real payment accounts. It does not
grant Zhiyin permission or bypass either platform's consent flow.

## Recommended test

1. Connect WeChat Pay and Alipay inside Zhiyin and approve the required scopes on
   both sides. Keep the normal authorization workflow intact.
2. Open the console, choose a scenario, and select **Prepare this scenario**.
   Review and confirm the listed changes.
3. Return to Zhiyin and use the suggested prompt shown by the console.
4. For a cancellation test, approve cancellation in Zhiyin, then return to the
   console and advance one day. The cancelled fixture must not be charged.
5. Inspect the provider's bill list and balance. Settlement also includes any
   other existing subscription that is due; the total is not fixture-only.

## Scenarios

| Scenario | Injected data | Expected observation |
| --- | --- | --- |
| Upcoming renewal | WeChat music membership, CNY 25, due tomorrow | Upcoming renewal and confirmed cancellation |
| Per-platform shortage | WeChat CNY 5, Alipay CNY 1,000; WeChat renewal CNY 25 | WeChat shortfall, not offset by Alipay funds |
| Duplicate subscriptions | Video membership on each platform, CNY 25 each | Possible overlap, not automatic cancellation |
| Suspected recurring payment | Four historical WeChat cloud bills, CNY 18 at 30-day intervals | Evidence-backed suspected recurrence, not a confirmed contract |

Fixture IDs are stable, so repeated loading does not duplicate them. An already
billed fixture retains its settlement linkage. Historical bill injection does
not debit the wallet. Balance settings do not create deposit transactions.

## Clock and recovery boundaries

- Advancing 1, 3, 7, or 30 days uses the existing billing engines on both platforms.
  It affects the whole simulated phone and pauses the clock at the target time.
- Each contract settles at most once per execution; missed historical periods are
  not retroactively charged. Insufficient funds do not produce a successful bill.
- Refreshing restores the startup clock configuration but retains app data and
  completed bills. There is no one-click rollback for completed settlement.
- Undo restores only the most recent balance/scenario settings, and only if the
  financial data has not changed since. Later payments or subscription edits
  block undo to prevent overwriting those changes.
- The last ten console financial actions and undo snapshot are session-only.
  Existing WeChat chat reset remains separate.

## Verification

The finance controller has unit coverage for validation, fixture idempotency,
real settlement, failed charges, retry, cancelled subscriptions and undo conflicts.
An integration test passes historical fixtures through the actual Zhiyin source
adapter and recurring-payment detector. This verifies data flow, not the content
of live language-model responses.
