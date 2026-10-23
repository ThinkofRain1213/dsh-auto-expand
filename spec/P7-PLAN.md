# P7 实施计划：工具行自动展开

> 日期：2026-10-23
> 状态：**已实施完成**（2026-10-23）
> 实施顺序：Step 0 恒等包裹 → Step 1 context 扩展 → Step 2 判据 → Step 3 设置页 → Step 4 收口
> 真机验收清单见 §6 与 §4 各步
> 上游：`@deepseek-ai/dsh-client-ui-tool` @0.2.1-rc.2，commit `687f282e86`
> 前身：`P4-ROLLBACK.md`（已回滚的实现）——**本计划与 P4 的做法根本不同**，见 §1

---

## 0. 一句话

用「**包裹**官方 `ToolCallTree` + 只覆盖它从 props 接收的 `useDisclosure`」实现工具行自动展开。
**不克隆 `ui-tool` 的任何代码**，官方 toolview 分派与 `GenericToolCard` fallback 原样保留。

---

## 0.1 语义确认（2026-10-23，用户）

用户澄清（要点）：

1. 当前**运行中**的操作组 → 内部工具行（连同思考）**全部自动展开一次**；
2. 之后**保持展开，插件不再干预**；
3. 直到该操作组**成为历史操作组** → **一起收起**。

**这确认了 §3.1 的语义 A**：工具行跟随**操作组**，而非跟随**大对话轮次**（turn）。

关键推论：

- 「成为历史操作组」= group `closed` 置真（正文出现），**这是一个 turn 内的时刻**；
- 因此**不需要** turn 级信号（`processPresentation.turnClosed`）；
- **不需要**改动 P2 已验收的操作组折叠行为；
- 「保持展开不干预」= `autoOpen` 不变时 `useAutoDisclosure` 不动作（尊重手动覆盖），
  仅当 `autoOpen` 变假才收起。

**被明确排除**：让工具行撑到 turn 结束。那需要先把操作组本身的收起时机改成跟 turn，
属 `CAPABILITY-MATRIX.md` §10 排序第 5 项，不在本计划范围。

**一个已向用户指出的语义细节**：操作组仍展开期间**新出现**的工具行也会自动展开
（那时 `autoOpen` 仍为真）。这符合「全部自动展开」；若要「只有展开那一刻已存在的行才展开」，
需要行身份信号——`P7-PLAN.md` §7 已列为不做。

### 0.2 手动语义（用户强调，2026-10-23）

**不要**把本设计理解为「插件强制维持组内所有工具行为展开」。准确语义来自
`src/client/auto-disclosure.ts:54`：

```ts
const open = override ?? autoOpen     // autoOpen 不变 → override（用户）权威
```

| 事件 | 行为 |
|---|---|
| 工具行出现 | **各自自动展开一次** |
| 用户手动收起 / 展开某行 | **保持用户的结果，插件不动作**（`autoOpen` 未变 → 覆盖保留） |
| 组内又出现新的工具行 | 新行自己展开一次；**不触碰**已有行的手动状态 |
| 操作组翻篇 | `autoOpen` 变 false → 丢弃全部覆盖 → **整组一起收起** |
| **历史工具行** | `autoOpen = false` → `open = override ?? false`，**默认折叠**，用户开合全部遵从官方语义 |

**即「自动展开一次，然后撒手；翻篇时整组收起」——不是「保持展开」。**
这条是用户本轮明确纠正的表述，实施时不得写成「维持展开」。

---

## 1. 与 P4 的根本差异（为什么这次可行）

| | P4（已回滚） | P7（本计划） |
|---|---|---|
| 手段 | **替换** `tool-call` 的渲染器为极简实现 | **包裹**官方 `ToolCallTree`，不改注册 |
| 官方 toolview 分派 | 丢失 | **原样保留** |
| `GenericToolCard` fallback | 丢失 → `pwsh` 退化为纯文本 | **原样保留** |
| 新增克隆 | 需再克隆约 2644 行 | **零** |
| `pnpm drift` 成本 | 大幅上升 | **不变** |

