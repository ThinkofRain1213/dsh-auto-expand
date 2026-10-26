# 插件详情页设置控件规范

> 状态：**当前实现基准**（2026-10-27）
> 基线：`dsh-project-groups`（下称 DPG）的设置页规范 + 官方 `ui-primitives` 的实测值
> 目标 DSH：`0.2.1-rc.3`（`ui-primitives` 未变，rc.2 同样适用）
> 与 [`SETTINGS-SPEC.md`](SETTINGS-SPEC.md) 的关系：那份记录了 P5 时期的槽位与渲染位置，
> **视觉数值以本文为准**（行内边距等已在那里之后调整过）。

本文覆盖插件详情页（`plugins.bundle.config` 槽位）里所有可用的控件与文本层级。
**每个数值都标注了出处**：`官方` = `deepseek-harness` 源码实测，`DPG` = 从 DPG 继承，
`本文` = 本项目在 DPG 基础上调整。不标出处的一律不要加。

---

## 0. 布局骨架

```
.stack                ← 卡片根，flex column，gap 0
  ├─ .rule            ← 分组之间的边界线（可选）
  ├─ .section         ← 一个分组，padding 0
  │    ├─ h3.heading  ← 一级文本（分组标题）
  │    ├─ .row        ← 横向行（开关 / 下拉）
  │    └─ .fieldSlot  ← 纵向字段（输入框），内部是官方 SettingsValueField
  ├─ .rule
  └─ .section …
```

**`.stack` 必须存在**，而且 `gap` 必须是 `0`。

原因（DPG 踩过）：官方 `detailSection` 容器给**直接子元素** `gap: 12px`。
若卡片返回 Fragment（不生成元素），每个块都会变成它的直接子元素，被塞进那个 12px；
官方插件卡片（终端 / 网页搜索）都包了一层内层 column，容器只看到一个子元素。
**间距必须全部由行自己的 `padding` 提供，不能依赖容器的 gap。**

---

## 1. 文本层级

只有三级，**一级与二级字号相同、只差字重**——这是官方区分层级的唯一手段。

| 层级 | 用途 | font-size | font-weight | line-height | color token | 出处 |
|---|---|---|---|---|---|---|
| **一级** | 分组标题 `<h3>` | **13px** | **600** | `1.5` | `label-primary` | 官方 `SubagentCard.heading` |
| **二级** | 行标题 / 字段 label | **13px** | **500** | `19.5px` | `label-primary` | DPG `.title` |
| **三级** | 行描述 / 字段 hint | **12px** | **400** | `18px` | `label-tertiary` | DPG `.desc` |
| 弱化 | 被上层锁定的文本 | 继承 | 继承 | 继承 | **`label-dimmed`** | DPG `.gated` |

### 1.1 一级文本的 margin 必须是 0

```css
.heading { margin: 0; font-size: 13px; font-weight: 600; line-height: 1.5; }
```

标题与下方第一行之间的留白**全部由那一行的 `padding-top` 提供**，标题自己不加边距。

> 本项目曾写 `margin: 0 0 4px`，让「标题→第一行」比官方多 4px。那 4px 没有任何依据。

### 1.2 弱化文本用颜色 token，不用 `opacity`

`opacity` 会让元素成为独立合成层，页面上任何一个 `Switch` 播放动画都会触发一帧重合成，
**肉眼可见亮度抖动**（DPG 的 SETTINGS-SPEC §7.3 记录过）。纯文本一律用 `label-dimmed`。

### 1.3 官方字段的 hint 是纯字符串

`SettingsValueField` 的 `hint` 由组件内部渲染成**独立的 `<p>`**，没有任何插槽能往它旁边加元素。
需要「描述 + 右侧提示」并列时，只能 `hint={undefined}` 自己渲染一行（见 §4.6）。

---

## 2. 间距

| 位置 | 值 | 出处 |
|---|---|---|
| `.stack` gap | `0` | 官方插件卡片同款 |
| `.row` 纵向内边距 | **`12px 0`** | 本文（对齐官方字段） |
| `.row` 横向 gap | `8px` | DPG |
| `.rowText` 内部 gap（标题↔描述） | `6px` | 官方插件卡片实测 |
| `.rowText` 右内边距 | `48px`（给右侧控件让位） | DPG |
| `.section` 纵向内边距 | **`0`** | 本文（见 §2.2） |
| 官方 `.field` 纵向内边距 | `12px 0`（组件内建，**改不了**） | 官方 |

### 2.1 行距 = 24px

相邻两行内容之间的距离 = 上一行 `padding-bottom` 12 + 下一行 `padding-top` 12 = **24px**。

