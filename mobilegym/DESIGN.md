---
name: MobileGym WeChat — transfers, wallet, and auto renew
description: Scoped documentation of the implemented WeChat money, auto-renew authorization, contact-reply, and sandbox-console surfaces.
colors:
  primary: "#07c160"
  primary-disabled: "#9be6b8"
  transfer: "#fa9d3b"
  transfer-soft: "#fff2df"
  incoming: "#07a858"
  incoming-soft: "#e8f8ef"
  background: "#ededed"
  surface: "#ffffff"
  balance-background: "#f5f5f5"
  text: "#000000"
  muted: "#666666"
  border: "#e5e7eb"
  link: "#576b95"
  error: "#fa5151"
  sent-bubble: "#95ec69"
  subscription-selection: "#f0fbf5"
  merchant-gold: "#f3c744"
  merchant-gold-text: "#9c4b18"
  merchant-red: "#e93434"
  console-graphite: "#171a1c"
  console-trigger: "#202426"
  console-panel: "#f4f2ed"
  console-paper: "#fffdfa"
  console-line: "#d8d4cc"
  console-muted: "#66645f"
  console-danger: "#b7352d"
  console-status: "#91a0a6"
  console-focus: "#86b8ff"
typography:
  display:
    fontSize: "52px"
    fontWeight: 500
    lineHeight: 1
  balance:
    fontSize: "40px"
    fontWeight: 500
    letterSpacing: "-0.025em"
  title:
    fontSize: "18px"
    fontWeight: 500
  body:
    fontSize: "16px"
    lineHeight: 1.5
  label:
    fontSize: "12px"
  subscription-meta:
    fontSize: "13px"
    lineHeight: 1.5385
  subscription-secondary:
    fontSize: "14px"
    lineHeight: 1.4286
  subscription-body:
    fontSize: "16px"
    lineHeight: 1.5
  subscription-dialog-title:
    fontSize: "18px"
    fontWeight: 700
  console-title:
    fontSize: "23px"
    fontWeight: 720
    lineHeight: 1.2
    letterSpacing: "-0.025em"
  console-body:
    fontSize: "13px"
    lineHeight: 1.55
  console-label:
    fontSize: "11px"
    fontWeight: 650
rounded:
  avatar: "4px"
  card: "6px"
  amount-panel: "14px"
  subscription-control: "6px"
  subscription-dialog: "12px"
  subscription-marker: "999px"
  console-control: "10px"
  console-card: "14px"
  console-panel: "16px"
  console-pill: "999px"
spacing:
  unit: "0.25rem"
  chat-gap: "0.75rem"
  chat-inset: "1rem"
  wallet-inset: "1.5rem"
  amount-inset: "1.75rem"
  subscription-field-inset: "16px"
  subscription-detail-inset: "24px"
  console-edge: "16px"
  console-gutter: "22px"
  console-header-inset: "24px"