P4 的教训（§7.1「注册数量 ≠ 覆盖面」、§7.2「接管渲染器前枚举所有分支产出」）**依然有效**，
而包裹法正是 §7.2 的正解：**不替换组件，就不需要枚举分支**。

---

## 2. 源码依据

| 事实 | 出处 |
|---|---|
| `tool-call` key 注册的组件是官方 `ToolCallTree` | `ui-tool/src/client/apply.ts:34-42` |
| `ToolCallTree` 的 `useDisclosure` **来自 props**，不是自己 import | `ToolCallTree.tsx:37, 111`（类型 `ToolTreeProps`） |
| 该 hook 由 slot 注入，**与思考行同一个工厂** | `ui-chat/src/client/apply.ts:69`、`ChatNodeSeat.tsx:117-119, 161-163` |
| `useDisclosure` 的形状：无参 → `{expanded, setExpanded, toggle}` | `ui-chat/src/client/contract/slots.ts:159` |
| 下游契约明说「Stable Hook; each invocation owns its open state」 | `ui-tool/src/client/contract/slots.ts:60-61` |
| `ToolRow` **无条件**调用 `useDisclosure()` | `ToolRow.tsx:153` |
| `ToolCall` 的 `useMemo` 依赖 `useDisclosure` **引用** | `ToolCallTree.tsx:39` |
| slot 渲染器 **memoize** entry 的 inject 结果 | `ui-tool/src/client/contract/slots.ts:145-148` 注释 |
| 插件已有 `wrapEntry` 基础设施 | `src/client/wrap.ts`（P1 已验证） |

---

## 3. 设计

### 3.1 autoOpen 判据

```
toolAutoOpen = settings.toolAutoExpand && group.open && group.auto
```

其中 `group.auto` = `AutoGroupSeat` 已有的
`autoOpen = settings.groupAutoExpand && !(closed === true)`（`AutoGroupSeat.tsx:185`）。

四种组合的语义（**这是本设计的核心**）：

| group.open | group.auto | 场景 | 工具行 |
|---|---|---|---|
| `true` | `true` | 当前轮，group 自动展开 | **自动展开** ✅ |
| `false` | `true` | 当前轮，用户手动收起了 group | 收起 ✅（跟着 group） |
| `true` | `false` | **用户手动展开了历史 group** | **保持折叠** ✅（E1：历史不受影响） |
| `false` | `false` | 历史 group，未展开 | 保持折叠 ✅ |

第三行是关键：`group.open` 单独用会**破坏 E1**，必须与 `group.auto` 相与。

### 3.2 扩展 `GroupOpenContext`

当前是 `createContext<boolean>(true)`（`src/client/group-open-context.ts`）。
改为携带两个字段：

```ts
export interface GroupOpenState {
  readonly open: boolean   // group body 的实际展开状态（含手动覆盖）
  readonly auto: boolean   // 是否处于「当前轮自动展开窗口」
}
export const GroupOpenContext = createContext<GroupOpenState>({ open: true, auto: false })
```

- 默认值保持 `open: true`（与原 `true` 一致，**不改变 P3 行为**）；
  `auto: false` 保证无 Provider 时工具行不自动展开。
- `AutoGroupSeat.tsx:271` 的 `value={open}` → `value={groupOpenState}`，
  用 `useMemo` 稳定引用（否则每次渲染产生新对象，所有子行全量重渲染）。
- `AutoReasoningRow.tsx` 的 `useContext(GroupOpenContext)` → 取 `.open`（**行为零变化**）。

### 3.3 hook factory 必须引用稳定（关键约束）

`ToolCall.tsx:39` 的 `useMemo` 把 `useDisclosure` 列为依赖。
若包裹组件每次渲染都新建 factory，`owner` 会每次重建 → toolview 反复重渲染。

**做法：factory 引用恒定，`autoOpen` 在 hook 内部通过 context 读取。**

