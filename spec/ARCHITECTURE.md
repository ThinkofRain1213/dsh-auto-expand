# dsh-auto-expand 整体设计

> 版本：0.1（设计阶段）
> 目标 DSH：`0.2.1-rc.3`（rc.2 兼容；rc.3 已人工核对，克隆零漂移）
> 配套：[DESIGN.md](DESIGN.md)（技术决策与证据）、[PLAN.md](PLAN.md)（阶段规划）

本文档是**面向实现的架构规格**：组件结构、数据流、接口契约、关键算法。实现时以本文档为准。

---

## 1. 系统上下文

### 1.1 在 DSH 中的位置

```
┌─────────────────────────────────────────────────────────┐
│ DSH Web Client                                          │
│                                                         │
│  conversation.view                                      │
│    └─ conversation.chat.flow        ← 包裹点 ①          │
│         └─ conversation.chat.node   (keyed)             │
│              ├─ assistant-step      ← 包裹点 ②          │
│              │    └─ reasoning.body (官方 Slot)         │
│              ├─ tool-call                               │
│              └─ turn-process / turn-tail / …            │
└─────────────────────────────────────────────────────────┘
```

插件只做两件事：在两个位置**原地替换渲染组件**，其余全部复用官方。

### 1.2 与官方的关系

| 官方能力 | 本插件用法 |
|---|---|
| Slot 注册表 | 读取 `entries()`，改写 `entry.component` |
| `CHAT_FLOW_INJECT` | 直接使用注入的 `useGroupAction` / `useGroupHeaderAction` |
| `chatStore` | 直接使用 `useStore` / `actions`（整轮折叠） |
| `flow-motion.ts` | 复用（不克隆） |
| `conversation.chat.reasoning.body` | 复用（思考正文排版） |
| `conversation.chat.message.images` | 复用（图片渲染） |
| `ui-primitives` | 复用（`MarkdownText` / `DisclosureRow` / 图标） |

**复用比例**：官方约 2000 行渲染逻辑中，约 850 行被复用（40%），1150 行被克隆，650 行为新增。

---

## 2. 分层架构

```
┌──────────────────────────────────────────────────┐
│ 第 0 层：包裹层                                    │
│   src/client/index.ts   wrap.ts                   │
│   职责：找到目标 entry，替换 component，可还原      │
├──────────────────────────────────────────────────┤
│ 第 1 层：Flow 层（第二层折叠）                      │
│   flow/AutoFlow.tsx                               │
│   flow/AutoNodeSeat.tsx                           │
│   flow/AutoGroupSeat.tsx                          │
│   职责：group body 的自动展开/折叠                  │
├──────────────────────────────────────────────────┤
│ 第 2 层：Assistant 层（第三层折叠）                 │
│   assistant/AutoAssistantNodeView.tsx             │
│   assistant/AutoAssistantMarkdown.tsx             │
│   assistant/AutoReasoningRow.tsx                  │
│   职责：思考块的自动展开/折叠                       │
├──────────────────────────────────────────────────┤
│ 第 3 层：共享抽象                                   │
│   auto-disclosure.ts   状态机                     │
│   group-open-context.ts  跨层通信                 │
│   职责：被上面两层共用                              │
└──────────────────────────────────────────────────┘
```

依赖方向**严格单向**：第 1 层 → 第 3 层，第 2 层 → 第 3 层，两层之间只通过 `GroupOpenContext` 通信。

---

## 3. 核心抽象：`useAutoDisclosure`

### 3.1 契约

```ts
/** 自动状态 + 一次性手动覆盖的 disclosure。 */
export interface AutoDisclosure {
  /** 当前是否展开。 */
  readonly open: boolean
  /** 用户显式设置。 */
  setOpen(open: boolean): void
  /** 用户切换。 */
  toggle(): void
}

/**
 * @param autoOpen 当前"应当处于"的自动状态。变化时清空手动覆盖。
 */
export function useAutoDisclosure(autoOpen: boolean): AutoDisclosure
```

### 3.2 语义

| 概念 | 定义 |
|---|---|
| `autoOpen` | 外部计算的期望状态。唯一由业务逻辑决定。 |
| `override` | 用户手动选择。仅在 `autoOpen` 不变期间有效。 |
| `open` | 实际渲染状态 = `override ?? autoOpen` |

