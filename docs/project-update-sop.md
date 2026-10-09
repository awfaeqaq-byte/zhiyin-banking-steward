# 项目更新 SOP

> 适用项目：知银 · 个人银行智能管家  
> 基线日期：2026-09-29  
> 远端仓库：<https://github.com/awfaeqaq-byte/zhiyin-banking-steward>  
> 关联需求：[账单分析、理财操作、卡片管理需求文档](member-b-requirements.md)

## 1. 当前基线说明

本次核对得到的远端 `main` 提交为：

```text
621b58c6db73385fadb3d3172ecc337fcbd03d45
docs: document project progress and team delivery plan
```

本地目录 `zhiyin-banking-steward-main/` 没有 `.git`，属于解压后的代码目录，不具备分支、提交、拉取和回退能力。经核对，本地 `src/`、`server/`、`docs/`、`scripts/` 及主要根部产品文件与上述远端提交一致；本次新增需求文档和 SOP 除外。

最稳妥的正式开发方式是重新克隆到一个 Git 工作目录，再把本次新增文档复制进去。不要直接把长期开发放在无 `.git` 的解压目录中。

## 2. 一次性的工作目录准备

### 2.1 推荐方式：重新克隆

```sh
cd "/Users/yangjingxi/Documents/微众金融科技大赛"
git clone https://github.com/awfaeqaq-byte/zhiyin-banking-steward.git zhiyin-banking-steward-dev
cd zhiyin-banking-steward-dev
git switch -c feature/member-b-bill-invest-card
```

将本目录新增的两个 Markdown 文档复制到新仓库的 `docs/`，再执行：

```sh
git status --short
git add README.md docs/member-b-requirements.md docs/project-update-sop.md
git commit -m "docs: add member B requirements and update SOP"
```

复制前先用 `git status --short` 确认目标仓库状态，避免覆盖队友未提交内容。

### 2.2 必须沿用当前目录时

可以在当前目录建立 Git 元数据，但先备份本次文档，并在绑定远端前检查差异：

```sh
cd "/Users/yangjingxi/Documents/微众金融科技大赛/zhiyin-banking-steward-main"
git init -b main
git remote add origin https://github.com/awfaeqaq-byte/zhiyin-banking-steward.git
git fetch --depth 1 origin main
git add -A
git diff --cached --stat origin/main
git diff --cached origin/main
```

此时只检查，不要急着提交或覆盖。确认差异只有本人希望保留的文件后，再把当前分支接到远端基线：

```sh
git reset --mixed origin/main
git switch -c feature/member-b-bill-invest-card
git status --short
```

如果差异中出现不认识的代码、私有数据或大量二进制文件，立即停止并先与队友核对。

## 3. 首次安装与启动

推荐使用 Node.js 22.13+ 的受支持 LTS。当前 Node.js 23.11.0 可以完成构建和测试，但部分依赖会提示引擎版本不受支持，因此不作为团队统一环境。

```sh
npm ci
PUPPETEER_SKIP_DOWNLOAD=true npm --prefix mobilegym ci
npm run phone:dev
```

默认完整手机地址为 <http://127.0.0.1:3000/>。如果 3000 被其他进程占用，先检查：

```sh
lsof -nP -iTCP:3000 -sTCP:LISTEN
```

不要直接结束不认识的进程。临时开发可以在完成 `npm run phone:sync` 后改用其他端口：

```sh
npm run phone:sync
npm --prefix mobilegym run dev -- --host 127.0.0.1 --port 3001 --strictPort
```

知银只通过 MobileGym 手机入口运行。修改 `src/` 后执行 `npm run phone:sync`，再刷新手机模拟器；跨 App 授权、微信／支付宝账单和沙箱模型配置均在该入口测试。

## 4. 大模型配置 SOP

完整手机启动后：

