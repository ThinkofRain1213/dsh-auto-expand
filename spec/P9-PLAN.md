# 隐藏「查看」按钮（P9）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给工具行上的「查看」按钮增加一个可配置的隐藏范围，让用户能把该按钮连同它占用的那一行一起去掉。

**Architecture:** 官方 `ToolRow` 的「查看」按钮由 `inspect !== undefined` 一个信号决定，而 `inspect` 由 `ToolCallTree` 从 props 的 `inspectCall` 派生。本插件的包裹层 `AutoToolCallTree` 本就持有全部 props，因此在透传时按设置把 `inspectCall` 置空即可——按钮、`hasInspect` 的 88px 让位、它预留的那一行高度会一起消失。**不改 CSS、不克隆 `ToolRow`。**

**Tech Stack:** TypeScript 5.9 / React 18 / Cordis DI / schemastery（Host schema）/ node:test（单元测试）/ tsdown（构建）

**Spec:** 本计划第一节即需求规格（用户已逐条确认），无独立 spec 文件。

## Global Constraints

- DSH 目标版本：`>=0.2.1-rc.2 <0.2.2`（`package.json` 的 `engines.dsh`）
- 上游克隆基准：`@deepseek-ai/dsh-client-ui-chat` / `ui-tool` / `ui-conversation` @ `0.2.1-rc.2`，commit `687f282e86`
- 字段名 `inspectButtonHideScope` 与取值 `off` / `current` / `all` 进 `cordis.patch.yml`，**发布后不宜改名**
- 默认值必须是 `off`，保证已安装用户行为不变
- 文案一律中文（`locales.ts` 的 `zh`）＋英文（`en`），两套都要齐
- 不修改官方「显示代码工作视图」开关，不修改 `inspectCall` 的官方实现
- 历史轮次的其它行为（自动展开、收起时机）一律不动
- 每个提交前必须 `pnpm verify` 通过（typecheck + build + test + smoke）
- 每个提交后 `pnpm drift` 必须仍为 0 漂移

## Review Focus

以下五类是规格隐含、但任何单个任务的测试都不会自动覆盖的失效点，按最可能出错排序。每条都已在对应任务中钉了测试。

1. **`inspectCall` 原本就是 `undefined` 时**（用户关掉了官方「显示代码工作视图」）——此时三档之间不应有任何可观察差异。若实现成"按档位强制置 `undefined`"，看起来一样，但若写成"按档位合成一个新的空函数"，就会把 `inspect !== undefined` 判成真，反而**凭空造出一个点了没反应的按钮**。
2. **`undefined` 与"省略字段"的差别**——`ToolCallTree` 解构 `inspectCall`，显式传 `undefined` 与不传等价；但若传 `null` 或空函数，行为完全不同。必须只传 `undefined` 或原值。
3. **设置变更时的实时性**——用户在下拉里切换档位后，已经挂载的工具行必须立即响应，不需要刷新页面。这要求包裹层订阅设置（`useAutoExpandSettings`），而不是在 `apply()` 时读一次快照。
4. **`off` 档必须逐字等价于"未安装本插件"**——宿主字段缺失、旧存档没有该字段、Host 返回 `undefined`，三种情况都必须回落到 `off`。
5. **`current` 档在历史轮次上的表现**——历史操作组的 `GroupOpenContext.auto` 为 `false`，因此按钮必须保持可见（与官方一致）。若判据写成"只有 `auto === true` 才保留"的取反，容易误伤成"历史轮一律隐藏"。

---

## 需求规格（已确认）

### 设置项

| 项 | 值 |
|---|---|
| 字段名 | `inspectButtonHideScope` |
| 控件 | 下拉框，三选一 |
| 默认 | `off` |
| 行标题 | 隐藏查看按钮 |
| 行说明 | 工具行上的「查看」按钮会跳转到轨迹记录；可只去掉当前轮的入口，或全部去掉。 |

### 三档

| 取值 | 中文 | 英文 | 行为 |
|---|---|---|---|
| `off` | 不隐藏 | Off | 透传原始 `inspectCall`，**逐字等价于官方** |
| `current` | 仅当前轮 | Current turn | 当前轮（`group.auto === true`）置空；历史组保持官方 |
| `all` | 全部轮次 | All turns | 一律置空 |

