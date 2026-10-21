# dsh-auto-expand 设计文档

> 版本：0.1（设计阶段，未开始实现）
> 目标 DSH 版本：`0.2.1-rc.2`（源码 checkout 与桌面安装实例均已核对一致）
> 源码基准：`C:\Users\Think\Desktop\项目\deepseek-harness`，git HEAD `687f282e86`（release-dsh-0.2.1-rc.2）

---

## 1. 目标与范围

### 1.1 一句话目标

让**正在进行的**工作过程（process group 的 body、以及其中的思考块）默认可见，并在该段工作完成后自动收起；**历史轮次完全保持官方原样**。

### 1.2 范围

| 在范围内 | 不在范围内 |
|---|---|
| 当前运行 Turn 内 group body 的自动展开/折叠 | 历史 Turn 的折叠行为（沿用官方） |
| 思考块（reasoning）的自动展开/折叠 | 工具调用行（tool-call）的自动展开（列为未来功能） |
| 保留 group header 与 400px 高度上限 | 替换整轮折叠（第一层）逻辑 |
| 复用官方的滚动跟随与折叠动画 | 新增设置项之外的配置界面 |

### 1.3 非目标

- 不修改 Session 日志、不新增事件类型。
- 不改变模型侧行为（无 tool、无 prompt、无 context 注入）。
- 不替换 `conversation.chat.flow` 的 **slot 声明**，只替换其**渲染组件**。

---

## 2. 已确认的需求规格

以下决策均来自逐条确认，作为实现的验收依据。

### 2.1 结构层

| 编号 | 决策 | 说明 |
|---|---|---|
| S-1 | **保留 group header** | 明确不采用 `detailed` 模式的"运行中不分组、完全平铺" |
| S-2 | **保留 400px 高度上限** | body 内部滚动，`min(400px, 50vh)` |
| S-3 | **当前运行 Turn 内的 group body 默认展开** | 历史 Turn 内的 group 不适用 |
| S-4 | **group 关闭时自动折叠** | `group.data.closed` 由 `false` 变 `true` 时折叠一次 |
| S-5 | **折叠只触发一次** | 折叠后进入"已完成"语义，此后由用户手动控制，自动逻辑不再介入 |

### 2.2 思考层

| 编号 | 决策 | 说明 |
|---|---|---|
| T-1 | **思考块默认展开** | 替代官方的"默认折叠、只显示首行预览" |
| T-2 | **折叠时机取先发生者** | 「不再流式」与「所属 group body 折叠」谁先发生就按谁折叠 |
| T-3 | **只保留最后一段思考展开** | 由 T-1/T-2 自动满足：思考是流式的，同一时刻只有一段处于 running |
| T-4 | **工具行保持官方默认折叠** | 不在本期实现 |

### 2.3 通用

| 编号 | 决策 | 说明 |
|---|---|---|
| G-1 | **历史轮次完全不动** | 任何自动逻辑只在 `turn.status === 'open'` 期间生效 |
| G-2 | **滚动行为遵从官方展开态** | 复用官方 `useProcessScroll` / `useScrollFollow`，不自行发明 |

---

## 3. 现有机制分析

### 3.1 三层折叠的真实归属

| 层 | 视觉单元 | 状态归属 | 是否可外部驱动 |
|---|---|---|---|
| ① 整轮 | Turn 的 process 区间 | Chat store 的 `turnProcesses[]` | **是**（有 `actions.setTurnProcessOpen`） |
| ② 大段 | process group | `ChatGroupSeat` 内部 `useState` | **否** |
| ③ 思考 | 单个 reasoning block | `ReasoningRow` 内部 `useState` | **否** |

第二、三层没有注入点的原因：两者的展开状态都来自 `useDisclosure()`，其状态存在组件闭包里，Slot 契约不暴露任何控制面。

### 3.2 关键源码定位

所有路径相对 `packages/client/ui-chat/src/client/`：