1. 点击页面右侧“沙箱控制台”；
2. 展开“模型配置”；
3. 填写服务地址、模型名称和 API 密钥；
4. 点击“保存模型配置”；
5. 打开“知银”，向宁宁发送一条新的简单问题验证；
6. 再测试一条本人场景问题，例如“分析一下本月账单”。

配置要求：

- 服务必须兼容 OpenAI `POST /chat/completions` 接口；
- 服务地址填写版本根路径，例如 `https://api.example.com/v1`，不要包含 `/chat/completions`；
- 地址必须是公网 HTTPS，不能包含账号、查询参数、锚点、localhost 或局域网 IP；
- 更换服务商地址时必须重新输入对应密钥；
- 保存动作本身不会调用付费模型，下一条新请求才使用新配置；
- 宁宁和微信联系人共用这份配置。

密钥保存在：

```text
mobilegym/.sandbox-model.local.json
```

该文件仅供本机后端读取，权限为所有者读写，不在浏览器中回显，已被 Git 忽略。不要截图、提交、发送或写进文档。若模型请求失败，按以下顺序检查：

1. 服务地址是否包含正确的 `/v1` 或服务商要求的兼容根路径；
2. 模型名称是否与服务商控制台完全一致；
3. API Key 是否有效且有额度；
4. 服务是否真的兼容 `chat/completions`；
5. 终端和浏览器控制台是否有 401、403、404、429 或超时；
6. 更换地址时是否同时更新了密钥。

## 5. 每日开发流程

### 5.1 开始工作

```sh
git switch main
git pull --ff-only origin main
git switch feature/member-b-bill-invest-card
git rebase main
git status --short
```

若分支已多人共用，不要自行 rebase 已推送的公共提交；改用合并 main，或先与队友约定。

### 5.2 选择一个可验收的小任务

一次提交只处理一个可说明的问题，例如：

- 账单页改用真实授权数据；
- 卡片限额自然语言意图与确认；
- 理财风险测评的数据结构和纯函数；
- 申购服务端幂等；
- 对应测试或文档。

开始前在需求文档或 Issue 中写明：输入、预期状态变化、失败条件、是否需要确认、测试入口。

### 5.3 先定义状态和边界

开发业务功能前回答五个问题：

1. 可信状态来自哪里；
2. 模型只负责什么；
3. 哪些字段由确定性代码校验；
4. 哪一步必须用户确认；
5. 用什么最终状态判断成功。

金额统一使用整数分；时间使用带时区 ISO 字符串或明确的北京时间；每个可重试写操作都应有稳定请求 ID 或幂等键。

### 5.4 实现顺序

推荐按以下顺序开发：

```text
类型与纯函数
→ 单元测试
→ 服务端状态与接口
→ 接口测试
→ 前端展示和确认面板
→ 组件测试
→ Agent 结构化动作
→ 端到端冒烟
→ 文档与演示脚本
```

不要先让模型“说得像成功”，再补真实业务状态。

### 5.5 修改知银后同步手机

```sh
npm run phone:sync
```

刷新 MobileGym 页面即可加载新的知银构建。修改 `mobilegym/` 自身代码通常由 Vite 热更新。

## 6. 测试门禁

### 6.1 每个小改动

```sh
npm test -- --run src/lib/对应测试文件.test.ts
npm run build
```

### 6.2 提交前

```sh
npm test
npm run build
npm run lint
npm --prefix mobilegym test
```

如果 MobileGym 全量测试耗时过长，至少运行本人改动涉及的测试文件，并在 PR 中写清未运行项和原因。任何失败都不得只用“原来就有”带过，需给出复现证据并确认是否与本次改动无关。

### 6.3 三场景最低人工回归

账单分析：

- 有授权／无授权；
- 本月、上月、最近 7 天、模糊时间；
- 重复、退款、转账、空数据、无效数据；
- 大额、同日多笔、周期规律及证据；
- 商户名中的提示注入文本。

理财操作：

