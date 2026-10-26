# 操作组展开高度设置 —— 设计文档

> 日期：2026-10-26
> 状态：**待用户批准**（批准后才写实施计划）
> 目标版本：DSH `0.2.1-rc.3`
> 相关：`spec/SETTINGS-EXTENSION.md`（2026-10-22 的旧设计，本文件取代它）

---

## 1. 一句话

给**自动展开的操作组**加三个设置项：一个开关、一个高度百分比、一个「历史轮次也应用」开关。

---

## 2. 与旧设计的关系（重要）

`spec/SETTINGS-EXTENSION.md` 里有一份 2026-10-22 的设计，当时也是「高度设置」，但**主作用域是历史轮次**，且明确限定百分比 1–100。本设计取代它。

| 维度 | 旧设计（暂缓） | 本设计 |
|---|---|---|
| 主作用域 | 历史轮次 | **自动展开的当前组** |
| 历史是否受控 | 恒受控 | **由第三个开关决定** |
| 百分比上限 | 1–100 | **0 ~ 无上限** |
| 「不设上限」怎么表达 | 无此概念 | **留空**（不是 0，见 §6.1.1） |
| 0 的含义 | 非法 | 普通的**过小值**，橙色提示劝阻 |
| 开关数量 | 2（完整展示当前轮 + 高度） | 3（开关 + 数值 + 历史） |
| 输入校验 | 需要（非法值拒绝） | **不需要**（强过滤，只接受数字） |

旧文件保留不删：它第 1 节关于 `closed` / `deferCompletedTurns` / `grouped` 三个概念的辨析仍然有效，且记录了三次混淆的教训。

---

## 3. 目标与非目标

### 目标

- 让用户能调整自动展开的操作组有多高。
- 默认关闭，开箱行为与现在**逐像素相同**。

### 非目标

- 不控制思考块高度（官方没有上限，见旧设计 §7 的否决理由）。
- 不控制工具行高度。
- 不改折叠动画。

### 反目标（做了就算失败）

- 默认状态下出现任何视觉变化。
- 让「无上限」的组被意外截断。
- 引入嵌套滚动（组内滚动 + 外层滚动）之外的第三层。

---

## 4. 设置项

| # | 名称 | 字段 | 类型 | 默认 |
|---|---|---|---|---|
| 1 | 自定义展开高度 | `groupHeightCustom` | boolean | `false` |
| 2 | 展开高度 | `groupHeightPercent` | **number \| null** | `100` |
| 3 | 历史轮次也应用 | `groupHeightHistory` | boolean | `false` |

字段名会在 `cordis.patch.yml` 出现，**发布后不宜改名**（用户存档会留旧键）。

`null` 表示**留空 = 不设上限**（见 §6.1.1）。

### 4.1 Host schema 约束

沿用现有 `src/index.ts` 的写法（`z.boolean().default(...).volatile()`）。新增三个字段：

```ts
groupHeightCustom: z.boolean().default(false).volatile(),
groupHeightPercent: z.union([z.natural(), z.const(null)]).volatile(),  // 注意：无 .default()
groupHeightHistory: z.boolean().default(false).volatile(),
```

> **为什么这个字段没有 `.default()`（实测结论，非常重要的坑）**
>
> 实测本仓库的 `@deepseek-ai/schemastery`：
>
> | 写法 | `null` | `undefined` | `0` | `-1` | `2.5` |
> |---|---|---|---|---|---|
> | `union([natural, const(null)])` | `null` ✅ | `undefined` | `0` | 拒绝 | 拒绝 |
> | 同上 `.default(100)` | **`100`** ❌ | `100` | `0` | 拒绝 | 拒绝 |
>
> **`.default()` 会把用户的 `null`（= 留空 = 不设上限）静默改写成 `100`**，
> 直接摧毁这个控件的核心语义。
>
> 因此：**schema 里不加 `.default()`，默认值只放在客户端 `DEFAULT_SETTINGS`。**
> Host 侧看到 `undefined` 就表示「用户从未设置过」，客户端按 `undefined → 100` 处理；
> 看到 `null` 就表示「用户明确清空了」，客户端必须保持 `null`。