### 连带消失的东西（同一信号，一处拦截全部生效）

| # | 位置 | 现象 |
|---|---|---|
| 1 | `ToolRow.tsx:357` | 通用工具行左下角按钮 |
| 2 | `QuestionToolRow.tsx:57` | `ask_user_question` 行按钮 |
| 3 | `bash-sample.tsx:158` | bash 示例行独立实现 |
| 4 | `ToolRow.tsx:325` → `ToolDetails` 的 `hasInspect` | 详情卡右侧 `padding-inline-end: 88px` 让位 |
| 5 | `ToolRow.module.css:126` 的 `.inspectButton` | `opacity: 0` 但仍占布局 → 不渲染则那一行高度消失 |

### 已知取舍（不处理）

轮次**刚结束**那一刻 `auto` 变假，`current` 档下按钮会重新出现。这与插件现有「操作组自动展开」完全同构（轮次结束后交回官方）。要让"刚结束的那轮也算当前"需另立判据，本次**不做**。

---

## 文件结构

| 文件 | 职责 |
|---|---|
| `src/client/inspect-button-scope.ts` | **新增**。三档的取值列表、类型、纯函数判据 `inspectCallFor()`。所有档位逻辑集中于此，可被直接单测 |
| `src/client/settings.ts` | 增加 `inspectButtonHideScope` 字段与默认值，`sync()` 参与比较 |
| `src/index.ts`（Host） | schema 增加该字段；导出取值列表与默认值供契约测试 |
| `src/client/locales.ts` | 三档文案、行标题与说明（中英双份） |
| `src/client/settings-card.tsx` | 第六行：下拉；`TIMING_LABEL_KEYS` 旁新增 `SCOPE_LABEL_KEYS` |
| `src/client/settings-card-state.ts` | 六行状态：新增行的锁定判据（随操作组开关门控） |
| `src/client/tool/AutoToolCallTree.tsx` | 读设置 + `GroupOpenContext`，调用 `inspectCallFor()`，透传时替换 `inspectCall` |
| `tests/inspect-button-scope.spec.mjs` | **新增**。三档 × 当前/历史 × 原始值有无 的判据矩阵 |
| `tests/contract-consistency.spec.mjs` | 字段名 5→6、取值列表两端一致、默认值一致 |
| `tests/settings-card-state.spec.mjs` | 六行的门控矩阵 |

---

### Task 1: 判据纯函数与取值列表

**Files:**
- Create: `src/client/inspect-button-scope.ts`
- Test: `tests/inspect-button-scope.spec.mjs`

**Interfaces:**
- Consumes: 无
- Produces:
  - `type InspectButtonHideScope = 'off' | 'current' | 'all'`
  - `const INSPECT_BUTTON_HIDE_SCOPES: readonly InspectButtonHideScope[]` = `['off', 'current', 'all']`
  - `const DEFAULT_INSPECT_BUTTON_HIDE_SCOPE: InspectButtonHideScope` = `'off'`
  - `function inspectCallFor(input: { readonly scope: InspectButtonHideScope; readonly auto: boolean; readonly inspectCall: ((callId: string) => void) | undefined }): ((callId: string) => void) | undefined`

- [ ] **Step 1: 写失败的测试**

