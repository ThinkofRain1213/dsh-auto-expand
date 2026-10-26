# 操作组展开高度设置 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给自动展开的操作组加三个设置项（启用开关、高度百分比、历史轮次也应用），让用户能把组调高或调矮。

**Architecture:** 三层。①三个字段贯通 Host schema 与客户端快照（`src/index.ts` / `src/client/settings.ts`）；②一个纯函数 `groupHeight` 把「组状态 × 设置」翻译成内联 CSS 值，接进 `AutoGroupSeat` 的 body；③设置卡片新增三行，第一行开关门控后两行，第二行是带强过滤与阈值警告的数字输入。

**Tech Stack:** TypeScript、React 18、Cordis、schemastery（`@deepseek-ai/schemastery`）、lightningcss（CSS Modules）、Node 内置 test runner。

**Spec:** `docs/superpowers/specs/2026-10-26-group-height-design.md`

## Global Constraints

- DSH 目标版本：`engines.dsh` = `>=0.2.1-rc.2 <0.2.2`，当前基线 rc.3。
- 三个字段名固定，发布后不可改名：`groupHeightCustom`、`groupHeightPercent`、`groupHeightHistory`。
- `groupHeightPercent` 类型是 `number | null`；**`null` = 留空 = 不设上限**。
- Host schema 里 **`groupHeightPercent` 不加 `.default()`**（实测会把 `null` 改写成 100）。
- 百分比换算：`100% → min(400px, 50vh)`，即 `min(percent*4 px, percent*0.5 vh)`。
- 橙色警告阈值：**`< 10` 时显示**，措辞「高度过小，内容几乎不可见」。
- 默认值：`groupHeightCustom: false`、`groupHeightPercent: 100`、`groupHeightHistory: false`。
- 文案只用中文（本项目 UI 文案全部中文）。
- 所有新增逻辑必须可单测；`pnpm verify` 必须保持全绿。

## Review Focus

1. **`percent` 存 `null` 后读回必须仍是 `null`**（不能变成 100）——用户清空输入框期望「不设上限」，若被回退成 100 则功能静默失效。
2. **官方 `detailed` 模式（`capped === false`）下不写任何内联 style**——否则会给本应无上限的组强加上限。
3. **`percent` 为 `null` 时必须同时写 `max-height: none` 与 `overflow-y: visible`**——只写前者会留下 `overflow-y: auto` 继续裁剪内容。
4. **输入 `200` 的过程中不能中途写 Host**——否则会依次写入 2、20、200，用户看到组闪缩三次。
5. **`percent` 为 `0` 或 `5` 时给警告但不阻止保存**——它们是合法值，只是过小。

---

## 文件结构

| 文件 | 责任 | 动作 |
|---|---|---|
| `src/index.ts` | Host schema 与类型声明 | 改 |
| `src/client/group-height.ts` | **新增**：`groupHeight` 纯函数与常量 | 建 |
| `src/client/settings.ts` | 客户端设置快照（八处） | 改 |
| `src/client/settings-card-state.ts` | 门控状态推导 | 改 |
| `src/client/settings-card.tsx` | 设置卡片渲染（新增 NumberRow） | 改 |
| `src/client/settings-card.module.css` | 数字输入行样式 | 改 |
| `src/client/locales.ts` | 新增文案键 | 改 |
| `src/client/flow/AutoGroupSeat.tsx` | 接入内联 style | 改 |
| `scripts/upstream-manifest.mjs` | 注释：`AutoGroupSeat.tsx` 修改点从四处变五处 | 改 |
| `tests/group-height.spec.mjs` | **新增**：纯函数单测 | 建 |
| `tests/settings-card-state.spec.mjs` | 门控状态用例 | 改 |
| `tests/contract-consistency.spec.mjs` | 字段数与正则 | 改 |
| `package.json` | test 脚本白名单 + 两个新 spec | 改 |

---

## Task 1: 三个设置字段贯通