> **为什么是 12 而不是 DPG 的 16**：本卡片混用两种行——横向 `.row` 与官方
> `SettingsValueField`（内建 `padding: 12px 0`，改不了）。若 `.row` 用 16px，
> 两种行的间距会变成 32px 与 24px 混排，肉眼一眼看出「高度都不一样」。
> 取 12px 让全卡统一在 24px。**代价**：比 DPG 的 32px 紧 25%。

### 2.2 分组的纵向留白交给行和线，`.section` 不给

官方 `SubagentCard` 的 `.section` 是 `padding: 16px 0`，那是因为它里面全是官方字段，
两者叠加出间距。本卡片里行自带 padding，若 `.section` 再加 16px，
**分隔线两侧的构成就不同**：上侧「行 12 + 分节 16」= 28，下侧「分节 16 + 标题 0」= 16，差一倍。

### 2.3 分隔线

```css
.rule { flex: none; margin: 4px 0 16px; border-top: 0.5px solid var(--dsw-alias-border-l2); }
```

| 位置 | 构成 | 值 |
|---|---|---|
| 上一条内容 → 线 | 行 padding-bottom 12 + 线 margin-top 4 | **16px** |
| 线 → 下组标题 | 线 margin-bottom 16 + 标题 margin 0 | **16px** |

**必须用独立元素，不能用 `border-top`。** `border` 属于某一个块，会让那个块的 padding
变得不对称、线贴到一侧内容上（DPG 原注释：`a border belongs to one block, which makes
that block's own padding lopsided`）。

**不能用 DPG 的 `margin: 0`。** DPG 能这么写是因为它上下两个 `.group` 都有 `padding: 16px 0`
且内部没有自带 padding 的行，两侧构成相同。本卡片不满足那个前提。

---

## 3. 控件清单

### 3.1 开关 Switch

| 项 | 值 |
|---|---|
| 交互 | 点击即写（**无暂存**） |
| 轨道 | `36 × 20px`，`border-radius: 999px` |
| 滑块 | `16 × 16px`，`border-radius: 50%` |
| 动画 | `transform 120ms ease` |
| 禁用 | 组件自带 `opacity: .5` |
| 聚焦 | `outline: focus-ring-width solid focus-ring-color` |

**直接使用官方组件，不要自己画**：

```tsx
import { Switch } from '@deepseek-ai/dsh-client-ui-primitives'
<Switch checked={value} onChange={next => …} label="无障碍名称" disabled={locked} />
```

`label` 是无障碍名称，屏幕阅读器读它——**必须传**，通常与行标题相同。

### 3.2 下拉框

官方没有「设置行内的下拉」这种组件，本卡片自建：一个 `button` 作锚点 + 官方 `Menu` 弹层。

| 项 | 值 |
|---|---|
| 高度 | `36px` |
| 内边距 | `0 14px` |
| 圆角 | `var(--dsw-radius-md)`（= 12px） |
| 背景 | `var(--dsw-alias-bg-module-platform)` |
| 字号 | `13px / 500 / 19.5px` |
| hover | `background: var(--dsw-alias-interactive-bg-hover)` |
| 禁用 | **`opacity: .5`**（整个控件压暗，不是只改文字色） |
| 图标 | `IconChevronDownOutlineRegular`，`gap: 12px` |

**`Menu` 必须开 `portal`**：卡片在插件页的滚动 detail 列里，就地展开的列表会被 `overflow` 裁剪。

```tsx
<Menu open={open} onClose={…} items={options} selectedId={value}
  onSelect={…} align="end" portal
  anchor={<button type="button" className={css.selector} aria-haspopup="menu"
    aria-expanded={open} disabled={locked}>…<IconChevronDownOutlineRegular /></button>} />
```

### 3.3 输入框（纵向字段）

**直接使用官方 `SettingsValueField`，不要自己写。**

| 项 | 值 | 出处 |
|---|---|---|
| 高度 | `34px` | 官方 `fields.module.css` |
| 内边距 | `0 12px` | 同上 |
| 边框 | `0.5px solid border-l4` | 同上 |
| 圆角 | `radius-md` | 同上 |
| 背景 | **`bg-layer-3`** | 同上 |
| 字号 / 行高 | `13px` / `1.5` | 同上 |
| 聚焦 | `border-color: state-business-primary`，`outline: none` | 同上 |
| 禁用 | `color: label-tertiary`（**只改文字色**） | 同上 |

**结构（官方组件内部）**：

```
.field（flex column, gap 6px, padding 12px 0）
  ├─ .head（flex, align-items center, gap 8px）
  │    ├─ label（flex:1, 13/500/1.5）        ← 占满左侧
  │    └─ .badges（右侧：「已覆盖」「恢复默认」）
  ├─ input（满宽）
  └─ p.hint / p.invalid（12px / 1.5）
```

