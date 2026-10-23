# 能力矩阵

> 日期：2026-10-23（§1.2.1 于同日第二次查证后修订：思考与工具统一为四个时机）
> 状态：**已实施**（P8）。用户授权落盘。
> 上游：`@deepseek-ai/dsh-client-ui-chat` / `dsh-client-ui-tool` @0.2.1-rc.2，commit `687f282e86`

---

## 0. 一句话

把「让当前轮的工作保持可见」拆成一组**正交的能力维度**（展开对象 × 触发条件 × 收起时机 × 高度 × 动画），
逐项标注官方现状、插件现状、代价与状态。

**这张表是后续所有「展开 / 收起」类需求的入口。** 拿到新需求先在这里定位是哪一格，
再决定是复用已有机制、新增接管点，还是直接归入否决项。

---

## 1. 主矩阵

状态图例：

| 符号 | 含义 |
|---|---|
| ✅ | 已实现并真机验收 |
| ⚠️ | 已实现但存在已知未解决问题 |
| 🔶 | 设计/可行性已明确，**未实施** |
| ⏸️ | 设计完成，用户决定**暂缓** |
| ❌ | 已否决或判定不可行 |
| 🔍 | **未验证**，结论基于代码阅读，必须真机确认 |

### 1.1 A 组：展开能力（谁自动展开）

| # | 能力 | 作用对象 | 官方现状 | 插件现状 | 设置项 | 状态 |
|---|---|---|---|---|---|---|
| A1 | **操作组大段自动展开** | 当前轮的操作组 body（`ChatGroupSeat`） | 默认折叠 | 已实现：`useAutoDisclosure(!closed)` | `groupAutoExpand` | ✅ P2 |
| A2 | **思考自动展开** | `assistant-step` 的 reasoning 行 | 恒折叠 | 已实现：`useAutoDisclosure(running && groupOpen)` | `reasoningAutoExpand` | ✅ P3 |
| A3 | **工具自动展开** | `tool-call` 节点的工具行（`ToolRow`） | 恒折叠 | ✅ **已实现**：包裹 `ToolCallTree`，零新增克隆 | `toolAutoExpand` | ✅ P7 |
| A4 | 工具自动展开**按工具细分** | 按工具名 / 工具类别分策略 | — | 未做 | 无 | ⏸️ 未来（用户已预埋） |
| A5 | 整轮（大对话轮次）展开 | `turn-process` 节点 | 由 `collapseTiming` 控制 | 未接管（**刻意**） | 官方 `collapseTiming` | ✅ 官方 |

### 1.2 B 组：收起时机（何时收）

| # | 能力 | 作用对象 | 官方现状 | 插件现状 | 状态 |
|---|---|---|---|---|---|
| B1 | 操作组 body 收起时机 | group body | 「正文出现」即收，且**只有一次** | 同官方（未偏离） | ✅ |
| B2 | **思考收起时机（默认）** | reasoning 行 | 手动 | 可配置，默认「下一批操作出现时」 | ✅ P8 |
| B3 | **思考收起时机可配置** | reasoning 行 | — | ✅ 四选一（与工具相同） | ✅ P8 |
| B4 | **工具收起时机** | 工具行 | 手动 | ✅ 四选一，默认「下一批操作出现时」 | ✅ P8 |
| B5 | 整轮收起时机 | `turn-process` | `completion` / `next-input` | 未接管 | ✅ 官方 |

### 1.3 C 组：官方入口的收纳（✅ P9）

| # | 能力 | 作用对象 | 官方现状 | 插件现状 | 状态 |
|---|---|---|---|---|---|
| C1 | **查看按钮的隐藏范围** | `ToolRow` 的 `inspectButton` | 悬停显现，不可配置 | ✅ 三选一：不隐藏（默认）/ 仅当前轮 / 全部轮次 | ✅ P9 |
| C2 | 工具行按工具细分策略 | 按工具名 / 类别 | — | 未做 | ⏸️ 未来（用户已预埋，见 A4） |

#### 1.3.1 查看按钮：**一处拦截，五处连带消失**

官方的「查看」按钮由**一个信号**决定是否渲染：