> **为什么 `z.natural()` 而不是 `z.number()`**：实测——
>
> | schema | `-1` | `2.5` | `0` |
> |---|---|---|---|
> | `z.number()` | 通过 | 通过 | 通过 |
> | `z.number().min(0)` | 拒绝 | **通过** | 通过 |
> | `z.natural()` | 拒绝 | **拒绝** | 通过 |
>
> `z.natural()` 同时挡住负数和**小数**。小数必须挡：`33.33%` 会生成
> `min(133.332px, 16.665vh)` 这类脏值。负数会生成 `min(-400px, -50vh)` ——
> **无效 CSS 声明**，浏览器静默忽略，表现为「配了 150% 却仍是 400px」，且不报错。

**不设上限**：`z.natural()` 没有 `.max()`。

### 4.2 需要同步改的八处（初版只笼统说「三个字段贯通」）

| 文件 | 位置 | 改什么 |
|---|---|---|
| `src/index.ts` | `AutoExpandSettings` 接口（`:93-106`） | 加三个字段，类型 `Volatile<number \| null>` / `boolean` |
| `src/index.ts` | `Config` 接口（`:109-116`） | 同步 |
| `src/index.ts` | schema（`:124-136`） | 加三条 |
| `src/client/settings.ts` | 字段常量（`:27-32`） | 加三个常量 |
| `src/client/settings.ts` | `DEFAULT_SETTINGS`（`:35-42`） | 加三个默认值 |
| `src/client/settings.ts` | `AutoExpandSettings`（`:44-55`） | 加三个只读字段 |
| `src/client/settings.ts` | `read()`（`:85-97`） | 加三个读取 |
| `src/client/settings.ts` | `sync()`（`:99-109`） | **加三个 `===` 比较** |

`sync()` 是**手写逐字段比较**——漏掉一个字段的后果是「Host 写成功、订阅者不重渲染」，不报错、不生效，极难排查。这是本设计最容易漏的一处。

### 4.3 `null` 与 `0` 在客户端回退逻辑里必须区分

Host 侧因为不加 `.default()`（§4.1），会原样传出三种值。客户端 `read()` 必须**三分支**：

| Host 传来的值 | 客户端应得到 | 含义 |
|---|---|---|
| `undefined` | `100` | 用户**从未设置过** → 用合理默认档位 |
| `null` | `null` | 用户**明确清空** → 不设上限 |
| `0` 及其他数字 | 原值 | 用户填的具体值 |

**不能用 `value?.groupHeightPercent ?? 100`**：`??` 会把 `null` 和 `undefined` 一起回退成 100，用户的「清空」就丢了。

正确写法：

```ts
groupHeightPercent: value?.groupHeightPercent === undefined
  ? DEFAULT_SETTINGS.groupHeightPercent   // 从未设置 → 100
  : value.groupHeightPercent,             // null 或数字 → 原样
```

> `??` 的另一个面：`0 ?? 100` 得 `0`，所以 `0` 不会被吃掉。
> 真正的坑只有 `null` 一个，但它恰好是本次新增语义的核心。

**要求**：加一条单测，断言「存 `null` 读回 `null`，不能变成 100」，并仿照
`inspectButtonHideScope` 在 `contract-consistency.spec.mjs` 里的做法加写法级断言，
防止日后有人把这段改回 `??`。

但这是**写法级脆弱点**：若日后有人把 `??` 改成 `||`，`0` 就会被吃成 `100`，功能静默失效。

**要求**：仿照 `inspectButtonHideScope` 在 `contract-consistency.spec.mjs` 里的做法，加一条断言，锁住这一点。

---

## 5. 门控矩阵

> 本节用**设置序号**（开关1/开关2/开关3，对应 §4 表格）。
> 卡片行号是 7/8/9，见 §9。

| 开关1（启用自定义） | 开关3（历史也应用） | 当前组 | 历史组 |
|---|---|---|---|
| 关 | 任意 | 官方 `min(400px, 50vh)` | 官方 |
| 开 | 关 | **自定义** | 官方 |
| 开 | 开 | **自定义** | **自定义** |

**还有一个隐藏维度**：`groupAutoExpand`（卡片第 1 行）。它关闭时整个高度功能不生效，见 §6.5。

开关1 关闭时，开关2（输入框）与开关3（历史开关）所在行变灰，见 §9.3。

---

## 6. 高度计算

### 6.1 基准：等比缩放官方公式

```
留空  → none（不设上限）
   0% → min(0px, 0vh)        ← 合法但无用，橙色提示劝阻
  10% → min(40px, 5vh)       ← 橙色提示的边界
 100% → min(400px, 50vh)     ← 与现状逐像素相同
 200% → min(800px, 100vh)
```

