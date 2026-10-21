# dsh-auto-expand 项目规划

> 版本：0.1（规划阶段）
> 目标 DSH 版本：`0.2.1-rc.2`
> 配套文档：[DESIGN.md](DESIGN.md)（设计与技术决策）

本文档定义**整个项目的发展路径**：里程碑划分、每阶段的交付物与验收、工程规范、质量保障、发布策略、风险治理与后续演进。

---

## 1. 项目定位

### 1.1 一句话定位

一个**只影响当前运行 Turn 的视觉呈现**的 DSH 客户端插件：让正在进行的工作过程（process group body 与思考块）默认可见，该段工作完成后自动收起，历史轮次保持官方原样。

### 1.2 项目边界

| 维度 | 承诺 | 明确不做 |
|---|---|---|
| 影响面 | 仅浏览器渲染层 | 不改 Session 日志、不改模型请求、不加 tool/prompt |
| 生效范围 | 当前运行 Turn | 历史 Turn、其他会话 |
| 配置 | 行为固定（本期） | 无设置卡片、无 Host 配置项 |
| 依赖 | 依赖 `dsh-client-ui-chat` 内部结构 | 不 fork 官方包、不 patch 官方文件 |

### 1.3 成功标准

项目成功的判定，按重要性排序：

1. **历史轮次零差异** —— 装与不装，历史消息渲染完全一致。
2. **当前轮次行为符合 11 条规格** —— 见 DESIGN.md 第 2 节。
3. **可安全卸载** —— 卸载后无残留 DOM、样式、全局状态。
4. **升级可跟进** —— DSH 升级时，能在 1 人日内完成适配。

---

## 2. 阶段总览

项目分为 **6 个阶段**，每个阶段都有可独立验证的产出，不存在"长期不可用"的中间态。

```
P0 设计         ── 已完成 ──→  设计文档
P1 骨架与包裹   ── 已完成 ──→  能安装、能渲染、行为不变
P2 第二层       ── 已完成 ──→  group body 自动展开/折叠
P3 第三层       ── 已完成 ──→  思考自动展开/折叠
P4 收口         ── 部分回滚 ─→  工具行自动展开放弃（见 P4-ROLLBACK.md）；
                                一致性/回归/性能并入 P5、P6
P5 设置页       ── 已完成 ──→  插件详情页的两个开关
P6 发布与治理   ── 已完成 ─→  漂移检测、发布产物自检、设置写入修正
```

| 阶段 | 名称 | 核心产出 | 依赖 | 状态 |
|---|---|---|---|---|
| P0 | 设计 | `spec/DESIGN.md` | — | ✅ 完成 |
| P1 | 骨架与包裹 | 可安装的空行为插件 | P0 | ✅ 完成 |
| P2 | 第二层 | group body 自动展开 | P1 | ✅ 完成 |
| P3 | 第三层 | 思考自动展开 | P2 | ✅ 完成 |
| P4 | 收口 | 一致性 + 回归 + 性能 | P3 | ⚠️ 工具行**回滚**，其余并入 P5/P6 |
| P5 | 设置页 | 插件详情页的两个开关 | P3 | ✅ 完成 |
| P6 | 发布与治理 | 漂移检测 + 发布产物自检 + 设置写入修正 | P5 | ✅ 完成 |

整体状态：**功能完整，可安装试用；尚未发布 npm**。真机验证由用户执行。

**关键设计原则**：P1 结束时插件必须"可安装且行为与官方完全一致"。这样即使后续阶段中止，仓库也处于可用状态，不会污染用户的运行环境。

---

## 3. P0 设计（已完成）

### 3.1 交付物

| 文件 | 内容 |
|---|---|
| `spec/DESIGN.md` | 11 条需求规格、4 条硬约束、架构、状态机、文件清单、风险 |
| `README.md` | 项目说明与预期行为 |
| `.gitignore` | 构建产物忽略 |