**关键规则**：`autoOpen` 一旦变化，`override` 立即丢弃。

这条规则实现"折叠只触发一次"（S-5）：group 从"未关闭"变"已关闭"时 `autoOpen` 由 `true` 变 `false`，override 被清空，渲染折叠。此后 `autoOpen` 恒为 `false`，用户手动展开即设置 `override=true`，且因 `autoOpen` 不再变化，override 永久保持。

### 3.3 实现

```ts
export function useAutoDisclosure(autoOpen: boolean): AutoDisclosure {
  // 已观察到的 autoOpen。与当前值不同说明发生了自动转换。
  const [seen, setSeen] = useState(autoOpen)
  // 用户覆盖。undefined 表示跟随自动。
  const [override, setOverride] = useState<boolean | undefined>(undefined)

  // 派生态：渲染期检测变化并同步，React 会在同一次渲染中重跑（收敛）。
  if (autoOpen !== seen) {
    setSeen(autoOpen)
    setOverride(undefined)
  }

  const open = override ?? autoOpen
  const setOpen = useCallback((next: boolean) => { setOverride(next) }, [])
  const toggle = useCallback(() => { setOverride(prev => !(prev ?? autoOpen)) }, [autoOpen])

  return { open, setOpen, toggle }
}
```

**为什么用派生态而非 `useEffect`**

`useEffect` 会在自动转换后先渲染一帧旧状态，视觉上是一次闪烁。派生态在渲染期同步，React 的 `setState during render` 会立即重跑本组件，**不产生额外帧**。这与 `ui-renderer` 的 `useMaybeIncarnation`（`scoped-slots.tsx:737-765`）是同一技法。

**为什么 `toggle` 依赖 `autoOpen`**

`prev ?? autoOpen` 需要读到当前自动值。`autoOpen` 变化时 `toggle` 重建，但其闭包读到的是新值，正确。

### 3.4 性能保证

- `autoOpen` 不变时：**零 setState**，无额外渲染。
- `autoOpen` 变化时：一次 setState + 一次重渲染。
- 流式输出期间 `autoOpen` 恒定（思考结束前 `running` 恒为 true），因此**流式不影响性能**。

---

## 4. 第二层：Flow

### 4.1 组件树

```
AutoFlow (props: ChatFlowSlotProps)
  ├─ useChat / useSession / usePresentation    ← 官方注入
  ├─ entries.map(entry =>
  │    entry.kind === 'node'  → AutoNodeSeat
  │    entry.kind === 'group' → AutoGroupSeat )
  ├─ pendingInputs.map(...)                    ← 原样保留
  └─ RunningStatus                             ← 原样保留
```

### 4.2 `AutoFlow` 改动清单

| 行 | 官方内容 | 本插件 |
|---|---|---|
| 1-9 | imports | 改路径 |
| 12-31 | 组件签名 + seatProps | 原样 |
| 32-43 | `entries.map` 分发 | `ChatNodeSeat` → `AutoNodeSeat`，`ChatGroupSeat` → `AutoGroupSeat` |
| 44-50 | `pendingRows` | **原样** |
| 51-59 | 空 control 的 splice 逻辑 | **原样**（注释也保留，说明其意图） |
| 60 | 返回值拼接 | 原样 |

**不可改动**：`chatRenderKey` 的用法、`entries` 的顺序、`pendingRows` 的 splice 位置。这些影响 React key 稳定性与滚动锚点。

### 4.3 `AutoNodeSeat` 改动清单

| 行 | 官方内容 | 本插件 |
|---|---|---|
| 49-53 | 签名 | 原样 |
| 54-70 | `turnProcessOpen` / `alwaysOpen` / `setOpen` | **原样**（第一层不动） |
| 71-77 | `foldCompleted` / `processWindowReady` | **原样** |
| 78-92 | `processMember` / `processAnswer` / `ownsDisclosure` / `foldable` | **原样** |
| 93-103 | `turnProcess` useMemo | **原样** |
| 104-110 | `controllerInactive` / `compactAnswer` / `processHidden` | **原样** |
| 111-114 | `revealProcess` / `useGroupAction` | **原样** |
| 115-124 | `disclosureReset` + 重置 effect | **原样**（但它只服务官方 tool 行，见 5.5） |
| 125-139 | `owner` useMemo | **原样** |
| 140-174 | 渲染 | 原样 |