```ts
// 稳定：不依赖任何外部值
function useAutoToolDisclosure(): UseDisclosure {
  const settings = useAutoExpandSettings()
  const group = useContext(GroupOpenContext)
  const { open, setOpen, toggle } = useAutoDisclosure(
    settings.toolAutoExpand && group.open && group.auto,
  )
  return { expanded: open, setExpanded: setOpen, toggle }
}
```

- 每个 `ToolCall` / `ToolRow` 实例各自调用 → 各自独立 state ✅
- 同一 group 内所有工具行的 `autoOpen` 相同 → 一起展开 / 收起 ✅
- `autoOpen` 变化时 `useAutoDisclosure` 丢弃手动覆盖并跟随 ✅

### 3.4 不需要行身份

「整组统一」语义下 **hook 不需要知道自己是第几条调用**——
这正是 `CAPABILITY-MATRIX.md` §5.1 推荐的语义 A。
若将来要做「只展开最新一条」，需另寻身份信号（§7 明确不做）。

### 3.5 改动清单

| 文件 | 动作 | 说明 |
|---|---|---|
| `src/client/group-open-context.ts` | 改 | `boolean` → `GroupOpenState` |
| `src/client/flow/AutoGroupSeat.tsx` | 改 | Provider 传对象 + `useMemo` |
| `src/client/assistant/AutoReasoningRow.tsx` | 改 | 取 `.open`（行为不变） |
| `src/client/tool/AutoToolCallTree.tsx` | **新增** | 包裹组件 + 稳定 factory |
| `src/client/index.ts` | 改 | 第三个包裹点 `tool-call`；文件头注释与 effect label 更新 |
| `src/index.ts`（Host） | 改 | schema 加 `toolAutoExpand`（Step 3） |
| `src/client/settings.ts` | 改 | 加字段 + 默认值 + **`sync()` 三字段比较**（Step 3） |
| `src/client/settings-card-state.ts` | 改 | 加 `tool` 行状态（Step 3） |
| `src/client/settings-card.tsx` | 改 | 第三行 `SwitchRow`（Step 3） |
| `src/client/locales.ts` | 改 | `toolTitle` / `toolDesc`（Step 3） |
| `tests/tool-disclosure.spec.mjs` | **新增** | 判据矩阵 + 形状适配 |
| `tests/settings-card-state.spec.mjs` / `settings-write.spec.mjs` | 改 | 加 tool 行用例 |
| `scripts/upstream-manifest.mjs` | **不动** | **本次零新增克隆** |
| `spec/CAPABILITY-MATRIX.md` / `README.md` | 改 | 状态回填 |

### 3.6 包裹组件形态

```tsx
function makeAutoToolCallTree(inner: ComponentType<never>): ComponentType<never> {
  return function AutoToolCallTree(props: ToolTreeProps) {
    const Inner = inner as unknown as ComponentType<ToolTreeProps>
    const useDisclosure = useMemo(() => useAutoToolDisclosure, [])
    return <Inner {...props} useDisclosure={useDisclosure} />
  } as unknown as ComponentType<never>
}
```

`{...props}` 先展开、`useDisclosure` 后覆盖，其余 props（`renderSlot` / `t` /
`useHostInfo` / owner 数据）**全部原样透传**。

---

## 3.7 设置页（本次交付的一半，不可省）

> **用户 2026-10-23 指正**：设置页不是可选的收尾步骤。没有这个开关，
> 用户就关不掉工具自动展开——功能等于强制。

### 新增开关

`toolAutoExpand`，默认 **`true`**（与另两个一致：默认全开是插件的核心价值）。

### 门控：被 `groupAutoExpand` 锁住，与 `reasoningAutoExpand` 完全相同

依据是功能层面的、非风格选择：`toolAutoOpen` 里含
`group.auto = settings.groupAutoExpand && !(closed === true)`，
所以**关掉「展开工作大段」后，工具行的自动展开永远不会生效**。
UI 不显示这一点就是在撒谎（`settings-card-state.ts` 头部的原话）。

