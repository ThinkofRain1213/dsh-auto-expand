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