- 风险测评、修改答案、过期；
- 金额不足、余额不足、风险不匹配、产品关闭；
- 收藏不扣款、取消确认不扣款；
- 重复确认不重复申购；
- 成功申购、持仓刷新、可赎回／不可赎回、赎回失败恢复。

卡片管理：

- 调额、开关、挂失、解挂；
- 取消确认、重复提交、旧 `revision`；
- 挂失、超限、余额不足、夜间保护对付款的拦截；
- 刷新与服务重启后的状态一致性。

## 7. 提交与 Pull Request

### 7.1 提交前检查

```sh
git status --short
git diff --check
git diff
```

确认没有以下内容：

- `.env`、API Key、真实账单或个人数据；
- `.sandbox-model.local.json`、`.zhiyin-bank.local.json`、记忆等 `*.local.json`；
- `node_modules/`、`dist/`、`coverage/`、大素材包；
- 与本任务无关的格式化或队友改动。

### 7.2 提交格式

```text
feat(bills): add authorized monthly report
feat(investment): add risk suitability checks
feat(cards): confirm limit changes through bank sandbox
fix(cards): reject stale revision updates
test(bills): cover duplicate and refund records
docs: update member B progress and limitations
```

### 7.3 PR 描述必须包含

- 需求与问题；
- 实现范围和明确未做事项；
- 数据或接口变化；
- 用户确认和安全边界；
- 测试命令与结果；
- 人工复现步骤；
- 截图或录屏；
- 回滚方式；
- 更新后的已知限制。

## 8. 更新记录模板

每个可演示增量在 `docs/project-update-log.md` 追加一条，不覆盖历史记录：

```md
## YYYY-MM-DD — 更新标题

- 负责人：
- 分支／提交／PR：
- 关联场景：账单分析／理财操作／卡片管理
- 更新前问题：
- 本次实现：
- 状态或接口变化：
- 用户确认与安全边界：
- 自动化测试：
- 人工验证步骤：
- 验证结果：
- 已知限制：
- 回滚方式：
- 下一步：
```

状态描述只使用以下四级：

1. 界面原型；
2. 单模块可用；
3. 业务闭环；
4. 验收通过。

没有最终状态判定和测试证据时，不写“已完成”。

## 9. 发布与比赛演示 SOP

1. 从最新 `main` 创建 `release/demo-YYYYMMDD`；
2. 锁定模型、提示词、演示日期、沙箱数据和用例；
3. 执行完整构建、测试和三场景人工回归；
4. 检查 API Key 与所有 `*.local.json` 均未进入 Git；
5. 生成演示构建并在干净浏览器中跑一遍；
6. 准备一键或明确步骤的数据复位；
7. 录制离线备用视频；
8. 为每个演示步骤准备预期状态和失败替代路线；
9. 创建版本标签并记录对应提交；
10. 更新进度表、限制说明、演示脚本和答辩材料。

## 10. 本次实际基线验证记录

2026-09-29 在本地执行：

```text
npm ci                                      通过
PUPPETEER_SKIP_DOWNLOAD=true npm --prefix mobilegym ci  通过
npm run build                               通过
npm test                                    33 个测试文件、259 条测试全部通过
npm --prefix mobilegym test -- tests/model-config.test.ts
                                                9 条测试全部通过
npm run phone:sync                          通过
npm run lint                                未通过：原始基线有 2 个 ESLint 错误
```

完整 MobileGym 已在 `http://127.0.0.1:3001/` 启动。使用 3001 是因为 3000 当时被另一个位于废纸篓路径的旧 MobileGym 进程占用；未结束该未知进程。沙箱控制台中的模型配置页已打开，等待本人输入服务地址、模型名与 API Key。

基线 ESLint 错误位于 `src/lib/reply-choices.ts`（多余转义）和 `src/lib/steward-profile.test.ts`（应使用 `const`）。它们不是本次文档更新引入，但正式功能开发前应单独提交修复，让后续 PR 能以 lint 全绿作为门禁。