| 位置 | 判据 |
|---|---|
| `ToolRow.tsx:357`（通用工具行） | `inspect !== undefined` |
| `QuestionToolRow.tsx:57`（提问行） | 同上 |
| `bash-sample.tsx:158`（bash 示例行） | 同上 |
| `ToolRow.tsx:325` → `ToolDetails` 的 `hasInspect` | 同上 |
| `ToolRow.module.css:126` 的 `.inspectButton` 占位 | 同上（不渲染则行高消失） |

而 `inspect` 由 `ToolCallTree.tsx:38` 从 props 的 `inspectCall` 派生。因此本插件
只需在包裹层（`AutoToolCallTree`）决定**是否透传 `inspectCall`**——不改 CSS，
不克隆 `ToolRow`。判据见 `src/client/inspect-button-scope.ts`。

> **为什么不能只把按钮变透明**：官方 `.inspectButton` 平时就是 `opacity: 0`，
> 但仍然 `display: inline-flex` + `margin: 4px 0 2px 4px` 占着一行高度。
> 只藏视觉会留下一条空行——这正是本能力要一并去掉的东西。

**一个真实边界**：「仅当前轮」下，轮次**刚结束**那一刻 `GroupOpenContext.auto`
变假，按钮会重新出现。这与「操作组自动展开」完全同构（轮次结束后交回官方），
不是缺陷；要覆盖「刚结束的那轮」需另立判据，本期不做。

#### 1.2.1 收起时机：**四个**（2026-10-23 第二次查证，✅ P8 已实施）

**思考与工具**：同一套四个时机、同一段判据。两者都由操作组提供同样的两个坐标，
因此不存在「某个时机只对某一方有意义」。

| # | 时机 | 判据 | 坐标 | 范围 |
|---|---|---|---|---|
| **1** | **本条完成时** | `!done` | — | 本条 |
| **2** | **下一条操作出现时** | 自己是**最新一条已开始**的操作 | 操作级 | **永远单条** |
| **3** | **下一批操作出现时**（默认） | `step >= latestStep` | 批次级 | 同批多条 |
| **4** | **随操作组收起** | 恒真 | — | 全部 |

顺序 = 下拉展示顺序 = **收起由早到晚**（也是展开范围由窄到宽）。

> **为什么两边对称**（2026-10-23 修订，推翻同日早些时候的结论）：
>
> 曾给思考裁掉 ②，理由是「`assistant-step` 的 key 是 `turn:step`
> （`assistant.ts:297`）——一个 step 只有一段思考」。**该事实成立**，但它不足以
> 支撑裁剪：
>
> - 思考行同样读 `anchorSeq`，② 在它身上**真实成立**且**真的会得出不同结果**
>   （思考所属节点的 `anchorSeq` 是本节点首条可见 chunk 的 seq，本 step 的工具
>   一出现就会被取代）；
> - 裁剪的直接后果是三套分叉：两份时机列表、两套文案、两个 Host 枚举。
>
> 结论：**按真实语义，两个对象完全对称**。差别只在信号怎么取，不在判据本身。

> **② 与 ③ 的真实差别**（并行 vs 串行）：
>
> | 场景 | ③ 下一批 | ② 下一条 |
> |---|---|---|
> | A/B/C **同批串行** | 三条一起留，直到下一批 | **逐条交替**：A 完保持，B 开始才收 A |
> | **真并发**（多个 `read`） | 三条一起留，直到下一批 | 同时开始 → 一起展开 |
>
> ③ 是「同批累积」，② 是「永远单条」。

> **为什么操作判据必须只统计「已开始」**（2026-10-23 真机修复）：
>
> 工具节点在**流式阶段**（`phase === 'preparing'`）就被创建，`anchorSeq` 此刻
> 已经定死。若把未执行的成员也算进「最新」，同一批派发的多条工具会在执行前就
> 分出胜负——只有序号最大的那条能展开（真机已复现「只有最后一条展开」）。
>
> 只统计走出 `preparing` 的成员，最新者才会随执行推进而前移：
>
> | 时刻 | 已开始成员 | 最新 | 结果 |
> |---|---|---|---|
> | 三条都在 preparing | 只有思考节点 | 思考 | 都展开着等执行 |
> | A 执行中 | 思考、A | A | 只有 A 展开 |
> | A 完成、B 未开始 | 思考、A | A | A 保持展开 |
> | B 开始 | 思考、A、B | B | A 收起、B 展开 |
> | 全部完成 | 思考、A、B、C | C | 只留 C 展开，不再整批重开 |
>
> 实现：`startedAnchorOfNode()`（`collapse-timing.ts`）过滤 `preparing`，
> `AutoGroupSeat` 遍历成员把结果放进 `GroupOpenContext.latestStartedAnchorSeq`。