### 3.2 关键产出

- 确认三层折叠的状态归属，定位第二、三层无外部注入点
- 否定两条路线（重注册 flow children / shadow assistant-step），确立"原地包裹"
- 定义 `useAutoDisclosure` 状态机，用一个抽象同时服务两层
- 确认官方已有 `disclosureReset` 机制可免费复用
  ⚠️ **该假设后来被推翻**：把 `useDisclosure` 换成 `useAutoDisclosure` 后，
  assistant-step 这条链路上 `disclosureReset` 没有消费者。见 `ARCHITECTURE.md` 5.5。

### 3.3 验收

- 需求 11 条全部经用户逐条确认 ✅
- 硬约束有源码行号证据 ✅
- 文件清单与规模估算完成 ✅

---

## 4. P1 骨架与包裹机制

### 4.1 目标

建立完整可安装的插件仓库，验证**原地包裹技法**在本环境可用，且包裹后渲染结果与官方**逐像素一致**（无任何行为变化）。

这一阶段不实现任何自动展开逻辑。它的唯一目的是把最大的技术风险（未公开 API）在最早时间点验证掉。

### 4.2 任务分解

| 编号 | 任务 | 产出 |
|---|---|---|
| P1-1 | 建包骨架：`package.json`、`tsdown.config.ts`、`cordis.patch.yml` | 可 `pnpm build` |
| P1-2 | Host 半边 `src/index.ts`（最小：无 apply 逻辑） | `lib/index.js` |
| P1-3 | 包裹工具 `wrapEntry`：改写 `entry.component` 并支持幂等与还原 | `src/client/wrap.ts` |
| P1-4 | `PassThroughFlow`：包裹 flow 后**原样渲染**（先直接调用官方组件） | 验证包裹可行 |
| P1-5 | `PassThroughAssistant`：包裹 `assistant-step` 后原样渲染 | 验证第二个包裹点 |
| P1-6 | 安装到测试 profile 并实测 | 安装成功、页面正常 |
| P1-7 | 卸载验证 | 无残留 |

### 4.3 技术要点

**包裹顺序与时机**

`slots/changed` 事件在 slot 注册变化时触发。包裹必须在目标 entry 存在后执行，且要处理：

- 重复触发（幂等）
- 目标 entry 尚未注册（稍后重试）
- 插件卸载（还原 `entry.component`）

```ts
// 幂等包裹的核心
const wrapped = new WeakSet<object>()

function ensureWrapped(entries: readonly StoredEntry[], key: string, make: Wrapper): () => void {
  const entry = entries.find(e => e.options.key === key)
  if (entry === undefined || wrapped.has(entry.component)) return NOOP
  const inner = entry.component
  const next = make(inner)
  wrapped.add(next)
  entry.component = next
  return () => { if (entry.component === next) entry.component = inner }
}
```

**P1 的关键验证点**

| 验证项 | 通过标准 |
|---|---|
| flow 包裹后能否拿到 `renderSlot` | 能渲染出 node 列表 |
| flow 包裹后能否拿到 `useGroupAction` | group 折叠动画正常 |
| flow 包裹后能否拿到 `useStore`/`actions` | 整轮折叠可点击 |
| assistant-step 包裹后能否拿到 `renderSlot` | 思考正文、图片正常 |
| 包裹后 React key 是否稳定 | 滚动位置、翻页锚点正常 |
| 卸载后是否还原 | 页面行为恢复官方 |

### 4.4 交付物

- 完整仓库骨架（可构建、可安装）
- 包裹工具 + 两个 pass-through 包装器
- 一份《P1 验证报告》，逐项记录 4.3 的验证结果

### 4.5 验收标准

1. `pnpm build` 成功，产出 `lib/index.js` + `lib/client.js`
2. 安装后页面正常加载，控制台无错误
3. 所有渲染与未安装时**视觉一致**
4. 4.3 六项验证全部通过
5. 卸载后无残留

