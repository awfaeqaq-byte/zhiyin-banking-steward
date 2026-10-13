---
version: 1
slug: "task-calendar"
primary_target: "src/components/task-calendar.tsx"
related_targets: ["src/components/calendar-components.tsx", "src/components/task-calendar.css", "src/App.tsx", "index.html"]
---

# 日程页 · 局部表面记录

## Overview

Operate。延续 `docs/home-ui-preview/DESIGN.md` 的首页视觉，服务于查看、记录和核对安排。月历定位，议程阅读，详情原地展开。`index.html` 的 CALENDAR 契约对应本页；不替换根设计系统，无新栅格资产。

## Colors

浅蓝白页面 `#f1fafc`，白色月历及事件底，墨蓝正文 `#133346`、辅助文字 `#506d7c`、青绿操作与选中态 `#007d7c`、分隔线 `#d5ebee`。日期标记另用蓝、暖棕、粉紫、橄榄色区分来源，事件同时提供文字标签。

## Typography

沿用中文系统字体，数字等宽。正文14px、事件标题15px、金额18px、月份20px、页标题23px；辅助字11–13px。表单输入16px，长标题和说明换行。

## Layout

内容最大960px，桌面月历与议程按 .95:1.15 分栏、间隔28px。700px及以下上下排列、间隔18px、页边距14px；350px及以下页边距6px。月历从周一开始，收起保留选中日期所在周。编辑器位于月历前，聚焦标题，关闭或保存后焦点回添加按钮。

## Elevation & Depth

平面白底与细分隔线形成层次，不另加阴影。事件为连续列表，详情在条目内展开。

## Shapes

月历与编辑器14px圆角，普通按钮10px。按钮、日期格至少44px高；320px实测日期格宽44px、360px约45.7px。焦点轮廓2px青绿。状态过渡160–180ms，减少动态偏好关闭过渡。

## Components

- `CalendarDatePicker`：月/周、日期标记、今天及前后月，选中与今日有可访问状态。
- `CalendarEventCard`：时间、类型、状态、金额，展开来源和说明；提醒、生日可维护，金融与筹备入口回原业务流程。
- `CalendarAgendaGroup`：近期按日期及星期分组；结束记录单独折叠。
- `TaskCalendar`：当天/30天、类型筛选、真实数据和编辑保存；区分错误与空态，生日投影覆盖跨年。
- 管家入口回首页填写日期草稿，不自动发送，支持同日重复交接。

## Do's and Don'ts

保持日期→事项→详情顺序，仅展示真实已知安排。续费到期不等于已扣费，提醒不授权资金操作。生日记录在日历、按年重复；普通提醒单次，系统推送尚未提供。完整行为及API见 `docs/task-calendar.md`。

2026-10-13 独立复核 `ship`，702项测试、类型检查、触及代码lint及手机构建通过。日历模块行覆盖100%、分支93.95%、函数85.71%。检测器29条均为建议，无阻断。

证据位于 `.impeccable/review/calendar-ui/`：`live-phone.png`、`live-birthday-editor.png` 为实际384px沙箱；`phone-360.png`、`phone-320-detail.png`、`desktop.png` 为标注示例数据的独立预览（桌面实际1273px）。均无横向溢出；复核记录 `finish-review.md`。正式数据与示例数据不可混淆。