components:
  transfer-submit:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.surface}"
    width: "25%"
  transfer-submit-disabled:
    backgroundColor: "{colors.primary-disabled}"
    textColor: "{colors.surface}"
  amount-input:
    backgroundColor: "transparent"
    textColor: "{colors.text}"
    typography: "{typography.display}"
    height: "58px"
  keypad-key:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    height: "58px"
  transfer-card:
    backgroundColor: "{colors.transfer}"
    textColor: "{colors.surface}"
    rounded: "{rounded.card}"
    width: "232px"
  wallet-row:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    padding: "1.25rem 1.5rem"
  chat-input:
    backgroundColor: "{colors.surface}"
    typography: "{typography.body}"
    rounded: "{rounded.card}"
    padding: "0.5rem 0.75rem"
  sandbox-trigger:
    backgroundColor: "{colors.console-trigger}"
    textColor: "{colors.surface}"
    rounded: "{rounded.console-pill}"
    padding: "0 15px"
    height: "44px"
  sandbox-drawer:
    backgroundColor: "{colors.console-panel}"
    textColor: "{colors.console-graphite}"
    rounded: "{rounded.console-panel}"
    width: "min(404px, calc(100vw - 32px))"
  sandbox-operation:
    backgroundColor: "{colors.console-paper}"
    textColor: "{colors.console-graphite}"
    rounded: "{rounded.console-card}"
  sandbox-danger-action:
    backgroundColor: "{colors.console-danger}"
    textColor: "{colors.surface}"
    rounded: "{rounded.console-control}"
    padding: "0 13px"
    height: "44px"
  sandbox-finance-control:
    backgroundColor: "{colors.console-paper}"
    textColor: "{colors.console-graphite}"
    rounded: "8px"
    height: "44px"
  subscription-list-row:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    padding: "16px"
    height: "96px"
  subscription-field:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    typography: "{typography.subscription-body}"
    padding: "0 {spacing.subscription-field-inset}"
    height: "58px"
  subscription-cycle-selected:
    backgroundColor: "{colors.subscription-selection}"
    textColor: "{colors.incoming}"
    typography: "{typography.subscription-secondary}"
    rounded: "{rounded.subscription-control}"
    height: "40px"
  subscription-confirm:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.surface}"
    typography: "{typography.subscription-body}"
    rounded: "{rounded.subscription-control}"
    height: "48px"
  subscription-danger-action:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.error}"
    typography: "{typography.subscription-body}"
    height: "52px"
---

# Design System: MobileGym WeChat — transfers, wallet, and auto renew

## Overview

**Creative North Star: "A familiar WeChat money conversation"**

Preserve the incumbent WeChat simulation: gray and white surfaces, green primary actions, compact chat bubbles and orange transfer receipts. Amount, recipient and transaction status carry the visual hierarchy. The feature lives inside the simulated phone, with keyboard and navigation behavior governed by MobileGym.

Auto renew is a scoped extension of that same WeChat world: an active authorization list and its maintenance flow, not a banking dashboard. It inherits the gray-white settings language, black information hierarchy, blue secondary text, flat dividers, and green confirmation action. Merchant color appears only inside circular service markers. The direction contract is `wechat-autorenew-management-v1`; it extends the incumbent identity without a concept roll.

The sandbox console is a scoped operator-world extension, not a replacement identity: matte graphite utility chrome opens onto a warm paper work area outside the phone. It identifies the controlled app with restrained WeChat green, explains the exact data boundary, and makes destructive scope explicit before acting. The direction contract is `sandbox-console-operator-drawer-v1`.

This is an incremental record for `apps/Wechat/pages/chat/TransferPage.tsx`, `ChatDetail.tsx`, `apps/Wechat/pages/pay/WalletPage.tsx`, `WalletBalancePage.tsx`, `apps/Wechat/pages/settings/Subscriptions.tsx`, `SubscriptionAddPage.tsx`, `SubscriptionDetailPage.tsx`, and the separate `sandbox/SandboxConsole.tsx` integration. It does not impose WeChat styling on other apps or make the operator console masquerade as a mobile app. It does not replace `AGENTS.md`, `docs/platform/`, the app manifest, or resource conventions. Existing app resources remain authoritative outside this scope.

**Key Characteristics:**

- White functional surfaces sit on a restrained gray canvas.
- Green denotes the primary action; orange identifies a transfer receipt.
- Amounts and explicit status text stay readable together.
- Keyboard input and financial state remain consistent across the amount page, chat and wallet.
- Auto renew lists only effective authorizations, with merchant identity subordinate to the service name.
- Addition uses full-width field groups and a restrained monthly/quarterly/yearly selector; cancellation is explicit and confirmed.
- The operator drawer remains outside the 360×800 phone and uses compact, countable status language.
- Graphite and warm paper distinguish developer operations from the simulated product world.

## Colors

### Primary

Use primary green for transfer submission and the existing chat send control. Use primary-disabled for an unavailable submission; do not present it as an enabled action.

### Secondary

Transfer orange identifies money-related chat cards and coin imagery. Soft orange contains wallet expense icons. Incoming green and its soft background distinguish incoming rows, alongside a plus sign and direction text. Blue is reserved for secondary links such as the transfer note entry. Error red accompanies an explicit error message.

