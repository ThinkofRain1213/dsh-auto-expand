# dsh-auto-expand

DSH 插件：让**正在进行的**工作过程默认可见。

## 解决什么问题

DSH 默认把工作过程折叠成三层：

1. 整轮折叠（Turn 级别）
2. 大段折叠（process group，只剩标题）
3. 思考折叠（只剩首行预览）

运行时看不到助手在做什么。本插件让**当前正在运行的那一轮**自动展开大段 body 与思考内容，并在该段工作完成后自动收起；**历史轮次完全保持官方行为**。

## 行为

| 维度 | 行为 |
|---|---|
| 结构 | 保留 group 标题与 400px 高度上限 |
| 大段 body | 当前运行 Turn 内默认展开 |
| 大段折叠 | group 关闭（中间回复或新工具边界）时折叠一次 |
| 思考块 | 默认展开（仅当前 Turn、仅最后一个、仅所属 group 展开时） |
| 思考折叠 | 「不再流式」与「所属 group 折叠」先发生者 |
| 历史轮次 | 完全不动，遵从官方 |
| 工具行 | 官方默认折叠 |

所有折叠都是**一次性的**：用户手动展开后，插件不会再次把它收起来。

## 设置

「侧栏 → 插件 → dsh-auto-expand」详情页里有两个开关（改后立即生效，跨重启保留）：

| 开关 | 关掉后 |
|---|---|
| 展开工作大段 | process group body 回到官方默认折叠行为 |
| 展开思考过程 | 思考块回到官方默认折叠行为 |

**两者有依赖关系**：思考块渲染在大段 body 内部，大段折叠时它不可见。所以关掉
「展开工作大段」后，「展开思考过程」不会生效——界面会如实显示（该行变灰并注明
由哪个开关控制，开关保留你原来的选择，重新打开大段后原样恢复）。

两个都关掉 = 完全等于未安装本插件。

## 实现方式

**不重新注册任何 slot**，而是原地包裹两个已注册的渲染组件：

- `conversation.chat.flow` → `AutoFlow`（官方 `ChatFlow` 的克隆，只换两个 seat 组件）
- `conversation.chat.node` 的 `assistant-step` → `AutoAssistantNodeView`

原因见 [spec/DESIGN.md](spec/DESIGN.md) 第 4 节。所有包裹失败都**静默降级**为官方行为。

## 文档

| 文件 | 内容 |
|---|---|
| [spec/DESIGN.md](spec/DESIGN.md) | 整体设计 |
| [spec/ARCHITECTURE.md](spec/ARCHITECTURE.md) | 技术架构与机制细节 |
| [spec/PLAN.md](spec/PLAN.md) | 阶段计划 |
| [spec/SETTINGS-SPEC.md](spec/SETTINGS-SPEC.md) | 设置页规范（摘自 dsh-project-groups 实测） |
| [spec/P4-ROLLBACK.md](spec/P4-ROLLBACK.md) | 工具行自动展开为何放弃 |

各阶段实施报告：`spec/P1-REPORT.md` ~ `spec/P5-REPORT.md`。

## 目标版本

- DSH `0.2.1-rc.2`（`engines.dsh` 限定在 `0.2.1`）
- 依赖 `@deepseek-ai/dsh-client-ui-chat` 的内部渲染结构；上游若改动需同步克隆组件（见各文件头部的上游版本记录）

## 开发

```bash
pnpm install
pnpm verify         # typecheck + build + test + smoke
pnpm pack:check     # 发布产物自检（files 覆盖、exports 可解析、产物体积）
pnpm drift          # DSH 升级后检查克隆组件是否与上游偏离
pnpm watch          # 增量构建
```

`pnpm drift` 需要一个上游源码 checkout（默认找同级的 `../deepseek-harness`，
也可以用 `--upstream <path>` 或环境变量 `DSH_SOURCE_CHECKOUT` 指定）。
没有源码 checkout 时它会跳过并以退出码 2 结束。

## 上游依赖与漂移

本插件克隆了 23 个官方源文件（清单见 `scripts/upstream-manifest.mjs`），
因为官方没有导出这些组件、且重新注册 slot 会被拒绝（见 `spec/DESIGN.md`）。

DSH 升级后**第一件事**是跑 `pnpm drift`：

- 它把每个克隆文件指回上游出处，用内容哈希判断上游是否变了；
- `verbatim`（整份克隆）变了 → 必须逐行重新对照，可能漏掉了新分支；
- `partial`（部分摘取）变了 → 复核被摘取的片段即可。

确认克隆已对齐后，用 `pnpm drift:record` 刷新 `spec/upstream.json`。

## 许可

MIT
