# 修复报告：已完成 group 手动展开被强制滚到底部

> 日期：2026-10-22
> 影响版本：P2 起的全部版本
> 修复版本：本提交

---

## 1. 现象

**与官方漂移**：已完成的 group（`closed === true`）中，手动点击展开思考块时，插件会自动滚动到最下面；官方则停在原位（顶部）。

| 操作 | 官方行为 | 修复前 |
|---|---|---|
| 已完成 group，点开思考 | 保持当前位置（顶部） | **自动滚到底部** |

---

## 2. 根因

### 2.1 直接原因

`AutoGroupSeat` 中我加的滚动初始化 effect 判据错误：

```ts
// 修复前
const previousOpen = useRef(open)
useEffect(() => {
  if (!previousOpen.current && open && grouped) initialize('bottom')
  previousOpen.current = open
}, [open, grouped, initialize])
```

它只看 `open` 的翻转，**无法区分自动展开与手动展开**。

### 2.2 完整链条

```
已完成 group，用户手动展开思考（或 group body）
  → open 由 false 变 true
  → effect 误判为"自动展开"
  → initialize('bottom')
  → useProcessScroll 的 ResizeObserver 触发 sync('resize')
  → follow.jump(body, metrics, floor)          ← 滚到底部
  → jump 内部：this.following = nearBottom(landed) = true
  → 此后任何 resize（含思考展开导致的 content 变高）都触发 toBottom
  → 表现为"点开思考自动滚到最下面"
```

### 2.3 为什么官方没有这个问题

官方的手动展开走 `toggle`（`ChatGroupSeat.tsx:175-178`）：

```ts
const toggle = useCallback(() => {
  if (!open) initialize(closed === false ? 'bottom' : 'top')
  setOpen(!open)
}, [closed, initialize, open, setOpen])
```

**已关闭的 group 定位到 `'top'`**（从顶部读），因此 `following = nearBottom(顶部) = false`，后续 resize 不会 `toBottom`。

我的 effect 无条件用 `'bottom'`，且抢在 `toggle` 之后执行，覆盖了官方选择。

---

## 3. 修复

### 3.1 改动

判据从 `open` 的翻转改为 **`autoOpen` 的翻转**：

```ts
// 修复后
const autoOpen = !(closed === true)
const { open, setOpen, toggle: toggleDisclosure } = useAutoDisclosure(autoOpen)
// ...
const previousAutoOpen = useRef(autoOpen)
useEffect(() => {
  if (!previousAutoOpen.current && autoOpen && grouped) initialize('bottom')
  previousAutoOpen.current = autoOpen
}, [autoOpen, grouped, initialize])
```

**语义**：

| 场景 | autoOpen 变化 | effect 触发 | 定位 |
|---|---|---|---|
| 运行中 group 自动展开 | false → true | ✅ | `'bottom'`（跟随增长） |
| 已完成 group 手动展开 | 不变（恒 false） | ❌ | 交给官方 `toggle` 的 `'top'` |
| group 关闭（自动折叠） | true → false | ❌ | 无需定位 |
| `detailed`/`verbose`（不分组） | — | ❌ | `grouped=false` |

### 3.2 为什么这样改是对的

`autoOpen` 是**纯业务状态**（group 是否关闭），不受用户操作影响；`open` 是**最终状态**（含手动覆盖）。

- 自动展开 = `autoOpen` 翻转 → 需要补定位
- 手动展开 = 只有 `open` 翻转，`autoOpen` 不变 → 官方 `toggle` 已处理

两者从此不重叠。

> **后续更正（见本文件第 9.2 节）**：这个判据方向对，但写法有致命缺陷——`useRef(autoOpen)` 的初值就是首次渲染的 `autoOpen`，所以 `!previousAutoOpen.current` 恒为假，这段代码在真实路径上**从未执行过**。此外它漏掉了 `grouped` 翻转，`useEffect` 的时序也晚于 ResizeObserver。第三次修复改用 `shouldAlignBody` + `useLayoutEffect` + `realign`。

