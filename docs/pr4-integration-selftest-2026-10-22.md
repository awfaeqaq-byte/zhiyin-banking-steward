# PR #4 integration self-test (2026-10-22)

PR #3 is now an ancestor of this branch. The overlapping subscription, transfer,
workspace, chat, and contact-proxy changes were reconciled against the V2 repairs;
the V2 behavior and the four new subscription matching regressions are retained.
This branch also includes PR #3's native Windows ACL persistence fix and tests.

React callback dependencies and two unused-variable lint errors are fixed without
changing the intended chat or workspace behavior. See
`pr3-selftest-followup-2026-10-22.md` for the shared subscription and persistence
changes.

## Validation

Executed on Windows with Node.js 24.21.0 and the repository lockfiles:

| Check | Result |
| --- | --- |
| Root `npm test -- --maxWorkers=2 --minWorkers=1` | 127 files, 809 tests passed |
| MobileGym `npm test -- --maxWorkers=2` | 85 files, 410 tests passed |
| Root `npm run lint` | Passed, no errors or warnings |
| Root `npm run build` | Passed, including TypeScript and phone production build |
| Isolated Chrome smoke checks | 4 passed |

The Chrome checks verified rejection of a three-decimal transfer amount, no debit
before final confirmation, rejection of a fractional-month wealth goal, and
successful planning for an integer-month goal. They used a temporary synthetic
ledger, fixed model replies, and an empty message fixture, not live account data.

Tests ran with separate temporary directories in the normal local environment so
HTTP and filesystem permission checks could execute. The build retains existing
large-bundle and mixed-import advisories. Live model requests and the full
360-case manual/model scenario workbook were not rerun in this follow-up.

Merge PR #3 before PR #4. No changes from this follow-up have been merged into
`main`.