**Files:**
- Modify: `src/index.ts:92-136`
- Modify: `src/client/settings.ts:27-109`
- Modify: `src/client/group-height.ts`（先只放常量，Task 2 再加函数）
- Test: `tests/group-height.spec.mjs`（新建）
- Modify: `package.json:64`（test 脚本）

**Interfaces:**
- Produces:
  - `GROUP_HEIGHT_CUSTOM_FIELD = 'groupHeightCustom'`
  - `GROUP_HEIGHT_PERCENT_FIELD = 'groupHeightPercent'`
  - `GROUP_HEIGHT_HISTORY_FIELD = 'groupHeightHistory'`
  - `DEFAULT_GROUP_HEIGHT_PERCENT = 100`
  - `AutoExpandSettings` 新增 `groupHeightCustom: boolean`、`groupHeightPercent: number | null`、`groupHeightHistory: boolean`

- [ ] **Step 1: 写失败测试**

`tests/group-height.spec.mjs`：

```js
import assert from 'node:assert/strict'
import { test } from 'node:test'

const { DEFAULT_SETTINGS } = await import('../src/client/settings.ts')
import {
  GROUP_HEIGHT_CUSTOM_FIELD, GROUP_HEIGHT_PERCENT_FIELD, GROUP_HEIGHT_HISTORY_FIELD,
} from '../src/client/group-height.ts'

test('三个字段名与设计一致', () => {
  assert.equal(GROUP_HEIGHT_CUSTOM_FIELD, 'groupHeightCustom')
  assert.equal(GROUP_HEIGHT_PERCENT_FIELD, 'groupHeightPercent')
  assert.equal(GROUP_HEIGHT_HISTORY_FIELD, 'groupHeightHistory')
})

test('默认值：开关关闭、高度 100、历史不应用', () => {
  assert.equal(DEFAULT_SETTINGS.groupHeightCustom, false)
  assert.equal(DEFAULT_SETTINGS.groupHeightPercent, 100)
  assert.equal(DEFAULT_SETTINGS.groupHeightHistory, false)
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --experimental-transform-types --test tests/group-height.spec.mjs`
Expected: FAIL，报 `Cannot find module '../src/client/group-height.ts'`

- [ ] **Step 3: 实现字段常量与客户端设置**

在 `src/client/group-height.ts` 新建并导出三个字段常量与 `DEFAULT_GROUP_HEIGHT_PERCENT = 100`（文件头部写一句注释：本模块是「组状态 × 设置 → CSS 值」的唯一判据源）。

在 `src/index.ts` 的 `AutoExpandSettings`、`Config`、schema 各加三项。schema 写法：

```ts
[GROUP_HEIGHT_PERCENT_FIELD]: z.union([z.natural(), z.const(null)]).volatile(),
```

**不加 `.default()`** —— 实测 `union(...).default(100)` 会把 `null` 改写成 100。

在 `src/client/settings.ts` 加三个字段常量引用、`DEFAULT_SETTINGS` 三项、`AutoExpandSettings` 三个只读字段、`read()` 三分支读取、`sync()` 三个 `===` 比较。

`read()` 里 `groupHeightPercent` 必须三分支（不能 `??`）：

```ts
groupHeightPercent: value?.groupHeightPercent === undefined
  ? DEFAULT_SETTINGS.groupHeightPercent
  : value.groupHeightPercent,
```

- [ ] **Step 4: 把新 spec 加进 test 白名单**

`package.json` 的 `scripts.test` 末尾追加 `tests/group-height.spec.mjs`。

- [ ] **Step 5: 运行测试确认通过**

Run: `pnpm test`
Expected: 全部 PASS，且输出里能看到新 spec 的名字

- [ ] **Step 6: 提交**

```bash
git add src/client/group-height.ts src/client/settings.ts src/index.ts tests/group-height.spec.mjs package.json
git commit -m "feat(settings): 高度字段贯通 Host schema 与客户端快照"
```

---

## Task 2: `groupHeight` 纯函数

**Files:**
- Modify: `src/client/group-height.ts`
- Test: `tests/group-height.spec.mjs`

**Interfaces:**
- Consumes: Task 1 的常量
- Produces: `groupHeight(input: GroupHeightInput): GroupHeightStyle | null`，其中