---

## 4. 回归测试

新增 `tests/scroll-init.spec.mjs`（7 项），把两种判据的差异固化：

| 用例 | 验证点 |
|---|---|
| 旧判据在已完成 group 手动展开时误触发 | **bug 复现**（固化根因） |
| 新判据在已完成 group 手动展开时不触发 | 修复生效 |
| 新判据在运行中 group 自动展开时触发 | 原功能未丢 |
| 新判据在 group 关闭时不触发 | 折叠无需定位 |
| 新判据在非分组模式不触发 | `grouped=false` |
| `following` 副作用 | 自动展开 true / 手动展开 false |
| 两种判据差异固化 | 直接对比 |

---

## 5. 验证结果

```
pnpm verify
  typecheck  →  通过
  build      →  lib/client.js 121.62 kB
  test       →  40/40 通过
  smoke      →  OK
```

---

## 6. 教训

### 6.1 技术教训

**"最终状态"不能作为"自动状态"的判据。**

`open = override ?? autoOpen` 是一个派生值，它混合了自动决策与用户操作。用它判断"是否发生了自动转换"必然误判。

正确做法：**用纯粹的自动状态（`autoOpen`）做判据**，把用户操作留给官方已有的处理路径。

### 6.2 流程教训

**接管一个行为时，必须同时接管它的所有触发路径，或明确让出。**

官方 `toggle` 已经正确处理了手动展开的定位。我加 effect 时只想到"自动展开不经过 toggle，需要补"，却没意识到新加的 effect 会**同时拦截手动展开**。

正确做法：补一条路径前，先问"这条新路径会不会也命中已有的那条？"

### 6.3 与 P4 教训的共性

P4 是"接管渲染器却没枚举它的全部分支"；本次是"接管行为却没枚举它的全部触发路径"。**同一个思维盲区。**

后续实现任何接管逻辑前，先列出：
1. 该逻辑的全部触发来源
2. 每个来源的期望行为
3. 新代码是否会在不该命中的来源上命中

---

## 7. 当前状态

| 层 | 行为 | 状态 |
|---|---|---|
| ① 整轮折叠 | 官方 | 未改动 |
| ② group body | 运行时展开、关闭时折叠 | ✅ 正常 |
| ③ 思考块 | 运行时展开、先发生者折叠 | ✅ 正常 |
| ④ 工具行 | 官方折叠（P4 已回滚） | 未改动 |

**已完成 group 的手动展开现在与官方一致**：停在顶部，不自动滚动。

---

# 修复报告（第二次）：body 自动滚动偶发失效

> 来源：真机反馈 —— "body 的自动滚动会偶发性失效，通常是大段思考会触发"
> 影响版本：P2 ~ P5
> 修复版本：本提交

## 8. 现象

当前运行的 group（body 带 400px 高度上限）在内容增长时本应自动跟到底部，但**偶发**停在原位。特征：

- 由**大段思考**触发，短思考基本不复现；
- 一旦失效就**持续**，后续工具输出再多也不跟随；
- 手动滚到底之后恢复正常。

## 9. 根因（两层，缺一不可地共同造成）

### 9.1 直接原因：跟随意图被误判关掉且不自恢复

`use-scroll-follow.ts` 里 `following` 只有四个写入点：

| 位置 | 行为 |
|---|---|
| `reset()` | 置 `false` |
| `jump()` | `following = nearBottom(landed)` |
| `sample()` | `if (movedByReader) following = nearBottom(metrics)` |
| `toBottom()` | 置 `true` —— **唯一的自恢复路径** |

而 `toBottom` 的调用入口条件就是 `follow.active`：

```ts
if (follow.active && (cause === 'resize' || ...)) metrics = follow.toBottom(body, metrics, 'smooth')
```

**`following` 一旦为 `false`，resize 分支直接跳过，不会自恢复。**

`following` 怎么变 `false` 的？`sample()` 默认的 `movedByReader` 判据是「`scrollTop` 比上次采样变化 > 0.5px」：