**结论**：`AutoNodeSeat` 相对官方**几乎无改动**，只把渲染的 group 组件换掉。这是刻意的——第一层逻辑完全交给官方。

### 4.4 `AutoGroupSeat` 改动清单

| 行 | 官方内容 | 本插件 |
|---|---|---|
| 132-136 | 订阅 members/turn/closed | 原样 |
| **137** | `useDisclosure()` | **`useAutoDisclosure(!closed)`** |
| 138-145 | `firstKey` / `bottom` / `presentation` / `turnLocation` | 原样 |
| 147-152 | `grouped` / `alwaysOpen` | 原样 |
| 153-160 | `selectOpen` / `storedOpen` / `outerHidden` / `revealOuter` | 原样（第一层） |
| 161-166 | `rootRef` / `headerRef` / `useGroupHeaderAction` | 原样 |
| 167-169 | `outerHidden` 时 `setOpen(false)` 的 effect | **保留**（外层折叠时一并折叠） |
| 170-178 | `reveal` / `bodyRef` / `bodyId` / `useProcessScroll` / `toggle` | 部分改动，见 4.5 |
| 179-203 | 渲染 | 加 `GroupOpenContext.Provider` |

### 4.5 关键改动：滚动初始化

官方 `toggle` 在展开时显式初始化滚动位置：

```ts
// 官方 ChatGroupSeat.tsx:175-178
const toggle = useCallback(() => {
  if (!open) initialize(closed === false ? 'bottom' : 'top')
  setOpen(!open)
}, [closed, initialize, open, setOpen])
```

**自动展开不经过 `toggle`**，因此必须在自动展开时也初始化。设计：

```ts
// 自动展开的初始化：只在"自动从折叠变展开"时触发一次
const prevAutoOpen = useRef(false)
useEffect(() => {
  if (!prevAutoOpen.current && open && grouped) {
    initialize('bottom')   // 未关闭的 group 从底部开始，跟随增长
  }
  prevAutoOpen.current = open
}, [open, grouped, initialize])
```

**为什么是 `'bottom'`**：运行中的 group 内容在增长，用户关心的是最新进展。官方对 `closed === false` 的 group 手动展开时也是 `'bottom'`。

**为什么不复用 `toggle`**：`toggle` 会翻转 `open`，而自动展开时 `open` 已由 `autoOpen` 决定。混用会导致状态竞争。

### 4.6 `GroupOpenContext`

```ts
/** 所属 group 的当前展开状态；无 provider 时视为展开（响应区无思考块）。 */
export const GroupOpenContext = createContext<boolean>(true)
```

提供点：`AutoGroupSeat` 的 `content` 内部，包裹 `GroupMembers`。

```tsx
<GroupOpenContext.Provider value={open}>
  <GroupMembers {...props} members={members} />
</GroupOpenContext.Provider>
```

**为什么放在 group 而不是 seat**：`groupPart === 'response'` 的渲染在 group 之外（`ChatFlow` 的 `kind: 'node'` 分支），此时无 provider，取默认 `true` 不影响——响应区没有 reasoning 块。

消费点：`AutoReasoningRow` 所在路径（见 5.4）。

#### 已知缺陷：Provider 传的是 `open`，而非 body 的真实可见性

body 的隐藏条件是 `grouped && !open`（`AutoGroupSeat.tsx:220` 的
`useGroupAction(grouped && !open, reveal)`），所以 **body 可见 = `!grouped || open`**。
而 Provider 传的是 `open`。

在 `grouped === false` 的场景——`detailed` 模式下运行中的 Turn、以及 `verbose` 模式
——body 视觉上完全平铺展开（无 400px 上限、不带 `hidden`），但 Provider 仍传
`open === false`。后果：这两类模式下思考块**不会**自动展开，即使它明明可见。

**未修复**，因为修它会连带改变"大段关 + 思考开"这一组合的语义（见 4.7）。

### 4.7 两个开关的耦合关系（当前行为）

```
groupAutoExpand ──→ autoOpen = groupAutoExpand && !closed
                          ↓
                     open ──→ GroupOpenContext ──→ groupOpen
                                                      ↓
                          reasoningAutoExpand && running && groupOpen
```

