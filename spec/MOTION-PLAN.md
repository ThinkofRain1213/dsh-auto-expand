# 折叠动画方案

> 状态：**方案，未实施**
> 起因：真机反馈"展开收起抖动太大——根因是没有动画"
> 相关：`ARCHITECTURE.md` 4.6 / 4.7、`FIX-SCROLL.md`

---

## 1. 问题

当前正在运行的那一轮里，group body 与思考块的展开/折叠都是**瞬时跳变**。插件的
自动展开把折叠频率放大了（每轮可能触发好几次），所以同样的跳变从"偶尔一次"变成
"每轮好几次"，肉眼就成了抖动。

---

## 2. 根因：官方其实有折叠动画，但默认配置下是关的

`ui-chat` 有一整套折叠动画引擎 `chat/flow-motion.ts`（532 行）：

```
collapse(element, done)
  opacity  → 0        70ms   （FADE_OUT_MS）
  height   → 0       110ms   延迟 50ms 开始（CLOSE_DELAY_MS → CLOSE_MS）
  margin-top → 0     同上
  缓动      cubic-bezier(0.4, 0, 0.2, 1)
```

触发入口是 `useFlowHidden(hidden, reveal, motion)` ——**group body 的隐藏正是走它**
（`AutoGroupSeat` 的 `props.useGroupAction(grouped && !open, reveal)`）。

但 `useFlowTransition`（`flow-motion.ts:487-501`）有三道闸门：

| # | 闸门 | 谁决定 |
|---|---|---|
| ① | `mounted`：元素必须已挂载过一帧 | 首次渲染不animate |
| ② | `motionEnabled(element)`：必须在 `[data-chat-motion]` 作用域内 | **`ChatView.tsx:211`** |
| ③ | `motion !== undefined`：必须拿到 viewport 的 motion 句柄 | `ChatView.tsx:195` |

**闸门②在默认设置下永远不满足**：

```tsx
data-chat-motion={deferCompletedTurns && scroll.initialized
  && (running || motionTail || pendingInputs.length > 0) ? '' : undefined}
```

`deferCompletedTurns` = `collapseTiming === 'next-input'`（`ChatView.tsx:70`），
而 `DEFAULT_COLLAPSE_TIMING = 'completion'`（`chat-settings.ts:19`）。

**结论：默认配置下，连官方的 group 折叠也是瞬时的。** 插件没有"弄坏"动画——它只是
把折叠次数放大到了一个跳变会被人眼捕捉到的频率。

---

## 3. 三个层级其实不是一回事

把"思考内滚动 / 大段内工具行滚动 / 最外层滚动"当成同一件事的三个层级是**不成立的**，
它们的机制完全不同：

| 层级 | 滚动机制 | 是否平滑 | 位置 |
|---|---|---|---|
| 思考块内部 | **没有滚动容器**：`.thinkBody` 无 `overflow`，随对话流 | — | `ReasoningRow.module.css`："The uncapped body scrolls with the conversation" |
| group body | `overflow-y: auto` + `max-height: min(400px, 50vh)` | ✅ `ScrollFollow.toBottom(..., 'smooth')` | `use-process-scroll.ts:45` |
| 最外层对话 | `[data-conversation-scroll]` | ⚠️ 仅 `deferCompletedTurns` 时 smooth，否则 instant | `use-chat-scroll.ts:83` |

**"思考内向上滚动有动画"是个误判**：那是 group body 的自动跟随——思考长高把 body
内容顶上去，`useProcessScroll` 判定仍在跟随后 `toBottom('smooth')`。思考自己不会滚。

---

## 4. 方案：自建最小动画，group 与思考共用

### 4.1 为什么不自建不行

- 官方 `flow-motion` 的 532 行里有 scrollport 协同（`InputFoldDriver` 的
  `begin/prepare/frame/finish`）、批量折叠、跨行冻结、视口留白补偿。**那些是为
  "整轮折叠"设计的**，而我们的折叠是单层局部的，用不上也不该动。
- 但它的**行级能力**（`collapse` 的 70/50/110ms 时间轴）正是需要的东西，可以
  独立复刻成一层的工具函数。