保留 `min()` 双约束，因此矮窗口下不会跑出视口——但 200% 在正常屏幕上 `100vh` 会让组几乎占满视口。这是用户主动选择的结果，不做额外限制。

### 6.1.1 「不设上限」由**留空**表达，不是 0

**这是本次设计的一个关键决定，推翻了更早的草案。**

更早的草案让 `0` 表示无上限。两个问题：

1. **百分比语义断裂**：`f(0) = ∞` 但 `f(1) = 4px`，曲线在 0 处跳到无穷；
2. **反直觉**：0 在百分比语境里天然读作「最小」，用它表示「最大」需要用户反着理解。

改为**留空 = 无上限**之后：

- 百分比曲线在 0 处连续，没有特殊值；
- 「没填 = 不限制」是通用直觉；
- 控件里**不存在任何特例值**，橙色提示只表达一条连续规则。

### 6.1.2 橙色提示：低于 10%

低于 10% 时显示橙色 ⓘ，`title` 为「高度过小，内容几乎不可见」。

选 10% 的理由：`10% = min(40px, 5vh)`，这个高度已经容不下一条完整操作行（含渐隐区）。

`0` **不单独处理**——它就是普通的小值，落在同一条警告里。整个控件因此没有任何特殊值分支。

**橙色只表示「这个值太小」，不阻止输入、不阻止保存。** 用户确实想要 `3%` 是他的自由。

### 6.2 判据（纯函数，可单测）

**输入必须包含 `capped`**——只给 `grouped` 不够，因为「该不该有上限」是官方 `capped` 判据算出来的，不是本插件能重新推导的。

```ts
/**
 * 算出某一组应有的高度。
 * @param input - 组状态与当前设置。
 * @returns `null` 表示"不写内联 style，交给 class"。
 */
function groupHeight(input: {
  capped: boolean           // 官方判据，见 §6.3 —— 该组当前有没有高度上限
  isCurrent: boolean        // 该组是否属于「当前正在运行」（见 §6.4）
  custom: boolean           // 开关1
  history: boolean          // 开关3
  percent: number | null    // 输入值；**null = 留空 = 不设上限**
}): { maxHeight?: string; overflowY?: string } | null
```

返回规则（**按顺序**，先命中先返回）：

| # | 条件 | 返回 | 理由 |
|---|---|---|---|
| 1 | `!capped` | `null` | 官方本就不设上限（`.expandedBody`），不干预 |
| 2 | `!custom` | `null` | 完全走官方 |
| 3 | `!isCurrent && !history` | `null` | 历史组不应用 |
| 4 | `percent === null` | `{ maxHeight: 'none', overflowY: 'visible' }` | **留空 = 无上限** |
| 5 | 其他（含 0） | `{ maxHeight: 'min(Npx, Nvh)' }` | 等比缩放 |

### 6.2.1 为什么「无上限」要同时写 `overflow-y`

实测（真实浏览器，非推断）：

| class | 内联 | `max-height` | `overflow-y` | `scrollbar-gutter` |
|---|---|---|---|---|
| `.body` | `none` | `none` | **`auto`** | **`stable`** |
| `.body.expandedBody` | — | `none` | `visible` | `auto` |

只写 `max-height: none` 而不管 `overflow-y`，元素仍是 `.body`，`overflow-y: auto` 会**继续裁剪**超出可视区的内容，并且 `scrollbar-gutter: stable` 保留右侧滚动条预留宽度。

所以「留空 = 无上限」必须**成对**写 `max-height: none` + `overflow-y: visible`，才与真正平铺（`.expandedBody`）在像素上等价。

### 6.3 `capped` 与 `grouped` 的来源与关系

```ts
// AutoGroupSeat.tsx:305（官方逐字保留，不要改）
const capped = grouped && (!deferCompletedTurns || open)
```

- `grouped`（`:247-248`）：`stepGrouping` 判据，`false` 表示官方 `detailed` 平铺模式。
- `deferCompletedTurns`（`:265`）：`collapseTiming === 'next-input'`。
- `open`（`:195`）：本组的展开状态。

**本插件只消费 `capped`，不自己重算。** 用户打开开关1 时首先命中的就是「`capped === false`」这一种组（官方 detailed 模式下当前组通常平铺），所以第 1 条规则必须存在，否则会给本该无上限的组强加上限。

### 6.4 `isCurrent` 的定义（结论：用 `closed === false`）