### 4.6 中止条件

若 P1 验证发现包裹技法在当前环境**不可用**（例如 `entries()` 返回冻结对象、或包裹后丢失 inject），则：

- 停止 P2/P3，回到 P0 重新评估路线
- 备选方案：fork `dsh-client-ui-chat` 并打 patch（成本高，但可行）

---

## 5. P2 第二层：group body 自动展开

### 5.1 目标

实现 group body 的自动展开与一次性折叠，保留 header 与 400px 上限。

### 5.2 任务分解

| 编号 | 任务 | 产出 |
|---|---|---|
| P2-1 | `useAutoDisclosure` 实现 + 单元测试 | `auto-disclosure.ts` |
| P2-2 | 克隆 `ChatFlow` → `AutoFlow` | `flow/AutoFlow.tsx` |
| P2-3 | 克隆 `ChatNodeSeat` → `AutoNodeSeat` | `flow/AutoNodeSeat.tsx` |
| P2-4 | 克隆 `ChatGroupSeat` → `AutoGroupSeat`，接入 `useAutoDisclosure` | `flow/AutoGroupSeat.tsx` |
| P2-5 | 克隆 `useProcessScroll` / `useScrollFollow` | `flow/` |
| P2-6 | 迁移 CSS（`.flowItem` 段、`ChatGroupSeat.module.css`） | `flow/*.module.css` |
| P2-7 | 安装实测 + 手感调优 | 验证报告 |

### 5.3 技术要点

**autoOpen 判据**

```ts
const groupAutoOpen = !group.data.closed
```

`closed` 的两个来源（见 DESIGN.md 3.3）：

1. 内容边界（中间回复、工具边界、Turn 输入）
2. Turn 结束（所有 group 被标记关闭）

两者都正确对应"该段工作完成"。

**必须原样保留的部分**

| 内容 | 原因 |
|---|---|
| `capped` 计算 | 400px 上限（S-2） |
| `useGroupHeaderAction` | header 显隐动画 |
| `bodyRef = useGroupAction(grouped && !open, reveal)` | 折叠动画与焦点保护 |
| `useProcessScroll` | 内部滚动跟随、边缘渐变 |
| `data-*` 属性 | 官方 CSS 与测试依赖 |
| `entries` 的 keyed 结构 | 滚动锚点稳定性 |

**行为差异点（需重点验证）**

官方：`grouped && !open` → body 隐藏。
本插件：运行中 `open = true` → body 显示，**但 `capped` 仍为 `true`**，所以有 400px 上限。

这意味着一个 group 首次展开时，`useProcessScroll` 需要初始化到**底部**（因为内容在增长）。官方逻辑（`ChatGroupSeat.tsx:175-178`）：

```ts
const toggle = useCallback(() => {
  if (!open) initialize(closed === false ? 'bottom' : 'top')
  setOpen(!open)
}, [closed, initialize, open, setOpen])
```

自动展开不经过 `toggle`，因此**必须显式调用 `initialize('bottom')`**。这是 P2 最容易遗漏的点。

### 5.4 交付物

- 第二层完整实现
- `useAutoDisclosure` 单元测试
- 《P2 验证报告》：A-1、A-2、A-8、A-9、A-10

### 5.5 验收标准

| 编号 | 场景 | 期望 |
|---|---|---|
| A-1 | 新 Turn 开始 | group body 可见，header 保留 |
| A-2 | group 关闭 | body 折叠一次，header 保留 |
| A-8 | 手动展开已折叠 group | 保持展开 |
| A-9 | 内容超 400px | 内部滚动 + 边缘渐变 |
| A-10 | 内容增长 | 跟随到底；用户滚轮后停止 |
| — | 历史 Turn | 与官方完全一致 |

---

## 6. P3 第三层：思考自动展开

### 6.1 目标

实现思考块的自动展开与折叠，与 group 折叠形成"先发生者"关系。

