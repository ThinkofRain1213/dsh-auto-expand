# P8 实施计划：思考 / 工具的收起时机（四个统一选项）

> 日期：2026-10-23（§1 于同日第二次查证后修订）
> 状态：**已实施完成**（Step 0~4 完成，Step 5 收口随本文件更新）
> 前置：P7（工具结果自动展开）已完成
> 上游：`dsh-client-ui-chat` / `dsh-client-ui-tool` @0.2.1-rc.2，commit `687f282e86`

---

## 0. 一句话

给「思考」和「工具结果」各加一个**收起时机**下拉，与现有开关**解耦**。
开关管「要不要自动展开」，时机管「什么时候收起」。

两个下拉的选项**完全相同**（四个）：思考与工具都由操作组提供同样的两个坐标，
四个时机对两边都真实成立。

---

## 1. 四个统一的时机

> ⚠️ 本节 2026-10-23 修订。曾有一版「三个对齐的时机」，并给思考裁掉
> 「下一条操作出现」——理由是「一个 step 只有一段思考」。该理由基于的事实成立
> （`assistant.ts:297`），但**不足以支撑裁剪**：思考同样有 `anchorSeq`，该时机在
> 它身上真实成立、也真的会得出不同结果。裁剪反而导致三套分叉（两份时机列表、
> 两套文案、两个 Host 枚举）。详见 `CAPABILITY-MATRIX.md` §1.2.1。

| # | 时机 | 文案 | 判据 | 坐标 | 范围 |
|---|---|---|---|---|---|
| **1** | `self` | 本条完成时 | `!done` | — | 本条 |
| **2** | `next-call` | 下一条操作出现时 | `anchorSeq >= latestAnchorSeq` | 操作级 | **永远单条** |
| **3** | `next-node` | 下一批操作出现时 | `step >= latestStep` | 批次级 | 同批多条 |
| **4** | `group` | 随操作组收起 | 恒真 | — | 全部 |

信号来源（思考与工具**都齐全**）：

| 信号 | 思考 | 工具 |
|---|---|---|
| `done` | `!running`（非流式尾部） | `'kind' in node.data.root`（`result` 阶段） |
| `isLatestBatch`（step） | `data.step` | `data.root.step`（`result` 阶段用 `useRef` 固定） |
| `isLatestNode`（anchorSeq） | 节点自带 | 节点自带 |

**默认值：思考与工具都是 3（下一批操作出现时）**（2026-10-23 用户指定）。

> ⚠️ 这不是 P8 最初的取值。最初为「行为零变化」把默认定为思考 `self`、工具 `group`；
> 用户随后明确要求两者都改为 `next-node`。这**会改变已安装用户的行为**，是知情决定。
>
> 语义：该行保持可见，直到组内出现更新的一批才收起
> ——「当前正在做的那件事」始终可见，做完的部分自动让位。

---

## 2. 探查结论（全部查证，非推理）

| 事实 | 证据 |
|---|---|
| `anchorSeq` 是单调排序位置 | `common.ts:47` 注释「**sortable render position**」；`chat-snapshot-builder.ts:100` 用它排序全部节点 |
| group 成员列表有序 | `ui-conversation/contract/groups.ts:28` 注释「**ordered, non-nested** Node references」 |
| `NodeReference` 只有 `key`、**无** `anchorSeq` | `groups.ts:13-17` |
| group 层能拿到成员节点数据 | `AutoGroupSeat.tsx:202` 已在用动态 key：`props.useChatNode(firstKey, node => …)` |
| 思考行能拿自己的 `anchorSeq` | `AutoAssistantNodeView.tsx:35` 已解构 `node`，但**未下传**给 Markdown → `AutoReasoningRow` |
| 工具行能拿自己的 `anchorSeq` | `ToolCallTree.tsx:111` 解构 `node`；`ToolTreeProps` 含它 |
| 思考完成信号 | `AssistantChatData.status: 'running' \| 'settled' \| 'interrupted'`（`chat-nodes.ts:38-39`） |
| 工具完成信号 | `ToolCallTree.tsx:11`：`'kind' in block` 即 `result` 阶段 |
| 下拉控件无通用原语 | `SettingsValueField` 是 `<input type="text">`（`ui-primitives/settings-form/fields.tsx:95`） |
| 下拉有 DPG 现成实现 | `dsh-project-groups/src/client/settings-card.tsx:366-397`：`Menu` + 自定义 `anchor` button |
| enum 字段的 schema 写法 | 官方 `ui-chat/src/chat-settings.ts:75`：`z.union([...COLLAPSE_TIMINGS]).default(DEFAULT)` |
| 该实现必须 `portal` | 同上注释：卡片在插件页的**滚动 detail 列**里，就地展开会被 `overflow` 裁剪 |
| `.selector` 样式可照抄 | `dpg/settings-card.module.css:88-111` |
| 我们的行几何已与 DPG 一致 | `settings-card.module.css` 的 `.row`/`.rowText`/`.title`/`.desc`/`.stack`/`.gated` |

