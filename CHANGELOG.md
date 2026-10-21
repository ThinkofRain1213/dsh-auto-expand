# 变更记录

本项目遵循 [语义化版本](https://semver.org/lang/zh-CN/)。DSH 目标版本写在
`package.json` 的 `engines.dsh` 里，只在与之匹配的 DSH 版本上保证行为。

## [0.1.0] — 未发布

首个功能完整的版本。插件把「当前正在运行的那一轮」的工作过程默认展开，
在那段工作结束后自动收起；**历史轮次完全保持官方行为**。

### 行为

- **工作大段（process group）**：当前 Turn 内默认展开；group 关闭（中间回复或
  新工具边界）时折叠一次。保留官方 group 标题与 `min(400px, 50vh)` 高度上限。
- **思考块**：流式期间默认展开；「思考结束」与「所属大段折叠」先发生者触发
  折叠。只展开当前 Turn 的最后一个思考块。折叠态沿用官方首行摘要预览。
- **历史轮次**：完全不动。
- **工具行**：沿用官方折叠行为（自动展开需要克隆 `GenericToolCard` 全树，
  代价不成比例，见 `spec/P4-ROLLBACK.md`）。
- 所有折叠都是**一次性**的：用户手动展开后插件不再收起。

### 设置

插件详情页里两个开关，改后立即生效、跨重启保留：

- 展开工作大段
- 展开思考过程

两个都关 = 完全等于未安装本插件。

### 实现要点

- **不重新注册任何 slot**，而是原地包裹官方已注册的渲染组件
  （`conversation.chat.flow` 与 `conversation.chat.node#assistant-step`）。
  所有包裹失败都静默降级为官方行为，绝不让 DSH 崩溃。
- 克隆了 23 个官方源文件（`scripts/upstream-manifest.mjs` 是清单）。
  `pnpm drift` 可以在 DSH 升级后检查这些克隆是否已与上游偏离。
- 设置走官方 `configForms`，命名空间 `auto-expand`（= Loader entry id），
  卡片注册在 `plugins.bundle.config` 槽位，key 为包名 `dsh-auto-expand`。

### 修复记录

- **已完成 group 手动展开被强制滚到底部**：滚动定位的 effect 用 `open` 翻转
  作判据，无法区分自动展开与手动展开。改用纯业务状态判定。
  详见 `spec/FIX-SCROLL.md` 第 1~7 节。
- **body 自动滚动偶发失效（大段思考触发）**：两层根因 ——
  ① `.body` 的滚动锚定会让内容变高时自动移动 `scrollTop`，被 `ScrollFollow`
  误判为「读者上滚」并永久关掉跟随；
  ② 上一次修复的定位补丁因 `useRef(autoOpen)` 初值问题**从未执行过**。
  修法见 `spec/FIX-SCROLL.md` 第 8~13 节。

### 已知限制

- 只在 DSH `0.2.1` 上验证。
- 深度依赖 `@deepseek-ai/dsh-client-ui-chat` 的内部渲染结构；上游改动需要用
  `pnpm drift` 发现并重新对照克隆。
- 折叠时机不可配置。