```ts
export interface GroupHeightInput {
  /** 卡片第 1 行开关。关闭时高度功能整体不生效（Spec §6.5 第 0 条）。 */
  readonly groupAutoExpand: boolean
  readonly capped: boolean
  readonly isCurrent: boolean
  readonly custom: boolean
  readonly history: boolean
  readonly percent: number | null
}
export interface GroupHeightStyle {
  readonly maxHeight: string
  readonly overflowY?: string
}
```

- [ ] **Step 1: 写失败测试**

追加到 `tests/group-height.spec.mjs`：

```js
import { groupHeight } from '../src/client/group-height.ts'

const base = {
  groupAutoExpand: true, capped: true, isCurrent: true,
  custom: true, history: false, percent: 100,
}

test('操作组自动展开关闭时整体不生效（Spec 6.5 第 0 条）', () => {
  assert.equal(groupHeight({ ...base, groupAutoExpand: false, percent: 150 }), null)
})

test('capped 为假时不干预（官方 detailed 模式）', () => {
  assert.equal(groupHeight({ ...base, capped: false, percent: 150 }), null)
})

test('开关关闭时不干预', () => {
  assert.equal(groupHeight({ ...base, custom: false }), null)
})

test('历史组且未开启历史应用时不干预', () => {
  assert.equal(groupHeight({ ...base, isCurrent: false }), null)
})

test('历史组且开启历史应用时生效', () => {
  assert.deepEqual(groupHeight({ ...base, isCurrent: false, history: true }),
    { maxHeight: 'min(400px, 50vh)' })
})

test('100% 等于官方原公式', () => {
  assert.deepEqual(groupHeight(base), { maxHeight: 'min(400px, 50vh)' })
})

test('50% 等比缩放', () => {
  assert.deepEqual(groupHeight({ ...base, percent: 50 }), { maxHeight: 'min(200px, 25vh)' })
})

test('200% 可以超过官方', () => {
  assert.deepEqual(groupHeight({ ...base, percent: 200 }), { maxHeight: 'min(800px, 100vh)' })
})

test('percent 为 null 时无上限且必须同时给 overflow-y', () => {
  assert.deepEqual(groupHeight({ ...base, percent: null }),
    { maxHeight: 'none', overflowY: 'visible' })
})

test('percent 为 0 是普通值，不是无上限', () => {
  assert.deepEqual(groupHeight({ ...base, percent: 0 }), { maxHeight: 'min(0px, 0vh)' })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --experimental-transform-types --test tests/group-height.spec.mjs`
Expected: FAIL，报 `groupHeight is not a function`

- [ ] **Step 3: 实现 `groupHeight`**