### 6.2 任务分解

| 编号 | 任务 | 产出 |
|---|---|---|
| P3-1 | `GroupOpenContext` | `group-open-context.ts` |
| P3-2 | 重写 `AssistantNodeView` → `AutoAssistantNodeView` | `assistant/` |
| P3-3 | 自实现 `AutoAssistantMarkdown` | `assistant/` |
| P3-4 | 克隆 `ReasoningRow` → `AutoReasoningRow` | `assistant/` |
| P3-5 | 迁移 `markdown-labels`、CSS | `assistant/` |
| P3-6 | 安装实测 | 验证报告 |

### 6.3 技术要点

**autoOpen 判据**

```ts
const reasoningAutoOpen = running && groupOpen
```

- `running`：该 reasoning block 是最后一个 block 且 node 在流式
- `groupOpen`：经 `GroupOpenContext` 下发

任一为假 → 折叠。这就是 T-2 的"先发生者"。

**为什么必须自实现 Markdown 层**

见 DESIGN.md 4.4：包裹 `assistant-step` 后，内部固定的 `AssistantMarkdown` 引用无法从外部替换。因此 `AutoAssistantNodeView` 必须完整重写 `AssistantNodeView`（51 行）+ `AssistantMarkdown`（167 行）。

**必须复刻的细节**

| 细节 | 位置 | 遗漏后果 |
|---|---|---|
| `hasVisible` 判定 | `AssistantMarkdown.tsx:71-74` | 工具组之间出现空壳 |
| `groupPart` 过滤 | `AssistantMarkdown.tsx:79-80` | reasoning/response 重复渲染 |
| 图片组以首块索引为 key | `AssistantMarkdown.tsx:110-121` | 流式追加时 remount |
| `interrupted` stopped 标记 | `AssistantMarkdown.tsx:149-151` | 中断态缺标记 |
| `reasoningHidden` | `AssistantNodeView.tsx:28-32` | 整轮折叠时思考泄漏 |

**思考正文仍走官方 Slot**

```tsx
renderSlot('conversation.chat.reasoning.body', { text, running })
```

这是官方 binding，由 wrapper 从 props 透传，因此正文排版与官方完全一致。这是本设计相对 `dsh-smooth-stream` 的关键优势。

### 6.4 交付物

- 第三层完整实现
- 《P3 验证报告》：A-3、A-4、A-5

### 6.5 验收标准

| 编号 | 场景 | 期望 |
|---|---|---|
| A-1 | 思考流式输出 | 思考块展开，正文可读 |
| A-4 | 思考结束 | 思考块折叠 |
| A-5 | group 折叠时思考仍在流式 | 随 group 一起不可见 |
| T-3 | 多段思考 | 只有当前流式那段展开 |
| — | 折叠态摘要 | 首行预览正常 |

---

## 7. P4 收口

### 7.1 目标

补齐一致性与回归，确认插件在真实使用中不破坏任何官方行为。

### 7.2 任务分解

| 编号 | 任务 | 验收 |
|---|---|---|
| P4-1 | 四种 `transcriptView` 模式兼容 | C-1 |
| P4-2 | 两种 `collapseTiming` 兼容 | C-2 |
| P4-3 | 中英文切换 | C-3 |
| P4-4 | 关闭插件恢复官方 | C-4 |
| P4-5 | 会话切换不串状态 | C-5 |
| P4-6 | 整轮折叠（第一层）回归 | 行为不变 |
| P4-7 | 翻页加载锚点回归 | 行为不变 |
| P4-8 | 浏览器查找（Ctrl+F） | 能展开被隐藏内容 |
| P4-9 | 与 `dsh-smooth-stream` 共存验证 | 结论明确 |
| P4-10 | 性能：流式高频更新 | 无掉帧、无内存泄漏 |

### 7.3 重点风险验证

**P4-1：四种模式的回退行为**

