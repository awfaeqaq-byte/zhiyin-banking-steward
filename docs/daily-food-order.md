# 日常点餐：功能与维护说明

知银在首页统一对话中整理日常点餐方案，后台以 `food` 事项保存进度。菜单、商品图、订单和微信／支付宝支付来自 MobileGym 浏览器手机沙箱；自然语言推荐使用现有模型代理。尚未接入真实微信、支付宝或商家 API，不能据此宣称具备真实世界的外卖下单、扣款或配送能力。

## 使用流程

1. 启动手机沙箱并打开知银，在首页交代“帮我推荐奶茶，用默认地址”等需求。系统识别日常点餐意图；旧 `general` 点餐事项续聊时保留原事项 ID，修复为 `food`，不另开一段聊天。
2. 模型依据沙箱外卖 App 的现有菜单推荐商品，必要时在原对话中给出选项。方案就地展示商品图、份数、口味备注、地址和费用，状态为“点餐方案 · 未下单”。此时没有订单，也没有扣款。
3. 可直接加减份数，或继续在首页对话要求换商品、改备注或地址。模型仅改商品／份数且省略地址、联系人时，保留用户已交代的自定义收货信息。未指定收货信息则沿用沙箱默认值。
4. 本人核对后点击“核对后去支付”，生成 `PENDING_PAYMENT` 沙箱订单并进入外卖 App。生成订单不扣款，也不改动用户原有购物车；用户在外卖 App 选择微信或支付宝，再完成支付确认。
5. 已生成订单后，知银内不能改订单本体；“继续付款”或“查看订单”打开原订单。支付后回到知银，前台事件触发菜单与本事项订单记录刷新，展示外卖 App 的实际状态。

独立打开根项目页面时没有手机桥接，应提示从手机沙箱进入；不能补造菜单或可支付订单。

## 数据与授权边界

- `foodQuote` 只使用实际菜单商品 ID 和价格，以整数分（cents）计算商品金额、配送费、优惠和实付；模型不提供权威金额。份数范围为 1–20，方案最多 8 个不同商品。
- 模型输出经结构校验，拒绝未知商品、非法份数、附带订单号的推荐和非法字段。模型推荐文案由菜单生成；“已下单”“支付成功”“扣款成功”、余额、积分等不可信模型话术不会作为交易事实展示。
- `prepare` 必须带本人确认标志，沙箱端重新读取菜单核价并比对报价；菜单费用变化或报价伪造时拒绝生成订单。同一订单 ID 内容不一致、跨事项访问或同事项重复生成活动订单也会被拒绝。
- 桥接核对同源、指定父／子窗口、协议版本、请求 ID 和操作白名单；手机端仅在知银处于前台时处理请求，在途相同请求去重。业务失败返回错误，超时保留核对提示，不伪装成成功。
- 下单重试复用原订单 ID；沙箱支付后端按订单支付记录保持幂等，重复支付不重复扣余额或写账单。微信零钱与支付宝余额支付会实际更新沙箱资金状态，并各写一条对应沙箱账单。
- 任务方案及 `orderId` 随事项进度持久化，外卖订单保存于沙箱外卖状态。会话／界面重载不代表重新授权；恢复已有订单时以外卖记录为准。保存失败保留原方案，模型失败不触发下单。

“实际更新”指沙箱状态变更，不能与外部账户资金或商家收款混用。

## 维护入口