> **两个坐标的粒度**：
> `step` 表达**批次**（同一次模型输出派发的操作共享同一 step）；
> `anchorSeq` 表达**单条操作**（每节点唯一），但**必须过滤未开始的成员**
> （见上一段）。两者解决的是不同问题，缺一不可。
>
> ⚠️ `step` 在 `result` 阶段**不存在**（`ToolResultNode` 不继承 `ToolCallHead`），
> 因此插件侧用 `useRef` 把它固定下来（`useStableToolStep`）。否则工具一完成就会被
> 判为「非最新」而错误收起——真机已复现并修复。详见 `P8-PLAN.md` §2.3.1。

**默认值**：思考与工具都是 **3（下一批操作出现时）**。

### 四段统一判据

四个时机可以归约成**同一个公式**（思考与工具**完全共用**）：

```
enabled    = 开关 && groupOpen && groupAuto
self       = enabled && !done
next-call  = enabled && isLatestNode      // anchorSeq，且只统计 started 成员
next-node  = enabled && isLatestBatch     // step
group      = enabled
```

每个对象提供的信号（**两边都齐全**）：

| 信号 | 思考 | 工具 |
|---|---|---|
| `done` | `!running`（非流式尾部） | `'kind' in node.data.root`（`result` 阶段） |
| `isLatestBatch`（step） | ✅ `data.step` | ✅ `data.root.step`（`result` 阶段用 `useRef` 固定） |
| `isLatestNode`（anchorSeq） | ✅ 节点自带 | ✅ 节点自带，但**只有 `started` 为真时才参与判据** |
| `started` | 恒为真（节点一出现就在流式产出） | `root` 非 `preparing` |

### 代码证据（全部查证，非推理）

| 事实 | 证据 |
|---|---|
| **`step` 是模型输出轮次，并行工具共享** | `ToolCallHead.step`（`records.ts:277`）；`rootCall` 填 `match.event.data.step` |
| **`step` 只到节点级（一个 step 一个 assistant-step 节点）** | `assistant.ts:297` 的 key 是 `turn:step` |
| **思考是 `assistant-step` 节点内部的 block，不是独立节点** | `assistant.ts:104-136` 的 `blocks[chunk.index]`；`assistant.ts:60` `blockIsVisible` 对 `tool-call` 返回 false |
| **思考的 `anchorSeq` 是节点级的** | `assistant.ts:266`：`firstVisibleSeq ?? settled.seq` |
| **工具的 `anchorSeq` 是它自己的** | `tool.ts:343-344`：`context.start?.event.seq` |
| `anchorSeq` 全阶段稳定 | `common.ts:47` 注释「sortable render position」；`chat-snapshot-builder.ts:100` 用它排序 |
| group 成员列表有序 | `groups.ts:28` 注释「**ordered, non-nested** Node references」 |
| group 层能拿成员节点数据 | `AutoGroupSeat.tsx` 用动态 key：`props.useChatNode(lastKey, …)` |
| 工具行的 step | `node.data.root.step`（`ToolCallTree.tsx:111` 的 `node`） |
| 思考行的 step | `node.data.step`（`AssistantChatData.step`） |
| 思考完成信号 | `AssistantChatData.status: 'running' \| 'settled' \| 'interrupted'` |
| 工具完成信号 | `ToolCallTree.tsx:11`：`'kind' in block` 即 `result` 阶段 |

### 为什么不需要行身份（推翻 §3 的旧结论）

判据是**节点级**的：思考行属于 `assistant-step`、工具行属于 `tool-call`，
两者都从自己的 `step` / `anchorSeq` 出发，与「本组最新成员」的对应坐标比较。

`ToolRow` 不暴露 callId 这件事**不再是障碍**——它不需要知道「我是第几行」，
只需要知道「我所属的节点是不是最新/最新一批」。

### 四个真实边界（查出来的）