### 2.1 为什么不需要行身份

判据是**节点级**：思考行属于 `assistant-step`、工具行属于 `tool-call`，
两者都从自己的 `node.anchorSeq` 出发，与「本组最新成员」比较。

`ToolRow` 不暴露 callId 这件事**不再是障碍**——它不需要知道"我是第几行"，
只需要知道"我所属节点是不是最新的"。

### 2.2 两个边界

1. **历史组 `members` 可能不完整**（分页）。但历史组 `group.auto === false`，
   判据含它，该场景被挡住。
2. **同一节点可能在 `members` 出现两次**（`NodeReference.groupPart` 区分
   reasoning / response）。同节点 `anchorSeq` 相同，判据不受影响。

### 2.3 修正：「节点」的粒度是 `step`，不是 `anchorSeq`（2026-10-23 真机反馈）

**问题**：并行执行多个工具时，只有最下面那一个展开。

**根因**：初版判据用 `anchorSeq`（节点序号）比较「是否最新」。但每个工具调用都是
独立节点、各有独立 `anchorSeq`，于是「只有最大的那个是最新」把同批其余节点全收起了。

**修正**：改用 `step`（模型输出轮次）。一次模型输出里并行发起的多个工具**共享同一个
`step`**（`ToolCallHead.step`，`records.ts:277`），这正是「批次」的正确粒度。

| 场景 | step | 结果 |
|---|---|---|
| 并行 3 个工具（同一次模型输出） | 都是 5 | **三个全部展开** |
| 下一段思考 | 6 | 三个工具收起，思考展开 |
| 再下一个工具 | 7 | 思考收起，工具展开 |

### 2.3.1 二次修正：`step` 在 `result` 阶段会消失（真机验收发现）

改用 `step` 后真机仍报三种怪象：**工具一完成就收起**、**全部完成后反而全展开**、
**下一段思考出现时全部收起**。

**根因**：上游 `ToolResultNode`（`ui-conversation/.../contract/records.ts:161-183`）
**不继承 `ToolCallHead`，根本没有 `step` 字段**（只有 `seq` / `time`）。
工具一进入 `result` 阶段，`root.step` 立刻变 `undefined`，当作 0 之后：

| 时刻 | 判据看到 | 后果 |
|---|---|---|
| A 完成 | A 的 step 变 **0**，组内最新仍是 5 | A(0) < 5 → **错误收起** |
| 全部完成 | 所有 step 都是 0，最新也是 0 | `0 >= 0` → **全部展开** |
| 思考出现 | 全部 0 < 新 step | **全部收起** |

**修法**：在 `AutoToolCallTree` 里用 `useRef` 记住最后一次读到的 `step`，
`result` 阶段沿用（`useStableToolStep`）。同一 `tool-call` 节点在 `start → result`
之间复用同一个组件实例（keyed slot 的 key 不变），所以 ref 活着；节点若因分页/滚动
被卸载重建，ref 归零 → 退化为「拿不到信息」的保守一侧。

**为什么 `stepOfNode` 不需要同样处理**：它对 `result` 阶段的工具返回 `undefined`，
而 `isLatestStep(step, undefined)` 恒为真 —— 组内最新成员若是刚完成的工具，
所有工具行都被判为最新、**保持展开**。这恰好就是期望行为。

**教训**：不要把「跨阶段不变的信息」建立在一个**会随阶段变形的字段**上。
`step` 只在 `preparing` / `start` 阶段存在，`anchorSeq` 才是全阶段稳定的节点级字段
——但 `anchorSeq` 粒度太细（每节点唯一），不能直接表达「批次」。两者都不合适时，
正确做法是**在插件侧把信息固定下来**（ref），而不是换一个同样是阶段性的字段。

**判据**：`isLatestStep(step, latestStep)` → `latestStep === undefined || step >= latestStep`。

用 `>=` 而不是 `==`：组内最新 step 单调不减，正常流程下等价；成员列表暂时不完整时
`>=` 只会多展开、不会误收，是安全的一侧。