`detailed` / `verbose` 模式下 `stepGrouping` 为 `history` / `none`，运行中**不分组**。此时 `ChatGroupSeat` 根本不会挂载，`useAutoDisclosure` 也无从生效。

预期行为：**回退为官方**，即这些模式下本插件无效。这符合"遵从官方"的原则，但需要在 README 明确说明。

**P4-9：与 smooth-stream 的共存**

smooth-stream 用 `priority: -100` 遮蔽 `assistant-step`。若两者同时安装：

- 它的 entry 胜出，我们的包裹作用在它的组件上
- 它的组件内部用 `MarkdownText` 重写思考，不走 `reasoning.body` Slot
- 我们的 `AutoAssistantMarkdown` 可能根本不参与渲染

结论：**行为叠加不确定，建议二选一**。P4-9 需给出明确结论并写入 README。

**P4-10：性能基线**

流式输出时，思考内容每帧变化。`useAutoDisclosure` 的实现必须保证：

- `autoOpen` 不变时**不触发 setState**
- 只在 `autoOpen` 变化（展开↔折叠）时渲染一次

这由 5.3 的派生态写法保证（`if (autoOpen !== seen)` 才 setState）。

### 7.4 交付物

- 《P4 回归报告》：C-1~C-5 + 4 项回归 + 共存结论 + 性能数据
- README 补充"已知限制"章节

---

## 8. P5 发布与治理

### 8.1 目标

建立长期可维护机制，让 DSH 升级时能低成本跟进。

### 8.2 任务分解

| 编号 | 任务 | 产出 |
|---|---|---|
| P5-1 | `spec/upstream-snapshot/` 保存克隆时的上游源码与 git 引用 | 快照 |
| P5-2 | `scripts/check-upstream-drift.mjs` 漂移检测 | 脚本 |
| P5-3 | 版本约束 `engines.dsh` | `package.json` |
| P5-4 | 完整 README（含已知限制、兼容矩阵） | 文档 |
| P5-5 | CHANGELOG | 文档 |
| P5-6 | 图标与 locale 元数据 | 显示资源 |

### 8.3 漂移检测设计

```
scripts/check-upstream-drift.mjs
  1. 读取 spec/upstream-snapshot/manifest.json（记录 git commit + 文件列表）
  2. 定位当前安装的 dsh-client-ui-chat 包目录
  3. 逐文件对比：本地克隆副本 vs 当前上游
  4. 输出差异报告：
     - 无差异 → OK
     - 仅注释/格式差异 → INFO
     - 逻辑差异 → WARN（需人工复核）
     - 文件消失/新增关键逻辑 → ERROR
```

关键：**不自动修改代码**，只报告。适配由人工判断，因为上游改动可能是改进、可能是重构、也可能是本插件依赖点的语义变化。

### 8.4 版本策略

| 场景 | 版本变化 | 说明 |
|---|---|---|
| 内部实现优化 | patch | 行为不变 |
| 新增未来功能（工具行展开） | minor | 向后兼容 |
| 依赖上游结构变化而适配 | patch + 更新 `engines.dsh` | 需同步快照 |
| 破坏性重设计 | major | — |

`engines.dsh` 约束：`>=0.2.1-rc.2 <0.2.2`。上游小版本升级时先跑漂移检测，再决定是否放宽。

### 8.5 交付物

- 上游快照 + 漂移检测脚本
- 完整文档（README / CHANGELOG / 兼容矩阵）
- 图标（原创或合规素材）
- locale 元数据（`meta.title` / `meta.description`，中英双语）

---

## 9. 工程规范

### 9.1 目录结构

