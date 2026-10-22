# PR #3 self-test follow-up (2026-10-22)

The subscription cancellation flow now recognizes a short membership name when
it identifies one subscription. Product qualifiers are preserved, and multiple
matching subscriptions still require an explicit choice before cancellation.
Four regression tests cover aliases, distinct products, and ambiguous candidates.

Workspace callbacks now include their actual dependencies and retain stable
identities for polling, claiming, loading, and persisting conversation entries.

Private model settings now use a protected current-user ACL on Windows, applied
when the temporary file is created. POSIX continues to use `0600`. Configuration
replacement remains atomic and a failed save preserves the previous configuration.
Tests verify Windows ACLs, repeated saves, Unicode, and helper failures; local
timeouts allow Windows subprocess startup without weakening assertions.

## Validation

Executed on Windows with Node.js 24.21.0 and the repository lockfiles:

| Check | Result |
| --- | --- |
| Root `npm test -- --maxWorkers=2 --minWorkers=1` | 125 files, 753 tests passed |
| MobileGym `npm test -- --maxWorkers=2` | 85 files, 410 tests passed |
| Root `npm run lint` | Passed, no errors or warnings |
| Root `npm run build` | Passed, including TypeScript and phone production build |

Tests used separate temporary directories and normal local execution so localhost
HTTP servers and Windows ACLs could be tested. The build still reports existing
large-bundle advisories. Live model requests and the full 360-case manual/model
scenario workbook were not rerun in this follow-up.

PR #4 incorporates this branch's commits. Merge PR #3 before PR #4 to preserve the
review sequence; this follow-up does not merge either PR into `main`.