审查指出文档初版把「`closed` 取反」当成 `isCurrent` 是错的。真实情况是两种可能：

| 定义 | 表达式 | 含义 |
|---|---|---|
| A | `closed === false` | 组还没关闭（数据未到时为 `false`） |
| B | `autoOpen`（即 `groupAutoExpand && !(closed === true)`） | 组是「当前自动展开」的 |

差别的实际后果：当 **`groupAutoExpand` 关闭**时，用户**手动展开**一个未关闭的组——
- 定义 A：仍算 `isCurrent` → 套用自定义高度
- 定义 B：不算 `isCurrent` → 走官方

`closed` 来自 `useChatGroup(groupKey, g => g?.data.closed)`（`:185`），类型是 `boolean | undefined`，**必须严格比较**，`!closed` 会把 `undefined` 也算成当前。

> **待定**：本设计的 §5 矩阵只覆盖了「开关1 × 开关3」，没有 `groupAutoExpand` 这一维。见 §6.5。

### 6.5 矩阵补上 `groupAutoExpand` 维度

`groupAutoExpand`（卡片第 1 行）关闭时，「自动展开」不存在，高度设置没有可作用的对象。

| `groupAutoExpand` | `custom` | 该组高度 |
|---|---|---|
| 关 | 任意 | **官方**（不写内联） |
| 开 | 关 | 官方 |
| 开 | 开 | 按 §5 矩阵 |

因此判据需要第 0 条规则：`if (!groupAutoExpand) return null`。

这也回答了 `isCurrent` 的选择：既然 `groupAutoExpand` 关闭时整条规则已经短路，定义 A 与 B 在这一维上**行为一致**。两者仅在「`groupAutoExpand` 开启 + 用户手动展开历史组」时有别——那种组 `closed === true`，两个定义都不算 `isCurrent`，也一致。

**结论：定义 A（`closed === false`）更简单且够用**，因为 `groupAutoExpand` 已在上一层短路。

---

## 7. 技术方案：内联 style（方案 B）

### 7.1 为什么不用 CSS 变量 / data 属性

现有 `capped` 判据已经把「这一组该不该有上限」算清楚了：

```ts
const capped = grouped && (!deferCompletedTurns || open)
```

要做的只是把「上限是多少」接上去，不需要第三条判断路径。CSS 变量方案还要为 `0 → none` 单独切 class，反而多一个分支。

### 7.2 内联 style 与 class 的关系（实测，修正了初版的错误论证）

**实测事实**（真实浏览器 + React 18.3.1）：

| 场景 | `max-height` 计算结果 |
|---|---|
| 只有 `.expandedBody` | `none` |
| `.expandedBody` + 内联 `300px` | **`300px`** |
| `style={{ maxHeight: undefined }}` 渲染 | React **完全移除** `style` 属性 |

而 `.body` 与 `.expandedBody` 都是**单个 class**（`AutoGroupSeat.module.css`，实测产物位置 `1593` / `2541`），`.expandedBody` 靠**写在文件后面**覆盖 `.body`。

> **初版文档此处有两个错误，已纠正：**
>
> 1. 说「内联 style 特异性更高」是**术语误用**。内联 style 不在 class 层叠规则里竞争，
>    它只是优先级更高的声明来源。用「特异性」描述它是错的。
> 2. 说「内联一旦写入就必须写完整最终值，否则残留旧值会截断」——**前提不成立**。
>    那是**命令式** DOM 操作（`el.style.maxHeight = ...`）才会有的问题。
>    本项目用 React 的 `style` prop，值变 `undefined` 时 React 会把属性整个移除
>    （实测输出 `<div>b</div>`，无 `style` 属性）。
>
> 因此「必须写 none」的理由**不是**「怕残留」，而是 §6.2.1 那条：`0` 需要
> `max-height: none` **加上** `overflow-y: visible` 才是真正的无上限。

### 7.3 接入点

`src/client/flow/AutoGroupSeat.tsx`：

```tsx
// 现有判据，不动（它同时决定 class 与 fade）
const capped = grouped && (!deferCompletedTurns || open)

const height = settings.groupHeightCustom && capped
  ? groupHeight({ capped, isCurrent: closed === false, custom: true,
                  history: settings.groupHeightHistory,
                  percent: settings.groupHeightPercent })
  : null

const classes = [css.body, !capped ? css.expandedBody : '', ...]

<div className={...} style={height ?? undefined}>
```

