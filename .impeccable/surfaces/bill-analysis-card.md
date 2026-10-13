---
version: 1
slug: "bill-analysis-card"
primary_target: "src/components/bill-analysis-card.tsx"
related_targets: ["src/components/bill-analysis-card.css", "src/components/steward-chat-home.tsx", "index.html"]
---

# 首页账单分析卡 · 局部表面记录

## Overview

账单卡接续既有三类任务卡，仅接入 `homePreview`；`index.html` 的 TASK REPLIES 已同步。固定事实来自真实 `BillAnalysis` 与 `billReplyFacts`，原意图识别和模型流程保留。

## Colors

继承 `docs/home-ui-preview/DESIGN.md` 及 `conversation-task-cards.md` 的白底、墨蓝正文与青绿操作。新增部分记录警示色 `#865416`，对白底对比度 `6.38:1`。复用现有人物素材，无新栅格资产。

## Layout

沿用消息气泡，不追加投影。按范围、合计、消费结构、最大消费、折叠说明和分析入口排列。合计两列；分类最多五项并附金额、占比与细条。消费金额为 `clamp(22px,6vw,28px)`；明细入口至少 `44px` 高。

## Components

普通入账、退款和转账分列；退款不抵扣消费。最大消费可进入原解释入口。仅在等长前期数据可用且 `coverageIncomplete=false` 时比较，并注明两期完整性未知。部分记录显示小计与警示。读取、错误、日期待确认、未授权或空记录时不展示金额结论；空记录不代表没有消费。

原平台筛选、明细与模型补充解读默认折叠，范围改变后隐藏旧解读并提示重新生成。沿用既有分析回调、禁用状态与键盘焦点，不新增执行能力。

## Do's and Don'ts

保持数据来源和范围可见，不把示例数据或已返回记录写成全部账户。

2026-10-13：完整回归 `125` 文件、`689` 测试通过；新卡行／函数覆盖率 `100%`、分支 `93.02%`；TypeScript、`phone:sync`、新模块 lint 通过。检测器 `21` 条建议主要来自继承配色差异，无阻断，复核为 `ship`。

证据位于 `.impeccable/review/bill-analysis-card/`：`preview-user.png` 为 `658px` 浏览器中的 `390px` 示例列；`live-top.png`、`live-details.png` 为真实只读查询的 `360px` 手机、约 `290px` 聊天卡。预览第四个“账单”页签标注示例数据。结论仅覆盖手机；IAB 宽度调整未生效、Chrome 不可用，桌面未验收，无效宽度截图已移除。