锁定时三件事一起做（沿用现有先例）：
1. `Switch` `disabled`；
2. 标签与描述变灰（`.gated`）并换成控制者说明；
3. `checked` **保留原值**，不强制 `false`——重新打开大段时用户的选择还在。

### 六处改动

| 文件 | 改动 |
|---|---|
| `src/index.ts`（Host） | `TOOL_AUTO_EXPAND_FIELD` / `DEFAULT_TOOL_AUTO_EXPAND = true` / `AutoExpandSettings` 加字段 / `Config` 接口与 schema 加 `.volatile()` 字段 |
| `src/client/settings.ts` | 字段常量、`DEFAULT_SETTINGS`、`AutoExpandSettings`、`read()`，以及 **`sync()` 的比较**（见下） |
| `src/client/settings-card-state.ts` | `SwitchValues` 加字段；`SettingsCardState` 加 `tool`；`deriveSettingsCardState` 加 tool 行（`locked = !groupAutoExpand`） |
| `src/client/settings-card.tsx` | 第三行 `SwitchRow`（**追加在末行**） |
| `src/client/locales.ts` | `toolTitle` / `toolDesc`；锁定文案见下方命名问题 |
| `src/client/settings-card.module.css` | **无需改动**（复用 `.row` / `.gated`） |

### 必须避开的陷阱：`sync()` 只比较两个字段

`settings.ts:77-78` 现在是这样：

```ts
if (next.groupAutoExpand === current.groupAutoExpand
  && next.reasoningAutoExpand === current.reasoningAutoExpand) return
```

加字段时**必须**把 `toolAutoExpand` 一并比较。否则写入工具开关后
`settingsSource` 不会更新 → **设置页的开关动了，渲染层行为不变**。
这是本步最容易漏掉、且症状最像「插件坏了」的一处。

### 待用户决定：锁定文案的键名

现有键 `reasoningGated`（`'由「展开工作大段」控制，现已关闭'`）现在会被
**两行共用**，名字不再贴切。

| 选项 | 代价 |
|---|---|
| A. 复用它 | 零成本；但键名误导后续维护 |
| B. 改名为 `gatedByWorkGroup` | 更准确；需同步 `settings-card.tsx` 与可能的跨文件字符串契约测试 |

（Lead 建议 **B**，因为这是最后一次能低成本改名的时机。）

### 卡片顺序

`workGroup` → `reasoning` → `tool`（**追加在末行**，不打乱现有两行的位置）。

### 新增测试

| 测试 | 内容 |
|---|---|
| `tests/settings-card-state.spec.mjs` | tool 行在 `groupAutoExpand` 两种取值下的 `checked` / `locked` / `gatedText` |
| `tests/settings-write.spec.mjs` | tool 字段的乐观写入与失败回滚 |
| `tests/contract-consistency.spec.mjs` | 若它校验字段名清单，需同步 |

---

## 4. 执行计划与清单

> 两条原则来自本项目的事故教训：
> 1. `FIX-SCROLL.md` §13：**一次性补丁要验证它真的执行了**；
> 2. `P4-ROLLBACK.md` §7.2：**接管渲染器前先枚举它所有分支的产出**。
>
> **每步独立提交**，便于单独回退。

### 4.0 总览

| 步 | 目标 | 前置 | 产出 | 通过标准 |
|---|---|---|---|---|
| **0** | 证明包裹**零副作用** | — | 恒等包裹 | 真机清单全过 |
| 1 | context 扩展 | 0 | `GroupOpenState` | P2 / P3 无任何可观察变化 |
| 2 | 接入自动展开 | 0、1 | 判据生效 | T-1 ~ T-11 |
| 3 | 设置页 | 2 | 开关 + 卡片 | T-12 ~ T-15 |
| 4 | 收口 | 3 | 全绿 | `verify` / `pack:check` / `drift` |

**严格串行**，Step 0 是硬门槛。

### 4.1 Step 0：恒等包裹（硬门槛）

**动作**