1. **历史组的 `members` 可能不完整**（分页加载时）。但历史组 `group.auto === false`，
   统一判据里已含 `groupAuto`，该场景被天然挡住。
2. **同一节点可能在 `members` 里出现两次**（`NodeReference.groupPart` 区分
   reasoning / response 两半）。同一节点的 `step` 相同，`isLatest` 不受影响。
3. **取不到 `step` 时保守展开**：`locationStep` 在非 step location 返回 `0`；
   `stepOfNode` 对不适用的节点返回 `undefined`，`isLatestStep` 视其为最新。
4. **自动收起会连带卸载行内浮层**（如图片灯箱）：`ToolRow` 收起时不渲染 children，
   `MessageImage` 的 `useState` 随之销毁。**记录为已知限制**，见 `CHANGELOG.md`。

### 一个真实语义边界（不是缺陷）

若**同一个 `assistant-step` 节点里出现多段思考**（`reasoning → text → reasoning`，
`assistant.ts` 的 `blocks` 数组按 `chunk.index` 存放，类型上不禁止），它们共享
**节点级**的 `anchorSeq`（`assistant.ts:266`），因此「下一条操作出现时」判据
**无法把这几段区分开**——同进同退。

这不是需要修的 bug：它们本来就在同一个节点里，节点级判据区分不了它们。
为「看起来更合理」再加约束，只会让判据与真实结构脱节。

### 配置形态（开关与时机**解耦**）

开关管「要不要自动展开」，时机管「什么时候收起」——两个独立维度，各自占字段与 UI 行。
**现有三个开关一个都不动。**

| 字段 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `groupAutoExpand` | boolean | `true` | 已有，保留 |
| `reasoningAutoExpand` | boolean | `true` | 已有，保留 |
| `toolAutoExpand` | boolean | `true` | 已有（P7），保留 |
| `reasoningCollapseTiming` | `CollapseTiming`（四个取值） | `'next-node'` | **新增** |
| `toolCollapseTiming` | `CollapseTiming`（同一个类型） | `'next-node'` | **新增** |

两个字段**共用同一个类型与同一个取值列表**（`COLLAPSE_TIMINGS`），Host schema 里
两者都是 `z.union([...COLLAPSE_TIMINGS])`。

设置卡片从 3 行变成 **5 行**，按「操作组 / 思考 / 工具」**三组**排列——
同一对象的开关与时机**相邻**，读起来就是「这一层开不开、什么时候收」的连续两行：

| 行 | 控件 | 内容 |
|---|---|---|
| 1 | Switch | 自动展开操作组 |
| 2 | Switch | 自动展开思考过程 |
| 3 | **下拉** | 思考收起时机 |
| 4 | Switch | 自动展开工具结果 |
| 5 | **下拉** | 工具收起时机 |

两个下拉的选项**完全相同**（同一个 `timingOptions`），都是**四选一**，
**不含「关闭」**——关闭是 Switch 的职责，不该混进时机里。

**门控链（在现有基础上多一层）**

| 行 | 被谁锁 |
|---|---|
| 1 自动展开操作组 | 永不锁 |
| 2 自动展开思考过程 | `!groupAutoExpand` |
| 3 思考收起时机 | `!groupAutoExpand \|\| !reasoningAutoExpand` |
| 4 自动展开工具结果 | `!groupAutoExpand` |
| 5 工具收起时机 | `!groupAutoExpand \|\| !toolAutoExpand` |

即「开关没开，挑时机没有意义」——与现有「操作组没开，思考/工具行变灰」是同一套先例。

> B1 的「只有一次」很关键：group 的 `closed` 一旦置真就**永久**保持
> （`ProcessGroup.refresh` 对 closed 组强制清空 summary）。
> 所以「大段完成后收起」这类需求，实际上**与 B2 的现有行为重合**——见 §6.3。

### 1.3 C 组：高度与滚动