Within auto renew, blue remains secondary copy for the quiet “关闭扣费服务” entry; it is not promoted into a filled action. Unimplemented support information stays muted gray rather than imitating a link. The pale green selection tint belongs only to the selected billing-cycle segment. Merchant gold, brown and red are identity cues inside circular service markers and must not spread into rows, headings, controls, or status language.

### Neutral

Background gray separates the white amount panel, wallet groups and chat composer. The balance detail page uses its existing slightly lighter gray. Black carries amounts and primary labels; muted grays carry balance hints, dates and secondary labels. Thin dividers separate keypad keys and wallet rows.

The sent-message green is a chat bubble color, separate from the primary action green. Do not substitute Zhiyin's teal identity into these WeChat surfaces.

### Tertiary

The sandbox console uses WeChat green only for the app icon and connected-state identification. Destructive confirmation uses console danger red; the pale blue focus ring is an interaction aid, not an accent color. Success, warning, and error backgrounds remain quiet tints so their result copy carries the meaning.

### Console Neutral

Near-black graphite anchors the drawer header and compact edge trigger. Warm panel beige and near-white paper create the work area, while warm gray lines and muted copy separate information without turning the console into a dashboard grid. Cool status gray belongs to environment and boundary metadata.

**The Separate Worlds Rule.** WeChat colors describe the simulated app; graphite and warm paper describe the browser-level operator tool. The console may identify WeChat with its green, but it must not inherit the mobile app's full visual language.

## Typography

Inherit the simulator's existing system sans-serif stack from the global stylesheet; no new font is introduced.

- **Display:** editable transfer amount; the adjacent currency mark is slightly smaller (50px).
- **Balance:** the large wallet balance, formatted with two decimal places.
- **Title:** recipient and transfer-card amount; wallet menu labels are 17px.
- **Body:** chat text, field labels and transaction titles.
- **Label:** receipt state and wallet date/status; errors and balance hints use 13px.

Money is stored in cents and rendered in yuan with two decimal places. Labels and notes support the amount, rather than replacing it with marketing copy.

Auto-renew settings use a compact 12/13/14/16/18px ladder: 12px for dates, notes and inline errors; 13px for merchant metadata; 14px for supporting labels and detail rows; 16px for field labels, values, service names and actions; and 18px for the cancellation-dialog title. Keep service names and page actions at the same calm settings-page scale rather than introducing dashboard numerals.

The console uses the same system sans-serif family but a denser utility hierarchy: a 23px, weight-720 title; 13–15px operation copy; and 11–12px metadata. Short Chinese action labels carry semibold emphasis. Sentence-case labels and countable results replace decorative headings or marketing language.

## Layout

The WeChat manifest declares a 412px design viewport. Preserve the mobile canvas when the surrounding desktop browser is wider; this scope introduces no desktop dashboard or new responsive breakpoint.

The transfer page is a full-height flex column: status/back region, recipient identity, a flexible white amount panel, then a non-shrinking keypad/action row. The top region is 88px high and reserves the existing status-bar inset. The keypad has three columns and four 58px rows; submission takes one quarter of the row width. Do not replace the real amount input with a display-only keypad value.

Chat uses a scrollable message region and a non-shrinking composer with `data-keep-keyboard`. Keep compatibility with OS `adjustResize`; do not position the composer against the physical browser bottom. Wallet uses full-width white menu groups; balance detail scrolls as one column. Amounts align consistently at the right of wallet transaction rows.

Auto-renew screens are full-width settings flows. The active-only list begins with a short explanatory strip, then places each authorization in a minimum 96px white row with a 44px circular service marker, service name, merchant, activation date and a real trailing navigation chevron. The add page uses two vertically separated white field groups: three 58px label/value rows, then the billing-cycle fieldset with three equal 40px segments. The detail page uses a centered identity header followed by white information groups with 24px horizontal insets. Avoid dashboard grids and stacks of floating cards.

