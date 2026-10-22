# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Inferred for this build: React, TypeScript, Vite, Tailwind CSS, and shadcn-style reusable components. The deliverable is a mobile-first responsive web prototype suitable for a later PWA wrapper.

## Users

Primary users are ordinary personal-banking customers, including people who may find traditional banking menus and financial terminology difficult. They need to understand their money, prepare banking actions, and stay in control without learning complex navigation.

## Product Purpose

“知银” is a personal AI banking steward. Through a user-selected steward, it turns natural-language needs into understandable plans, explains financial signals, and prepares banking actions for the user to review and authorize.

## Positioning

Unlike a generic banking dashboard or a financial chatbot, 知银 organizes a complete intent-to-action flow: understand the request, prepare a structured plan, explain its impact, request explicit user authorization, and expose a traceable result.

## Operating Context

The current deliverable is an interactive competition prototype using illustrative account, transaction, investment, risk, card, reminder, and preference data. The primary use context is a phone-sized browser, with responsive support for larger screens.

## Capabilities and Constraints

- The prototype must cover the home steward experience, spending analysis, investment planning, risk explanation, card controls, and steward/memory settings.
- Interactions should be demonstrable, but no real banking operation or external financial transaction is required.
- Every funds-related action must visibly require the user's confirmation.
- AI explanations may prepare actions but must not imply that an unconfirmed transaction has occurred.
- All financial figures in this build are illustrative demo data.

## Brand Commitments

- Product name: 知银.
- The steward is selectable rather than fixed. 宁宁 is warm and planning-oriented; 阿衡 is calm, direct, and analysis-oriented. Both have the same banking capabilities and safety boundaries.
- The supplied concept images are the visual reference: warm white surfaces, deep ink-blue typography, restrained teal accents, generous touch targets, and a calm private-banking tone.
- The interface should feel approachable without becoming childish or casual about money.

## Evidence on Hand

- `/var/folders/2t/63tqcw3n5wvbtk8mcqbr5nyc0000gn/T/codex-clipboard-53799126-8e85-4a0a-a026-99159e5fd72b.png`: primary home-screen concept.
- `/var/folders/2t/63tqcw3n5wvbtk8mcqbr5nyc0000gn/T/codex-clipboard-2a94e15c-f84b-4c56-a3df-6ff104027c41.png`: five secondary-screen concepts.
- `/var/folders/2t/63tqcw3n5wvbtk8mcqbr5nyc0000gn/T/codex-clipboard-60bf789d-5c71-4ff0-a59a-6aa6ba4a1243.png`: steward selection concept for 宁宁 and 阿衡.
- No production banking data, customer claims, or connected-bank capabilities are supplied; the build must not fabricate them.

## Product Principles

1. Natural language starts the task; structured review completes it.
2. The assistant explains and prepares, while the user authorizes.
3. Important exceptions outrank decorative analytics.
4. Banking trust comes from clarity, reversibility, and visible control.
5. Warmth belongs in the guidance; precision belongs in the transaction.

## Accessibility & Inclusion

Use readable Chinese typography, strong contrast, keyboard-operable controls, visible focus, reduced-motion support, and at least 44px touch targets. Do not rely on color alone for financial or risk status.


## 小店经营创新场景（第一阶段）

个人版六大功能仍是主线。新增“我的 → 我的小店”，面向同时经营小店的个人用户，复用首页统一对话。当前实现顾客扫码点单 → 店主核对并记录实际收款 → 菜品销量与收入 → 经营流水 → 首页经营分析快照。

- 顾客只取得公开菜单与自己的订单回执，不读取经营账本。店名、菜单和价格由店主核对；初始菜品可编辑，没有预造营业记录。
- 订单由服务端按菜单单价计算，提交后为待收款。店主登记收款、取消、全额退款和已发生支出；登记不会发起真实支付或退款。
- 今天、近 7 个自然日、全部三个范围按北京时间统计。收款、退款、支出按事件时间；销量排行使用期间已收款且当前未退款订单。现金差额不是利润。
- 首页“小店经营”事项独立分流，服务端从本地账本计算经营摘要；不依赖个人平台账单授权。历史卡片保留查询快照，不自动改写历史金额。
- 网络结果不明时保留原请求，店主和顾客均先核对同一请求回执，避免重复订单或记账。
- 当前为本地原型：浏览器 scope 用于账本隔离，并非生产商户身份认证。二维码需指向手机可访问的部署地址；localhost 只能本机预览。尚未接入微信商户支付、部分退款、库存、成本核算、税务、多员工权限；经营资金到期安排在后续阶段接入。