- [ ] `src/client/index.ts`：加 `TOOL_TARGET = { slot: 'conversation.chat.node', key: 'tool-call' }`
- [ ] `src/client/index.ts`：`sync()` 里加 `attempt('tool', TOOL_TARGET, makeAutoToolCallTree)`
- [ ] `src/client/index.ts`：`slots/changed` 的判断已覆盖同一 slot（与 assistant 相同），确认无需改
- [ ] 新增 `src/client/tool/AutoToolCallTree.tsx`：**恒等包裹**，`useDisclosure` 原样透传
- [ ] 改写 `index.ts` 文件头注释（现在写的「工具行不做自动展开」已过时）
- [ ] effect label 改为「包裹 flow、assistant-step 与 tool-call」

**验证**

- [ ] `pnpm verify`
- [ ] `pnpm pack:check`
- [ ] **真机**（关键的一步，不可跳）：
  - [ ] 先确认包裹**真的生效**（加临时日志或可见判据）——否则无法区分「生效」与「静默降级」
  - [ ] `pwsh` 终端卡片完整（命令 / 退出码 / 耗时 / cwd / 输出 / 复制按钮）
  - [ ] fallback 路径：`terminal_*` / `exec_command` / `apply_patch`
  - [ ] 已注册 toolview：`bash` / `read` / `grep` / `glob` / `edit` / `write` / `web_*` / `todo_write`
  - [ ] 图片画廊（`tool.call.images` 子 slot）
  - [ ] `ask_user_question` 行
  - [ ] `SubCalls` 递归
  - [ ] 无闪烁 / 无额外重渲染

**通过**：全过 → 进 Step 1。**任一卡片退化 → 立即回退，中止本计划。**

### 4.2 Step 1：context 扩展（行为零变化）

**动作**

- [ ] `src/client/group-open-context.ts`：`boolean` → `GroupOpenState { open, auto }`，默认 `{ open: true, auto: false }`
- [ ] `src/client/flow/AutoGroupSeat.tsx`：Provider `value={open}` → `value={groupOpenState}`，`useMemo` 稳定引用
- [ ] `src/client/assistant/AutoReasoningRow.tsx`：取 `.open`（行为不变）

**验证**

- [ ] `pnpm verify`
- [ ] 真机：P2 / P3 逐项与改动前一致（当前轮展开、手动覆盖、历史不受影响）

### 4.3 Step 2：接入自动展开

**动作**

- [ ] `AutoToolCallTree.tsx`：`useDisclosure` 换成**稳定 factory**
- [ ] 新增 hook（同文件或 `use-tool-disclosure.ts`）：读 settings + context → `useAutoDisclosure`
      → 适配成 `{ expanded, setExpanded, toggle }`
- [ ] 新增 `tests/tool-disclosure.spec.mjs`：判据四组合矩阵 + 形状适配

**验证**

- [ ] `pnpm verify`
- [ ] 真机 T-1 ~ T-11（**T-4 历史不受影响是重中之重**）

### 4.4 Step 3：设置页（§3.7）

**动作**

- [ ] `src/index.ts`（Host）：字段、默认值 `true`、接口、schema `.volatile()`
- [ ] `src/client/settings.ts`：字段、默认值、接口、`read()`、**`sync()` 三字段比较**
- [ ] `src/client/settings-card-state.ts`：`SwitchValues` / `SettingsCardState.tool` / 推导
- [ ] `src/client/settings-card.tsx`：第三行 `SwitchRow`
- [ ] `src/client/locales.ts`：`toolTitle` / `toolDesc`；锁定键名按用户选择（A 复用 / B 改名）
- [ ] 更新 `tests/settings-card-state.spec.mjs`、`tests/settings-write.spec.mjs`

**验证**

- [ ] `pnpm verify`
- [ ] 真机 T-12 ~ T-15

### 4.5 Step 4：收口

- [ ] `pnpm verify`
- [ ] `pnpm pack:check`
- [ ] `pnpm drift`（应为 **0 偏差**——本次零新增克隆）
- [ ] 文档回填：`CAPABILITY-MATRIX.md`（A3 / B4 状态）、`README.md` 索引、`CHANGELOG.md`
- [ ] 确认 `scripts/upstream-manifest.mjs` **未改动**