| # | 能力 | 作用对象 | 官方现状 | 插件现状 | 状态 |
|---|---|---|---|---|---|
| C1 | 操作组 400px 上限 | group body | 官方公式 `grouped && (!deferCompletedTurns \|\| open)` | **已还原为官方** | ✅ |
| C2 | 完整展示当前轮（去掉上限） | 当前 group body | 无此概念 | 设计完成 | ⏸️ `SETTINGS-EXTENSION.md` §2 |
| C3 | 历史轮次最大高度 | 历史 group body | 官方公式 | 设计完成 | ⏸️ `SETTINGS-EXTENSION.md` §3 |
| C4 | 思考块最大高度 | reasoning body | **无上限**（官方设计） | — | ❌ `SETTINGS-EXTENSION.md` §7 |
| C5 | 内层滚动搬到外层 | group body | 内层 400px 内部滚动 | — | ❌ 见 §7 |
| C6 | 内容增长时外层平滑 | 外层视口 | `followTail()` 默认 **`instant`** 硬写 | — | ❌ `MOTION-PLAN.md` §6.3 |

### 1.4 D 组：动画

| # | 能力 | 官方机制 | 插件现状 | 状态 |
|---|---|---|---|---|
| D1 | 折叠动画（运行中窗口内） | `flow-motion.ts` | 用户设 `collapseTiming: next-input` 即可 | ✅ 靠设置 |
| D2 | 折叠动画**脱离**运行中窗口 | 无（三重闸门） | — | 🔍 低难度但**有风险**，`MOTION-PLAN.md` §6.5 |
| D3 | 展开动画（group body） | **官方写死无动画**（`grow=false`） | — | 🔍 必须自建 |
| D4 | 展开/收起动画（思考块） | 无（`DisclosureRow` 不在 `useFlowHidden` 链上） | — | 🔍 必须自建 |
| D5 | **独立实现整套动画** | 替换官方引擎 | — | 🔶 本轮新想法，见 §8 |

### 1.5 E 组：一致性与边界（不可回退的承诺）

| # | 约束 | 现状 |
|---|---|---|
| E1 | **历史轮次完全不受影响** | ✅ 本插件的核心承诺，未破坏 |
| E2 | 手动覆盖优先（「先发生者」） | ✅ `useAutoDisclosure`：`autoOpen` 变化时丢弃手动覆盖 |
| E3 | 搜索能命中折叠内容（`hidden="until-found"`） | ✅ 沿用官方 `searchable-hidden.ts` |
| E4 | 焦点保护 | ✅ 沿用官方 |
| E5 | 组标题在 `grouped` 时隐藏 | ✅ 同官方 |
| E6 | 空 `assistant-step` 的 6px 间隙 | ✅ 插件用自己的 CSS 覆盖修掉 |

---

## 2. 接管点矩阵（本项目的技术资产）

**这一节回答「要改某个行为，该动哪里」。**

| 层 | 官方组件 | 归属包 | 插件接管手段 | 现状 |
|---|---|---|---|---|
| ① 整轮 | `TurnProcessNodeView` | `ui-chat` | 未接管（刻意） | — |
| flow | `ChatFlow` | `ui-chat` | `wrapEntry` 替 `entry.component` | ✅ `AutoFlow` |
| node seat | `ChatNodeSeat` | `ui-chat` | `wrapEntry` | ✅ `AutoNodeSeat` |
| ② group seat | `ChatGroupSeat` | `ui-chat` | `wrapEntry` | ✅ `AutoGroupSeat` |
| ③ assistant 链 | `AssistantNodeView` → `AssistantMarkdown` → `ReasoningRow` | `ui-chat` | `wrapEntry` + 克隆 | ✅ 三个克隆 |
| ④ **工具行** | `ToolCallTree` → `ToolRow` | **`ui-tool`** | **`wrapEntry` 包裹 + 覆盖 `useDisclosure` prop** | ❌ 未做 |

### 2.1 一个此前未被利用的机制：`useDisclosure` 是可注入的 slot hook

`ui-chat/src/client/apply.ts:69`：

```ts
disclosure: (_standard, { disclosureReset }) => bindDisclosure(disclosureReset),
```

- 第一个参数 `_standard` 是**官方默认实现** → 该注入点**设计上允许包装**。
- 数据来源是 `ChatNodeSeat` 构造的 `hookContext`（`ChatNodeSeat.tsx:117-119`），
  随 `renderSlot('conversation.chat.node', ...)`（`:161-163`）传给**每一个** node 渲染器。
- 因此 **思考行与所有工具行共享同一个 hook 工厂**。

### 2.2 但这个契约是「重置式」的，必须知道

