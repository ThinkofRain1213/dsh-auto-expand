# 折叠动画方案

> 状态：**group body 已解决（用官方机制 + 一处修正）；思考块待实施**
> 起因：真机反馈"展开收起抖动太大——根因是没有动画"
> 相关：`ARCHITECTURE.md` 4.6 / 4.7 / 4.8、`FIX-SCROLL.md`

---

## 0. 一句话结论

| 层 | 状态 | 做法 |
|---|---|---|
| group body 折叠动画 | ✅ 已解决 | 用户设置 `collapseTiming: next-input`，打开官方 `flow-motion` |
| 外层对话滚动平滑 | ✅ 已解决（顺带） | 同一设置启用 `InputFoldDriver` |
| 折叠时的跳变 / 过度上拉 / 底部空白 | ✅ 已修 | `capped` 不再随 `open` 翻转（`group-capped.ts`） |
| **思考块折叠动画** | ❌ **待实施** | 需要自建行内高度过渡，见第 4 节 |

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

### 2.1 改一个设置就能打开官方动画（已验证）

`collapseTiming` 是**用户可见的设置**：设置 → 通用 →「工作步骤收起时机」→
「下次有新消息时」（`TranscriptViewRow.tsx:62-69`，`order: 12`）。也能直接写
profile 的 `cordis.patch.yml`：

```yaml
- id: ui-chat
  config:
    collapseTiming: next-input
```

**实测结果**：

| 项 | 改之前（`completion`） | 改之后（`next-input`） |
|---|---|---|
| group body 折叠 | 瞬时跳变 | ✅ 有动画 |
| 外层对话滚动 | instant | ✅ **丝滑了**（`InputFoldDriver` 逐帧驱动） |
| 思考块折叠 | 瞬时 | ❌ 仍然瞬时 |

外层滚动变平滑是意外收获：`deferCompletedTurns` 会启用
`reading.followInputFold()`（`use-chat-scroll.ts:82`），它走
`use-chat-viewport.ts` 的 `InputFoldDriver`，`frame()` 每帧写 `scrollTop`
（`:328`），与折叠动画共享同一个 `progress`（`flow-motion.ts:269`）——高度收缩和
视口上移是同一根时钟驱动的。这正是"把平滑滚动搬到外层"想要的效果，只是不需要搬。

**思考块不在此列**：`[data-chat-motion]` 只对走 `useFlowHidden` / `useMotionHidden`
的元素生效。思考块走 `DisclosureRow` 的 `{open && children}`，完全不在这个体系内。
这一层只能改代码（见第 4.4 节）。

---

## 2.2 打开动画后暴露的第二个 bug：`capped` 翻转

`next-input` 下第一次折叠就出现三个症状：**上面跳变、下面被拉上去、最下面凭空多出
空白**。三者是同一个数字算错的三种表现。

### 根因

官方 `ChatGroupSeat.tsx:182`：

```ts
const capped = grouped && (!deferCompletedTurns || open)
```

`capped` 决定 body 用 `.body`（`max-height: min(400px, 50vh)`）还是
`.expandedBody`（`max-height: none`）。公式里带 `open`，于是折叠那一刻 `open`
变 false、`capped` 同时变 false，**body 在动画测量之前就被摊成完整高度**：

| 位置 | 读到的数字 | 症状 |
|---|---|---|
| `flow-motion.ts:370` `element.offsetHeight` | 完整内容高度（几千 px），不是屏幕上的 400px | 动画从完整高度收起 → **上面跳变** |
| `use-chat-viewport.ts:259` `removed += box.height` | 同上 | 视口位移算大 → **下面被拉上去** |
| `use-chat-viewport.ts:282` `setSpacer(...)` | 同上 | 留白撑到几千 px → **底部空白** |

官方注释称"正在关闭的 body 保留平铺高度，使过渡从屏幕上的样子开始"——这句话在
`next-input` 下恰好反了：屏幕上的样子是 400px 上限，去掉上限才**不是**屏幕上的样子。

### 为什么官方自己没发现

`DEFAULT_COLLAPSE_TIMING = 'completion'`，那时 `capped` 恒等于 `grouped`、与
`open` 无关，折叠前后都是 400px，动画正确。只有切到 `next-input` 才暴露。

### 修法（已实施）

`capped` 是 body 的**布局属性**，不该随展开状态变化：

```ts
const capped = isBodyCapped(grouped)   // 原：grouped && (!deferCompletedTurns || open)
```

判定抽到 `src/client/flow/group-capped.ts`（纯函数 + 完整推演），
`tests/group-capped.spec.mjs` 固化"与官方公式的差异只有一格"。

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

## 4. 思考块：唯一要自建的部分