```ts
sample(metrics, movedByReader = this.sampledTop === undefined
  || Math.abs(metrics.top - this.sampledTop) > 0.5)
```

它假设「scrollTop 变了 = 读者滚了」。但 `.body` 是 `overflow-y: auto`，**默认开启滚动锚定**（官方 CSS 没有 `overflow-anchor: none`）。内容在视口上方变高时，浏览器会主动调 `scrollTop` 保住视觉位置——这不是读者行为，却被判成读者行为，于是 `following = nearBottom(...)` 为假。

思考块正是最典型的高度跳变源：`DisclosureRow` 用 `{open && children}` 直接挂载（`DisclosureRow.tsx:121`，**无高度动画**），一次展开就是成百上千像素的跳变。跳变越大，锚定位移越可能发生 —— 这就是"大段思考触发"。

### 9.2 结构性原因：P2 的定位补丁其实一直是空转的

上一个修复（本文件第 3 节）把判据从 `open` 翻转改成 `autoOpen` 翻转，方向是对的，但写法有致命缺陷：

```ts
const previousAutoOpen = useRef(autoOpen)
useEffect(() => {
  if (!previousAutoOpen.current && autoOpen && grouped) initialize('bottom')
  previousAutoOpen.current = autoOpen
}, [autoOpen, grouped, initialize])
```

三个独立问题：

1. **ref 初值**：`useRef(autoOpen)` 在首次渲染就把 `current` 设成当时的 `autoOpen`。运行中 group 首次渲染时 `autoOpen` 已经是 `true`，所以 `!previousAutoOpen.current` 恒为假 —— **这段代码在真实路径上从未执行过**。只有用户手动把设置开关从关到开时才会命中一次。
2. **判据范围太窄**：`autoOpen` 只在 group 关闭时翻转（单向），而 body 第一次出现内部滚动的时刻是 `grouped` 从假变真（Turn 从平铺变成带高度上限，见 `.expandedBody`），那次翻转完全不在判据里。
3. **`useEffect` 时序太晚**：消费 `initialPosition` 的唯一入口是 `sync('resize')`，它由 ResizeObserver 回调触发；而 ResizeObserver 在绘制前交付，`useEffect` 在绘制后才跑。即使 `initialize` 执行了，也要等**下一次**尺寸变化才被采纳。

三条叠加的结果：自动滚动完全靠「挂载时内容刚好少（`floor = 0`）→ 首次采样判为在底部 → `following` 自然为真」这条路，是运气而不是设计。

## 10. 修复

### 10.1 `use-process-scroll.ts`：resize 不再重判跟随意图

```ts
} else if (cause === 'resize') {
  // 内容增长不是读者行为：浏览器滚动锚定也会改 scrollTop。
  // 这里只刷新采样基线，绝不据此重判跟随意图。
  follow.sample(metrics, false)
  if (follow.active) metrics = follow.toBottom(body, metrics, 'smooth')
} else {
  // scroll / scrollend：读者行为，保持官方判据
}
```

`sample(metrics, false)` 是 `ScrollFollow` 已有的签名（第二个参数就是 `movedByReader`）：它会更新 `sampledTop` 但不动 `following`。基线被刷新的意义是：紧随其后的 `onScroll`（平滑滚动会产生）拿不到"虚假位移"，不会再误判一次。

`toBottom` 在 `follow.active` 为假时**不调用**，所以读者主动上滚仍然被尊重。

### 10.2 `use-process-scroll.ts`：新增 `realign()`

```ts
const realign = useCallback(() => { sync('resize') }, [sync])
```

`initialize()` 只是登记意图，要等下一次 `sync('resize')` 才兑现。自动展开之后若没有新的尺寸变化，这次定位就永远丢失。`realign` 让调用方在 DOM 更新后的同一帧里主动兑现它。

官方 `toggle` 路径不受影响：它依然是"先登记、由随后的展开尺寸变化消费"。

### 10.3 `auto-disclosure.ts`：暴露 `following`