```
dsh-auto-expand/
├── package.json
├── tsdown.config.ts
├── cordis.patch.yml
├── README.md
├── CHANGELOG.md
├── icon.svg
├── locale/
│   ├── zh.json
│   └── en.json
├── spec/
│   ├── DESIGN.md              ← 设计与技术决策
│   ├── PLAN.md                ← 本文档
│   └── upstream-snapshot/     ← P5：上游源码快照
│       ├── manifest.json
│       └── *.tsx / *.css
├── scripts/
│   └── check-upstream-drift.mjs
├── src/
│   ├── index.ts               ← Host 半边
│   └── client/
│       ├── index.ts           ← 包裹点与 apply
│       ├── wrap.ts            ← 包裹工具
│       ├── auto-disclosure.ts
│       ├── group-open-context.ts
│       ├── flow/              ← 第二层
│       │   ├── AutoFlow.tsx
│       │   ├── AutoNodeSeat.tsx
│       │   ├── AutoGroupSeat.tsx
│       │   ├── use-process-scroll.ts
│       │   ├── use-scroll-follow.ts
│       │   ├── flow-utils.ts
│       │   ├── AutoGroupSeat.module.css
│       │   └── chat-flow.module.css
│       └── assistant/         ← 第三层
│           ├── AutoAssistantNodeView.tsx
│           ├── AutoAssistantMarkdown.tsx
│           ├── AutoReasoningRow.tsx
│           ├── markdown-labels.ts
│           ├── AutoAssistantMarkdown.module.css
│           └── AutoReasoningRow.module.css
└── tests/
    ├── auto-disclosure.spec.ts
    └── wrap.spec.ts
```

### 9.2 克隆代码的标记规范

所有从上游克隆的文件，**文件头必须有来源标注**：

```ts
/**
 * 克隆自 @deepseek-ai/dsh-client-ui-chat@0.2.1-rc.2
 * 源文件：packages/client/ui-chat/src/client/chat/ChatGroupSeat.tsx
 * 上游 commit：687f282e86
 * 修改点：
 *   1. useDisclosure → useAutoDisclosure（第 137 行）
 *   2. 新增 GroupOpenContext.Provider
 * 其余逻辑逐字保留，请勿在未对照上游的情况下修改。
 */
```

这既是维护线索，也是漂移检测的定位依据。

### 9.3 提交规范

Conventional Commits，中文正文：

```
feat(flow): group body 自动展开
fix(assistant): 修正思考折叠时的高度跳变
docs(spec): 补充 P2 验证报告
chore(build): 升级 tsdown
```

### 9.4 构建配置

沿用 `dsh-smooth-stream` 的双产物配置：

| 产物 | 格式 | 平台 | 说明 |
|---|---|---|---|
| `lib/index.js` | ESM | node | Host 半边 |
| `lib/client.js` | CJS | browser | 浏览器 bundle，包裹 `__ModuleLoader__.load` |

关键点：

- 平台模块（`react`、`ui-slots`、`ui-primitives`、`client-store`）必须 external，否则会打包出第二份 React
- CSS Modules 用 lightningcss 内联，注入带 `data-plugin-css` 标记的 `<style>`
- 需要 purity 插件拦截非法跨包 value import

**需要额外加入 external 的模块**（相对 smooth-stream）：

| 模块 | 原因 |
|---|---|
| `@deepseek-ai/dsh-client-ui-primitives` | 用 `MarkdownText` / `DisclosureRow` / 图标 |
| `@deepseek-ai/dsh-client-store` | 订阅 observable |
| `@deepseek-ai/dsh-client-locale` | `t` 绑定 |

`@deepseek-ai/dsh-client-ui-chat/client` 与 `dsh-client-ui-conversation/client` **只做类型导入**（`import type`），不产生 value 依赖。

---

## 10. 质量保障

### 10.1 测试策略

| 层级 | 内容 | 工具 |
|---|---|---|
| 单元 | `useAutoDisclosure` 状态机、`wrapEntry` 幂等性 | vitest |
| 集成 | 安装后实测各场景（A-1~A-10、C-1~C-5） | 手工 + 截图对比 |
| 回归 | 历史轮次零差异、翻页、Ctrl+F | 手工对照 |

