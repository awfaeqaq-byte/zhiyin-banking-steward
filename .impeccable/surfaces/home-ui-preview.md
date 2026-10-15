---
version: 1
slug: "home-ui-preview"
primary_target: "src/components/home-preview-header.tsx"
related_targets: ["src/components/home-ui-preview.css", "src/components/home-reply-visual.tsx", "src/components/steward-chat-home.tsx", "src/lib/compound-example.ts", "src/App.tsx", "index.html"]
---

# 首页 UI 预览 · 局部表面记录

## Scope and direction

用户授权：“备份目前的版本，做一版新 UI 看看，就做个首页的就行了”。仅本地 AI 原生首页采用浅蓝白、墨蓝和青绿的参考方向；经典款和其他页面保留原样。局部视觉记录位于 `docs/home-ui-preview/DESIGN.md`，不替换根设计系统或产品约定。

`index.html` 的方向契约为：THESIS 将银行身份与连续管家会话结合；OWN-WORLD 为浅蓝白画布、墨蓝文字、青绿操作、真人头像和紧凑金额；STORY 为查看银行资产、收起明细、交代需求、核对结果、单独授权；FIRST VIEWPORT 为品牌导航、可选管家、紧凑快照、可滚动对话和稳定输入；FORM 为局部代码实现；FINISH 为修正、评审与局部文档闭环。

## Composition and behavior

2026-10-15 按用户要求移除左上角知银标志、名称及「更懂你的财富伙伴」，改为固定页头的「会话」菜单按钮；右侧保留日程、订阅和我的。会话抽屉开关由 App 管理，聊天滚动区不再重复放工具栏，新建对话保留在抽屉内。入口触控高度约46px，带展开状态和可见键盘焦点。实际沙箱聊天 scrollTop 从6396移至4836再返回时，按钮始终位于页头 top≈14px、left≈20px，草稿与后台处理组件不重建。

默认资产快照收起，金额来自现有银行沙箱状态与资产汇总。隐藏金额覆盖快照及展开明细；只读更新不构成资金授权，错误时不显示旧金额为可用最新资产。头像入口继续使用已有管家选择流程，名字与肖像随选择变化。

中间会话独立滚动，输入框与资金确认提示保持固定。后台工作组件在页面隐藏时继续挂载。首次加载会话按服务端顺序恢复同 ID 的最新内容，并选中最新管家回复；即使服务端回复 ID 与缓存相同，也触发首次定位，使回复身份和开头可见。长图解的下半部分通过自然滚动阅读，不强求首屏全部展示。

复利图解仅接受连续 2–10 年、单次本金、相同增长率且逐年到分校验一致的原文算术链；定投或追加存款、数据不一致等情况保留普通文字。图表标明假设，原文在“查看完整文字说明”中保留。界面没有虚构资产收益、实际收益率承诺或无功能语音按钮。准备金融动作与最终授权仍分开。

## Reference and raster provenance

本轮用户参考：`/var/folders/2t/63tqcw3n5wvbtk8mcqbr5nyc0000gn/T/codex-clipboard-067ee19a-695e-48f1-86d2-c6576926cb5b.png`。标志及图表为代码绘制；真人肖像复用仓库既有 `src/assets/ningning.png`、`src/assets/aheng.png`，本轮未生成或新增人物栅格素材。

验收图为 `.impeccable/review/home-ui-preview/mobile-phone.png` 与 `mobile-expanded-phone.png`：来自本地手机预览，分别展示紧凑与展开资产状态，是渲染证据，不是界面素材。

## Proof and limits

2026-10-15 固定菜单调整：新增 App 交互回归先验证失败，再验证页头打开/关闭/重新打开抽屉、单一入口和草稿保留。全量722项测试、类型检查及完整手机构建通过；触及代码lint无错误、4条既有hooks依赖提示。页头与工作区合计行覆盖95.16%、分支86.31%、函数81.25%。实际390px手机无横向溢出，截图为 `.impeccable/review/fixed-conversation-menu/home.png` 与 `sidebar.png`，均为实际沙箱截图裁剪，无图像生成或业务数据重置。

2026-10-12 修正后完整回归通过（113 个文件、625 项测试）；TypeScript、手机同步构建与范围内 lint 通过。首次恢复与同 ID 更新定位有独立回归覆盖。

视觉评审认定参考方向下的局部预览构图连贯；最后一次 finish reviewer 为 `ship`，仅对会话恢复修正评分。该结论不表示全站重设计、所有模型回复可靠，或完成了更高视觉上限的评定。没有新增真实银行接入或资金执行能力。

## Local backup

预览分支为 `codex/home-ui-preview-20261012`；基线备份分支为 `codex/backup-home-ui-20261012`，基线提交 `12de2d7a677abe4517b68756f07077cad2e671e9`。归档 `output/backups/zhiyin-before-home-ui-20261012.tar.gz` 保存基线 Git 跟踪文件，不含秘密、运行数据、未跟踪文件或依赖。切换已提交版本后运行 `npm run phone:sync` 即可查看对应手机构建，不重置私人数据库。