| 关注点 | 位置 |
|---|---|
| 整轮展开判定 | `chat/ChatNodeSeat.tsx:60-65` |
| 历史轮次折叠豁免 | `chat/ChatNodeSeat.tsx:71-77` |
| group 折叠时重置内层 disclosure | `chat/ChatNodeSeat.tsx:120-124` |
| **group 本地开关状态** | `chat/ChatGroupSeat.tsx:137` |
| group 是否保留 header | `chat/ChatGroupSeat.tsx:147-148` |
| group 外层隐藏判定 | `chat/ChatGroupSeat.tsx:153-160` |
| group 手动切换 | `chat/ChatGroupSeat.tsx:175-178` |
| **400px 上限** | `chat/ChatGroupSeat.module.css:86-92` |
| **思考本地开关状态** | `chat/ReasoningRow.tsx:55` |
| 思考 body 仅在展开时挂载 | `chat/ReasoningRow.tsx:70-74` |
| disclosure 基础实现 | `chat/use-disclosure.ts:11-21` |
| 内部滚动跟随 | `chat/use-process-scroll.ts`（88 行） |
| 滚动跟随内核 | `chat/use-scroll-follow.ts`（182 行） |
| group 关闭时机（含 Turn 结束） | `conversation-nodes/process-groups.ts:104-109` |
| assistant-step 的 children 声明 | `chat/register-node-renderers.ts:50-59` |
| flow 的注册（含 children 与 inject） | `apply.ts:215-225` |

### 3.3 group 的关闭语义

`group.data.closed` 为真有两种来源：

1. **内容段结束**：中间回复（assistant reply）、`process` 位置节点、Turn 输入等把它切断（`process-groups.ts:149-165`）。
2. **Turn 结束**：`input.timeline.turns.get(turn)?.status === 'closed'` 时全部 group 被标记关闭（`process-groups.ts:104-109`）。

这正好覆盖 S-3 与 S-4：Turn 运行时 group 逐个因边界而关闭；Turn 结束时全部关闭。

---

## 4. 关键约束（探查结论）

这一节是本设计最重要的部分。四个结论中前两个直接否定了两条看似可行的路线。

### 4.1 不能重新注册 flow 的 children

`packages/client/ui-slots/src/index.ts:1245-1252`：

```js
if (options.children) {
  for (const childKey of Object.keys(options.children)) {
    const childRec = this.records.get(childKey)
    if (childRec?.spec) {
      throw new Error(`slot "${childKey}" is already declared (by ${childRec.declaredBy ?? 'an unknown entry'})`)
    }
  }
}
```

官方 flow 注册时已声明 `children: { 'conversation.chat.node': { kind: 'keyed', scope: 'session', inject: CHAT_NODE_INJECT } }`（`apply.ts:215-225`）。

因此**再注册一个 flow entry 不能声明同名 children**；而不声明就收不到 `renderSlot`，也就渲染不了任何 node。**硬阻塞**。

### 4.2 必须原地包裹 `entry.component`

`StoredEntry` 是可变的普通对象（`ui-slots/src/index.ts:1265-1280`），`ctx.slots.entries(key)` 返回其原始数组。直接改写 `entry.component` 即可替换渲染组件，而**保留**该 entry 的：

- `children` 声明 → 仍能拿到 `renderSlot` / `SessionProvider`
- `inject` 工厂 → 仍能拿到 `useGroupAction` / `useGroupHeaderAction`（`CHAT_FLOW_INJECT`）与 `useStore` / `actions`（`chatStore`）
- `locale` 命名空间 → 仍能拿到 `t`
- `store` 声明 → 仍能拿到 `useStore`

`dsh-smooth-stream` 的 `wrapAgentChatRows`（`src/client/index.ts:115-146`）已在生产中使用此技法，是可行性证据。

> 注意：这是**未公开 API**。它不在 Slot 契约内，属于风险点（见第 8 节）。

### 4.3 第二、三层没有外部注入点

确认结论：没有任何 Slot、Service、Event 可以驱动 `ChatGroupSeat` 或 `ReasoningRow` 的展开状态。

- `conversation.chat.reasoning.body` 只在**已展开**时渲染，对控制展开无用。
- `conversation.chat.reasoning.content` 是 root 作用域 Factory，同样只在已展开时被调用。
- 纯 CSS 强制展开不可行：思考折叠时 body **根本不在 DOM**（`ReasoningRow.tsx:70-74` 的 `content` 在 `expanded` 为假时是 `undefined`）；group 折叠时 body 带 `hidden="until-found"`，CSS 覆盖会破坏 `aria-expanded`、边缘渐变与滚动跟随。