`use-disclosure.ts:13`：

```ts
const expanded = expandedVersion === version   // 初始必为折叠
```

它只有两个输入：**用户点开**、**`version` 前进 → 强制回折叠**。
**没有外部 open 输入**；下游 `ReasoningRow` / `ToolRow` 是官方组件，只会按官方契约无参调用。

**推论：hook 内部拿不到「这一行是否 running」「是第几条调用」。**
任何「按行状态自动展开」的设计，都必须由**调用方的父组件**提供信息（React context 或替换 prop）。

### 2.3 未展开时正文根本不挂载

`ReasoningRow.tsx:70` 的 `content = expanded ? <...> : undefined`，工具行同理。
**任何 CSS / DOM 补丁都不可能伪造「展开」**，必须真正改写 React state。

---

## 3. 信号可得性矩阵（`autoOpen` 判据）

**这一节回答「自动展开 / 收起能靠什么信号驱动」。** 结论标注验证状态。

| 信号 | 来源 | 精度 | 验证 |
|---|---|---|---|
| 思考是否流式 | `AssistantMarkdown` 传 `running = streaming && i === last` | 精确 | ✅ 真机验收 |
| 所属 group 是否展开 | `GroupOpenContext` | 精确 | ✅ |
| group 是否已关闭 | `AutoGroupSeat` 的 `closed` | 精确 | ✅ |
| 工具是否运行中 | `ToolRowModel.state`（`preparing` / `running` / `ok` / `error` / `stopped`） | 精确 | 🔍 代码可见，未真机 |
| 「出现了下一次调用」 | group `summary.counts` 变化 | 中 | 🔍 未验证 |
| **本行是第几条调用** | **不可得**（`ToolRow` 不暴露任何身份） | — | ❌ 结构性缺失 |

> 最后一行是「只展开最新一条工具行」的**唯一硬障碍**。绕过它需要利用
> 「hook 在渲染期间按树顺序同步执行」这一 React 实现细节做计数器——
> 脆弱（并发渲染 / StrictMode 双渲染可能错位），不推荐。

---

## 4. 本轮讨论的五个议题（用户提出）

| # | 议题 | 结论 | 详见 |
|---|---|---|---|
| 1 | 独立实现展开/收起动画 | 可行，但必须同时复刻三件契约 | §8.1 |
| 2 | 把内层丝滑滚动搬到外层 | **建议不做**（与官方逐帧写入冲突） | §7 |
| 3 | 只自动展开思考、思考完收 | **部分已实现**；「收起大段」有歧义 | §6.1 |
| 4 | 工具结果自动展开，下一次调用/大段完成时收 | **重新可行**（推翻 P4 的悲观结论） | §5 |
| 5 | 思考收起时机（完成 / 下一次调用 / 大段完成） | 前两者已实现，第三者缺失 | §6.2 |

---

## 5. 关键修订：工具行自动展开**重新可行**（对 P4 的修正）✅ 已实施

`P4-ROLLBACK.md` 得出的结论是：

> P5 之后若再考虑工具行自动展开，必须①克隆约 2644 行依赖树，或②找到官方组件复用途径（当前不存在），
> 或③接受只对已注册 toolview 生效（不可接受）。

**本轮探查证明①②③都不是唯一选项**，原因是 P4 的做法与现在可行的做法是**两回事**：

| | P4 的做法（已回滚） | 现在可行的做法 |
|---|---|---|
| 手段 | **替换** `tool-call` 的渲染器为极简实现 | **包裹**官方 `ToolCallTree`，只覆盖它的 `useDisclosure` prop |
| 后果 | 官方 toolview 分派 + `GenericToolCard` fallback **全部丢失** → `pwsh` 退化为纯文本 | 官方 toolview 分派 + fallback **原样保留** |
| 规模 | 514 行 + 需再克隆 2644 行 | 一个包裹组件 + 一个 hook 工厂 |

技术依据：

- `ui-tool/src/client/apply.ts:34-42` 注册 `ToolCallTree` 为 `conversation.chat.node` 的 `tool-call` key。
- `ToolCallTree` 的 `useDisclosure` 来自 **props**（`ToolTreeProps`，`ToolCallTree.tsx:37,111`），
  并向下透传给 `ToolCall` → toolview → `ToolRow`。