### 4.2 核心工具

```ts
/** 折叠动画的共享常量：两个层级必须一致，"同一套动画"才成立。 */
export const FADE_OUT_MS = 70
export const CLOSE_DELAY_MS = 50
export const CLOSE_MS = 110
export const EASING = 'cubic-bezier(0.4, 0, 0.2, 1)'

/**
 * 把元素从当前高度收到 0。
 * @param element - 待折叠元素（必须已挂载且可见）。
 * @param done - 过渡结束或降级时调用；调用方在其中提交真正的隐藏状态。
 */
export function collapseElement(element: HTMLElement, done: () => void): () => void
```

行为要点（全部来自官方 `collapse()` 的实现，见 `flow-motion.ts:368-415`）：

1. 先测 `offsetHeight` 与 `marginTop`；都为 0 时直接 `done()`，不做动画。
2. `transition: none` → 写死当前高度 → 强制 reflow（`void element.offsetHeight`）
   → 再挂 transition 并写 `height: 0`。**少了强制 reflow 就不会动**。
3. `overflow: hidden` 必须有，否则子内容溢出会露出。
4. 兜底定时器 `CLOSE_DELAY_MS + CLOSE_MS + 80ms`：`transitionend` 在某些情况下
   不触发（元素被卸载、同一帧多次改样式），**必须有定时器兜底**，否则 `done`
   永不调用、元素永久卡在动画中间态。
5. 返回 disposer：卸载或重复折叠时清理样式与监听器。
6. `prefers-reduced-motion` 时直接 `done()`。

### 4.3 group body 的接入点

现状：`AutoGroupSeat.tsx:220`

```ts
const bodyRef = props.useGroupAction(grouped && !open, reveal)
```

`useGroupAction` → `useFlowHidden` → `useSearchableHidden`：它同步写
`hidden="until-found"` 属性，没有动画（闸门②不过）。

改动思路：**不改 `useGroupAction` 的调用**（它还负责焦点保护和浏览器查找的
`beforematch` 揭示），而是在它之外再包一层：

```
open 变 false
  → 拦截：先 collapseElement(bodyRef.current, commit)
  → commit 里让 useGroupAction 收到 hidden
```

难点：`useGroupAction` 的 hidden 是由 React 渲染期传入的布尔值驱动的，
**无法"延迟提交"**。两条路：

**A. 受控延迟（推荐）**：在 `AutoGroupSeat` 里多一个 `closing` state：

```ts
const [closing, setClosing] = useState(false)
// 隐藏条件改为 grouped && !open && !closing
useLayoutEffect(() => {
  if (!(grouped && !open) || closing) { setClosing(false); return }
  setClosing(true)
  return collapseElement(bodyRef.current, () => setClosing(false))
}, [grouped, open])
```

缺点：折叠期间 `hidden` 未提交，`scrollMetrics` 仍把 body 当可见，可能让
`useProcessScroll` 的边缘渐变短暂抖一下。可接受（body 正在收）。

**B. 直接用 `flow-motion` 的机制**：把 `motion` 从 props 里取出来自己调
`motion.collapse(bodyRef.current, commit)`。但 `motion` 通过 `ChatFlowHookContext`
注入、只在 `[data-chat-motion]` 下生效，而我们无法让 `ChatView` 挂上那个属性。
**不可行**。

### 4.4 思考块的接入点

现状：`DisclosureRow`（`ui-primitives`）是 `{open && children}` 直接挂载，
**没有高度过渡通道**，也不接收 motion。

两条路：

**A. 自己包一层**（不动官方原语）：

```tsx
<DisclosureRow ...>{/* 不传 children */}</DisclosureRow>
<Collapsible open={expanded}>{content}</Collapsible>
```

但这样内容会跑到 `DisclosureRow` 的 `root` 之外，布局结构变了。

**B. 给 `DisclosureRow` 传一个被包裹的 children**：把 `content` 换成
`<Collapsible open={expanded}>...</Collapsible>`，`Collapsible` 内部处理高度过渡。
`DisclosureRow` 在 `open` 为假时不渲染 children，所以**折叠动画的第一帧就已经
没了 children**——除非 `DisclosureRow` 也改成"始终渲染 + 自己控制显示"。