| 文件 | 职责 |
| --- | --- |
| `src/lib/food-order.ts` | 点餐意图识别、数据校验、整数分核价、菜单约束下的模型推荐与文案防护 |
| `src/lib/food-order-bridge.ts` | 知银页面向手机父窗口请求菜单、生成／打开订单、读取记录；校验响应并处理超时 |
| `src/components/food-order-planner.tsx` | 对话内方案、份数修改、保留收货信息、本人确认按钮、原订单恢复与前台刷新 |
| `src/components/food-order-planner.css` | 点餐现场样式、窄屏布局、触控目标与减少动态偏好 |
| `src/components/steward-chat-home.tsx`、`steward-workspaces.tsx` | 首页统一对话接入、后台事项进度和旧事项类型修复 |
| `src/lib/workspace-service.ts`、`workspaces.ts`、`task-progress.ts`、`task-progress-schema.ts` | 事项分流、校验、持久化及 `food` 进度数据 |
| `mobilegym/apps/Zhiyin/phone-session.ts` | 可信前台会话校验、操作白名单、在途去重和错误结果返回 |
| `mobilegym/apps/Zhiyin/food-order-access.ts` | 沙箱菜单与商品图读取、再次核价、待付款订单生成、事项隔离和原订单跳转 |
| `mobilegym/apps/FoodDelivery/orderModel.ts`、`payments/backend.ts` | 订单模型中的 `stewardTaskId`／备注及既有沙箱支付、余额账单和幂等逻辑 |

界面沿用当前白底、墨色文字与青绿强调，复用现有 `Button` 和外卖商品图。商品行、地址、费用与授权动作在原对话就地呈现；点餐选项继续使用首页输入流程。这里记录的是本功能的表达与维护约束，不应将其布局推广成全局设计规则，或改写 `DESIGN.md`／`PRODUCT.md`。

维护时优先保持菜单与模型数据边界、本人确认与实际支付边界、事项与订单关联，以及失败后的原方案／原订单恢复。新增菜单字段、支付方式或桥接操作时应同步相关校验和回归；不要仅修改模型提示词。

## 验证记录与复验

本次交付验证快照：根项目 433 项测试全部通过；相关 MobileGym 沙箱回归 47 项通过，包含知银订单的微信／支付宝余额账单幂等，以及可信前台桥接、拒绝越权来源／后台／非法操作、在途去重和错误返回。根项目构建与 `phone:sync` 已通过。此前新模块定向覆盖率为行覆盖 100%、分支覆盖 83.89%，这不是全项目覆盖率。

本次改动文件的定向 lint 与根／MobileGym TypeScript 检查通过。全量根 lint 仍有三个既有无关问题：`scripts/expense-notebook-smoke.mjs` 的 `no-empty`、`src/lib/reply-choices.ts` 的 `no-useless-escape`、`src/lib/steward-profile.test.ts` 的 `prefer-const`。生产依赖审计根项目为 0，MobileGym 的 `react-router`／`react-router-dom` 仍有 2 项 high 告警；本次没有新增或升级依赖，不能视为全项目安全审计通过。

已完成实际模型只读推荐验证；没有将浏览器 UI 中实际支付扣款记为已实测。沙箱扣余额与账单幂等由自动化测试验证。375×812 手机与 1280×900 桌面视口截图审查通过，完整页面产物为 `.impeccable/review/food/mobile.jpg`（375×817）与 `desktop.jpg`（1280×905）。

根项目定向复验：

```bash
npm test -- src/lib/food-order.test.ts src/lib/food-order-bridge.test.ts src/components/food-order-planner.test.tsx src/components/steward-food-flow.test.tsx
npm run build
npm run phone:sync
```

从 `mobilegym` 目录运行本次相关回归：

```bash
npm test -- --run tests/zhiyin-food-order.test.ts tests/zhiyin-session.test.ts tests/foodDeliveryPaymentBackend.test.ts tests/foodDeliveryPaymentUi.test.ts tests/foodDeliveryOrderFlow.test.ts
```

完整根项目复验使用 `npm test`；定向覆盖率复验在根目录运行：

```bash
npx vitest run src/lib/food-order.test.ts src/lib/food-order-bridge.test.ts src/components/food-order-planner.test.tsx src/components/steward-food-flow.test.tsx --coverage --coverage.include=src/lib/food-order.ts --coverage.include=src/lib/food-order-bridge.ts --coverage.include=src/components/food-order-planner.tsx
```

演示时核对“推荐前无订单／无扣款 → 修改方案 → 本人确认生成待付款订单 → 外卖 App 确认支付 → 返回知银更新状态”。测试素材使用沙箱默认数据，不在说明或截图中记录密钥、私人聊天、真实联系方式或真实账户信息。