| 大段 | 思考 | 实际行为 |
|---|---|---|
| 开 | 开 | 大段运行中展开；思考流式时在其中展开；段落结束一起折 |
| 开 | 关 | 大段展开；思考保持官方折叠态（只显示首行摘要） |
| **关** | **开** | **两层都折**——思考开关是空操作，界面上该行被门控变灰 |
| 关 | 关 | 等于官方 |

第三行是设计后果而非 bug：思考块在大段体内，大段折叠时它不可见，因此"思考自动
展开"没有意义。

**已处理（2026-10-22）**：这一行曾经是 UI 撒谎——两个开关长得完全独立，用户会
反复拨弄一个永远不生效的开关。现在大段关闭时思考行被门控（`disabled` + `.gated`
变灰 + 描述换成「由「展开工作大段」控制，现已关闭」，`checked` 保留原值），
推导逻辑在 `settings-card-state.ts`，写法照 DPG 先例（`spec/SETTINGS-SPEC.md` 7.2.1）。

#### 被否决的方案：反向耦合

曾考虑让思考流式**驱动**大段展开：

```
思考流式中 → 打开所在大段 + 展开思考
思考结束   → 折叠该大段
同段再思考 → 再打开 + 再展开
```

**否决理由**——`process-groups.ts:147-164` 里 reasoning 成员与 tool-call 成员进的是
**同一个 group**，只有出现 reply 或走到 process 边界才 `flush(true)`：

```
group = [reasoning₁, tool₁, reasoning₂, tool₂, reasoning₃, ...]
```

所以该模型在一轮对话里会开合三四次（每次一条 160ms 折叠动画 + 一次滚动定位），
而且**工具执行期间大段是折叠的**——工具恰恰是最想看的东西。

更根本的是：**渲染结构上思考与大段不可分离**（同在 `.body` 里），想只露思考就得
再加一层过滤，那是另一个量级的改动。而"大段开 + 思考开"已经给了同样的可见性，
只是多露了工具输出。

#### 若将来仍要正交化

最简单的做法是让思考开关在大段折叠时**接管 body 的展开**：

```ts
open = groupAutoExpand && !closed || reasoningAutoExpand && hasRunningReasoning
```

或者直接合成一个三态选择（关闭 / 仅思考 / 全部）。

### 4.8 折叠动画：默认关闭，靠用户设置打开

group body 的隐藏走 `props.useGroupAction(grouped && !open, reveal)` →
官方 `useFlowHidden`，**这条链本来是带折叠动画的**（`flow-motion.ts` 的
70/50/110ms 时间轴）。但它有三道闸门，其中一道在默认设置下永不满足：

```tsx
// ChatView.tsx:211
data-chat-motion={deferCompletedTurns && scroll.initialized && (...) ? '' : undefined}
```

`deferCompletedTurns` = `collapseTiming === 'next-input'`，而默认是 `'completion'`。
**所以默认配置下连官方的 group 折叠也是瞬时的**——插件没有弄坏动画，只是把折叠
频率放大到了跳变会被眼睛捕捉的程度。

**部分改善**：把「设置 → 通用 → 工作步骤收起时机」改成「下次有新消息时」后，
**一轮运行中**的折叠有动画、外层滚动也平滑了。但动画只在
`running || motionTail || pendingInputs` 窗口内存在；历史轮次与手动操作仍无动画。

这一改还会暴露官方的另一个 bug（`capped` 随 `open` 翻转，导致动画测到错误高度，
表现为跳变 + 过度上拉 + 底部空白）。**该 bug 属官方，本插件不修**——
推演见 [MOTION-PLAN.md](MOTION-PLAN.md) 第 2.2 节与其中的"还原决定"。

**思考块仍未解决**：`DisclosureRow` 是 `{open && children}`，没有高度过渡通道，
`[data-chat-motion]` 对完全不在 `useFlowHidden` 链上的它无效。这一层需要改代码，
方案见 [MOTION-PLAN.md](MOTION-PLAN.md) 第 4 节。

---

## 5. 第三层：Assistant

### 5.1 组件树

```
AutoAssistantNodeView (props: ChatNodeViewProps<'assistant-step'>)
  ├─ useTurnData('turn-tail')          ← 官方注入
  ├─ GroupOpenContext                  ← 新增
  ├─ 计算 reasoningHidden / mentions    ← 复刻官方
  └─ AutoAssistantMarkdown
       ├─ blocks.map(...)
       ├─ text      → MarkdownText
       ├─ reasoning → AutoReasoningRow
       ├─ image     → renderSlot('conversation.chat.message.images')
       └─ tool-call → null（由分组层渲染）
```