**信号来源**

| 信号 | 来源 |
|---|---|
| 思考自己的 step | `node.data.step`（`AssistantChatData.step`） |
| 工具自己的 step | `node.data.root.step`（`ToolCallHead.step`） |
| 组内最新 step | `members.at(-1).key` → `useChatNode(lastKey, stepOfNode)` |

**取「组内最新 step」只需一个 hook 调用**（`members` 有序，取最后一项），
不需要遍历成员——这是该修法很轻的关键。

### 2.4 已知限制：自动收起会连带卸载行内浮层

`read_image` 的缩略图点开大图后，若该行被自动收起，大图会跟着消失：
`ToolRow` 收起时不渲染 children → `MessageImage` 被卸载 → 灯箱状态
（`useState`，`ui-attachment/src/MessageImage.tsx:82`）随之销毁。

官方手动收起时也会如此，但那是用户主动操作。修它需要跨包读取 `ui-attachment`
的内部状态，代价与收益不匹配，**记录为已知限制**（见 `CHANGELOG.md`）。

---

## 3. 架构：三层

```
                    AutoGroupSeat
                         │
        members.at(-1).key ─┴─► useChatNode(lastKey, n => n.anchorSeq)
                                        │
                                        ▼
                    GroupOpenContext { open, auto, latestAnchorSeq }
                                        │
        ┌───────────────────────────────┴───────────────────────────────┐
        ▼                                                               ▼
AutoAssistantNodeView ──anchorSeq──► AutoAssistantMarkdown          AutoToolCallTree
                                        │                            ToolRowContext
                                        ▼                            { anchorSeq, done }
                                  AutoReasoningRow                        │
                                        │                                 │
                                        └────► autoOpenFor() ◄────────────┘
                                                  （同一段纯函数）
```

**第 1 层（信号）**：把 `latestAnchorSeq` 与每行的 `anchorSeq`/`done` 变成可读信号。
**第 2 层（判据）**：`autoOpenFor()` 纯函数，两处共用。
**第 3 层（设置）**：两个 enum 字段 + 卡片两行下拉。

---

## 4. 分步实施

> ⚠️ **以下是当时的实施记录，勿照抄代码。** 本文件 §4 的代码片段停留在「三个时机」
> 那一版；实际落地的是 §1 修订后的四个时机、思考与工具共用一份 `COLLAPSE_TIMINGS`。
> 以 `src/client/collapse-timing.ts` 为准。

### Step 0：纯函数判据 + 单测（零接线、零风险）

**动作**

- [ ] 新增 `src/client/collapse-timing.ts`
  ```ts
  export type CollapseTiming = 'self' | 'group' | 'next-node'
  export const COLLAPSE_TIMINGS: readonly CollapseTiming[] = ['self', 'group', 'next-node']
  export function isLatestAnchor(anchorSeq: number, latestAnchorSeq: number | undefined): boolean
  export function autoOpenFor(input: {
    readonly timing: CollapseTiming
    readonly done: boolean
    readonly isLatest: boolean
    /** 由调用方算好：开关 && group.open && group.auto */
    readonly enabled: boolean
  }): boolean
  ```
- [ ] 新增 `tests/collapse-timing.spec.mjs`：3 时机 × `done` × `isLatest` × `enabled` 全矩阵；
      另测 `latestAnchorSeq === undefined` 时 `isLatest` 恒真（保守：不收起）
- [ ] `package.json` 的 `test` 脚本登记新测试

**验证**：`pnpm verify`

**为什么先做**：这是整个功能的核心判据，纯函数可直接断言。先把语义钉死，
后面接线只是搬运。

### Step 1：信号层（**行为零变化**）

**动作**

- [ ] `group-open-context.ts`：`GroupOpenState` 加 `latestAnchorSeq: number | undefined`；
      默认值 `{ open: true, auto: false, latestAnchorSeq: undefined }`
- [ ] `AutoGroupSeat.tsx`：
  ```ts
  const lastKey = members?.[members.length - 1]?.key ?? ''
  const latestAnchorSeq = props.useChatNode(lastKey, node => node?.anchorSeq)
  const groupOpenState = useMemo(() => ({ open, auto: autoOpen, latestAnchorSeq }),
    [open, autoOpen, latestAnchorSeq])
  ```