### 10.2 `useAutoDisclosure` 测试用例

| 编号 | 初始 | 动作 | 期望 |
|---|---|---|---|
| U-1 | autoOpen=true | — | open=true |
| U-2 | autoOpen=true | 手动折叠 | open=false |
| U-3 | autoOpen true→false | — | open=false，override 清空 |
| U-4 | autoOpen=false | 手动展开 | open=true |
| U-5 | autoOpen=false，override=true | autoOpen 再变 | override 清空，按新 autoOpen |
| U-6 | autoOpen=false→false（不变） | 手动展开后重渲染 | open 保持 true |

### 10.3 视觉验证方法

由于是视觉插件，必须做**截图对比**：

1. 安装前截图：历史轮次、当前轮次
2. 安装后截图：同一位置
3. 历史轮次：**逐像素对比应完全一致**
4. 当前轮次：人工确认符合预期

建议保留一组基准截图在 `spec/screenshots/`（P4 建立）。

### 10.4 手工测试清单

每阶段结束前必须过一遍：

- [ ] 新会话首条消息正常
- [ ] 多轮对话正常
- [ ] 长会话翻页正常
- [ ] 切换会话正常
- [ ] 四种模式切换不崩
- [ ] 中英文切换正常
- [ ] 中断（Stop）后状态正确
- [ ] 出错轮次状态正确
- [ ] 卸载后恢复官方

---

## 11. 风险治理

### 11.1 风险登记册

| ID | 风险 | 等级 | 影响阶段 | 缓解措施 | 触发后动作 |
|---|---|---|---|---|---|
| R-1 | `entry.component` 改写是未公开 API | 高 | P1 | P1 最早验证；运行时防御 | 转 fork 方案 |
| R-2 | 克隆组件与上游漂移 | 高 | P2/P3/P5 | 来源标注 + 漂移检测 + 快照 | 人工适配 |
| R-3 | 自实现 Markdown 层遗漏细节 | 中 | P3 | 对照源码逐条核对清单 | 补实现 |
| R-4 | 折叠动画与 flow-motion 冲突 | 中 | P2 | 不自造动画，复用注入 hook | 简化动画 |
| R-5 | 自动展开未初始化滚动位置 | 中 | P2 | 显式 `initialize('bottom')` | — |
| R-6 | 流式性能下降 | 低 | P4 | 派生态写法，仅在变化时 setState | 优化订阅粒度 |
| R-7 | 与 smooth-stream 冲突 | 低 | P4 | P4-9 实测并写入 README | 建议二选一 |
| R-8 | 上游改变 group 关闭语义 | 中 | 升级时 | 漂移检测 + 验收用例 | 调整判据 |

### 11.2 关键决策的不可逆性

| 决策 | 可逆性 | 说明 |
|---|---|---|
| 原地包裹 vs fork | 可逆 | 包裹失败可转 fork |
| 克隆 vs 重写 | 可逆 | 克隆可逐步替换为重写 |
| 不遮蔽 assistant-step | 可逆 | 若需要可改遮蔽 + 完整重写 |
| 行为固定 vs 可配置 | 可逆 | 未来可加设置卡片 |

所有关键决策都保留退路，无单向门。

---

## 12. 后续演进（v1.0 之后）

### 12.1 已登记的未来功能

| 功能 | 优先级 | 说明 |
|---|---|---|
| 工具行自动展开 | 高 | 用户已明确列为未来功能；复用 `useAutoDisclosure`，autoOpen 判据为"工具仍在运行" |
| 折叠时机可配置 | 中 | `closed` / 下一个 group / Turn 结束 |
| 思考折叠延迟 | 中 | 避免思考-工具快速交替时抖动 |
| 历史轮次可选择性生效 | 低 | 需重新设计历史语义 |
| 设置卡片 | 低 | 需要 Host 半边 + RPC |