**`.label` 是 `flex: 1`** —— 所以标题天然靠左、右侧能放状态徽章。

```tsx
import { SettingsValueField } from '@deepseek-ai/dsh-client-ui-primitives'
<SettingsValueField
  id={fieldId} label="展开高度（%）" hint="…" text={draft}
  invalid={invalid} invalidLabel="请填数字"
  overridden={percent !== 100} overriddenLabel="已覆盖" resetLabel="恢复默认"
  onReset={…} numeric disabled={locked}
  onEdit={text => setDraft(text)} />
```

**单位写进标题**（`展开高度（%）` / `命令超时（毫秒）`），**不要做框内后缀**——官方没有这个先例。

### 3.4 展示框

只读展示区域。两种状态：

**有内容**（DPG `.injectionText`，用于展示代码 / 纯文本）：

| 项 | 值 |
|---|---|
| 内边距 | `12px` |
| 边框 | `0.5px solid var(--dsw-alias-border-l2)` |
| 圆角 | `var(--dsw-radius-lg)`（= 16px） |
| 背景 | `var(--dsw-alias-bg-base)` |
| 字体 | `var(--dsw-font-family-mono, ui-monospace, …)`，`12px / 18px` |
| 换行 | `white-space: pre-wrap; overflow-wrap: anywhere` |

**空状态**（DPG `.injectionOff`）：

| 项 | 值 |
|---|---|
| 内边距 | `12px` |
| 边框 | `0.5px **dashed** var(--dsw-alias-border-l2)` |
| 圆角 | `var(--dsw-radius-lg)` |
| 文字 | `12px / 18px`，`label-tertiary` |

虚线是刻意的——它表达「这里还没有内容」，与实线的内容框区分。

### 3.5 展开折叠

用官方 `DisclosureRow`。

| 项 | 值 |
|---|---|
| 行高 | `24px + var(--dsh-content-font-delta, 0px)` |
| leading 图标盒 | `16 × 16px`（内嵌 14px svg），右外边距 `6px` |
| 标题字号 | `var(--dsh-content-font-size-secondary, 13px)` |
| 默认色 | `label-tertiary` |
| hover 色 | `label-secondary`（`transition: color 100ms ease`） |
| 图标切换 | 默认显示自身图标；hover 时淡出、`chevronHover` 淡入 |
| 可展开标记 | `[data-expandable]` 决定 `cursor: pointer` |

折叠行是**次级信息**（工具调用、思考过程这类），所以默认用 `tertiary` 而不是 `primary`。
减少动画偏好下所有 `transition` 关闭。

---

## 4. 状态与门控

### 4.1 三种视觉状态

| 状态 | 文本 | 控件 | 用在哪 |
|---|---|---|---|
| 正常 | `label-primary` | 正常 | — |
| **被上层锁** | `label-dimmed` | `opacity: .5` | 该设置此刻不生效 |
| 禁用 | `label-dimmed` | `opacity: .6` + `cursor: default` | 数据只读 |

**分界线**：纯文本用颜色 token（避免合成层抖动），控件本身用 `opacity`（官方对带背景控件就是这么做的）。

### 4.2 门控该不该做

**只有当控件真的不会生效时才灰/隐藏。** 反例：本插件的「不限制高度」开关**永不置灰**——
即使总开关关闭，用户「我想要无上限」的意图仍有效，关掉再打开应原样恢复。
这种情况用文案说明「暂不生效」，不锁行。

### 4.3 隐藏 vs 变灰

- **变灰**：控件仍可见、值保留、点击被拒。行数稳定，不引起页面跳动。
- **隐藏**：该档下这个概念**不存在**。更干净，但行数变化会让页面高度跳。

同一张卡片里不要混用两种策略描述同一类关系。

### 4.4 官方字段被锁时要自己补整行变灰

官方 `SettingsValueField` 只把 `disabled` 传给 `<input>`，而 `.input:disabled` **只改输入框的文字色**——
`<label>` 与 `<p class="hint">` 保持原色。若卡片其它行是整行变灰的，必须自己补：

```css
.fieldGated label, .fieldGated p { color: var(--dsw-alias-label-dimmed); }
.fieldGated input { opacity: 0.5; cursor: default; }
```

### 4.5 错误与警告用不同颜色

| 语义 | token | 表现 |
|---|---|---|
| **错误**（非法值） | `state-error-primary`（红） | 官方 `invalid` 通道：红字替换 hint + 边框变红 |
| **警告**（合法但危险） | `state-warn-primary`（橙） | 自定义，不能占用 `invalid` 通道 |