### 4.4 `assistant-step` 不能 shadow，只能原地包裹

若用 `priority: -100` 遮蔽官方 `assistant-step` entry，则胜出的是我们的 entry，而 `standardKit` 依据 **`entry.children`** 决定是否注入 `renderSlot`（`ui-renderer/src/client/scoped-slots.tsx:577-593`）。我们的 entry 不声明 children（声明会与 4.1 冲突，因为官方已声明 `conversation.chat.reasoning.body` 与 `conversation.chat.message.images`），于是**拿不到 `renderSlot`**，无法渲染思考正文与图片。

`dsh-smooth-stream` 正是因此在自己的 renderer 里用 `MarkdownText` 重写了思考正文，绕开了该 Slot。

**本设计改为原地包裹**：保留官方 entry 的 children 声明，wrapper 接收 `renderSlot` 并向下传递。代价是我们必须自己实现 `AssistantMarkdown` 这一层（见 6.5）。

---

## 5. 架构设计

### 5.1 两个包裹点

```
conversation.chat.flow  (官方 entry，原地改写 component)
  └─ AutoFlow              ← 克隆自 ChatFlow
       ├─ AutoNodeSeat     ← 克隆自 ChatNodeSeat
       └─ AutoGroupSeat    ← 克隆自 ChatGroupSeat，接入自动 disclosure
            └─ renderSlot('conversation.chat.node')
                 └─ AutoAssistantNodeView   ← 包裹官方 assistant-step（原地改写 component）
                      └─ AutoAssistantMarkdown  ← 自实现，逐块控制思考 disclosure
                           └─ renderSlot('conversation.chat.reasoning.body')  ← 官方 binding
```

### 5.2 为什么必须克隆三个组件

`ChatFlow` / `ChatNodeSeat` / `ChatGroupSeat` 均未在 `@deepseek-ai/dsh-client-ui-chat/client` 的公开导出中（该入口只导出类型与两个工具函数）。要替换 `ChatGroupSeat` 就必须替换渲染它的 `ChatFlow`，而 `ChatFlow` 又依赖 `ChatNodeSeat`。三者构成一个不可分割的整体。

`useProcessScroll` / `useScrollFollow` 同理，需一并克隆。

**不做的事**：不克隆 `flow-motion.ts`（532 行）。折叠动画由 `CHAT_FLOW_INJECT` 注入的 `useGroupAction` / `useGroupHeaderAction` 提供，我们只直接使用注入的 hook，仅需内联其中 2 行的 `hiddenOrCollapsing` 判定。

### 5.3 状态机

核心抽象是一个"自动状态 + 一次性手动覆盖"的 disclosure：

```ts
interface AutoDisclosure {
  readonly open: boolean
  setOpen(open: boolean): void
  toggle(): void
}

/**
 * autoOpen 是"当前应当处于"的状态。
 * 手动覆盖仅在 autoOpen 保持不变期间有效；autoOpen 一旦变化，覆盖被丢弃，
 * 由新的 autoOpen 接管 —— 这就是"折叠只触发一次"的实现。
 */
function useAutoDisclosure(autoOpen: boolean): AutoDisclosure
```

实现要点（React 派生态写法，与 `ui-renderer` 的 `useMaybeIncarnation` 同源）：

```ts
const [override, setOverride] = useState<boolean | undefined>(undefined)
const [seen, setSeen] = useState(autoOpen)
if (autoOpen !== seen) {
  setSeen(autoOpen)
  setOverride(undefined)
}
const open = override ?? autoOpen
```

状态转移表：

| 阶段 | autoOpen | override | open | 说明 |
|---|---|---|---|---|
| 运行中，group 未关闭 | `true` | `undefined` | **展开** | 默认可见 |
| group 关闭（false→true） | `false` | 重置为 `undefined` | **折叠** | S-4 的一次性折叠 |
| 折叠后用户手动展开 | `false` | `true` | 展开 | 手动优先 |
| 用户再次手动折叠 | `false` | `false` | 折叠 | |
| Turn 结束（全部 group 关闭） | `false` | 重置 | 折叠 | G-1 |