### 4.6 中止条件

| 条件 | 动作 |
|---|---|
| Step 0 任一卡片退化 | 中止、回退，**不进入 Step 2**，重新评估路径 |
| 包裹被静默降级（entry 冻结） | 中止；该位置插件无法生效，需另寻途径 |
| T-4（历史不受影响）无法满足 | 中止，重新设计判据 |
| `pnpm drift` 出现非 0 偏差 | 停下来查是否误改了克隆文件 |

---

## 5. 风险清单

| # | 风险 | 判据 / 应对 |
|---|---|---|
| R1 | 官方 entry 被冻结 → `wrapEntry` 静默降级 | Step 0 必须在真机确认包裹**真的生效** |
| R2 | factory 引用不稳定 → `ToolCall` 的 `useMemo` 全失效 | §3.3；Step 0 观察闪烁 / 重渲染 |
| R3 | `useAutoDisclosure` 丢失官方 `disclosureReset` 语义 | group 被整轮折叠后再展开时，工具行是否仍展开；真机观察。**P3 的思考行已是同类做法且已验收**，风险可控 |
| R4 | 运行中但尚无输出的工具不展开 | `ToolRow.tsx:174` 的 `expandable` 要求有内容——**官方行为，合理**，不算缺陷 |
| R5 | 破坏 E1（历史不受影响） | §3.1 的 `group.auto` 判据；必须专门验证「手动展开历史 group 时工具行保持折叠」 |
| R6 | `QuestionToolRow` 也消费同一 `useDisclosure` | `ask-question-row.tsx:347,353`。**已决定（2026-10-23，用户确认）：与其它工具一致自动展开**，不做单独排除 |
| R7 | 子调用 `SubCalls` 一起展开导致行很长 | 语义上合理（同属一组）；若观感差，可只对根调用展开（需行身份，暂不做） |

---

## 6. 验收标准

| 编号 | 场景 | 期望 |
|---|---|---|
| T-1 | 当前轮，工具开始运行 | 该工具行**自动展开** |
| T-2 | 同一 group 内出现第二个工具调用 | 两行都展开（语义 A） |
| T-3 | group 关闭（出现正文） | 全部工具行**收起** |
| T-4 | **手动展开历史 group** | 工具行**保持折叠**（E1） |
| T-5 | 当前轮手动收起某个工具行 | 保持收起，直到 `autoOpen` 变化 |
| T-6 | 当前轮手动收起 group | 工具行一并收起 |
| T-7 | `pwsh` / 各类工具卡片 | 与未装插件时**完全一致**（只是默认展开） |
| T-8 | 关闭 `toolAutoExpand` | 回到官方恒折叠 |
| T-9 | 关闭 `groupAutoExpand` | 工具行不自动展开（被门控） |
| T-10 | 历史轮次浏览 | 与未装插件时完全一致 |
| T-11 | `ask_user_question` 行 | 与其它工具一致，自动展开（用户 2026-10-23 决定） |
| T-12 | 设置页第三行 | 出现「展开工具结果」，默认开 |
| T-13 | 关闭「展开工作大段」 | 第三行变灰 + 描述换成控制者说明 + 拒绝输入（`checked` 保留原值） |
| T-14 | 改动工具开关后 | 渲染层**立即跟随**（专测 `sync()` 陷阱） |
| T-15 | 三个开关跨重启 | 各自保留（Host 持久化） |

---

## 7. 明确不做

| 项 | 原因 |
|---|---|
| **只展开最新一条**（下一条出现时收起上一条） | `ToolRow` 不暴露行身份；唯一替代是依赖 React 渲染顺序计数，**脆弱**。见 `CAPABILITY-MATRIX.md` §3 |
| **按工具细分策略**（A4） | 用户已列为未来功能，本期先做整组统一 |
| 克隆任何 `ui-tool` 代码 | 正是 P4 失败的原因 |
| 修改 `capped` / 滚动 | 与 `MOTION-PLAN.md` §6.3、§8.2 结论一致，不做 |