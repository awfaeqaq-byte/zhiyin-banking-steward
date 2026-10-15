---
name: 知银 · 首页 UI 预览
description: 浅蓝白底、真人管家与连续对话的局部首页样式记录
colors:
  ink: "#133346"
  teal: "#008a87"
  teal-label: "#007d7c"
  canvas: "#f1fafc"
  paper: "#fff"
  muted: "#506d7c"
  line: "#d5ebee"
  user-message: "#dff2f8"
  result: "#eaf8f7"
typography:
  body:
    fontFamily: '"PingFang SC", "Microsoft YaHei", system-ui, sans-serif'
    fontSize: "14px"
    lineHeight: 1.7
  identity:
    fontSize: "22px"
    fontWeight: 650
    lineHeight: 1.35
  amount:
    fontSize: "clamp(25px,5vw,30px)"
    fontWeight: 650
    lineHeight: 1.3
    letterSpacing: "-0.03em"
rounded:
  button: "10px"
  card: "14px"
  composer: "16px"
spacing:
  compact: "8px"
  content-gutter: "18px"
  header-gutter: "20px"
components:
  asset-snapshot:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.card}"
    padding: "11px 13px 10px"
  composer:
    backgroundColor: "{colors.paper}"
    rounded: "{rounded.composer}"
    padding: "5px 6px 5px 9px"
  illustration-result:
    backgroundColor: "{colors.result}"
    textColor: "{colors.teal-label}"
    rounded: "{rounded.button}"
    padding: "10px 9px"
---

# Design System: 知银 · 首页 UI 预览

## Overview

这是 2026-10-12 的本地 AI 原生首页预览，依据用户提供的首页参考与已实现源码提取。品牌导航、可选真人管家、紧凑银行资产和连续对话构成同一手机页面。局部记录只约束这一预览；根 `DESIGN.md`、`PRODUCT.md`、经典款及其他业务页保留各自既有基准。

事实来源：`src/components/home-ui-preview.css`、`home-preview-header.tsx`、`home-reply-visual.tsx`、`steward-chat-home.tsx`、`src/lib/compound-example.ts` 与 `src/App.tsx`。交互范围与验收证据见 `.impeccable/surfaces/home-ui-preview.md`。

## Colors

### Primary

青绿用于发送、链接、展开入口和可见键盘焦点；较深青绿用于小型 AI 标识和图解强调数字。

### Neutral

浅蓝画布承载白色资产面与管家气泡，墨蓝表达正文和金额，灰蓝表达范围和辅助文字。用户消息采用浅蓝面，算术结果采用浅青绿面。分隔依靠细线，不把资产分类色当作操作主色。

## Typography

沿用系统中文无衬线字体。手机管家正文使用 body 角色，641px 起增至 15px；管家身份比普通消息署名突出，资产金额使用 amount 角色。金额启用等宽数字。

消息署名为 12px，图解标题为 14px、桌面为 16px。导航与紧凑说明为 10–11px；这些尺寸描述当前预览，不扩展为全站文字规范。

## Layout

顶栏上限 800px，手机左右内距使用 header-gutter，641px 起为 28px；对话内距使用 content-gutter。固定会话入口与导航、管家身份依次排列；首页不再展示资产快照，资产从底部导航进入。页框固定在视口内，顶栏不参与滚动，中部对话独立滚动，输入区固定并包含底部安全区。

360px 以下顶栏内距为 14px、对话内距为 12px；陪伴短句隐藏，图解结果落到柱图下方。手机导航保留日程、订阅、我的。资产展开增加顶栏高度，较长回复通过中间区域自然滚动查看，不压缩成一屏。

## Elevation & Depth

主要使用浅色叠层和细边框。资产快照与消息默认不追加投影；输入区聚焦时使用轻微青绿阴影（`0 2px 12px #008a8714`），焦点轮廓为 2px、外偏移 3px。

## Shapes

资产面采用 card 圆角。管家气泡左上角为 2px，其余为 14px；用户气泡右下角为 3px，其余为 14px。输入区采用 composer 圆角，发送按钮为圆形，管家头像为圆形真人肖像。

## Components

**资产入口：**2026-10-15 按用户要求移除首页总资产卡片；余额、持仓及隐私控制继续由原资产页提供，底部「资产」入口不变。

**对话：**管家消息带当前头像、名字和 AI 标识，用户消息右对齐，沿用同一输入框。金融操作仍通过既有明确确认流程。头像与装饰图标不重复朗读，导航、资产控制及说明展开入口保留至少 44px 命中范围。

**复利图解：**只展示回复中已验证的一次存入算术链，逐年金额、柱图、终值及相对单利差额共同表达含义。完整原文留在原生可展开说明中；条件不匹配或算术不一致时使用原文。不得为任意金融回复补造增长图。

减少动态效果时关闭首页动画与平滑滚动；可见焦点和文字状态继续保留。

## Do's and Don'ts

- Do 保留“银行沙箱账本”和算术示意的范围说明；未知或读取失败时不给出虚构金额。
- Do 保持知银、用户叶先生与动态选择的宁宁／阿衡身份区分。
- Do 将金额隐藏、资产展开和查看资产做成独立可访问操作。
- Do 在固定输入区下方保留“涉及资金的操作仍需你确认”。
- Don't 把算术假设写成银行或理财产品收益，或把图表写成用户真实资产增长。
- Don't 增加无实际功能的语音按钮，或将本次首页构图推广到其他页面。