### 12.2 迁移到官方扩展点

若上游未来提供以下任一能力，应优先迁移并删除克隆代码：

- group / reasoning 的 disclosure 变为受控（接受 `open` prop 或 store）
- 新增可注入的"展开策略"扩展点
- `ChatGroupSeat` 等组件从公开入口导出

迁移时保留 `useAutoDisclosure`（它是本项目自己的抽象，与上游无关）。

### 12.3 向上游提案

本插件解决的问题（运行中过程不可见）具有普遍性。若实现稳定，可考虑向上游提案：

- 新增 `transcriptView` 模式（如 `live`），语义为"当前轮次 body 展开"
- 或把 `stepGrouping` 扩展一个 `live-expanded` 取值

这比插件更可持续，但需要上游接受。

---

## 13. 里程碑与验收汇总

| 里程碑 | 完成标志 | 用户可感知 |
|---|---|---|
| M0 | 设计文档完成 | 无 |
| M1 | 插件可安装，行为不变 | 无（但风险已验证） |
| M2 | group body 自动展开 | **当前轮次过程可见** |
| M3 | 思考自动展开 | **思考内容实时可见** |
| M4 | 一致性与回归通过 | 可日常使用 |
| M5 | 发布就绪 | 可分享/长期使用 |

**关键节点**：M2 是第一个有用户价值的里程碑。M3 完成即达到用户最初描述的核心诉求。

---

## 14. 当前状态与下一步

### 14.1 当前状态

- ✅ P0 完成：设计与规划文档就绪
- ⬜ P1 未开始

### 14.2 建议的下一步

**P1-1 ~ P1-2：建包骨架。**

理由：这是纯机械工作，无技术风险，完成后能立刻进入 P1-3 的包裹验证——而包裹验证是整个项目的技术分水岭。

### 14.3 需要用户确认的事项

| 编号 | 事项 | 影响 |
|---|---|---|
| Q-1 | 是否同意 P1 先行验证包裹技法（而非直接做功能） | 决定风险暴露顺序 |
| Q-2 | 测试方式：装到 `desktop` profile 实测，还是建独立测试 profile | 影响 `desktop` 环境 |
| Q-3 | 是否需要 P1 结束就给出可安装版本供试用 | 影响交付节奏 |

---

## 附录 A：需求规格速查

摘自 DESIGN.md 第 2 节，作为全程验收基准。

**结构层**

- S-1 保留 group header
- S-2 保留 400px 上限
- S-3 当前运行 Turn 内 body 默认展开
- S-4 group 关闭时折叠
- S-5 折叠只触发一次

**思考层**

- T-1 默认展开
- T-2 先发生者（不再流式 / group 折叠）
- T-3 只保留最后一段展开
- T-4 工具行保持官方折叠

**通用**

- G-1 历史轮次完全不动
- G-2 滚动遵从官方

## 附录 B：验收用例索引

| 编号 | 阶段 | 场景 |
|---|---|---|
| A-1 | P2 | 新 Turn 开始，body 可见 |
| A-2 | P2 | group 关闭，body 折叠 |
| A-3 | P3 | 工具调用中，body 保持展开 |
| A-4 | P3 | 思考结束，思考折叠 |
| A-5 | P3 | group 折叠时思考流式中 |
| A-6 | P4 | Turn 结束，全部折叠 |
| A-7 | P4 | 历史轮次零差异 |
| A-8 | P2 | 手动展开不被收回 |
| A-9 | P2 | 400px 上限与渐变 |
| A-10 | P2 | 滚动跟随与中断 |
| C-1 | P4 | 四种模式 |
| C-2 | P4 | 两种时机 |
| C-3 | P4 | 中英文 |
| C-4 | P4 | 卸载恢复 |
| C-5 | P4 | 会话切换 |
| U-1~U-6 | P2 | `useAutoDisclosure` 单元测试 |