### 5.2 `AutoAssistantNodeView` 复刻要点

官方 `AssistantNodeView`（51 行）必须**完整重写**，因为它内部固定引用官方 `AssistantMarkdown`，无法从外部替换。

必须复刻的逻辑：

| 逻辑 | 官方位置 | 说明 |
|---|---|---|
| `turn` 提取 | `:15-17` | `location.kind === 'turn' \| 'step'` |
| `useTurnData('turn-tail')` | `:18` | 用于判断是否为 closing assistant |
| `owner` 计算 | `:19-23` | `turn.status === 'closed'` 且 `tail.closing` 匹配 |
| `mentions` | `:24-27` | `fileMentions(owner)` |
| `reasoningHidden` | `:28-32` | 整轮折叠时隐藏思考 |
| `revealProcess` | `:33` | 展开整轮 |

`reasoningHidden` 的语义：当整轮折叠（`turnProcess.open === false`）且该 step 是 answer step 且 `inlineReasoning` 时，思考应被隐藏。**这是第一层的职责，必须保留**，否则整轮折叠时思考会泄漏。

### 5.3 `AutoAssistantMarkdown` 复刻要点

官方 167 行，必须逐条对齐。关键点：

| 要点 | 官方位置 | 遗漏后果 |
|---|---|---|
| `hasVisible` 判定 | `:71-74` | 工具组之间出现空壳行 |
| `groupPart` 过滤 | `:79-80` | reasoning/response 重复渲染 |
| 空白 reasoning 跳过 | `:95` | 空思考行 |
| 图片组以首块索引为 key | `:110-121` | 流式追加时 gallery remount |
| `interrupted` stopped | `:149-151` | 中断态缺标记 |
| 未知 block → `JsonBlock` | `:135-142` | 新 block 类型丢失 |

`markdownLabels(t)` 与 `localPathMediaUrl` 需一并迁移（共约 45 行）。

### 5.4 `AutoReasoningRow` 改动清单

| 行 | 官方内容 | 本插件 |
|---|---|---|
| 48-54 | 签名（含 `useDisclosure` prop） | 改为从 context 读 `groupOpen` |
| **55** | `const { expanded, toggle } = useDisclosure()` | **`useAutoDisclosure(running && groupOpen)`** |
| 56-59 | `summaryText` / `summary` / `preview` | 原样 |
| 60-69 | `collapsedContent` | 原样 |
| 70-74 | `content`（仅展开时渲染） | 原样 |
| 76-101 | 渲染 | 原样 |

**autoOpen 的精确计算**

```ts
const groupOpen = useContext(GroupOpenContext)
// running 由 props 传入：官方 AssistantMarkdown 已计算"是否为最后一个 block 且流式"
const { open, toggle } = useAutoDisclosure(running && groupOpen)
```

`running` 的来源（官方 `AssistantMarkdown.tsx:103`）：

```tsx
<ReasoningRow ... running={streaming && i === last} ... />
```

`i === last` 保证只有最后一个 block 是 running。这自动满足 T-3（只保留最后一段展开）。

**T-2 先发生者的实现**

- 思考结束 → `running` 变 false → `autoOpen` 变 false → 折叠
- group 折叠 → `groupOpen` 变 false → `autoOpen` 变 false → 折叠

两者任一先发生，`autoOpen` 都变 false，`useAutoDisclosure` 清空 override 并折叠。**无需额外逻辑。**

### 5.5 `disclosureReset` 的实际归属（一处需要更正的旧说法）

官方 `ChatNodeSeat` 有这套机制（`ChatNodeSeat.tsx:115-124`）：group 隐藏时递增
`disclosureReset`，`useDisclosure` 检测版本变化即重置。链路是

```
ChatNodeSeat → AssistantNodeView(props.useDisclosure) → AssistantMarkdown
  → ReasoningRow → useDisclosure() 读 reset 版本
```

**本插件在这条链路上把 `useDisclosure` 断开了**：`AutoAssistantNodeView` 不再接收
也不再透传它，`AutoReasoningRow` 用的是 `useAutoDisclosure`。因此：