The list top bar owns the right-aligned Add action. The add page title is explicit; the detail page keeps the title area quiet because the service identity immediately below carries the page heading. Static billing history and payment information remain plain rows without a chevron, button role, or link styling.

The sandbox console mounts into a sibling browser root, above and outside the simulator. At desktop widths, a 404px-maximum drawer sits 16px from the top, right, and bottom; its non-shrinking 128px graphite header leads into a flexible, independently scrolling paper body containing the boundary note. The closed-state trigger sits at the top-right browser edge and disappears while the drawer is open. This topology must never resize, cover by ownership, or enter the simulated phone's application shell.

At 820px and below, the trigger moves to the bottom-right and the drawer becomes an 8px-inset near-full-screen sheet with a 14px radius. The phone remains governed by its independent 360×800 scaling. The console adapts around it rather than introducing a desktop/mobile redesign inside the phone.

**The Outside-the-Phone Rule.** Operator controls live in the browser layer, use a separate mount root, and act on real runtime data without becoming an icon, route, or surface inside the simulated device.

## Elevation & Depth

Gray gutters and fine dividers do most of the grouping. The transfer message and existing chat bubbles use the incumbent small shadow: `0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)`. Wallet groups and the amount panel remain flat.

Auto-renew list rows, field groups, detail groups, and cycle segments also remain flat. Use the gray canvas, white surfaces, hairline separators, and the selected segment's pale green tint to express structure. Only the centered cancellation dialog separates from the page with a 50% black scrim; it does not add a decorative card shadow.

Keypad and transfer actions darken on press (brightness 0.95). Chat send uses its existing short transition (200ms, ease-in-out) and pressed opacity (0.8). The pending contact reply is a white bubble with three pulsing dots, staggered by 120ms; it remains secondary to real messages.

The console is flat within the drawer: borders, paper contrast, and tinted state bands establish hierarchy. Depth is reserved for the browser-layer affordances—a compact shadow under the trigger and one stronger, diffuse shadow under the open drawer. Hover lift is limited to one pixel on the trigger; internal cards do not float.

Drawer motion uses a 260ms decelerating horizontal entrance and a shorter 150ms fade. The trigger uses the same restrained deceleration. Under reduced-motion preference, transitions collapse to 1ms and the running spinner slows rather than forcing full-speed motion.

**The Reserved Elevation Rule.** Use strong elevation only to separate the operator drawer from the simulator. Inside the drawer, use tonal layering and hairline borders, not nested card shadows.

## Shapes

Compact chat and receipt corners use the card radius; chat avatars use avatar radius. The amount panel rounds only its upper corners. Round coin and transfer-icon containers are supporting pictograms, not oversized decorative illustrations. The transfer card has an orange body and a near-white footer for its type and optional note.

Auto-renew field groups and information rows have square outer edges and read as settings sections, not cards. The only repeated 6px corners are controls: billing-cycle segments and the green confirmation button. Service markers are circles at 44px in the list and 64px in detail. The confirmation dialog is a compact 300px white surface with a 12px corner radius; its action bar remains flat and divided.

The console uses a stepped utility geometry: a pill for the edge trigger and environment badge, a gently rounded 16px drawer, 14px operation cards, and 10–12px controls and icons. These corners soften dense operator content without making it playful. State regions share the operation card's outer clipping rather than stacking independent floating cards.

## Components

### Amount input and keypad

Keep the labeled native input with `inputMode="decimal"` so physical keyboard entry, paste and the on-screen keys feed the same amount state. Normalize to at most six integer digits and two decimal places; the backend validates positive cents, the balance and the transfer limit.

Show the recipient's name, WeChat ID and avatar before the amount. The optional note is capped at 60 characters. Show either the available balance or an adjacent error with `role="alert"`. Submission is disabled for an empty/nonpositive amount or while submitting; the processing label makes that state explicit.

### Transfer message

A 232px orange group shows a transfer icon, formatted amount and pending/received/refunded text, with an optional note in its footer. It is a status group, not a link to an unimplemented detail screen. Sender alignment and avatars follow the existing chat layout.

