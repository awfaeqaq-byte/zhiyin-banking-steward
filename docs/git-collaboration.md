# Git 协作与首次启动

本项目采用一个根 Git 仓库，同时管理知银与 `mobilegym/` 应用代码。MobileGym 是内置源码，不是子模块。保留其 LICENSE、NOTICE 与素材许可；不要推送到上游 Purewhiter/mobilegym。

## 首次运行

使用 Node.js 22.12+（或更新的受支持 LTS），在项目根目录执行：

```sh
npm ci
npm --prefix mobilegym ci
npm run phone:dev
```

打开 http://localhost:3000 。不需要额外开 5174。修改知银后执行 `npm run phone:sync`；修改 MobileGym 内应用由 Vite 热更新。Puppeteer 下载失败时可设置 `PUPPETEER_SKIP_DOWNLOAD=true` 再安装，普通网页演示不依赖其浏览器。

API Key 不入库：在沙箱控制台的模型配置中自行填写。所有真实账户操作均未接入，只有本地沙箱数据。

## 分支流程

每项任务开一个短期分支，例如 `feature/wechat-bills`，不要两个人长期直接改 main。开始前先拉取最新 main；完成后提交并推送自己的分支，通过 Pull Request 合并。不要用强制推送覆盖队友提交。

尽量按目录分工：`src/` 为知银前端，`server/` 为知银本地后端，`mobilegym/apps/` 为模拟应用，`mobilegym/sandbox/` 为测试控制台。修改共享数据结构或接口前先约定字段，再各自实现。

## 不入库的内容

- node_modules、dist、coverage、发布 ZIP 和原始大型扩展素材包。
- `.env`、`.env.local`、`.sandbox-model.local.json`、`.zhiyin-bank.local.json`、记忆等 `*.local.json` 私有文件。
- 浏览器的聊天、支付及个人设置数据不会随 Git 同步。

默认桌面依赖的两个主题目录和主题清单会随源码保存；其他主题、视频、地图等扩展素材按需下载，见 `mobilegym/mobilegym-data/README.md`。未安装的其他主题不要切换，完整素材包安装后才可使用。

## 本次迁移

MobileGym 原有 Git 历史（含本地提交）已备份到项目外的相邻目录 `金融科技大赛-git-backup-20260924/mobilegym.git`。源码未删除，原有未提交改动纳入新仓库首次快照。该备份不提交、不发送给队友。

目前只建立本地仓库。托管到 GitHub/Gitee 时请新建自己的私有空仓库，再将其地址设置为本项目 origin；不要复用上游框架地址。
