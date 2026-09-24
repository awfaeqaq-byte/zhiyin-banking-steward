# Bank-funded platform payments

## Implemented scope

GoodBite checkout now separates the payment channel (WeChat / Alipay) from the funding account (platform balance / Zhiyin bank card 8888). Both bank-funded channels debit the same server-side bank ledger. Platform balances stay unchanged, while the chosen platform receives one expense record. Refunds return to the original funding account and produce a platform refund record.

The bank page shows the associated merchant payments and refund status. Platform bill analysis currently consumes platform records, not bank payment mirrors, so these records are not added to spending twice.

## Testing

1. Create an order in GoodBite, select WeChat or Alipay, then select card 8888.
2. Confirm payment; inspect the platform bill and Zhiyin → Assets → Bank card. Platform balance should not change; bank balance should decrease by the order amount.
3. Cancel the paid food order; the bank balance should recover and the platform bill should show the refund.
4. Freeze the card or reduce its limit in Zhiyin. Bank-funded payment should fail without falling back to platform balance.
5. If a response is lost, retry the same order. Its persistent unique bank payment ID prevents another debit. Until the result is known, the checkout locks the original payment channel and funding account.

Automated tests use isolated memory/file fixtures; the browser walkthrough created two unpaid test orders (HS000001 and HS000002), without executing a payment. The second walkthrough confirmed switching to Alipay + card 8888 and the corresponding payment-button label.

## API and storage

`POST /api/zhiyin/bank`, same-origin JSON, `X-Zhiyin-Bank: 1`:

- `{type: "payment", authorized: true, payment: {id, channel, amount, merchant}}`
- `{type: "refund-payment", authorized: true, paymentId}`

Amounts are integer cents. Payment receipts live under `payments` in the existing private bank ledger. Requests are idempotent by ID and reject changed amount/channel/merchant. Refunds are full, idempotent and do not require an unfrozen card. Debit checks enforce balance, single-transaction limit, freeze and night protection.

## Boundaries

- Sandbox only: no real bank/WeChat/Alipay payment APIs, identity verification, card-binding or authorization mandates.
- Automatic renewals, WeChat chat transfers and other apps' legacy cashiers still use their previous funding behavior. They have **not** been switched to card 8888.
- The bank ledger is server-side; platform bills/orders remain the simulator's browser-persisted stores. This is not one distributed database transaction. Retrying on the same browser reconciles an interrupted payment; clearing browser data is not an automatic reconciliation mechanism.
- Single-user local demo, not authenticated/multi-user production infrastructure. Existing dependency audit reports two high-severity React Router findings; no dependency upgrade was performed in this change.