### 5.4 两层 autoOpen 的定义

```ts
// 第二层：group body
const groupAutoOpen = !group.data.closed

// 第三层：思考块
const reasoningAutoOpen = running && groupOpen
//   running   = 该 assistant node 仍在流式，且该 reasoning 是最后一个 block
//   groupOpen = 所属 group 的 open（经 GroupOpenContext 下发）
```

`reasoningAutoOpen` 精确实现了 T-2 的"先发生者"：

- 思考结束 → `running` 变假 → autoOpen 变假 → 折叠
- group 折叠 → `groupOpen` 变假 → autoOpen 变假 → 折叠

两者任一先发生，autoOpen 都会变假，从而丢弃 override 并折叠。T-3 由 `running` 的定义（仅最后一个 block 为 running）自动满足。

---

## 6. 详细设计

### 6.1 `useAutoDisclosure`

新文件 `src/client/auto-disclosure.ts`，约 40 行。不依赖官方 `use-disclosure.ts`（其语义是"版本变化时整体重置"，与本设计需要的一次性折叠不同）。

需要额外处理：

- **可访问性**：折叠时若焦点在内部，应先 `reveal` 而不是直接隐藏（官方 `useSearchableHidden` 已有此保护，我们沿用注入的 `useGroupAction`，无需自行处理）。
- **与官方 `disclosureReset` 的关系**：`AutoNodeSeat` 保留官方的 reset 计算
  （`ChatNodeSeat.tsx:115-124`），但本插件在 assistant-step 这条链路上把
  `useDisclosure` 断开了（`AutoReasoningRow` 用 `useAutoDisclosure`），因此
  **思考行不消费它**。后果与理由见 `ARCHITECTURE.md` 5.5——这是有意的差异，
  不是冗余保险。

### 6.2 `AutoFlow`（克隆 `ChatFlow`，61 → 约 70 行）

逐字保留：keyed 列表结构、`pendingInputs` 与本地 echo 的 splice 逻辑、`RunningStatus` 尾部。

唯一改动：`ChatNodeSeat` / `ChatGroupSeat` 换成我们的版本。

> 注意 `entries` 的 `kind: 'node' | 'group'` 判别与 `chatRenderKey` 必须原样保留，否则滚动锚点与 React key 稳定性会被破坏。

### 6.3 `AutoNodeSeat`（克隆 `ChatNodeSeat`，174 → 约 185 行）

保留全部：`turnProcessOpen` 计算、`alwaysOpen` 判定、`processMember` / `processAnswer` / `ownsDisclosure`、`disclosureReset`、`useGroupAction` 的 `processHidden` 绑定、`data-*` 属性。

**不改动第一层逻辑**（G-1、范围外）。改动仅限把 `ChatGroupSeat` 引用换掉，并把 `GroupOpenContext` 的提供点放在 group 层而非此处。

### 6.4 `AutoGroupSeat`（克隆 `ChatGroupSeat`，203 → 约 215 行）

改动三处：

1. **第 137 行**：`const { expanded: open, setExpanded: setOpen } = useDisclosure()`
   → `const { open, setOpen } = useAutoDisclosure(!closed)`

2. **新增**：向子树提供 `GroupOpenContext`

   ```tsx
   <GroupOpenContext.Provider value={open}>
     <GroupMembers {...props} members={members} />
   </GroupOpenContext.Provider>
   ```

3. **保留**：`useGroupHeaderAction`（header 可见性）、`bodyRef = useGroupAction(grouped && !open, reveal)`（隐藏绑定）、`useProcessScroll`（滚动跟随与边缘渐变）、`capped` 计算（400px 上限）。

`capped` 在 `transcriptView: 'standard'` 下恒为 `true`，因此 S-2 自动满足，无需额外代码。

`closed` 的订阅方式不变（`props.useChatGroup(groupKey, group => group?.data.closed)`）。

### 6.5 `AutoAssistantMarkdown`（自实现，约 170 行）

因为 4.4 的结论，必须自己实现这一层。渲染内容对齐官方 `AssistantMarkdown.tsx`：