两者互斥：有错误时警告没有意义。

### 4.6 要在 hint 旁边放元素时必须自己渲染描述行

官方 `hint` 是纯字符串，没有插槽。做法：

```tsx
<SettingsValueField hint={undefined} … />   {/* 不传 hint */}
<div className={css.hintRow}>
  <span className={css.hintText}>{description}</span>
  {warn && <span className={css.warnBadge}>ⓘ {warning}</span>}
</div>
```

```css
.hintRow { display: flex; align-items: center; justify-content: space-between;
  gap: 12px; margin: -6px 0 12px; }
```

**那对负边距是有代价的**：官方 `.field` 是 `padding: 12px 0` + `gap: 6px`，hint 在组件**内部**，
所以「输入框 → hint」= 6px。移到外面后先经过 `padding-bottom: 12px`，
`margin-top: -6px` 抵回 6px、`margin-bottom: 12px` 补回下侧原有的 12px。

⚠️ **这两个值依赖官方 `.field` 的 `padding: 12px 0`**。上游一改，这里静默错位。
`pnpm drift` 会报出 `fields.module.css` 变更。

---

## 5. 官方组件速查

```tsx
import {
  DisclosureRow,                    // 展开折叠行
  Menu,                             // 下拉弹层（需 portal）
  SettingsValueField,               // 设置字段（输入框）
  SettingsSecretField,              // 密钥字段
  Switch,                           // 开关
  Tag, Pill,                        // 徽章
  Button, SegmentedControl,         // 按钮 / 分段选择
  IconChevronDownOutlineRegular,
  IconInfoOutlineRegular,
} from '@deepseek-ai/dsh-client-ui-primitives'
```

**不要自己实现开关、输入框、展开折叠**——官方组件已经带了无障碍、聚焦环、禁用态、动画，
自己写必然漏掉其中几项。

---

## 6. 踩过的坑

### 6.1 绝对不要在渲染函数内部定义组件

```tsx
// ✗ 每次渲染都创建新的组件类型 → React 卸载重建整棵子树
function Card() {
  const Section = ({ children }) => <section>{children}</section>
  return <Section>…</Section>
}
```

症状：**开关动画消失**、**点击开关页面跳到顶部**、组件内部状态丢失、输入框失去焦点。
组件类型必须定义在**模块级**。

### 6.2 不要给官方字段外层再加纵向 padding

官方 `.field` 自己就是 `padding: 12px 0`。外层容器若也加 12px，这一行的上下留白会变 24px，
而其它行是 12px——一格明显更松。外层容器**只保留 `min-width: 0`**。

### 6.3 `blur` 不冒泡

官方字段不暴露 `onBlur`。要捕获失焦必须用 `onBlurCapture`（capture 阶段），
普通 `onBlur` 在父元素上收不到。

### 6.4 颜色 token 与 `opacity` 不要混用错对象

| 对象 | 用什么 | 为什么 |
|---|---|---|
| 纯文本 | 颜色 token | `opacity` 创建独立合成层 → 开关动画时亮度抖动 |
| 控件（带背景） | `opacity` | 只改文字色会留下「灰字 + 亮底」，与旁边的 Switch 不一致 |

### 6.5 输入框过滤会静默篡改用户输入

官方契约（`fields.tsx`）：

> `numeric` only hints the keypad: which drafts a field accepts is decided by its spec,
> so **the control never silently rewrites what the user typed**.

**不要在 `onChange` 里删字符**。本项目曾把 `2.5` 过滤成 `25`（小数点被删、数字放大十倍），
用户毫无提示。正确做法：原样接收，提交时校验，非法则给红字、不写入。

### 6.6 圆角 token 的实际值

| token | 值 | 常用处 |
|---|---|---|
| `radius-xs` | 4px | — |
| `radius-sm` | 8px | 小按钮 |
| `radius-md` | **12px** | 输入框、下拉、下拉项 |
| `radius-lg` | **16px** | 展示框 |
| `radius-xl` | 20px | 大卡片 |

---

## 7. 数值速查表

| 项 | 值 |
|---|---|
| 行距（内容→内容） | **24px** |
| 内容 → 分隔线 | **16px** |
| 分隔线 → 分组标题 | **16px** |
| 分组标题 → 第一行 | **12px** |
| 标题 ↔ 描述（行内） | **6px** |
| 输入框 ↔ 其 hint | **6px** |
| 开关轨道 | 36 × 20px |
| 下拉 / 输入框高度 | 36px / **34px** |
| 一级 / 二级 / 三级字号 | 13 / 13 / 12 |
| 一级 / 二级 / 三级字重 | 600 / 500 / 400 |
