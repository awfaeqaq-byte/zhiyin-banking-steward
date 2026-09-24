# Zhiyin sandbox integration

This local modification installs Zhiyin as a first-screen MobileGym app. The existing React 18 project remains in the parent directory; MobileGym uses React 19. A same-origin WebView keeps their CSS, dependencies and UI modes isolated.

## Run and update

From the parent directory:

```sh
npm run phone:dev
# http://localhost:3000
npm run phone:sync
# Refresh the phone after syncing changes to Zhiyin.
npm run phone:build
npm run phone:preview
```

`scripts/sync-phone.mjs` builds the parent app with relative asset paths and copies the generated assets to `public/zhiyin/`. This directory is ignored by Git and must be regenerated for a fresh checkout. The parent project must be retained alongside this repository. This is not an APK or Android emulator.

## Navigation and state

- The manifest registers `com.zhiyin.banking.sandbox`; launcher defaults pin Zhiyin without removing any app.
- OS back is routed through a navigation-only `postMessage` bridge. Both ends validate origin, frame identity, channel and protocol version. Correlated request IDs prevent stale back replies from navigating away from a different app.
- Dialogs consume back before page navigation. At the root, back returns to the launcher. Bottom-bar swipes and WebView edge strips capture pointer events so gestures can cross the iframe boundary.
- Backgrounding retains the WebView while MobileGym keeps the activity mounted. Relaunch after process destruction restores only the state already persisted by the parent app.
- Classic and AI-native modes, stewards, and settings remain in Zhiyin. Mode selection is in the settings page, not the home header.
- The classic transfer form and AI-native edit sheet can request read-only contacts through the OS permission dialog. The host queries the system Contacts provider and sends only `id`, display name, avatar color and the phone suffix. Full phone numbers, notes and email addresses never enter the WebView. A beneficiary is selectable only when both its display name and suffix match a saved demo bank recipient.
- New defaults add the demo beneficiaries `妈妈` (`6621`) and `爸爸` (`7316`). Persisted address books receive only missing fixture IDs; existing contacts are not overwritten or removed.
- The navigation declaration represents the WebView entry and retry action only. Its internal screens are not yet part of MobileGym benchmark navigation graphs or state snapshots.
- No balances, transactions or messages are shared with other apps. Contact access is read-only and selection only edits a draft. The bridge cannot authorize transfers. The simulated OS keyboard is not bridged into the iframe; use the browser/physical keyboard. No microphone or biometric APIs were added.

## Assets and attribution

Official dataset archive:
https://github.com/Purewhiter/mobilegym/releases/download/data-v0.1.0/mobilegym-data-v0.1.0.tar.gz

Extracted root: `mobilegym-data/`, served locally at `/cdn/` by Vite. The original archive is retained at `mobilegym-data-v0.1.0.tar.gz`; both are ignored by Git. Upstream wallpaper and WMR widget selections are preserved in `os/launcher/defaults.json`. Existing saved launcher layouts are not erased automatically.

Alipay's fallback launcher PNG was copied without visual alteration from upstream `web/figures/icons/com.eg.android.AlipayGphone.png` to `apps/Alipay/assets/launcher.png`. Applied theme icon packs may override this fallback. The mark identifies a simulated app, not an affiliation or official banking integration.

Keep upstream `LICENSE`, `NOTICE`, `LICENSE-DATA` and the dataset's `DISCLAIMER.md`. Source is Apache-2.0; dataset and app assets have separate CC BY-NC 4.0 / third-party limitations. Source modification rights do not grant unrestricted commercial use of the assets.

## Verification

```sh
npx vitest run tests/zhiyin-session.test.ts tests/alipay-launcher.test.ts
npx vitest run tests/contact-defaults.test.ts tests/zhiyin-contact-access.test.ts tests/zhiyin-active-state.test.ts
npx tsc --noEmit
npx eslint apps/Zhiyin apps/Alipay/manifest.ts
node scripts/build_nav_artifacts.mjs Zhiyin
```

The parent app has independent interaction and bridge tests (`npm test`). Browser checks should include launching from the first screen, switching mode in settings, edge back, swiping home, reopening, and opening the simulated Alipay app with its image icon.

Dependency audit on 2026-09-14 reports 23 issues in the upstream MobileGym dependency tree (including 2 critical) and 6 in the parent prototype (including 2 critical, in the test toolchain). No automatic dependency upgrades were applied as part of this integration. Development and preview commands bind to loopback only. Resolve and re-test dependencies before public deployment; this checkout is a local demonstration, not a production banking system.