- 插件已有 `wrapEntry` 基础设施（P1 已验证），可在**不改注册、不替换组件**的前提下替换这个 prop。

**因此：**
1. §7.3 那三条约束**作废**，更新为「优先用包裹法」。
2. §7.1 / §7.2 的教训**依然有效**——而且包裹法正是对 §7.2（「接管渲染器前先枚举所有分支产出」）
   的正面回应：不替换组件，就不需要枚举分支。
3. 仍有**未验证项**：包裹后 `pwsh` 终端卡片是否完整、`SubCalls` 递归是否正常。
   **必须真机验证，不得凭代码阅读下结论**（本项目已多次在此翻车）。

### 5.1 两种目标语义，成本差一个量级

| 目标 | 判据 | 可行性 |
|---|---|---|
| **整组统一**：当前轮所有工具行一起展开，随 group 收起 | `toolAutoExpand && groupOpen && liveTurn` | ✅ 简单、稳定，**hook 不需要知道行的身份** |
| **只展开最新一条**：旧的在下一次调用时收起 | 需要「本行是第几条」 | ⚠️ 见 §3 最后一行，不推荐 |

### 5.2 叠加效应提醒

工具行展开 + `capped` 仍是官方 400px 上限 → 内容变长且**走内层滚动**。
若再叠加 C2（去掉上限）或 C5（搬外层），页面会非常长。**这四项不要一起上。**

---

## 6. 思考相关的两个议题细节

### 6.1 议题 3：「收起大段」有歧义

- **理解①：收起思考块本身。** → **当前已满足**（`running` 变假即收起）。
- **理解②：收起整个操作组（group body）。** → 思考结束就折叠大段，
  那么接下来工具执行时**大段是折叠的、工具结果不可见**，
  与本插件「让当前轮工作保持可见」的初衷自相矛盾。

**倾向①，待用户确认。**

### 6.2 议题 5：三个收起时机

| 时机 | 现状 | 说明 |
|---|---|---|
| 思考完成后 | ✅ 已实现 | `running` 变假 |
| 大段完成后 | ✅ **已实现，但名不副实** | group `closed` 在「正文出现」时就置真（`process-groups.ts:147-164`），**远早于**大段真正结束；`closed` → `groupOpen` 变假 → 思考随之收起 |
| 下一次调用时 | ❌ 未实现 | 需要 group 级信号（见 §3） |

### 6.3 一个重要的事实修正

因为 group 的 `closed` **一旦置真就永久保持**，「思考完成后」与「大段完成后」
在现有机制下**高度重合**，可区分度低。真正正交的只有第三项「下一次调用时」。
写实现前必须先确认这一点，否则会做出一个用户感知不到差别的三选项。

---

## 7. 议题 2：把内层滚动搬到外层 —— 建议不做

「内层滚动」的来源就是 `capped` 的 400px 上限（`C1`），
而它正是上一轮用户要求**还原为官方**的地方。议题 2 等于**再次偏离，且偏离面更大**
（影响所有组的布局，不只是当前轮）。

再叠加一层坏消息：外层「丝滑」是硬编码不到的。
`use-chat-scroll.ts:94-98` 的内容增长路径调用 `reading.followTail()`
**不带参数**，落到默认 `'instant'`（`use-chat-reading.ts:83`）。三条路都有坑：

| 方案 | 后果 |
|---|---|
| CSS `scroll-behavior: smooth` | 破坏官方每帧写入：每个 frame 都触发一次平滑动画 → 抖动 / 卡顿 |
| 自建 rAF 补间 | 与官方 `instant` 写入**抢同一帧的 `scrollTop`**，结果不可预测 |
| 不动 | 保持现状跳变 |

这与 `MOTION-PLAN.md` §6.3 的结论**同源**：
外层的滚动视口由 `ChatView` 拥有，状态机在 `use-chat-viewport.ts`（800 行）
与 `use-chat-reading.ts`（282 行）里，插件够不到。

**建议归入 ❌，并写入已知限制。**

---

## 8. 议题 1：独立实现展开/收起动画

### 8.1 真正的难点不是补间曲线

自建动画（`D5`）必须先同时复刻三件契约，否则是功能回退：