```ts
readonly following: boolean   // override === undefined
```

用来区分"插件自动展开"与"用户手动展开"。滚动定位只在 `following` 为真时接管，否则会重蹈第一次修复的覆辙（把已完成的 group 强行滚到底部）。

### 10.4 `AutoGroupSeat.tsx`：定位判据换成 `shouldAlignBody`

```ts
const previousShape = useRef<ScrollAlignState | null>(null)
useLayoutEffect(() => {
  const current = { open, grouped, followsAuto }
  if (shouldAlignBody(previousShape.current, current)) {
    initialize('bottom')
    realign()
  }
  previousShape.current = current
}, [open, grouped, followsAuto, initialize, realign])
```

判定抽到 `flow/scroll-align.ts`（纯函数，可直接单测）：

| 条件 | 说明 |
|---|---|
| `open` | 折叠态没有可滚动内容 |
| `grouped` | 平铺模式（`.expandedBody`）没有高度上限，body 不滚动 |
| `followsAuto` | 用户手动展开必须交给官方 `toggle` 定位 |
| 且 `open` / `grouped` / `followsAuto` 任一相对上次翻转（或首次挂载） | |

换成 `useLayoutEffect` 解决了 9.2 的第 3 点：它在 DOM 变更后、绘制前运行，并且晚于 `useProcessScroll` 内部的 effects（同一组件按 hook 顺序），因此 `realign()` 的 `sync('resize')` 能立即消费刚登记的意图。

## 11. 三代判据对照

| 代 | 判据 | 问题 |
|---|---|---|
| 一 | `open` 翻转 | 手动展开被误当自动展开 → 已完成 group 被强行滚到底部 |
| 二 | `autoOpen` 用 ref 比较翻转 | ref 初值即首次值 → **从未触发**；且漏掉 `grouped` 翻转 |
| 三 | `shouldAlignBody(open, grouped, followsAuto)` + `useLayoutEffect` + `realign` | 正确 |

## 12. 回归测试

```
tests/scroll-align.spec.mjs    9 项   当前判据（真实 import）
tests/process-scroll.spec.mjs  9 项   ScrollFollow 状态机（真实 import）
tests/scroll-init.spec.mjs     7 项   三代判据演进与两代 bug 复现
tests/auto-disclosure.spec.mjs +3 项  following 语义
合计 61/61 通过
```

`scroll-align` 与 `process-scroll` 用 `--experimental-transform-types` **直接 import 源码**（`use-scroll-follow.ts` 有 parameter properties，Node 的类型剥离不支持，必须开 transform）。这是对之前"复制一段逻辑到测试里"写法的修正：本 bug 的一半就藏在内联复制与原实现不一致的地方。

关键用例：

- 「复现 bug：内容增长 + 锚定位移，默认采样会关掉跟随」—— 固化根因；
- 「修复：resize 采样传 `movedByReader=false`」—— 断言 `following` 保持，且基线确实被刷新；
- 「读者真的向上滚仍然会关掉跟随」—— 确认修复没有把读者的意图一起吞掉；
- 「第二代：ref 初值等于首次渲染的 `autoOpen`，于是永不触发」—— 固化 bug 2。

## 13. 教训

1. **"scrollTop 变了"不等于"读者滚了"。** 只要容器开了滚动锚定，布局变化自己就会移动 `scrollTop`。判断读者意图必须看输入事件，而不是位置差值。
2. **一次性补丁要验证它真的执行了。** `useRef(x)` 的初值就是 `x`，任何 `!ref.current && ...` 形式的"首次触发"判据在这种写法下永不成立。这次是第二次修复同一处代码，第一次改动本身是空转的。
3. **异步消费的意图必须有兑现路径。** `initialize` 只登记、由 resize 消费；自动展开不保证后续有 resize。凡是"只登记不主动兑现"的设计，都要问一句"谁来兑现"。
4. **测试要测真实代码。** 内联复制的逻辑测不出"源码里写错了"的 bug。
