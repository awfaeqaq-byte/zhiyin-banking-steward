# 知银工程脚本

请从项目根目录执行命令。npm 启动和构建命令保持不变。

| 目录 | 用途 | 示例 |
| --- | --- | --- |
| `build/` | 提示词生成、知银编译并同步到手机沙箱 | `npm run phone:sync`、`npm run prompts:sync` |
| `data/` | 行情数据、账单导入、日期修复与 Python 环境 | `bash scripts/data/setup_akshare.sh` |
| `preview/` | 开发预览和截图采集 | `node scripts/preview/asset-ui-preview.mjs` |
| `smoke/` | 功能冒烟与联调 | `node scripts/smoke/workspace-smoke.mjs` |

Python 适配器的四项离线测试：`python3 scripts/data/test_akshare_fund_samples.py`，需要对应的 Python 依赖。该文件与适配器同目录，以兼容 Python 的模块导入。

带 `live` 或使用浏览器的脚本可能需要已运行的沙箱、授权状态或模型配置，请先阅读脚本开头的运行条件。它们不会随 `npm test` 自动执行。`workspace-smoke.mjs` 使用隔离组件与本地服务测试。

知银本体在 `src/` 与 `server/`；`mobilegym/` 是外部拟真沙箱，并承载当前手机入口和部分代理依赖。`phone:sync` 仅把知银编译产物写到 `mobilegym/public/zhiyin/`，不能将沙箱目录直接当作可删除缓存。

新的构建、覆盖率和 TypeScript 缓存统一放到 `.artifacts/`。整理前的构建缓存、旧发布包与重置备份保留在 `.artifacts/archive/20261102-154835/`，原文档、测试报告与比赛资料未移动。