| 组件 | 是否消费 `disclosureReset` |
|---|---|
| `AutoNodeSeat` | 计算并保留（供官方 tool 行使用） |
| 官方 tool-call 行（`ui-tool`） | ✅ 消费 —— 那些行不在本插件的接管范围内 |
| `AutoAssistantNodeView` → `AutoReasoningRow` | ❌ **不消费** |

**实际后果**：手动展开的**已结算**思考行，在整轮被 `processHidden` 隐藏再显示后，
不会像官方那样回到折叠，而是保持展开。

**这是有意的差异，不是遗漏**。理由：

- 官方的 `disclosureReset` 是给"临时展开"兜底的——它没有自动展开概念，手动展开
  的状态在上下文消失后应该复位；
- 本插件 `useAutoDisclosure` 的语义是"用户覆盖持续到自动状态改变"，用户显式展开
  的内容不应因为整轮折叠而丢失；
- 组件的挂载身份本身提供了一层边界：切换会话再回来，组件重挂载，覆盖自然失效。

若将来要与官方完全一致，做法是把 `disclosureReset` 的值作为 `useAutoDisclosure`
的额外丢弃条件（`autoOpen` 之外再加一个 `resetKey`）。

> **旧版本本节曾称"两套机制互为冗余"，那是错的**——冗余需要两套都生效，而这条
> 链路上的 reset 没有任何消费者。审计（2026-10-22）确认了这一点。

---

## 6. 包裹层

### 6.1 包裹工具

```ts
/** 一次成功包裹的记录，用于还原。 */
interface WrapRecord {
  readonly entry: StoredEntry
  readonly inner: unknown
  readonly outer: unknown
}

/**
 * 在目标 slot 的指定 key 上原地替换 component。
 * @param ctx 客户端 context
 * @param slotKey slot 名
 * @param entryKey keyed slot 的 key；single slot 传 undefined
 * @param make 包装器工厂
 */
function wrapComponent(
  ctx: ClientContext,
  slotKey: string,
  entryKey: string | undefined,
  make: (inner: ComponentType<any>) => ComponentType<any>,
): () => void
```

实现要点：

1. **查找**：`ctx.slots.entries(slotKey).find(e => entryKey === undefined || e.options.key === entryKey)`
2. **幂等**：`WeakSet` 记录已包裹的 `inner`，避免重复包裹
3. **时机**：立即尝试一次 + 订阅 `ctx.on('slots/changed')` 重试
4. **还原**：返回 disposer，在 `entry.component === outer` 时恢复 `inner`

### 6.2 包裹顺序

```
apply(ctx)
  ├─ ctx.effect(() => wrapComponent(ctx, 'conversation.chat.flow', undefined, makeAutoFlow))
  └─ ctx.effect(() => wrapComponent(ctx, 'conversation.chat.node', 'assistant-step', makeAutoAssistant))
```

两者独立，顺序无关。但**必须在官方 entry 已注册后执行**——通过 `slots/changed` 重试覆盖。

### 6.3 未公开 API 的防御

| 防御 | 做法 |
|---|---|
| entry 不存在 | 静默返回 NOOP，不抛错 |
| `entry.component` 非函数 | 跳过并 `console.warn` |
| 已被他人包裹 | `WeakSet` 检测，避免二次包裹 |
| 上游冻结 entry | `try/catch` 包裹赋值，失败则 `console.error` 并降级为不生效 |

**降级策略**：包裹失败时插件不生效，但**不影响 DSH 正常运行**。这比抛错让整个 slot 崩溃要好。

---

## 7. 数据流

### 7.1 第二层状态流

```
Session 事件流
  → Conversation 装配 → Chat snapshot
    → ChatNodeStore (node/group 数据)
      → AutoGroupSeat 订阅 group.data.closed
        → autoOpen = !closed
          → useAutoDisclosure
            → open
              ├─ bodyRef = useGroupAction(grouped && !open)  → 折叠动画
              ├─ capped = grouped                            → 400px 上限
              ├─ useProcessScroll(bodyRef, ..., open, grouped) → 滚动跟随
              └─ GroupOpenContext.Provider value={open}       → 下发给第三层
```

### 7.2 第三层状态流