**C. 不用 `DisclosureRow` 渲染正文**：`AutoReasoningRow` 直接渲染 header 与 body，
自己控制展开动画。代价是失去官方 `DisclosureRow` 的 hover 图标切换、a11y 属性、
`previewChevron` 等（约 60 行要复刻）。

**结论：B 与 C 都需要动 `DisclosureRow` 的行为；C 更干净**（本插件已经克隆了
`ReasoningRow`，自己渲染正文是自然的下一步），但要复刻官方原语的 a11y 契约。

### 4.5 `contain: size layout` 的坑

`ReasoningRow.module.css`：

```css
.root:not([data-expanded]) {
  contain: size layout;
  height: calc(24px + var(--dsh-content-font-delta, 0px));
}
```

`contain: size` 让子元素尺寸**不参与父级计算**。要在折叠态与展开态之间做高度过渡，
必须在动画期间换成显式 `height`，动画结束后再切回 `contain: size` ——否则过渡的
目标值算不出来。这是最容易踩的一处，必须写进实现注意事项。

### 4.6 统一常量

两个层级必须用同一组 `FADE_OUT_MS / CLOSE_DELAY_MS / CLOSE_MS / EASING`。
"同一套动画"的判据是**共用同一组数值与同一条缓动**，而不是各写各的 110ms。

---

## 5. 外层滚动：暂不接管

曾考虑把平滑滚动"搬"到最外层。**不建议**，两个理由：

1. **外层已经是平滑的**——`use-chat-scroll.ts:83` 的
   `followTail(deferCompletedTurns ? 'smooth' : 'instant')`。只是默认配置下
   走 instant。插件无法改变 `deferCompletedTurns`（那是原生工作细节设置）。
2. **外层滚动是一套完整状态机**：`use-chat-reading.ts` 的 `followingTail` /
   `followTail` / `landing` / `onResize`，与 `ChatViewport` 的 `InputFoldDriver`
   协同。插件插手等于接管一条有完整分支的路径——**这正是 P4 与 `FIX-SCROLL`
   两次事故的共同成因**（见 `FIX-SCROLL.md` 第 6.2 / 13 节）。

**折叠高度连续变化后，视口自然就平滑跟上了**，不需要额外接管外层滚动。

---

## 6. 实施顺序与验收

| 步 | 内容 | 验收 |
|---|---|---|
| 1 | `collapseElement` 工具 + `prefers-reduced-motion` 降级 + 兜底定时器 | 单测：正常路径、高度为 0、元素卸载、reduced-motion |
| 2 | group body 接入（4.3 的 A 方案） | 真机：group 自动折叠时高度连续收缩，无跳变 |
| 3 | 思考块接入（4.4 的 C 方案） | 真机：思考折叠时高度连续收缩 |
| 4 | 统一常量并核对两处时间轴一致 | 两处同时折叠时观感一致 |
| 5 | 回归：`FIX-SCROLL` 的三条（手动展开停顶部、自动跟随、读者上滚） | `pnpm verify` + 真机 |

**必须真机确认的三点**：

1. 折叠动画期间，group body 的 400px 上限是否导致内容先"跳"一下再收；
2. 思考块 `contain: size` 切换的瞬间有没有一帧尺寸错位；
3. 连续快速折叠（中间回复打断）时有没有残留的中间态。

---

## 7. 参考数据（供实现时对照）

| 常量 | 值 | 出处 |
|---|---|---|
| `FADE_OUT_MS` | 70 | `flow-motion.ts:10` |
| `CLOSE_DELAY_MS` | 50 | `flow-motion.ts:12` |
| `CLOSE_MS` | 110 | `flow-motion.ts:13` |
| `SETTLE_SLACK_MS` | 80 | `flow-motion.ts:14` |
| `EASING` | `cubic-bezier(0.4, 0, 0.2, 1)` | `flow-motion.ts:16` |
| 成员间距过渡 | `margin-top 160ms` 同缓动 | `ChatGroupSeat.module.css` |