```js
// tests/inspect-button-scope.spec.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  INSPECT_BUTTON_HIDE_SCOPES, DEFAULT_INSPECT_BUTTON_HIDE_SCOPE, inspectCallFor,
} from '../src/client/inspect-button-scope.ts'

/** 一个可辨认的假回调，用来断言"是否原样透传"。 */
const CALL = () => {}

test("'off'：原样透传，无论当前轮还是历史轮", () => {
  assert.equal(inspectCallFor({ scope: 'off', auto: true, inspectCall: CALL }), CALL)
  assert.equal(inspectCallFor({ scope: 'off', auto: false, inspectCall: CALL }), CALL)
})

test("'current'：当前轮置空，历史轮原样透传", () => {
  assert.equal(inspectCallFor({ scope: 'current', auto: true, inspectCall: CALL }), undefined)
  assert.equal(inspectCallFor({ scope: 'current', auto: false, inspectCall: CALL }), CALL)
})

test("'all'：一律置空", () => {
  assert.equal(inspectCallFor({ scope: 'all', auto: true, inspectCall: CALL }), undefined)
  assert.equal(inspectCallFor({ scope: 'all', auto: false, inspectCall: CALL }), undefined)
})

test('原始值本就是 undefined 时，三档都不得凭空造出回调', () => {
  // Review Focus 第 1 条：官方「显示代码工作视图」关闭时 inspectCall 就是
  // undefined。此时任何档位都必须保持 undefined——绝不能返回一个空函数，
  // 否则官方会判 inspect !== undefined 而渲染出一个点了没反应的按钮。
  for (const scope of INSPECT_BUTTON_HIDE_SCOPES) {
    for (const auto of [true, false]) {
      const result = inspectCallFor({ scope, auto, inspectCall: undefined })
      assert.equal(result, undefined, `scope=${scope} auto=${auto} 必须保持 undefined`)
    }
  }
})

test('未知取值回落到 off（旧存档 / 字段缺失）', () => {
  // Review Focus 第 4 条：字段缺失时读出来是 undefined，必须等同于 off。
  for (const bad of [undefined, null, '', 'nonsense']) {
    assert.equal(
      inspectCallFor({ scope: bad, auto: true, inspectCall: CALL }), CALL,
      `未知取值 ${String(bad)} 应回落到 off`,
    )
  }
})

test('取值列表：三个、顺序固定、默认 off', () => {
  assert.deepEqual([...INSPECT_BUTTON_HIDE_SCOPES], ['off', 'current', 'all'])
  assert.equal(new Set(INSPECT_BUTTON_HIDE_SCOPES).size, 3)
  assert.equal(DEFAULT_INSPECT_BUTTON_HIDE_SCOPE, 'off')
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --experimental-transform-types --test tests/inspect-button-scope.spec.mjs`
Expected: FAIL，`Cannot find module '../src/client/inspect-button-scope.ts'`

- [ ] **Step 3: 实现 `src/client/inspect-button-scope.ts`**

按下列签名实现；`inspectCallFor` 的三档分支用 `switch`，未知取值走 `default` 返回原值（等价 `off`）。

```ts
export type InspectButtonHideScope = 'off' | 'current' | 'all'
export const INSPECT_BUTTON_HIDE_SCOPES: readonly InspectButtonHideScope[] = ['off', 'current', 'all']
export const DEFAULT_INSPECT_BUTTON_HIDE_SCOPE: InspectButtonHideScope = 'off'

export interface InspectButtonScopeInput {
  readonly scope: InspectButtonHideScope
  readonly auto: boolean
  readonly inspectCall: ((callId: string) => void) | undefined
}

export function inspectCallFor(input: InspectButtonScopeInput): ((callId: string) => void) | undefined {
  // 原始值为 undefined 时一律不造新回调（Review Focus 第 1、2 条）。
  if (input.inspectCall === undefined) return undefined
  switch (input.scope) {
    case 'current': return input.auto ? undefined : input.inspectCall
    case 'all': return undefined
    // 'off' 与任何未知取值：原样透传，等价于未安装本插件。
    default: return input.inspectCall
  }
}
```

文件头注释必须写明：这五处渲染点共用 `inspect !== undefined` 一个信号，因此只在这里拦截；以及「等价于官方」的含义。

- [ ] **Step 4: 跑测试确认通过**

Run: `node --experimental-transform-types --test tests/inspect-button-scope.spec.mjs`
Expected: PASS，6 个测试全绿

- [ ] **Step 5: 登记测试脚本并提交**

把 `tests/inspect-button-scope.spec.mjs` 追加到 `package.json` 的 `test` 脚本末尾。

```bash
pnpm test
git add src/client/inspect-button-scope.ts tests/inspect-button-scope.spec.mjs package.json
git commit -m "feat(inspect): 查看按钮隐藏范围的判据（三档纯函数）"
```

---