```
AutoAssistantNodeView
  ├─ props.node.data.blocks（含 reasoning 文本）
  ├─ props.node.data.status（running/settled/interrupted）
  └─ GroupOpenContext（来自第二层）
       ↓
     AutoAssistantMarkdown
       ├─ streaming = status === 'running'
       ├─ last = blocks.length - 1
       └─ 每个 reasoning block:
            running_i = streaming && i === last
            autoOpen = running_i && groupOpen
              ↓
            useAutoDisclosure
              ↓
            展开 → renderSlot('conversation.chat.reasoning.body', { text, running })
            折叠 → 首行摘要预览
```

### 7.3 无数据写入

插件**不写任何持久状态**：

- 不写 Session 日志
- 不写 localStorage / sessionStorage
- 不写 Host 设置
- 所有状态都是组件本地 React state，随卸载清除

这保证了 C-4（卸载恢复）与 C-5（会话切换不串状态）。

---

## 8. 接口契约

### 8.1 依赖的官方类型

全部通过 `import type` 从 `@deepseek-ai/dsh-client-ui-chat/client` 与 `@deepseek-ai/dsh-client-ui-conversation/client` 获取：

```ts
import type {
  ChatFlowSlotProps, ChatNodeViewProps, ChatNodeOwnerProps,
  TurnProcessOwnerProps, ChatGroupTree,
} from '@deepseek-ai/dsh-client-ui-chat/client'
import type {
  GroupKey, NodeReference, RenderEntry, GroupSnapshot,
} from '@deepseek-ai/dsh-client-ui-conversation/client'
```

**只做类型导入**，不产生 value 依赖。这样 bundle 不会打入第二份官方代码。

### 8.2 依赖的官方运行时值

| 值 | 来源 | 用途 |
|---|---|---|
| `MarkdownText` | `ui-primitives` | 正文渲染 |
| `JsonBlock` | `ui-primitives` | 未知 block |
| `DisclosureRow` | `ui-primitives` | 思考折叠壳 |
| `TextShimmer` | `ui-primitives` | 流式标题 |
| `IconThinkOutlineRegular` 等 | `ui-primitives` | 图标 |
| React | `react` | — |

这些必须在 tsdown 配置中 **external**，由 shell 的模块表提供。

### 8.3 不依赖的官方值

以下**不能** value import（会打入第二份）：

- `@deepseek-ai/dsh-client-ui-chat`（整个包）
- `@deepseek-ai/dsh-client-ui-conversation`
- `@deepseek-ai/dsh-client-ui-slots`（除类型）

`ui-slots` 的 `StoredEntry` 类型可用，但 `SlotCore` 等运行时值不可用。我们通过 `ctx.slots` 服务访问，而非直接实例化。

---

## 9. 样式策略

### 9.1 必须克隆的样式

| 文件 | 原因 |
|---|---|
| `ChatGroupSeat.module.css`（150 行） | group body 上限、渐变、间距 |
| `ChatView.module.css` 的 `.flowItem` 段（约 120 行） | 行间距、空行消除、response 间距 |
| `ReasoningRow.module.css`（70 行） | 思考行布局、摘要省略、sticky header |
| `AssistantMarkdown.module.css`（约 40 行） | 正文容器 |

### 9.2 样式隔离

克隆的 CSS Module 会被 lightningcss 重新哈希（`[hash]_[local]`），因此**不会与官方类名冲突**。

但 `data-*` 属性选择器是全局的，必须原样保留：

| 属性 | 依赖方 |
|---|---|
| `data-chat-flow` | `ChatView.module.css` 的间距规则 |
| `data-chat-group-key` | 测试与调试 |
| `data-step-process` | 官方样式 |
| `data-chat-motion` | `flow-motion.ts` |
| `data-turn-process-*` | 官方样式 |

### 9.3 不克隆的样式

`flow-motion.ts` 相关样式（`[data-chat-motion]` 的过渡）由官方 `.column` 上的属性驱动，我们通过 `useGroupAction` 注入的 hook 触发，**无需克隆样式**。

---

## 10. 错误处理

### 10.1 分层降级

| 失败点 | 降级行为 |
|---|---|
| 包裹失败 | 插件不生效，DSH 正常运行 |
| `useAutoDisclosure` 抛错 | 该组件边界捕获，渲染空（slot 机制自带） |
| `renderSlot` 调用失败 | 不调用即降级为纯文本（不应发生） |
| locale 缺失 | `t` 返回 key 本身 |

