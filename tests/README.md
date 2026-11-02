# 知银测试目录

从项目根目录运行 `npm test`。测试仍覆盖同一套应用与业务服务，按被测对象存放：

| 目录 | 内容 |
| --- | --- |
| `app/` | 应用入口、导航、模式切换和完整交互 |
| `components/` | 组件渲染、操作、业务卡片与语音界面 |
| `lib/` | 业务算法、客户端、服务端存储及本地 HTTP 集成 |
| `helpers/` | 测试专用服务与数据夹具 |
| `setup.ts` | 全局测试环境初始化 |

单文件示例：`npm test -- tests/lib/merchant-funding.test.ts`。

`npm run test:coverage` 输出到 `.artifacts/coverage/`。商户场景测试默认将新日志写入 `.artifacts/test-results/`，可用 `ZHIYIN_SCENARIO_REPORT` 指定其他位置；旧报告保持原位。

2026-11-02 整理映射：原 `src/App.*.test.tsx` 移到 `tests/app/`，原 `src/components/*.test.*` 与 `src/lib/*.test.*` 分别移到同名测试分区，原 `src/test/` 的初始化与夹具移到这里。应用源码仍位于 `src/`，服务端仍位于 `server/`。