注意 `style={height ?? undefined}`，**不能**写 `style={height === null ? undefined : height}`
之外的简化形式：`tsconfig.json` 开了 `exactOptionalPropertyTypes`（`:15`），
把 `undefined` 赋给可选属性会报错，必须显式处理。

本项目此前**没有任何 `style={}` 先例**（全仓 grep 为空），引入它是本次的新做法。

### 7.4 动画风险（审查补充了机制，不只是「要验证」）

实读 `ui-chat` bundle 的 `flow-motion`：

- collapse 以 `element.offsetHeight` 作为起点；
- `clearMotion` 只清 `height` / `marginTop` / `opacity` / `overflow` / `transition` / `translate`，
  **不动 `max-height`**。

⇒ `capped` 翻转那一帧，`offsetHeight` **已经被自定义 `max-height` 截断**，折叠动画会从错误高度起步。这与旧设计 §8.1 记录的事故同型。

**验收判据**（不能只写「真机看看」）：

1. 把高度设为 50%，让组内有足够内容；
2. 等组关闭（`capped` 从不设上限翻到有上限）；
3. 观察折叠动画起点是否从**当前可见高度**开始，而不是先跳到 50% 再折。

**退路**：若出现跳变，改为「动画期间不写内联 max-height」——即检测 `bodyRef` 上的 motion 属性，动画中返回 `null`。这需要额外读取 motion 状态，作为兜底方案记录于此。

---

## 8. 输入控件

### 8.1 形态：**警告在框外左侧**（与 DPG 不同）

DPG 的 `LinkRow` 把状态标记叠在**输入框内部右端**（`position: absolute; right: 8px`）。
本设计**不采用**那个做法，原因：

- DPG 那个标记有 4 种状态（spinner / ✓ / ⓘ / 无），框内右侧是唯一的空位；
- 我们只有 1 种状态（值太小），且**不是错误**，塞进框里会让它读起来像输入出错了。

**最终形态（已用 HTML 模拟稿验证）：**

```
[行标题、描述]              ⓘ  [  150  % ]
                             ↑   ↑
                       框外左侧  输入框
```

| 元素 | 规格 |
|---|---|
| 控件组 | `display: flex; align-items: center; gap: 8px` |
| 警告槽 | 固定 16×16，`visibility: hidden` 占位 |
| 输入框 | 高 36px（与 `.selector` 一致）、`border: 0.5px solid var(--dsw-alias-border-l4)`、圆角 `--dsw-radius-md`、背景 `--dsw-alias-bg-layer-1` |
| 数字 | `text-align: right`，宽 56px |
| 单位 `%` | 13px/500、`--dsw-alias-label-tertiary` |

#### 8.1.1 警告槽必须**固定占位**

不能用条件渲染（`{warning && <Icon/>}`），否则图标出现/消失时会把输入框推歪，行内元素左右跳动。

用 `visibility: hidden` 而不是 `display: none`：前者保留占位，后者仍会让布局重排。

**实测验证**：模拟稿中 10 行控件的右边缘**全部对齐在 728px**（含警告态与留空态），
说明固定占位策略有效。

### 8.1.2 各行的宽度差异（已知，不修）

右对齐后，开关（40px）、下拉（≈128px）、数字组（≈152px）的**左边缘必然参差不齐**。
这是所有「右侧控件宽度不一」的设计页的通病，官方卡片也有。接受。

### 8.2 强过滤

非数字字符**敲不进去**。`onChange` 里过滤，只保留 ASCII `[0-9]`，再写回。

因此「负数、字母、符号」在物理上不可输入，**UI 层不存在需要拦截的非法值**。

> **两个已知限制**（审查指出，记录而非解决）：
>
> 1. **全角数字**：中文输入法打出的 `１２３` 不符合 `\d`，会被静默吞掉。
>    若实施时遇到反馈，改用 `value.replace(/[^\d０-９]/g, '')` 后做全角转半角。
> 2. **UI 过滤不是数据保障**。配置可能被手工编辑或来自旧存档，
>    因此 Host schema 仍然要约束（见 §4.1）。UI 过滤只是第一道。

### 8.3 标记规则（只有一条）

| 输入 | 显示 |
|---|---|
| 空 | 输入框显示 placeholder「不限」，**不显示警告** |
| `< 10` | 橙色 ⓘ（框外左侧），`title` 为「高度过小，内容几乎不可见」 |
| `>= 10` | **什么都不显示** |