- [ ] `AutoAssistantNodeView.tsx`：`<AutoAssistantMarkdown anchorSeq={node.anchorSeq} … />`
- [ ] `AutoAssistantMarkdown.tsx`：props 加 `anchorSeq: number`，透传给 `AutoReasoningRow`
- [ ] `AutoToolCallTree.tsx`：新增 `ToolRowContext`，Provider 提供
      `{ anchorSeq: node.anchorSeq, done: 'kind' in node.data.root }`（`useMemo` 稳定）
- [ ] `AutoReasoningRow.tsx` / `use-tool-disclosure.ts`：先只读取信号，**判据暂不变**

**验证**：`pnpm verify` + 真机确认 P2/P3/P7 行为**完全不变**

**为什么单独一步**：信号接线可能出错（比如 `useChatNode` 动态 key 传空串），
先证明"接上但不生效"，错误就只会来自这一层。

### Step 2：判据接入（timing 先硬编码默认值，**行为仍不变**）

**动作**

- [ ] `AutoReasoningRow.tsx`：`autoOpen = autoOpenFor({ timing: 'self', done: !running, isLatest, enabled })`
- [ ] `use-tool-disclosure.ts`：`autoOpen = autoOpenFor({ timing: 'group', done, isLatest, enabled })`
- [ ] 两处的 `enabled` 都 = `settings.x && group.open && group.auto`
- [ ] `AutoGroupSeat` 的 group body 判据**不动**（它没有时机选项）

**验证**：`pnpm verify` + 真机确认行为**仍完全不变**

**含义**：此时功能已完整接线，只差"timing 从设置来"。

### Step 3：设置字段（Host + client，行为开始可变）

**动作**

- [ ] `src/index.ts`（Host）：
  ```ts
  export const REASONING_COLLAPSE_TIMING_FIELD = 'reasoningCollapseTiming'
  export const TOOL_COLLAPSE_TIMING_FIELD = 'toolCollapseTiming'
  export const COLLAPSE_TIMINGS = ['self', 'group', 'next-node'] as const
  // schema（照官方 chat-settings.ts:75 的写法）：
  [REASONING_COLLAPSE_TIMING_FIELD]: z.union([...COLLAPSE_TIMINGS]).default('self').volatile(),
  [TOOL_COLLAPSE_TIMING_FIELD]: z.union([...COLLAPSE_TIMINGS]).default('group').volatile(),
  ```
  ✅ 已查证：官方 `chat-settings.ts:75` 就是 `z.union([...COLLAPSE_TIMINGS]).default(...)`；
  `.volatile()` 链在其后（本项目现有 boolean 字段已这样用）。
- [ ] `settings.ts`：`AutoExpandSettings` 加两字段；`DEFAULT_SETTINGS` 加默认值；
      `read()` 读两字段；**`sync()` 改为五字段比较**（现有三个 boolean + 两个 timing）
- [ ] `AutoReasoningRow.tsx` / `use-tool-disclosure.ts`：`timing` 改从 `settings` 读

**验证**：
- `pnpm verify`
- **通过 profile 配置**逐项验证（先不加 UI）：在 `cordis.patch.yml` 的
  auto-expand entry 里写 `reasoningCollapseTiming: next-node` 等，观察行为

### Step 4：设置卡片 UI（5 行）

**动作**

- [ ] `settings-card.module.css`：加 `.selector` / `.selector:hover` / `.chevron` /
      `.selector:disabled`（照抄 DPG `settings-card.module.css:88-111`，disabled 那条是本项目新增）
- [ ] `settings-card.tsx`：
  - 新增 `SelectRow`（约 45 行，`Menu` + 自定义 `anchor`，`portal`、`align="end"`）
  - 按「操作组 / 思考 / 工具」三组插入 5 行
- [ ] `settings-card-state.ts`：`SwitchValues` 不动（时机字段不参与锁定推导的输入）；
      `SettingsCardState` 加 `reasoningTiming` / `toolTiming` 两个 `SwitchRowState`
      （复用 `SwitchRowState` 的 `locked`/`gatedText` 语义）
- [ ] `locales.ts`：`reasoningTimingTitle` / `reasoningTimingDesc` /
      `toolTimingTitle` / `toolTimingDesc` + 6 个选项文案（中英）
- [ ] 更新 `tests/settings-card-state.spec.mjs`

**门控链**

| 行 | 被谁锁 |
|---|---|
| 1 自动展开操作组 | 永不锁 |
| 2 自动展开思考过程 | `!groupAutoExpand` |
| 3 思考收起时机 | `!groupAutoExpand \|\| !reasoningAutoExpand` |
| 4 自动展开工具结果 | `!groupAutoExpand` |
| 5 工具收起时机 | `!groupAutoExpand \|\| !toolAutoExpand` |