| block 类型 | 处理 |
|---|---|
| `text` | `MarkdownText`（来自 `dsh-client-ui-primitives`） |
| `reasoning` | 空白文本跳过；否则渲染 `AutoReasoningRow` |
| `image` | 连续图片合并为一组，调用 `renderSlot('conversation.chat.message.images', …)` |
| `tool-call` | 跳过（由 Chat 分组层渲染为工具行） |
| 其他 | `JsonBlock` |

必须复刻的细节：

- `hasVisible` 判定（否则会在工具组之间画出空壳）
- `groupPart === 'reasoning'` / `'response'` 的过滤
- 图片组以**首块索引**为 key（流式追加时避免 remount）
- `interrupted` 的 stopped 标记

需要一并迁移的小工具：

- `markdownLabels(t)`（`src/client/markdown-labels.ts`，小）
- `localPathMediaUrl`（`AssistantMarkdown.tsx:23-28`，5 行，可内联）

### 6.6 `AutoReasoningRow`（克隆 `ReasoningRow`，102 → 约 110 行）

改动：`useDisclosure` 换成 `useAutoDisclosure(reasoningAutoOpen)`。

保留：

- 折叠态的摘要预览（首行 / 最新完成段落首行）与 `TextShimmer`
- `data-variant="think"`、`data-state`、`data-expanded`、`data-preview` 属性（官方 CSS 依赖）
- 展开时通过 `renderSlot('conversation.chat.reasoning.body', { text, running })` 渲染正文 —— 这是**官方 binding**，由 wrapper 透传，因此正文排版（compact Markdown）与官方完全一致
- `running` 的无障碍播报

**新增**：展开/折叠切换时的动画。官方 `DisclosureRow` 折叠即卸载 children；`ReasoningRow.module.css` 的 `.root:not([data-expanded])` 用 `contain: size layout` 固定 24px 高度。我们沿用同一机制，不引入 grid-track 动画（避免与 `flow-motion` 的 fold 批次冲突）。

### 6.7 `GroupOpenContext`

```ts
const GroupOpenContext = createContext<boolean>(true)
```

默认值 `true`：`groupPart === 'response'` 的渲染位于 group 之外，此时无 provider，取默认值不影响（响应区没有 reasoning 块）。

### 6.8 包裹层实现

`src/client/index.ts`：

```ts
function wrapEntry(entries: readonly StoredEntry[], key: string, make: (inner: ComponentType<any>) => ComponentType<any>): () => void {
  const entry = entries.find(e => e.options.key === key)
  if (entry === undefined) return () => {}
  const inner = entry.component as ComponentType<any>
  if (inner === undefined) return () => {}
  const next = make(inner)
  entry.component = next
  return () => { if (entry.component === next) entry.component = inner }
}
```

在 `apply` 中于 `ctx.on('slots/changed')` 上重试（slot 声明顺序不保证），并保证幂等（用 `WeakSet` 记录已包裹的组件）。

包裹顺序：

1. `conversation.chat.flow` → `AutoFlow`
2. `conversation.chat.node` key `assistant-step` → `AutoAssistantNodeView`

`AutoAssistantNodeView` 是薄包装，约 30 行：读取 `GroupOpenContext`，计算 `reasoningAutoOpen` 所需信息，渲染 `<Inner {...props} />` 但**替换内部 markdown 层**——这里存在一个实现细节需要落地验证：官方 `AssistantNodeView` 内部固定引用官方 `AssistantMarkdown`，无法从外部替换。

因此 `AutoAssistantNodeView` 必须**完整重写** `AssistantNodeView` 的 51 行（订阅 `turn-tail`、计算 `mentions`、计算 `reasoningHidden`、渲染 `AutoAssistantMarkdown`），而不是简单包裹。它的 props 全部来自官方 binding，可以完整取得。

---

## 7. 文件清单