> **范围已收窄**。本节原本打算连 group body 一起自建动画；实测后 group body
> 用官方机制就够了（第 2.1、2.2 节）。现在只剩思考块这一层需要自己做。

### 4.1 为什么不用官方机制

官方 `flow-motion` 的 532 行里有 scrollport 协同（`InputFoldDriver` 的
`begin/prepare/frame/finish`）、批量折叠、跨行冻结、视口留白补偿——**那些是为
"整轮折叠"设计的**，思考块是单行内部的展开，用不上也不该动。

思考块真正缺的是"行内高度过渡"这一件事。而 `[data-chat-motion]` 体系对它完全
无效，因为 `DisclosureRow` 不在 `useFlowHidden` / `useMotionHidden` 的调用链上。

### 4.2 核心工具

```ts
/** 折叠动画的共享常量：必须与官方 flow-motion 一致，否则节奏割裂。 */
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

### 4.3 group body 的接入点 —— **已不需要**

> **状态更新**：这一节原本打算自建动画接管 group body。实测后作废——
> 把 `collapseTiming` 设为 `next-input` 就打开了官方 `flow-motion` 的折叠动画，
> 再修掉 `capped` 翻转（第 2.2 节）之后，group body 的折叠已经是平滑的、
> 且与外层滚动共用同一根时钟。**不需要 `collapseElement`。**

保留这段记录，是为了说明为什么当时的判断是错的：我以为
`[data-chat-motion]` 作用域在插件里无法满足，实际上它由用户设置驱动，
而插件的折叠时刻（group 关闭）都发生在一轮运行中，正好落在作用域覆盖的窗口内。

### 4.4 思考块的接入点 —— 唯一还需要改代码的地方

现状：`DisclosureRow`（`ui-primitives`）是 `{open && children}` 直接挂载，
**没有高度过渡通道**，也不接收 motion。`[data-chat-motion]` 对它完全无效。

三条路：

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

思考块的高度过渡必须与官方 `flow-motion` 用同一组数值，否则大段与外层是平滑的、
思考块却是另一个节奏，观感割裂：

| 常量 | 值 | 出处 |
|---|---|---|
| `FADE_OUT_MS` | 70 | `flow-motion.ts:10` |
| `CLOSE_DELAY_MS` | 50 | `flow-motion.ts:12` |
| `CLOSE_MS` | 110 | `flow-motion.ts:13` |
| `SETTLE_SLACK_MS` | 80 | `flow-motion.ts:14` |
| `EASING` | `cubic-bezier(0.4, 0, 0.2, 1)` | `flow-motion.ts:16` |

注意：这些是**官方 CSS transition 的时长**，我们复刻时照抄即可，不需要重新调参。

---

## 5. 外层滚动：已确认不需要接管

曾考虑把平滑滚动"搬"到最外层。**不需要**，而且现在已经实现了：

`use-chat-scroll.ts:83` 本来就是 `followTail(deferCompletedTurns ? 'smooth' : 'instant')`。
把 `collapseTiming` 设为 `next-input` 后走的是更强的一条：
`reading.followInputFold()`（`:82`）→ `ChatViewport.foldDriver()` →
`InputFoldDriver.frame()` 每帧写 `scrollTop`（`use-chat-viewport.ts:328`），
与折叠动画共享同一个 `progress`。

**真机已确认外层变丝滑。** 剩下唯一的问题在思考块。

---

## 6. 当前状态与剩余工作

### 已完成

| 项 | 做法 |
|---|---|
| group body 折叠动画 | 用户设置 `collapseTiming: next-input`，打开官方 `flow-motion` |
| 外层滚动平滑 | 同一设置顺带启用 `InputFoldDriver` |
| 折叠时的跳变/过度上拉/底部空白 | 修 `capped` 翻转（`group-capped.ts`） |

### 剩余：思考块高度过渡

**这是唯一还需要改代码的地方。** 在那之前，观感是：大段平滑收起 + 外层平滑跟随，
但思考块在动画开始前就瞬间消失。

实施要点：

1. 走 4.4 的 **C 方案**（`AutoReasoningRow` 自己渲染正文），因为 B 方案需要改
   `DisclosureRow` 的行为；
2. 复刻官方 `DisclosureRow` 的 a11y 契约（`aria-expanded`、`role="button"`、
   Enter/Space 键盘、`data-disclosure-*` 属性）；
3. 处理 4.5 的 `contain: size` 冲突；
4. 时长用 4.6 那组常量。

**验收**：思考块折叠时高度连续收缩，节奏与大段一致；`prefers-reduced-motion` 下
直接跳变；手动展开/折叠仍然即时响应（不要给用户操作加延迟）。