**没有绿色对勾，没有错误色，没有 spinner。** 橙色只表达「这个值太小」这一件事。

`0` 不特殊——它和 `1`、`5` 一样走同一条警告。整个控件**没有任何特殊值分支**。

**placeholder「不限」**：解决「清空后框里一片空，用户不知道这意味着什么」。
灰色、`--dsw-alias-label-dimmed` 色，提交时不参与取值。

### 8.4 提交模型（初版此处自相矛盾，已重写）

初版一边写「失焦提交」、一边写「与开关的立即生效一致」——这两句冲突：开关是**点击即写**，没有草稿概念（`settings-card.tsx:199` → `settings-write.ts:44-63`）。

**本控件必须是受控草稿，规则如下：**

| 事件 | 行为 |
|---|---|
| 键入 | 只更新**本地草稿状态**，不写 Host |
| 失焦 / 回车 | 提交草稿 |
| 提交时值未变 | 不写（`settings-write.ts:51` 的相等短路已覆盖） |
| 提交时草稿为空 | **写 `null`**，表示不设上限（见 §6.1.1） |
| 提交后 Host 拒绝 | `writeOptimistic` 回滚，输入框**回到旧值** |

**为什么不能在 `onChange` 里写 Host**：输入 `200` 的过程是 `2` → `20` → `200`，会连续写三次，中间那个 `2%` 会让操作组瞬间压到 `min(8px, 1vh)`——用户会看到组在打字时闪缩三次。

**空值写 `null` 而不是 100**：既然空 = 不设上限是这个控件的核心语义，清空就应该表达那个语义，而不是偷偷填回 100。用户清空后看到组展开，与「空 = 不限制」的直觉一致。

**为什么不写旧值**：用户清空后看到文字又跳回来，像是输入没生效。

**回滚时的草稿同步**：`settings.ts:99-109` 的 `sync()` 在外部变化时会更新快照。输入框必须在**非聚焦时**跟随快照（聚焦时保留草稿，否则用户打字打到一半会被外部值覆盖）。这是本控件唯一需要 `useEffect` 同步的地方。

---

## 9. 设置卡片布局

> **编号约定（初版这里两套编号打架，已统一）**
>
> 本文件此前同时用了「设置序号 1/2/3」（§4、§5）和「卡片行号 第7/8/9行」（§9）。
> 从本节起**统一用卡片行号**；§4/§5 的设置序号改称「开关1/开关2/开关3」。

在现有 6 行之后追加，共 9 行：

| 行号 | 控件 | 内容 | 新增 |
|---|---|---|---|
| 1 | Switch | 自动展开操作组 | |
| 2 | Switch | 自动展开思考过程 | |
| 3 | 下拉 | 思考收起时机 | |
| 4 | Switch | 自动展开工具结果 | |
| 5 | 下拉 | 工具收起时机 | |
| 6 | 下拉 | 隐藏查看按钮 | |
| **7** | Switch | 自定义展开高度 | ← |
| **8** | 数字 | 展开高度 | ← |
| **9** | Switch | 历史轮次也应用 | ← |

### 9.1 门控状态推导

现有 `settings-card-state.ts` 的 `gate` 枚举只有三个值（`:45-46`）：

```ts
readonly gate: 'none' | 'workGroup' | 'own'
```

第 8、9 行被第 7 行锁，这是一个**新的控制者**，`own` 表达不了（`own` 在现有语义里指「本层自己的开关」）。需要新增一个值：

```ts
readonly gate: 'none' | 'workGroup' | 'own' | 'heightCustom'
```

同时需要新的行状态类型——**卡片目前没有数字行**（只有 `SwitchRow` / `SelectRow`）：

```ts
/** 一行数字输入的渲染状态。 */
export interface NumberRowState {
  readonly locked: boolean
  readonly gate: 'none' | 'workGroup' | 'heightCustom'
}
```

`SwitchValues` 扩展两个布尔：`groupHeightCustom`、`groupHeightHistory`。

### 9.2 第 7 行是否随第 1 行变灰？——**不变**

现有规则 1 写明「操作组开关永不被锁」（`settings-card-state.ts:74` / `:100`），而规则 2 让第 2~6 行随 `groupAutoExpand` 变灰。

第 7 行与第 1 行同类：**它自己能独立决策，永不被锁。**