**The Shared Financial State Rule.** Drive wallet balance, wallet records, ledger entries and chat transfer messages from the same transfer operation and ID. Status updates must update the matching chat message and wallet record together; do not hard-code a success receipt independently.

The current store adapter writes the balance change, ledger entry and chat message together. The demo receipt advances from pending after a simulated delay; this is not confirmation from a real payment service.

### Wallet summary and balance detail

The wallet balance row reads the same cent balance shown by the amount page and balance detail. Detail rows show recipient/direction, explicit state, date and signed amount. Incoming rows use green accents and a plus sign; outgoing rows use the expense treatment and a minus sign.

**The Honest Control Rule.** Unsupported actions must be explicitly disabled and accompanied by clear availability text. Wallet menu items without a route are non-interactive rows with `aria-disabled` and no chevron or pressed feedback. Recharge and withdrawal are disabled buttons and share an explanatory note. Do not imply that those operations can complete in the demo.

### Chat input and contact reply

Retain the existing white expanding textarea and green send control. The pending reply uses the contact's avatar and an accessible typing description, and is cleared when the request finishes.

Keep AI service credentials out of frontend code and settings. A configured remote endpoint must be an application backend proxy; the browser sends the conversation request to it without a provider API key. With no remote endpoint configured, the current implementation uses deterministic local replies. This integration contract must not be converted into a new user-facing banking permission or a claim that an AI reply executed a transfer.

### Auto-renew authorization list

Show only records whose automatic renewal is active. Each row is a genuine navigation control and presents the service name first, then merchant and localized activation date. The circular service marker may use the merchant tone mapping; no other part of the row inherits that color. The right-aligned top-bar Add action opens the creation flow. When there are no active authorizations, replace the list with a centered empty state and explanatory hint.

Until it has a real destination, the support-center label remains muted static text without a button role, blue link styling, pressed treatment, or fabricated chevron.

**The Active Authorization Rule.** The management list represents effective automatic-debit authorizations, not historical subscriptions or a financial dashboard. Filter inactive records from the list and make status explicit in detail.

### Auto-renew add form

Use one full-width white group for service name, merchant, and renewal amount. Labels hold an 88px column; values and placeholders remain left aligned. The decimal amount input accepts at most two fraction digits. A second white fieldset presents monthly, quarterly, and yearly as equal segments with `aria-pressed`; selected state combines green border, green text and a pale green fill.

The note below the fieldset is quiet 12px explanatory copy. The full-width green confirmation button is enabled only when both text fields are non-empty, the amount is positive, and no submission is running; its disabled state uses the incumbent pale green. Errors sit adjacent to the form with `role="alert"` rather than appearing as a detached toast.

### Auto-renew detail and cancellation

Lead with the circular merchant marker, service name and renewal cadence. Information groups disclose current status, activation time, account, service description and payment method as label/value pairs. Static payment and billing-history information is not decorated with arrows or blue button styling.

“关闭扣费服务” is a quiet blue entry on a neutral gray surface, not a destructive-looking filled button. Selecting it opens a centered modal that states the consequence before the user can end authorization. “再想想” is the safe action and receives initial focus; “仍要关闭” alone uses danger red. Constrain Tab focus within the two enabled actions, close on Escape, and restore focus to the invoking control after dismissal. While cancellation runs, disable both actions; expose any bounded failure inline with `role="alert"`.

**The Deliberate Cancellation Rule.** Ending an effective debit authorization always requires a consequence statement and a second explicit action. Initial focus stays on safety, danger color belongs only to the final confirmation, and keyboard focus never escapes or disappears.

### Sandbox console drawer

The closed trigger is a compact graphite pill with a shield icon and explicit “沙箱控制台” label. The open drawer begins with a graphite header containing the tool title, local-environment status, boundary statement, and close control. The paper work area groups each application domain into a bordered operation card; the footer repeats that actions affect only the current browser tab.