| 文件 | 来源 | 预计行数 |
|---|---|---|
| `package.json` | 新写 | ~45 |
| `cordis.patch.yml` | 新写 | ~15 |
| `src/index.ts` | 新写（Host 半边，最小） | ~20 |
| `src/client/index.ts` | 新写（两个包裹点） | ~120 |
| `src/client/auto-disclosure.ts` | 新写 | ~40 |
| `src/client/group-open-context.ts` | 新写 | ~10 |
| `src/client/flow/AutoFlow.tsx` | 克隆 `ChatFlow` | ~70 |
| `src/client/flow/AutoNodeSeat.tsx` | 克隆 `ChatNodeSeat` | ~185 |
| `src/client/flow/AutoGroupSeat.tsx` | 克隆 `ChatGroupSeat` | ~215 |
| `src/client/flow/use-process-scroll.ts` | 克隆 | 88 |
| `src/client/flow/use-scroll-follow.ts` | 克隆 | 182 |
| `src/client/flow/flow-utils.ts` | 内联 `hiddenOrCollapsing` 等 | ~20 |
| `src/client/flow/chat-flow.module.css` | 迁移 `.flowItem` 段 | ~120 |
| `src/client/flow/AutoGroupSeat.module.css` | 克隆 | 150 |
| `src/client/assistant/AutoAssistantNodeView.tsx` | 重写 | ~60 |
| `src/client/assistant/AutoAssistantMarkdown.tsx` | 自实现 | ~170 |
| `src/client/assistant/AutoReasoningRow.tsx` | 克隆 `ReasoningRow` | ~110 |
| `src/client/assistant/markdown-labels.ts` | 迁移 | ~40 |
| `src/client/assistant/*.module.css` | 克隆两份 | ~140 |
| `locale/zh.json`, `locale/en.json` | 新写 | ~10 |

**合计约 1800 行**，其中约 1150 行是克隆/迁移，约 650 行是新增逻辑。

---

## 8. 风险与升级策略

### 8.1 风险

| 等级 | 风险 | 缓解 |
|---|---|---|
| **高** | 改写 `entry.component` 是未公开 API | smooth-stream 已在生产使用；加入运行时防御（entry 不存在则静默跳过）；在 README 声明版本兼容范围 |
| **高** | 克隆的 5 个组件会与上游漂移 | 建立 `scripts/check-upstream-drift.mjs`，对比本地副本与 `node_modules` 中的对应源码，差异超阈值时告警 |
| **中** | `AssistantMarkdown` 自实现遗漏官方细节（新 block 类型、图片边界） | 首版对齐 `0.2.1-rc.2`；把官方源码作为只读参照保留在 `spec/upstream-snapshot/` |
| **中** | 折叠动画与 `flow-motion` 的批次冲突 | 不引入自定义高度动画，完全复用 `useGroupAction`；展开态由 `data-chat-motion` 驱动 |
| **低** | 流式高频更新下的性能 | 沿用官方订阅粒度（每个 seat 订阅自己的 node/group）；`useAutoDisclosure` 只在 autoOpen 变化时 setState |

### 8.2 升级策略

1. 锁定 `engines.dsh: >=0.2.1-rc.2 <0.2.2`。
2. `spec/upstream-snapshot/` 保存克隆时的上游源码快照与 git 引用，便于三方对比。
3. `scripts/check-upstream-drift.mjs` 在 DSH 升级后运行，输出需人工复核的 diff。
4. 若上游把 group/reasoning 的 disclosure 改为可注入（例如新增 Slot 或受控 prop），应优先迁移到官方扩展点并删除克隆。

---

## 9. 未来功能

### 9.1 工具行自动展开（本期不实现）

用户已明确将其列为未来功能。届时需要：

- 扩展 `AutoAssistantMarkdown` 之外的 tool-call 渲染路径（工具行由 `conversation.chat.node` 的 `tool-call` key 渲染，属独立 entry）
- 复用同一 `useAutoDisclosure`，autoOpen 判据为"该工具仍在运行"
- 需要确认与 `tool.call.toolview` 子 slot 的交互

### 9.2 可配置化（候选）

- 第二层折叠时机改为可配置（`closed` / 下一个 group 出现 / Turn 结束）
- 思考折叠延迟（避免思考-工具快速交替时抖动）
- 是否对历史轮次生效

本期按用户确认固定为 `closed` 即折叠，不做配置。

---

## 10. 验收标准

### 10.1 功能