按 Spec §6.2 的规则顺序实现，**第 0 条是 `!groupAutoExpand → null`**（Spec §6.5），然后才是 §6.2 的五条。返回值 `null` 表示不写内联 style。

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm test`
Expected: 全部 PASS

- [ ] **Step 5: 提交**

```bash
git add src/client/group-height.ts tests/group-height.spec.mjs
git commit -m "feat(height): groupHeight 纯函数与五条判据"
```

---

## Task 3: 接入 AutoGroupSeat

**Files:**
- Modify: `src/client/flow/AutoGroupSeat.tsx:305-312`
- Modify: `src/client/flow/AutoGroupSeat.tsx:6-19`（头部修改点清单）
- Modify: `scripts/upstream-manifest.mjs:82-85`

**Interfaces:**
- Consumes: `groupHeight`（Task 2）、`AutoExpandSettings`（Task 1）

- [ ] **Step 1: 接入内联 style**

在 `const capped = ...` 之后计算：

```tsx
const height = groupHeight({
  groupAutoExpand: settings.groupAutoExpand,
  capped,
  isCurrent: closed === false,
  custom: settings.groupHeightCustom,
  history: settings.groupHeightHistory,
  percent: settings.groupHeightPercent,
})
```

body 的 `<div>` 加 `style={height ?? undefined}`。

注意 `exactOptionalPropertyTypes` 已开启：`GroupHeightStyle` 的 `overflowY` 是可选的，直接传对象即可；`null` 必须转 `undefined`。

- [ ] **Step 2: 更新文件头部的修改点清单**

`AutoGroupSeat.tsx:6-19` 的清单从四处改为五处，新增一条说明内联 max-height 的接入。

同时更新 `scripts/upstream-manifest.mjs:82-85` 里该条目的注释。

- [ ] **Step 3: 运行门禁**

Run: `pnpm verify`
Expected: typecheck + build + 166 个测试 + smoke 全部通过

- [ ] **Step 4: 真机验证动画（Spec §7.4）**

把高度设为 50%，让组内有足够内容，等组关闭，观察折叠动画起点是否从**当前可见高度**开始，而不是先跳到 50% 再折。

若出现跳变，按 Spec §7.4 的退路处理（动画期间不写内联），并在提交信息里记录。

- [ ] **Step 5: 提交**

```bash
git add src/client/flow/AutoGroupSeat.tsx scripts/upstream-manifest.mjs
git commit -m "feat(flow): 操作组 body 接入自定义高度"
```

---

## Task 4: 门控状态推导

**Files:**
- Modify: `src/client/settings-card-state.ts:19-124`
- Test: `tests/settings-card-state.spec.mjs:22-25`

**Interfaces:**
- Produces:
  - `SwitchValues` 新增 `groupHeightCustom: boolean`、`groupHeightHistory: boolean`
  - `SelectRowState['gate']` 新增 `'heightCustom'`
  - `SettingsCardState` 新增 `heightPercent: NumberRowState`、`heightHistory: SelectRowState`、`heightCustom: SwitchRowState`、`groupHeightIdle: boolean`

- [ ] **Step 1: 写失败测试**

在 `tests/settings-card-state.spec.mjs` 的 `values()` 工厂加两个字段（默认 `groupHeightCustom: false, groupHeightHistory: false`），然后追加：

```js
test('高度第一行永不被锁', () => {
  for (const groupAutoExpand of [true, false]) {
    const s = deriveSettingsCardState(values({ groupAutoExpand }))
    assert.equal(s.heightCustom.locked, false)
  }
})

test('高度开关关闭时，数字行与历史行被 heightCustom 锁住', () => {
  const s = deriveSettingsCardState(values({ groupHeightCustom: false }))
  assert.equal(s.heightPercent.locked, true)
  assert.equal(s.heightPercent.gate, 'heightCustom')
  assert.equal(s.heightHistory.locked, true)
  assert.equal(s.heightHistory.gate, 'heightCustom')
})

test('高度开关开启时两行解锁', () => {
  const s = deriveSettingsCardState(values({ groupHeightCustom: true }))
  assert.equal(s.heightPercent.locked, false)
  assert.equal(s.heightHistory.locked, false)
})