The reset row names the exact action before confirmation. Confirmation expands in place as a warm warning band and states both what will change and what will not change. Cancel remains neutral; the final action alone receives destructive red. Running disables both choices, keeps the drawer open, and changes the action label to a progress phrase. Success reports conversation and restored-message counts; error states say that other data was not modified.

Focus moves to the close control when the drawer opens, to the alert dialog when confirmation appears, and back to the trigger after the drawer closes. Escape closes the drawer unless a reset is running. All drawer buttons and the trigger use the same 3px blue `:focus-visible` ring with a 2px offset; hidden content is both inert and `aria-hidden`.

**The Scoped Destruction Rule.** A destructive control must name the data domain, explain inclusions and exclusions before execution, require an explicit confirmation, block dismissal while running, and end with a verifiable count or a bounded failure message.

**The Focus Return Rule.** Opening, escalating to confirmation, and closing each have an intentional focus destination. Visual hiding never substitutes for removing inactive controls from the accessibility flow.

### Sandbox finance testing

`sandbox/FinanceTestPanel.tsx` and `sandbox/sandbox-console.css` extend `sandbox-console-operator-drawer-v1` with live WeChat and Alipay balances, active-authorization counts, four scenario presets, confirmed balance settings, clock advance, and real settlement. The operator works from the same runtime state as the phone. Preparation and settlement remain separate actions; settlement reports charged amounts and insufficient-balance counts. Undo is available only while the reversible settings snapshot remains valid; intervening financial changes block restoration. The expandable history keeps the latest ten successful operations in the current panel session.

Keep the incumbent warm paper and graphite palette. Live balances use two columns and 20px tabular figures; sections use flat dividers, 14px headings, and 12–13px supporting copy. Native `select` controls choose scenarios and day increments; native `details` disclose balance editing and history. Finance inputs and buttons use 8px corners and a minimum 44px height; summaries, the drawer trigger, close control, and reset confirmation actions also retain 44px minimum targets. Graphite filled actions signal confirmation, with warm inset previews and textual status feedback. The preview receives focus, disables the other finance controls, and returns focus to its initiating control after dismissal, falling back to an enabled control when necessary. Inputs, selects, summaries, and preview containers share the existing blue focus ring.

## Do's and Don'ts

### Do

- Do preserve WeChat's gray-white surfaces, green actions and orange transfer receipt.
- Do support both physical input and on-screen keys with one amount state.
- Do show amount, recipient and explicit financial status together.
- Do derive all financial displays from the shared transfer state.
- Do show only active auto-renew authorizations in the management list and expose cadence and status in detail.
- Do use full-width white field groups, the 12/13/14/16/18px ladder, and green confirmation for auto-renew creation.
- Do place initial dialog focus on “再想想”, constrain focus, support Escape, and restore focus after cancellation is dismissed.
- Do disable unsupported actions and state their availability.
- Do keep remote AI credentials on the backend and retain the local reply mode.
- Do keep the sandbox console in its browser-level root and the phone canvas unchanged.
- Do reserve WeChat green in the console for identifying the controlled app or its connected state.
- Do describe destructive scope before confirmation and report a countable outcome afterward.
- Do preserve focus transfer, focus return, Escape behavior, and reduced-motion handling.

### Don't

- Don't apply this scoped palette to other MobileGym apps.
- Don't use a receipt color alone to communicate completion.
- Don't use a decorative keypad in place of an editable input.
- Don't claim a real payment or provider-confirmed receipt from simulated state.
- Don't turn auto renew into a banking dashboard or stack its settings groups as floating cards.
- Don't use merchant colors outside circular service markers.
- Don't add fake chevrons, button roles, or blue action styling to static subscription information.
- Don't end an active authorization without the consequence dialog and a separate danger confirmation.
- Don't put an API key into frontend configuration or account settings.
- Don't place sandbox controls inside the simulated phone or style the console as another mobile app.
- Don't use destructive red for navigation, environment status, or decorative emphasis.
- Don't let the drawer close, cancel, or accept a second action while a reset is running.
- Don't communicate reset success with color alone or without the restored conversation and message counts.