| 必须保留 | 官方实现 | 丢失的后果 |
|---|---|---|
| `hidden="until-found"` 语义 | `searchable-hidden.ts`（`beforematch` 触发展开） | Ctrl+F 能命中折叠内容但**不会**展开 |
| 逐帧滚动补偿 | `InputFoldDriver`（`use-chat-viewport.ts:328`） | 动画期间下方内容连续漂移 |
| 焦点保护 | 官方 | 展开/收起时焦点丢失 |

### 8.2 接管手段

`groupAction` / `groupHeaderAction` 由 `CHAT_FLOW_INJECT` 注入
（`ui-chat/src/client/apply.ts:52-61`）。**插件克隆的 `AutoGroupSeat` 只是接收
`useGroupAction` 作为 prop，无法在内部替换**——要换只能改写上游 inject。

这意味着 `D5` 与 `A3`（工具行）**共用同一个接管体系**（同一套 `hookContext` 注入）。
若两者都做，应合并为**一个 inject 补丁层**，而不是继续增加克隆。
但那是未公开 API（与 `wrap.ts` 同级），**必须真机验证后再动**。

### 8.3 收益

解决 `MOTION-PLAN.md` §6.2 的「手动展开 / 收起跳变」——即官方 `grow=false`
导致的**展开无动画**（官方设计，不是 bug）。

---

## 9. 待决策（**已全部决出**，2026-10-23）

| # | 问题 | 结论 |
|---|---|---|
| Q1 | 议题 3 的「收起大段」指什么 | **工具行跟随操作组**（不是大对话轮次）；思考收起时机解耦是未来项 |
| Q2 | 议题 4 的目标语义 | **A 整组统一**（`ToolRow` 不暴露行身份，B 不做） |
| Q3 | 议题 1、2 是否值得再次偏离官方 | 议题 2（搬外层）**否决**；议题 1（自建动画）保留为 D5 候选 |

---

## 10. 实施优先级（2026-10-23 用户指定）

用户指定：**第一需求 = 工具自动展开**。其余由 Lead 排序，理由如下。

| 序 | 项 | 对应格 | 排序理由 |
|---|---|---|---|
| ~~1~~ ✅ | ~~工具自动展开~~ **已完成** | A3 | 用户指定。已按「包裹而非替换」实施，**零新增克隆** |
| 2 | 思考收起时机可配置 | B3 | 与 1 共用同一套 `hookContext` 注入体系，紧接其后成本最低 |
| 3 | 工具收起时机 | B4 | 是 1 的一部分（语义 A 已内含「随 group 收起」）；仅在细化时才独立 |
| 4 | 自建动画 | D5（含 D3 / D4） | 要动官方动画引擎，需先验证 `MOTION-PLAN.md` §6.5；风险与验证成本最高 |
| 5 | 操作组时机细化 | A1 / B1 | A1 已实现；只剩「时机可配置」，价值低于上面四项 |
| 6 | 完整展示当前轮 / 历史最大高度 | C2 / C3 | 用户已暂缓（`SETTINGS-EXTENSION.md`） |
| — | 内容增长平滑 / 搬外层 | C5 / C6 | ❌ 已否决 |
| — | 只展开最新一条 | A3 细化 | ❌ 不推荐（`P7-PLAN.md` §7） |
| — | 按工具细分 | A4 | ⏸️ 用户已预埋为未来功能 |

**依赖关系**：2、3 依赖 1 建立起的注入体系与 context 扩展；4 与 1 共用注入体系，
但**不依赖** 1 完成（可并行设计，实施建议排在 1 之后）。

**第一项的落点**：[P7-PLAN.md](P7-PLAN.md)。

---

## 11. 维护规则

- 任何新的「展开 / 收起 / 高度 / 动画」需求，**先在本表定位**，再决定动手；
  不在表内的需求，先补一行再谈实现。
- 新增接管点必须同时更新 §2 与 `scripts/upstream-manifest.mjs`。
- §3 中标 🔍 的信号，**真机验证后必须回来改状态**——本项目已多次因
  「凭代码阅读推断官方行为」而翻车（P4、`FIX-SCROLL`、`capped` 三次）。
- 与本文件冲突的旧结论（尤其 `P4-ROLLBACK.md` §7.3）以本文件为准，并在旧文件处留指引。