### Task 2: 设置字段贯通两端

**Files:**
- Modify: `src/client/settings.ts:23-48`、`:75-99`
- Modify: `src/index.ts:23-33`、`:45-67`、`:80-119`
- Test: `tests/contract-consistency.spec.mjs`

**Interfaces:**
- Consumes: Task 1 的 `InspectButtonHideScope`、`INSPECT_BUTTON_HIDE_SCOPES`、`DEFAULT_INSPECT_BUTTON_HIDE_SCOPE`
- Produces:
  - `settings.ts`：`INSPECT_BUTTON_HIDE_SCOPE_FIELD = 'inspectButtonHideScope'`；`AutoExpandSettings.inspectButtonHideScope: InspectButtonHideScope`；`DEFAULT_SETTINGS.inspectButtonHideScope = 'off'`
  - `src/index.ts`：`INSPECT_BUTTON_HIDE_SCOPE_FIELD`、`INSPECT_BUTTON_HIDE_SCOPES`（`as const`）、`DEFAULT_INSPECT_BUTTON_HIDE_SCOPE`、`InspectButtonHideScope` 类型，并进入 `Config` schema

- [ ] **Step 1: 写失败的契约测试**

在 `tests/contract-consistency.spec.mjs`：

```js
  const fieldPattern = () => new RegExp(
    '(GROUP|REASONING|TOOL)_AUTO_EXPAND_FIELD\\s*=\\s*\'([^\']+)\''
    + '|(REASONING|TOOL)_COLLAPSE_TIMING_FIELD\\s*=\\s*\'([^\']+)\''
    + '|INSPECT_BUTTON_HIDE_SCOPE_FIELD\\s*=\\s*\'([^\']+)\'',
    'g',
  )
  /** 取值：正则的第 2 / 4 / 6 组（取决于命中哪个分支）。 */
  const valueOf = (match) => match[2] ?? match[4] ?? match[6]
```

**新增**三条（放在现有「收起时机」相关测试之后）：

```js
test('隐藏范围取值列表两端一致', () => {
  const membersOf = (source, name) => {
    const block = new RegExp(`\\b${name}[^=\\n]*=\\s*\\[([^\\]]*)\\]`).exec(source)
    assert.ok(block !== null, `找不到 ${name} 的定义`)
    return [...block[1].matchAll(/'([^']+)'/g)].map(match => match[1])
  }
  assert.deepEqual(
    membersOf(read('src/client/inspect-button-scope.ts'), 'INSPECT_BUTTON_HIDE_SCOPES'),
    membersOf(hostSource, 'INSPECT_BUTTON_HIDE_SCOPES'),
    '两端必须逐字一致，否则 Host 会拒写 Client 发来的枚举值',
  )
  assert.deepEqual(membersOf(hostSource, 'INSPECT_BUTTON_HIDE_SCOPES'), ['off', 'current', 'all'])
})

test('隐藏范围默认值三处一致且为 off', () => {
  const hostDefault = capture(hostSource,
    /DEFAULT_INSPECT_BUTTON_HIDE_SCOPE:\s*\w+\s*=\s*'([^']+)'/, 'Host 默认值')
  const clientDefault = capture(read('src/client/inspect-button-scope.ts'),
    /DEFAULT_INSPECT_BUTTON_HIDE_SCOPE:\s*\w+\s*=\s*'([^']+)'/, 'Client 默认值')
  const snapshotDefault = capture(clientSettings,
    /inspectButtonHideScope:\s*'([^']+)'/, 'Client 快照默认值')
  assert.equal(hostDefault, 'off', '默认必须是 off，保证已安装用户行为不变')
  assert.equal(clientDefault, hostDefault)
  assert.equal(snapshotDefault, hostDefault)
})

test('schema 里隐藏范围字段用 INSPECT_BUTTON_HIDE_SCOPES 做 union', () => {
  assert.match(hostSource,
    /INSPECT_BUTTON_HIDE_SCOPE_FIELD\]:\s*z\.union\(\[\.\.\.INSPECT_BUTTON_HIDE_SCOPES\]\)/,
    '字段必须用取值列表做 union，否则 Host 会接受非法值')
})
```