test('操作组自动展开关闭时高度设置显示为不生效，但不锁行', () => {
  const s = deriveSettingsCardState(values({ groupAutoExpand: false, groupHeightCustom: true }))
  assert.equal(s.groupHeightIdle, true)
  assert.equal(s.heightPercent.locked, false)
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --experimental-transform-types --test tests/settings-card-state.spec.mjs`
Expected: FAIL，报 `s.heightCustom is undefined`

- [ ] **Step 3: 实现状态推导**

按 Spec §9.3 的表格实现。`gate` 枚举加 `'heightCustom'`。

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm test`
Expected: 全部 PASS（含原有 18 个用例）

- [ ] **Step 5: 提交**

```bash
git add src/client/settings-card-state.ts tests/settings-card-state.spec.mjs
git commit -m "feat(settings): 高度三行的门控状态推导"
```

---

## Task 5: 文案

**Files:**
- Modify: `src/client/locales.ts`

**Interfaces:**
- Produces: 文案键 `heightCustomTitle`、`heightCustomDesc`、`heightPercentTitle`、`heightPercentDesc`、`heightPercentTooSmall`、`heightHistoryTitle`、`heightHistoryDesc`、`gatedByHeightCustom`、`heightIdle`

- [ ] **Step 1: 加文案（中英两套）**

中文用 Spec 定的措辞，英文对应翻译。错误提示固定为：

- `heightPercentTooSmall`（zh）：`高度过小，内容几乎不可见`
- `heightPercentDesc`（zh）：`按官方高度的百分比缩放；留空表示不设上限。`

- [ ] **Step 2: 类型检查**

Run: `pnpm typecheck`
Expected: 通过（`SettingsKey` 会因新增键而扩展）

- [ ] **Step 3: 提交**

```bash
git add src/client/locales.ts
git commit -m "docs(locale): 高度设置的中英文案"
```

---

## Task 6: 设置卡片三行

**Files:**
- Modify: `src/client/settings-card.tsx`
- Modify: `src/client/settings-card.module.css`

- [ ] **Step 1: 加数字行的样式**

在 `settings-card.module.css` 追加 Spec §8.1 的规格：`.numGroup`、`.warnSlot`（16px 固定占位，`visibility: hidden` 默认）、`.numWrap`（36px 高、`0.5px solid var(--dsw-alias-border-l4)`、圆角 `--dsw-radius-md`、背景 `--dsw-alias-bg-layer-1`）、`.numInput`（56px、右对齐）、`.unit`。

**警告槽必须固定占位**：不能用条件渲染，否则图标出现时会把输入框推歪。用 `visibility: hidden` 而非 `display: none`（后者仍会重排）。

> **已知且不修**（Spec §8.1.2）：右对齐后，开关（40px）、下拉（≈128px）、数字组（≈152px）的**左边缘必然参差不齐**。这是所有右侧控件宽度不一的设置页的通病，官方卡片也有。不要试图用固定宽度抹平它。

- [ ] **Step 2: 实现 `NumberRow` 组件**

受控草稿模型（Spec §8.4）：

- 本地 `draft` 状态，键入只改 draft
- `onBlur` / Enter 提交：空 → `null`，否则 `Number(draft)`
- 非聚焦时跟随 `settings.groupHeightPercent` 同步 draft
- `onChange` 里用 `/[^\d]/g` 过滤
- `< 10` 时 `.warnSlot` 加 `show` class

- [ ] **Step 3: 在卡片里渲染三行**

按 Spec §9 的顺序追加第 7~9 行，用 Task 4 的状态与 Task 5 的文案。

- [ ] **Step 4: 构建与冒烟**

Run: `pnpm verify`
Expected: 全绿

- [ ] **Step 5: 真机验证**

打开插件设置页，确认：

- 三行出现且顺序正确
- 输入框右边缘与其它行控件对齐
- 输入 `5` 失焦后出现橙色 ⓘ
- 清空失焦后框内显示 placeholder「不限」
- 关掉第一行开关，后两行变灰
- 改值后重组，高度即时变化

- [ ] **Step 6: 提交**

```bash
git add src/client/settings-card.tsx src/client/settings-card.module.css
git commit -m "feat(settings): 卡片新增高度三行"
```

---

## Task 7: 契约测试与收尾

**Files:**
- Modify: `tests/contract-consistency.spec.mjs:95-106`
- Modify: `README.md`、`CHANGELOG.md`

- [ ] **Step 1: 更新契约测试**

- `fieldPattern()` 加三个新字段名
- `:105-106` 的「应声明 6 个字段」改为 9
- 新增断言：`read()` 里 `groupHeightPercent` 不得用 `??`（防止有人改回去）

- [ ] **Step 2: 运行**

Run: `pnpm test`
Expected: 全绿

- [ ] **Step 3: 更新文档**

README 的设置列表从六行改为九行；CHANGELOG 加一节说明新增三行设置。

- [ ] **Step 4: 全量门禁**

Run: `pnpm verify && pnpm pack:check && pnpm verify:release && pnpm drift`
Expected: 全绿；drift 无漂移

- [ ] **Step 5: 提交**

```bash
git add tests/contract-consistency.spec.mjs README.md CHANGELOG.md
git commit -m "test(contract): 覆盖高度字段并更新文档"
```