| 编号 | 场景 | 期望 |
|---|---|---|
| A-1 | 新 Turn 开始，模型开始思考 | group body 可见，思考块展开，正文可读 |
| A-2 | 出现中间回复，前面的 group 关闭 | 该 group body 折叠（一次），header 保留 |
| A-3 | 工具调用进行中 | 所属 group body 保持展开，可见工具行（工具行本身折叠） |
| A-4 | 思考结束、开始写正文 | 该思考块折叠 |
| A-5 | group 折叠时思考仍在流式 | 思考随 group 一起不可见（先发生者） |
| A-6 | Turn 结束 | 所有 group 折叠，行为与官方一致 |
| A-7 | 浏览历史 Turn | 与未安装插件时**完全一致** |
| A-8 | 手动展开已折叠的 group | 保持展开，不被自动逻辑收回 |
| A-9 | group body 超过 400px | 内部滚动，出现上下边缘渐变 |
| A-10 | 展开态下内容持续增长 | 跟随到底部；用户滚轮后停止跟随（与官方一致） |

### 10.2 一致性

| 编号 | 场景 | 期望 |
|---|---|---|
| C-1 | 切换 `transcriptView` 四种模式 | 不崩溃；`detailed` / `verbose` 下行为回退为官方（不分组，无 group 可展开） |
| C-2 | 切换 `collapseTiming` | 不崩溃；第一层逻辑不受影响 |
| C-3 | 中英文切换 | 新增文案正确 |
| C-4 | 关闭插件 | 恢复官方渲染，无残留 DOM/样式 |
| C-5 | 会话切换 | 不串状态（disclosure 状态随 seat 卸载清除） |

### 10.3 回归

- 整轮折叠（第一层）行为不变
- 翻页加载（Load older）锚点不变
- 浏览器查找（Ctrl+F）能展开被隐藏内容
- 折叠动画无跳动

---

## 11. 分期计划

| 期 | 内容 | 产出 |
|---|---|---|
| **P0** | 本设计文档 | `spec/DESIGN.md` |
| **P1** | 仓库骨架 + 包裹机制验证 | 能成功改写 flow 与 assistant-step 的 component 并原样渲染（无行为变化） |
| **P2** | 第二层（group body 自动展开/折叠） | A-1、A-2、A-8、A-9 |
| **P3** | 第三层（思考自动展开/折叠） | A-3、A-4、A-5 |
| **P4** | 一致性与回归 | C-1~C-5、A-6、A-7、A-10 |
| **P5** | 升级防护 | drift 检查脚本、README、版本约束 |

每期结束应可独立安装验证，避免长期处于不可用状态。

---

## 附录 A：与 `dsh-smooth-stream` 的关系

两者都做"思考自动展开"，但定位不同：

| 维度 | dsh-smooth-stream | dsh-auto-expand |
|---|---|---|
| 主功能 | 流式打字机 + 滚动平滑 | 过程自动可见 |
| 思考控制方式 | 自实现 `AnimatedReasoning`，用 `MarkdownText` 重写正文 | 保留官方 `reasoning.body` Slot |
| 第二层 group | 不涉及 | **核心目标** |
| 是否遮蔽 entry | 遮蔽 `assistant-step`（priority -100） | 原地包裹，不遮蔽 |
| 设置项 | 有完整设置卡片 | 本期无（行为固定） |

两者可共存的前提：都不遮蔽对方需要的 entry。由于我们采用原地包裹而非遮蔽，理论上前者遮蔽 `assistant-step` 后，我们的包裹会作用在其遮蔽后的组件上，行为叠加。**共存需要实测**，建议安装时二选一，或在 P4 明确验证。

## 附录 B：参考实现索引

| 参考 | 位置 | 用途 |
|---|---|---|
| 原地包裹技法 | `dsh-smooth-stream/src/client/index.ts:115-146` | 4.2 的可行性依据 |
| 派生态写法 | `ui-renderer/src/client/scoped-slots.tsx:737-765` | `useAutoDisclosure` 的写法范本 |
| 折叠动画与滚动补偿 | `ui-chat/src/client/chat/flow-motion.ts` | 复用（不克隆） |
| 分组规则 | `ui-chat/src/client/conversation-nodes/README.md` | 行为对照 |
| 插件包结构 | `dsh-project-groups/package.json`, `cordis.patch.yml` | 打包与 patch 范本 |
