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