### 10.2 不可降级

以下属于**配置错误**，应显式失败：

- `package.json` 的 `dsh.client.inject` 缺少必需包
- `cordis.patch.yml` 的 insert 名称错误

这些由 DSH 的加载器在启动时报错，不属插件运行时。

### 10.3 日志规范

```ts
const TAG = '[dsh-auto-expand]'

// 包裹成功（仅 debug 级别，生产静默）
// 包裹失败：必须 warn，因为用户会困惑"为什么没效果"
console.warn(`${TAG} 未能包裹 ${slotKey}:${entryKey}，插件不生效`)
```

---

## 11. 关键算法汇总

### 11.1 自动状态判定

```ts
// 第二层
groupAutoOpen = !group.data.closed

// 第三层
reasoningAutoOpen = running && groupOpen
//   running     = streaming && i === blocks.length - 1
//   groupOpen   = useContext(GroupOpenContext)
```

### 11.2 一次性折叠

```ts
if (autoOpen !== seen) {
  setSeen(autoOpen)
  setOverride(undefined)   // 丢弃手动覆盖 → 回到 autoOpen
}
open = override ?? autoOpen
```

### 11.3 自动展开的滚动初始化

```ts
useEffect(() => {
  if (!prevOpen.current && open && grouped) initialize('bottom')
  prevOpen.current = open
}, [open, grouped, initialize])
```

### 11.4 包裹幂等

```ts
const wrapped = new WeakSet<object>()
if (wrapped.has(entry.component)) return NOOP
wrapped.add(outer)
entry.component = outer
```

---

## 12. 实现顺序建议

按依赖关系排序，每步都可独立验证：

| 步骤 | 内容 | 验证 |
|---|---|---|
| 1 | `useAutoDisclosure` + 单元测试 | U-1~U-6 |
| 2 | `wrapComponent` 工具 | 包裹后渲染不变 |
| 3 | `AutoFlow`（pass-through） | 页面正常 |
| 4 | `AutoNodeSeat`（pass-through） | 页面正常 |
| 5 | `AutoGroupSeat`（pass-through） | 页面正常 |
| 6 | `AutoGroupSeat` 接入 `useAutoDisclosure` | A-1、A-2 |
| 7 | 滚动初始化 | A-9、A-10 |
| 8 | `AutoAssistantNodeView`（pass-through） | 页面正常 |
| 9 | `AutoAssistantMarkdown`（pass-through） | 页面正常 |
| 10 | `AutoReasoningRow` 接入 | A-4 |
| 11 | `GroupOpenContext` 联通 | A-5 |
| 12 | 全量回归 | C-1~C-5 |

**关键**：步骤 3-5 和 8-9 都是 pass-through（先不改行为），确保每层单独可验证后再叠加功能。这样任何一步出问题都能精确定位。

---

## 附录：与官方源码的对应表

| 本插件文件 | 官方源文件 | 改动程度 |
|---|---|---|
| `flow/AutoFlow.tsx` | `chat/ChatFlow.tsx` | 仅改两个组件引用 |
| `flow/AutoNodeSeat.tsx` | `chat/ChatNodeSeat.tsx` | 仅改两个组件引用 |
| `flow/AutoGroupSeat.tsx` | `chat/ChatGroupSeat.tsx` | disclosure 替换 + context 提供 |
| `flow/use-process-scroll.ts` | `chat/use-process-scroll.ts` | 逐字克隆 |
| `flow/use-scroll-follow.ts` | `chat/use-scroll-follow.ts` | 逐字克隆 |
| `assistant/AutoAssistantNodeView.tsx` | `chat/AssistantNodeView.tsx` | 重写（换 Markdown 层） |
| `assistant/AutoAssistantMarkdown.tsx` | `chat/AssistantMarkdown.tsx` | 重写（换 ReasoningRow） |
| `assistant/AutoReasoningRow.tsx` | `chat/ReasoningRow.tsx` | disclosure 替换 |
| `assistant/markdown-labels.ts` | `markdown-labels.ts` | 逐字克隆 |
| `auto-disclosure.ts` | — | 全新 |
| `group-open-context.ts` | — | 全新 |
| `wrap.ts` | — | 全新 |