**不要**再单独新增「字段总数从 5 变成 6」的测试——现有的那条改完数字即已覆盖，重复断言同一件事没有价值。

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm test`
Expected: FAIL，报 `INSPECT_BUTTON_HIDE_SCOPE_FIELD` 未声明

- [ ] **Step 3: 实现两端字段**

`src/client/settings.ts`：加字段常量、接口字段、默认值，并在 `sync()` 的比较里加入 `next.inspectButtonHideScope !== current.inspectButtonHideScope`。类型从 Task 1 的模块导入。

`src/index.ts`：
- 导出 `INSPECT_BUTTON_HIDE_SCOPE_FIELD`、`INSPECT_BUTTON_HIDE_SCOPES = ['off', 'current', 'all'] as const`、`InspectButtonHideScope = typeof INSPECT_BUTTON_HIDE_SCOPES[number]`、`DEFAULT_INSPECT_BUTTON_HIDE_SCOPE: InspectButtonHideScope = 'off'`
- `Config` schema 增加 `[INSPECT_BUTTON_HIDE_SCOPE_FIELD]: z.union([...INSPECT_BUTTON_HIDE_SCOPES]).default(DEFAULT_INSPECT_BUTTON_HIDE_SCOPE).volatile()`
- `AutoExpandSettings` 接口与 `Config` 接口同步加字段

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm test`
Expected: PASS，全部通过（含原有 5 字段断言被改成 6）

- [ ] **Step 5: 提交**

```bash
pnpm verify
git add src/client/settings.ts src/index.ts tests/contract-consistency.spec.mjs
git commit -m "feat(settings): 隐藏范围字段贯通 Host schema 与客户端快照"
```

---

### Task 3: 包裹层按档位透传

**Files:**
- Modify: `src/client/tool/AutoToolCallTree.tsx:99-137`
- Test: `tests/inspect-button-scope.spec.mjs`（追加一条集成式断言）

**Interfaces:**
- Consumes: Task 1 的 `inspectCallFor`；Task 2 的 `settings.inspectButtonHideScope`；现有 `GroupOpenContext.auto`
- Produces: 包裹层的透传行为——`<Inner inspectCall={...} useDisclosure={...} />`

- [ ] **Step 1: 写失败的测试**

在 `tests/inspect-button-scope.spec.mjs` 追加一条，直接断言"包裹层会传什么"，用判据函数表达该契约（渲染层无法在 node:test 里挂载，因此断言判据与参数来源）：

```js
test('包裹层透传契约：档位 + 当前轮状态 + 原始值 → 传给 Inner 的值', () => {
  // 对应 AutoToolCallTree 里的 `inspectCall={inspectCallFor({...})}`。
  // 这五种组合覆盖了当前轮/历史轮 × 三档的关键交叉。
  const CALL = () => {}
  const cases = [
    // [档位, group.auto, 原始值, 期望传给 Inner 的值]
    ['off', true, CALL, CALL],
    ['off', false, CALL, CALL],
    ['current', true, CALL, undefined],
    ['current', false, CALL, CALL],
    ['all', false, CALL, undefined],
    ['all', true, undefined, undefined],
    ['current', false, undefined, undefined],
  ]
  for (const [scope, auto, original, expected] of cases) {
    assert.equal(inspectCallFor({ scope, auto, inspectCall: original }), expected,
      `scope=${scope} auto=${auto} original=${original === undefined ? 'undefined' : 'callback'}`)
  }
})
```

- [ ] **Step 2: 跑测试确认通过（判据已存在）**

Run: `node --experimental-transform-types --test tests/inspect-button-scope.spec.mjs`
Expected: PASS（这条只钉契约，不改判据）

- [ ] **Step 3: 改 `AutoToolCallTree`**

在组件内：

```tsx
const settings = useAutoExpandSettings()
const group = useContext(GroupOpenContext)
const inspectCall = inspectCallFor({
  scope: settings.inspectButtonHideScope,
  auto: group.auto,
  inspectCall: props.inspectCall as ((callId: string) => void) | undefined,
})
// ...
<Inner {...props} inspectCall={inspectCall} useDisclosure={useAutoToolDisclosure} />
```

