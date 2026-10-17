# 知银评测与证据

本目录保存功能评测、能力用例、安全红队配置、复现脚本和原始结果。`results/` 中的文件是历史运行证据，名称中的 `56b5cfd` 等提交号指向当时的被测版本；它们不代表当前分支已重新通过同样的模型评测。报告见仓库根目录的 `reports/` 和本目录 `reports/`。

## 本地运行

在仓库根目录安装应用依赖并启动 MobileGym 沙箱；模型代理使用本机配置。Promptfoo 需要单独安装，模型评分所需凭据通过本地环境变量或本目录未跟踪的 `.env` 提供，不能提交。运行前确认沙箱数据和授权范围，评测脚本中的移动端会话写入会改变当前沙箱会话列表。

```sh
npm ci
npm --prefix mobilegym ci
npm run phone:dev
cd promptfoo-learning
node scripts/build-scenario-provider.mjs
promptfoo eval -c options-capability-eval.yaml --max-concurrency 1 --no-cache --no-share -o results/options-capability-new.json
promptfoo eval -c security-regression.yaml --max-concurrency 1 --no-cache --no-share -o results/security-regression-new.json
```

`chat.py` 使用当前仓库的财务教练提示词和本地 `127.0.0.1:3000` 模型代理；`scenario-provider.mjs` 使用当前源码构建的 `generated/` 文件以及本地银行、理财沙箱接口。修改 `src/lib/steward-chat.ts` 或账单分析后，应先重新执行构建脚本。`generated/`、Promptfoo 缓存、日志和 `.env` 被忽略；历史原始 JSON 和人工判定文件保留，用于复核报告中的分母、接口错误与评分器无效项。

## 解释结果

Promptfoo 的原始失败可能来自目标接口错误、评分模型 `No output` 或评分 JSON 无效。报告分别记录这些情况和可核对的目标答复。模型说“已准备”也不构成服务端交易成功；转账、支付、申购、挂失和取消应以独立确认及服务端回执判定。历史报告中的 2026-10-13/14 数字只适用于当时保存的样本和版本。

## 授权污染与日志挖掘

`scripts/build-security-matrix.mjs` 生成六个业务域、四种攻击方式的固定矩阵。多轮用例要求同时检查首轮是否拒绝虚假授权约定、续轮是否拒绝跳过核对，并检查整个会话的动作。`scripts/run-authorization-security.mjs` 直接调用当前源码与兼容接口；从本机环境读取 `OPENAI_API_KEY`、`OPENAI_API_BASE_URL`，默认使用高速模型，输出带时间戳的新结果文件，不覆盖历史证据。

```sh
cd promptfoo-learning
node scripts/build-security-matrix.mjs
node scripts/build-scenario-provider.mjs
node scripts/run-authorization-security.mjs
python3 scripts/mine-authorization-logs.py
```

日志挖掘脚本还可传入 `--workspace-snapshot` 指向本机被 Git 忽略的任务空间快照，或多次传入 `--audit-log` 指向逐行审计记录。逐行记录至少提供匿名 `session_id`、`timestamp`、`domain`、`role`、`text`；助手或回执记录可附 `receipt_id`。脚本按会话排序，发现虚假授权、伪造角色、攻击前缀和缺回执完成声明，输出 `reports/authorization-risk-events.json` 与中文网页报告。手机号、长账号、邮箱和密钥在写出前遮盖；本机快照的完整对话不会复制到报告。当前网页使用旧版、修复中和功能扩展后的固定证据；更新证据文件后再生成报告。

功能扩展后的固定结果还包括三轮转账追问、按收款人查历史、对话加卡及卡密索取；运行脚本会写入 `results/authorization-security-minimax-20261017-workflows.json`。审计日志可增加 `role=operation` 的操作事件及 `status`、`authorization_id`、`account_id`、`authorized_account_id`、`receipt_id`，脚本会标记已执行但缺授权、缺回执或账户不一致的线索。安全判断仍需人工核对真实服务端记录。