**验证**：`pnpm verify` + 真机（下拉展开、选择生效、门控变灰、跨重启保留）

### Step 5：收口

- [ ] `contract-consistency.spec.mjs`：字段名断言 **3 → 5**；默认值一致性补两条
- [ ] `pnpm verify` / `pnpm pack:check` / `pnpm drift`（应仍 0 偏差）
- [ ] 文档回填：`CAPABILITY-MATRIX` B3/B4、`SETTINGS-EXTENSION` §10、`README.md`、
      `CHANGELOG.md`

---

## 5. 验收清单

> 2026-10-23 修订：时机统一为四个后，思考与工具各补一条「下一条操作出现时」。
> 表中「下一批操作出现时」即早期的「下一个节点出现即收」（同一取值 `next-node`，
> 只是文案改成了按真实语义说的说法）。

| 编号 | 场景 | 期望 |
|---|---|---|
| C-1 | **思考 = 下一批操作出现时（默认）** | 写完保持，下一批出现时收 |
| C-2 | 思考 = 随操作组 | 写完保持，组折叠时收 |
| C-3 | 思考 = 本条完成时 | 写完即收 |
| C-4 | **思考 = 下一条操作出现时** | 写完保持，本 step 的工具一出现即收 |
| C-5 | **工具 = 下一批操作出现时（默认）** | 保持，下一批出现时收 |
| C-6 | 工具 = 随操作组 | 留到组结束 |
| C-7 | 工具 = 本条完成时 | 该工具 `result` 后收起 |
| C-8 | **工具 = 下一条操作出现时** | 串行时只留最新一条；并行时只留最后一个 |
| C-9 | 四个时机下浏览历史 | 完全不受影响 |
| C-10 | 手动开合某行 | 保持用户结果，插件不干预（`useAutoDisclosure` 语义） |
| C-11 | 下拉门控 | 关闭对应开关后变灰且不可操作 |
| C-12 | 设置持久化 | 跨重启保留 |
| C-13 | 关闭大段开关 | 后四行全灰 |
| C-14 | 两个下拉的选项 | **完全相同**，都是四项 |

---

## 6. 风险

| # | 风险 | 应对 |
|---|---|---|
| **R1** | `latestAnchorSeq` 每次新节点变化 → 该组所有行重渲染 | 组内行数不多；Step 1 真机观察闪烁 |
| **R2** | `sync()` 五字段比较漏一个 → 设置动了行为不变 | 专测 C-10；Step 3 用 profile 验证 |
| **R3** | `Menu` 的 `portal` 定位在滚动容器里偏移 | 照抄 DPG（同容器、已上线） |
| **R4** | 「工具自身完成即收」会**闪动**（工具常几百毫秒） | **需用户决定**是否给该时机加短延迟（参考官方 `MOTION_TAIL_MS = 800`） |
| ~~R5~~ | ~~enum 写法未确认~~ | ✅ 已查证：`z.union([...VALUES]).default(...)`（官方 `chat-settings.ts:75`），可链 `.volatile()` |
| **R6** | `latestAnchorSeq === undefined`（空组）时的判据 | 纯函数里定义为「视为最新」，Step 0 单测覆盖 |
| **R7** | 思考行 `anchorSeq` 传递链长（NodeView → Markdown → ReasoningRow） | Step 1 单独验证「传了但不生效」 |

---

## 7. 中止条件

| 条件 | 动作 |
|---|---|
| Step 1 真机出现任何行为变化 | 中止，回查信号接线 |
| `latestAnchorSeq` 引起可见闪烁 | 改用「只在值变化时才更新 context」的 memo 策略；仍不行则中止 |
| schemastery 无法表达 enum | 改用 `z.string()` + 允许值校验，或退回 boolean 双字段方案 |
| `pnpm drift` 非 0 | 查是否误改克隆文件 |

---

## 8. 明确不做

| 项 | 原因 |
|---|---|
| 保留最近 N 个节点（而非 1 个） | 机制相同，但用户未提出；将来若要，把 `isLatest` 换成 `rank < N` |
| 行级时机（每行独立状态） | 需要行身份，`ToolRow` 不暴露；节点级已满足需求 |
| 动画（展开/收起过渡） | 属 D5，`MOTION-PLAN.md` §8 |
| 修改操作组本身的收起时机 | 它没有时机选项，保持"组关闭即收" |