三点必须写进注释：
1. **只覆盖 `inspectCall` 一个 prop**，其余（含 `inspectCall` 之外的一切）原样透传。
2. **必须用 `useAutoExpandSettings()` 订阅**，不能在 `apply()` 时读一次快照——否则用户切换档位后已挂载的行不响应（Review Focus 第 3 条）。
3. **只传 `undefined`，绝不传空函数或 `null`**——官方判 `inspect !== undefined`，空函数会造出死按钮（Review Focus 第 1 条）。

`ToolTreePassthroughProps` 是 `Record<string, unknown>`，取值时需显式窄化类型。

- [ ] **Step 4: 验证全绿**

Run: `pnpm verify`
Expected: typecheck / build / 全部测试 / smoke 都通过

- [ ] **Step 5: 提交**

```bash
git add src/client/tool/AutoToolCallTree.tsx tests/inspect-button-scope.spec.mjs
git commit -m "feat(tool): 包裹层按档位置空 inspectCall，隐藏查看按钮及其占位行"
```

---

### Task 4: 设置卡片第六行

**Files:**
- Modify: `src/client/locales.ts`（`zh` 与 `en` 各加 5 个键）
- Modify: `src/client/settings-card.tsx:54-60`（`SCOPE_LABEL_KEYS`）、`:170-230`（第六行）
- Modify: `src/client/settings-card-state.ts:19-56`、`:73-103`
- Test: `tests/settings-card-state.spec.mjs`

**Interfaces:**
- Consumes: Task 1 的 `INSPECT_BUTTON_HIDE_SCOPES`；Task 2 的 `settings.inspectButtonHideScope` 与 `setAutoExpandSetting`
- Produces: `SettingsCardState.inspectScope: SelectRowState`；`SettingsKey` 新增 5 个文案键

- [ ] **Step 1: 写失败的测试**

在 `tests/settings-card-state.spec.mjs` 追加。注意该文件已有辅助函数 `values(groupAutoExpand, reasoningAutoExpand, toolAutoExpand = true)`，**直接用它是同一件事**：

```js
test('新增的隐藏范围行：只随操作组开关门控', () => {
  const on = deriveSettingsCardState(values(true, true))
  assert.equal(on.inspectScope.locked, false)
  assert.equal(on.inspectScope.gate, 'none')

  const off = deriveSettingsCardState(values(false, true))
  assert.equal(off.inspectScope.locked, true)
  assert.equal(off.inspectScope.gate, 'workGroup')
})

test('隐藏范围行不受思考/工具开关影响', () => {
  for (const reasoningAutoExpand of [true, false]) {
    for (const toolAutoExpand of [true, false]) {
      const state = deriveSettingsCardState(values(true, reasoningAutoExpand, toolAutoExpand))
      assert.equal(state.inspectScope.locked, false,
        `reasoning=${reasoningAutoExpand} tool=${toolAutoExpand} 不应影响该行`)
    }
  }
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm test`
Expected: FAIL，`state.inspectScope` 为 `undefined`

- [ ] **Step 3: 实现**

`locales.ts` 的 `zh` 与 `en` 各加：

| 键 | zh | en |
|---|---|---|
| `inspectScopeTitle` | 隐藏查看按钮 | Hide the Inspect button |
| `inspectScopeDesc` | 工具行上的「查看」按钮会跳转到轨迹记录；可只去掉当前轮的入口，或全部去掉。 | The Inspect button on tool rows opens the trajectory record. Hide it only in the running turn, or everywhere. |
| `inspectScopeOff` | 不隐藏 | Don't hide |
| `inspectScopeCurrent` | 仅当前轮 | Current turn only |
| `inspectScopeAll` | 全部轮次 | All turns |

`settings-card-state.ts`：`SettingsCardState` 加 `inspectScope: SelectRowState`；`deriveSettingsCardState` 里 `inspectScope = { locked: innerLocked, gate: innerLocked ? 'workGroup' : 'none' }`。