理由：高度设置保存的是用户偏好，即使当前 `groupAutoExpand` 关闭，用户的「我想要 150%」这个意图仍然有效，关掉开关 1 再打开时应该原样回来。强行灰化会让用户以为设置丢了。

**但**：`groupAutoExpand` 关闭时高度**确实不生效**（§6.5 第 0 条规则）。这个「可编辑但不生效」的状态与 P9 第六行（隐藏查看按钮）采用同一套做法——**不锁行，只在描述里说明**。

因此第 7 行需要类似 `inspectScopeIdle` 的说明字段：

```ts
/** groupAutoExpand 关闭时，高度设置不生效；用于描述文案。 */
readonly groupHeightIdle: boolean
```

### 9.3 三行的最终状态表

| 行 | `locked` | `gate` | 描述文案 |
|---|---|---|---|
| 7（开关） | `false` | — | 常文本；`groupHeightIdle` 时改说「操作组自动展开已关闭，此设置暂不生效」 |
| 8（数字） | `!groupHeightCustom` | `heightCustom` | 锁定时点名第 7 行 |
| 9（历史开关） | `!groupHeightCustom` | `heightCustom` | 同第 8 行 |

### 9.4 测试要同步改的地方

`tests/settings-card-state.spec.mjs:22-25` 有一个 `values()` 工厂函数，构造 `SwitchValues`。新增两个布尔字段后它必须同步，否则现有 18 个用例会因缺字段而失败或静默通过。

---

## 10. 待实施时验证的点

| # | 要验证什么 | 为什么 | 判据 / 退路 |
|---|---|---|---|
| V1 | 内联 style 与 `.expandedBody` 的胜负 | 已用浏览器探针确认（§7.2），实施后复核真实组件 | 见 §7.2 表格 |
| V2 | `capped` 翻转时动画是否误判 | 见 §7.4 机制说明 | 见 §7.4 三条判据 + 退路 |
| V3 | 强过滤在中文输入法下的行为 | 全角数字会被吞（§8.2） | 打 `１２３` 看是否全丢；若是，按 §8.2 方案改 |
| V4 | 200% 在 1366×768 上的表现 | 确认不会完全遮挡对话 | 组占屏 ≤ 视口；超出属用户选择，记录不修 |

---

## 11. 留给实施者的决定

- 数字输入的 CSS 细节（高 32px 还是 34px）
- 文案最终措辞
- 单测的组织方式
- 描述文案里不要出现「第 7 行」「开关1」这类内部编号

---

## 12. 实施顺序

| 步 | 内容 | 连带要做 |
|---|---|---|
| 1 | 三个字段贯通：Host schema（`z.natural()`）+ 客户端五处（§4.2 表格）| 单测：默认值、`0` 不被回退 |
| 2 | `groupHeight` 纯函数 + 单测 | 覆盖 0/100/200 + 门控矩阵 + `capped === false` |
| 3 | 接入 `AutoGroupSeat`，先不加 UI，改配置验证 | **V2 真机动画验证**（§7.4） |
| 4 | 设置卡片第 7~9 行（强过滤、橙色提示、草稿提交） | 门控状态 + 描述文案 |
| 5 | 回归 | 见下方清单 |

### 12.1 容易漏的三件事（审查指出）

1. **`contract-consistency.spec.mjs` 会红**
   - `:95-99` 的 `fieldPattern()` 正则只认 6 种字段名，新字段要加进去；
   - `:105-106` 硬编码断言「应声明 6 个字段」，要改成 9；
   - 该文件注释自己写过「不加入正则就不受契约保护」。

2. **`package.json` 的 test 脚本是 13 文件白名单**（`:63`）
   - 新 spec 不加进去，`pnpm test` / `pnpm verify` 会**静默跳过**，仍然全绿。

3. **`AutoGroupSeat.tsx` 在 `scripts/upstream-manifest.mjs:82-85` 标为 `verbatim`**
   - 改动后要同步更新该文件头部的「修改点」清单（`AutoGroupSeat.tsx:6-19`），
     从四处变五处。否则下一个读代码的人会以为它仍是上游原样。

### 12.2 不该列入回归的

`pnpm drift` 只比上游 checkout 的哈希（`scripts/check-drift.mjs:88`），**与本地编辑无关**。
把它当本次回归项会误导——它验证的是「上游没变」，不是「我改对了」。

仍建议跑一次，但目的是确认**动手期间上游没有漂移**，而非验证本次改动。
