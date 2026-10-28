---
version: 1
slug: "cross-scene-continuation"
primary_target: "src/components/expense-notebook.tsx"
related_targets: ["src/components/expense-notebook.css", "src/components/occasion-planner.tsx", "src/components/occasion-planner.css", "src/components/chat-task-cards.tsx", "docs/cross-scene-continuation.md"]
---

# 跨场景费用与筹备变更 · 局部表面记录

## Scope and direction

2026-10-15 增量采用 Operate 模式，在现有浅蓝白、墨蓝、青绿界面内延展同一事项的连续对话：从首页进度就地整理费用、查看来源、调整筹备并单独授权。本记录仅覆盖费用与变更组件，不构成全页重设计或根设计系统的新规范。业务关联及后台运行边界见 `docs/cross-scene-continuation.md`。

## Composition and behavior

事项进度卡保留事项名称、阶段、业务记录和核对时间；存在待记入实付时提供“整理本次费用”。该入口整理同一事项的原订单资料，进度卡本身不授权付款或预算操作。

费用候选在浅青色容器内逐笔显示商品、商家、原实付和已退款；右侧金额明确标为“本次记入”，表示实付减退款的净额。首次只补微信群和参与人，已有账本先按本次参与人平分。点击“确认记入”才入账，尚未发起收款；用户仍可在对话中调整承担人。已入账条目保留“订单与付款依据”折叠项，包含商家、付款时间、订单及付款编号。

候选容器使用现有局部实现的 16px 圆角与 14px 内边距；金额右对齐并使用等宽数字，来源编号允许换行。退款提示用棕黄色文字说明需要核对的差额。未进入收款批次的费用随退款更新净额；已有批次保留原分摊与回执并使旧收款入口失效，不能因原款收齐就把退款差额标记处理完成。来源暂不可核对时保留记录并阻止旧金额收款。

筹备变更紧接当前方案展示“本次变更”：用前后值、移除或新增商品、已付金额及剩余预留说明影响，再进入“确认变更并调整预留”的二次授权。示例为已付蛋糕 206 元保留、移除未下单鲜花，预算由 800 元降到 300 元，剩余预留由 594 元变为 94 元。已付款原单不会重复扣款，日历生日日期不随送达安排变化。

变更清单采用标签与内容两列、细分隔线及可换行文字。涉及已下单商品、收货信息或送达时间时，草案显示阻断原因和原订单入口；原平台处理与退款核对前不能应用。已移除商品的退款旧单仍可展开查看。

## Reference and raster provenance

本轮沿用既有产品组件与样式，未新增图像素材。以下文件是 390px 隔离组件的渲染证据，使用合成业务数据与实际产品组件：

- `.impeccable/review/cross-scene-depth/scene-mobile.png`：事项续接与费用入口。
- `.impeccable/review/cross-scene-depth/expenses-mobile.png`：实付候选与记入净额。
- `.impeccable/review/cross-scene-depth/imported-mobile.png`：入账记录与来源证据。
- `.impeccable/review/cross-scene-depth/amendment-mobile.png`：筹备变更差异。
- `.impeccable/review/cross-scene-depth/amendment-confirm-mobile.png`：变更二次授权。

## Proof and limits

本轮 UI reviewer 仅评审上述局部截图。唯一要求修正的金额语义问题已通过区分原实付、退款和本次记入净额解决，复核为 resolved / ship。该结论不覆盖完整首页，也不表示已经完成真实模型对话的端到端验收。

知银全量 804 项测试、手机沙箱 412 项测试通过；金额文案修改后 8 项定向组件回归通过。类型检查与完整手机构建通过，改动范围 lint 无错误，保留 4 条既有 hooks 依赖提示。新增共享资料与来源抽取模块此前行覆盖率为 100%，该数值不代表整应用覆盖率。

实现基于现有沙箱商家、订单和支付能力，没有新增真实商家或支付接入，也不会自动退款、退差额、补付款或重新下单。后续若要扩大验收，应补完整首页内同一事项的真实模型连续对话流程；本轮组件截图和自动化结果不能替代该验收。