`settings-card.tsx`：加 `SCOPE_LABEL_KEYS: Record<InspectButtonHideScope, SettingsKey>`，用 `INSPECT_BUTTON_HIDE_SCOPES.map(...)` 生成选项，在第五条（工具收起时机）之后渲染第六个 `SelectRow`，`locked` 用 `gatedByWorkGroup`，`onChange` 写 `setAutoExpandSetting('inspectButtonHideScope', next)`。

- [ ] **Step 4: 验证**

Run: `pnpm verify`
Expected: 全绿

- [ ] **Step 5: 提交**

```bash
git add src/client/locales.ts src/client/settings-card.tsx src/client/settings-card-state.ts tests/settings-card-state.spec.mjs
git commit -m "feat(settings): 设置卡片新增「隐藏查看按钮」下拉（三选一）"
```

---

### Task 5: 文档收口

**Files:**
- Modify: `README.md`（设置节从五行改六行）
- Modify: `CHANGELOG.md`
- Modify: `spec/CAPABILITY-MATRIX.md`（新增一条能力行）

**Interfaces:**
- Consumes: 前四个任务的全部产出
- Produces: 无代码接口

- [ ] **Step 1: 改 README 设置节**

把「五行设置」改为「六行」，表格追加：

| 行 | 控件 | 关掉/作用 |
|---|---|---|
| 隐藏查看按钮 | 下拉 | 三选一：不隐藏（默认）/ 仅当前轮 / 全部轮次 |

并在「已知限制」或行为表附近补一句：选「仅当前轮」时，轮次刚结束那一刻按钮会重新出现（与操作组自动展开的行为一致）。

- [ ] **Step 2: 改 CHANGELOG**

在「设置」节补第六行；在「行为」节补一条能力说明，注明连带消失的五处渲染点。

- [ ] **Step 3: 改 CAPABILITY-MATRIX**

`A` 组（展开能力）之外新增一节记录该能力：作用对象 `ToolRow.inspectButton`、判据 `inspectCallFor()`、三档语义、连带影响面、已知取舍。

- [ ] **Step 4: 验证并提交**

```bash
pnpm verify
git add README.md CHANGELOG.md spec/CAPABILITY-MATRIX.md
git commit -m "docs: 隐藏查看按钮的设置说明与能力矩阵"
```

---

## 真机验收清单

按档位逐个切换，每档都要看到预期结果：

- [ ] **`off`（默认）**：工具行悬停出现「查看」按钮；点开详情卡右侧有 88px 让位；展开详情行底部有按钮占位。**与未安装插件时完全一致**
- [ ] **`current` + 当前轮运行中**：按钮不出现；展开详情行底部**没有**空行；详情卡右侧**没有** 88px 空白
- [ ] **`current` + 浏览历史轮**：历史工具行的按钮**仍正常显示**（与官方一致）
- [ ] **`all`**：当前轮与历史轮都不出现按钮，也都没有空行
- [ ] **实时性**：在下拉里切换档位，**不刷新页面**，已挂载的工具行立即变化
- [ ] **官方开关交叉**：把官方「显示代码工作视图」关掉后，三个档位表现应完全一致（都没有按钮，因为本来就没有入口）
- [ ] **跨重启**：设置保留
- [ ] **其它行为不受影响**：操作组自动展开、思考/工具的收起时机、滚动跟随都照旧

---

## 风险

| # | 风险 | 应对 |
|---|---|---|
| R1 | 空函数冒充 `undefined`，造出死按钮 | Task 1 的测试第一条就断言原始 `undefined` 时任何档位都返回 `undefined` |
| R2 | 只有当前轮判据写反，误伤历史轮 | Task 1 与 Task 4 都有历史轮断言；真机清单专列一条 |
| R3 | 读快照而非订阅，切换不实时 | Task 3 明确要求 `useAutoExpandSettings()`；真机清单有实时性项 |
| R4 | 字段名写错，写入被静默忽略 | 契约测试把字段名进清单，两端口径一致 |
| R5 | 默认值不是 `off`，改变已安装用户行为 | 契约测试断言默认值必须是 `off` |
| R6 | `ToolTreePassthroughProps` 是 `Record<string, unknown>`，取值需窄化 | Task 3 明示显式类型断言 |
