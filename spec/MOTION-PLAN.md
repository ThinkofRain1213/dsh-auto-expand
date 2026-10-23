# 折叠动画方案

> 状态：**group body 已解决（用官方机制 + 一处修正）；思考块待实施**
> 起因：真机反馈"展开收起抖动太大——根因是没有动画"
> 相关：`ARCHITECTURE.md` 4.6 / 4.7 / 4.8、`FIX-SCROLL.md`

---

## 0. 一句话结论

**本插件当前不修改任何动画/布局代码，全部沿用官方行为。** 下表是现状与可做的事：

| 层 | 状态 | 说明 |
|---|---|---|
| 折叠时外层滚动平滑 | ✅ 官方机制 | 用户设 `collapseTiming: next-input`（仅"运行中"窗口内） |
| 折叠时的跳变 / 过度上拉 / 底部空白 | ⚠️ **官方 bug，已还原不修** | `next-input` 下 `capped` 翻转导致，见 2.2 与"还原决定" |
| 折叠动画脱离「运行中」窗口 | ❌ 未做 | 需在我们节点上加 `data-chat-motion`，**有风险**，见 6.5 |
| group body **展开**动画 | ❌ 未做 | 官方 `useFlowHidden` 写死 `grow = false`，必须自建 |
| 思考块折叠/展开动画 | ❌ 未做 | `DisclosureRow` 的 `{open && children}` 不在动画体系内 |
| 内容增长时的滚动平滑 | ❌ **不可行** | 滚动状态机在 `ChatView`/`ChatViewport`，插件够不到 |

> ⚠️ **两处重要更正**，都是真机推翻读代码的结论：
>
> 1. 第 2.1 节曾写"改一个设置就能打开官方动画"，**不完整**。
>    `data-chat-motion` 需要三个条件同时成立，其中
>    `running || motionTail || pendingInputs.length > 0` 意味着动画只在
>    **一轮运行中或刚结束 800ms 内**存在。详见 6.1。
> 2. 第 2.2 节曾实施过 `capped` 的修正，**已按要求还原**（见该节"还原决定"）。
>    插件层修官方 bug 的长期成本高于收益。

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

**首次实测结果**（部分结论后来被推翻，见下方更正）：

| 项 | 改之前（`completion`） | 改之后（`next-input`） |
|---|---|---|
| group body 折叠 | 瞬时跳变 | ✅ 一轮运行中时有动画 |
| 外层对话滚动（折叠时） | instant | ✅ **丝滑了**（`InputFoldDriver` 逐帧驱动） |
| 思考块折叠 | 瞬时 | ❌ 仍然瞬时 |

外层滚动变平滑是意外收获：`deferCompletedTurns` 会启用
`reading.followInputFold()`（`use-chat-scroll.ts:82`），它走
`use-chat-viewport.ts` 的 `InputFoldDriver`，`frame()` 每帧写 `scrollTop`
（`:328`），与折叠动画共享同一个 `progress`（`flow-motion.ts:269`）——高度收缩和
视口上移是同一根时钟驱动的。这正是"把平滑滚动搬到外层"想要的效果，只是不需要搬。

> **⚠️ 这条结论不完整。** 上表说的"有动画"只在**一轮运行中、或刚结束 800ms 内**
> 成立——`data-chat-motion` 还有第三个条件没被注意到。查看历史轮次、或一轮结束后
> 手动操作，仍然没有动画。完整条件见 6.1，那里也解释了为什么第二次真机验证
> 会推翻这里的说法。

**思考块不在此列**：`[data-chat-motion]` 只对走 `useFlowHidden` / `useMotionHidden`
的元素生效。思考块走 `DisclosureRow` 的 `{open && children}`，完全不在这个体系内。
这一层只能改代码（见第 4.4 节）。

---

## 2.2 打开动画后暴露的第二层问题：`capped` 翻转

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

### 处理：**已还原为官方写法**

曾改过一版（`capped` 去掉 `open` 依赖，抽到 `group-capped.ts`），解决了三个症状，
但**已按要求还原**——原因见下方"还原决定"。

### 还原决定（2026-10-22）

用户要求："上轮偏离官方的改动还原掉。"

`capped` 现在**逐字保留官方公式**。这意味着：

- `collapseTiming: 'completion'`（默认）下一切正常；
- `collapseTiming: 'next-input'` 下折叠会出现跳变 + 过度上拉 + 底部空白。

**这个 bug 属于官方**：`next-input` 是官方提供的选项，在该选项下官方自己的
collapse 动画就是错的。本插件不接管它。

真要修，正确的归属是向上游报告（`ui-chat` 的 `ChatGroupSeat.tsx:182`），而不是
在插件里长期偏离官方的渲染代码——偏离会让 `pnpm drift` 的 `verbatim` 条目变成
"有未声明改动"，增加升级成本。

> 记录这次改动与还原，是为了说明：**插件层修官方 bug 要权衡长期成本**。
> 一次 4 行的偏离看似便宜，但它让这个文件不再是"官方代码 + 已知修改点"的形态。

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

## 4. 自建动画的可用工具

> **范围说明**：本节列的是自建方案的全部素材。当前需要自建的有三处——
> group body 的**展开**动画（官方 `grow=false` 写死）、group body 在
> **"运行中窗口"之外**的折叠动画、以及**思考块**的两个方向（第 6.4 节表格）。

### 4.1 为什么思考块不能用官方机制

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

### 4.3 group body 的接入点 —— 需要重新评估

> **状态**：这一节经历了两轮判断，记录两次都错在哪，因为它说明"读代码得出的结论
> 必须由真机验证"。
>
> **第一轮判断（错）**：以为 `[data-chat-motion]` 作用域在插件里无法满足，
> 打算自建 `collapseElement` 接管 group body。
>
> **第二轮判断（也不完整）**：把 `collapseTiming` 设为 `next-input` 后，真机确实
> 看到了折叠动画，于是宣布"不需要自建"。修掉 `capped` 翻转后这条路的折叠部分
> **是成立的**——但只在 `running || motionTail || pendingInputs` 窗口内成立
> （第 6.1 节）。**窗口外（历史轮次、一轮结束 800ms 后）依然无动画。**
>
> **当前结论**：官方机制能覆盖"运行中"这个主场景，够用；要覆盖全部场景必须
> 在我们节点上加 `data-chat-motion`（风险见 6.5）或自建。这个决定留给用户。

`collapseElement` 于是不再是必需品，但它仍是**思考块那层**的基础（第 4.2 节），
也仍是"要覆盖窗口外折叠"时的现成方案。

### 4.4 思考块的接入点 —— 必须自建

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

## 6. 第二次真机验证：三个现象，三个不同原因

改 `collapseTiming: next-input` 并修掉 `capped` 之后，真机（2026-10-22）仍报三个
现象。逐条查证后确认：**"改一个设置就够"是错的**，官方的动画条件比预想严格得多。

### 6.1 现象一：动画只在「下次前」语义下出现

**不是"绑定设置"这么简单。** 闸门②的真实条件是三项同时成立
（`ChatView.tsx:211-212`）：

```tsx
data-chat-motion={deferCompletedTurns && scroll.initialized
  && (running || motionTail || pendingInputs.length > 0) ? '' : undefined}
```

| 条件 | 含义 |
|---|---|
| `deferCompletedTurns` | `collapseTiming === 'next-input'` |
| `scroll.initialized` | 视口已初始化 |
| `running \|\| motionTail \|\| pendingInputs.length > 0` | **一轮正在跑，或刚结束 800ms 内**（`MOTION_TAIL_MS`），或有待发消息 |

所以即使设成 `next-input`，**查看历史轮次、或一轮结束 800ms 后手动操作，都没有
动画**。这正是"仍与下次前绑定"的真实来源。

### 6.2 现象二：手动展开再收起跳变；手动展开也跳变

两条独立的结论，都要说清楚：

**折叠无动画** —— 闸门②没过（见 6.1）。`useFlowTransition` 里
`else commit()` 分支同步写 `hidden`，瞬跳。

**展开无动画是官方设计，不是 bug** —— `useFlowHidden` 的实现
（`flow-motion.ts:512-514`）把 `grow` 写死成 `false`：

```ts
export function useFlowHidden(hidden, reveal, motion) {
  return useSearchableHidden(hidden, reveal, useFlowTransition(motion, false))
                                //                                    ↑ grow = false
}
```

而 `useFlowTransition` 里展开分支要求 `grow`：

```ts
if (wasHidden && animate && grow) motion?.reveal(element)   // ← 永远不走
```

只有 `useMotionHidden`（用于 group **header**）传 `grow = true`。**官方的 group
body 展开本来就无动画**——`reveal` 只给 header 用。

要展开也有动画，只能自建（官方那条路写死了）。

### 6.3 现象三：内容增长时整体上跳，无滚动动画

这是**滚动**问题，不是动画问题，且插件够不到。

`use-chat-scroll.ts:94-98`：

```ts
if (tipChanged && reading.followingTail) {
  navigation.cancel()
  if (current.deferCompletedTurns && reading.followInputFold()) return
  reading.followTail()          // ← 未传参数
}
```

`followTail(behavior: 'instant' | 'smooth' = 'instant')`（`use-chat-reading.ts:83`）
——**默认 instant**。只有两条路径走 smooth：

| 路径 | 代码 | 何时 |
|---|---|---|
| 自己发消息 | `followTail(deferCompletedTurns ? 'smooth' : 'instant')` | `use-chat-scroll.ts:83` |
| 折叠批次 | `reading.followInputFold()` | `:82`、`:96` |

模型生成新内容属于 `tipChanged` 分支，**永远瞬间跳**。

**为什么插件修不了**：我们只包裹了 `conversation.chat.flow` 与
`assistant-step` 两个组件。滚动视口由 `ChatView`（290 行）拥有，状态机在
`use-chat-viewport.ts`（800 行）与 `use-chat-reading.ts`（282 行）里。
要改必须整树克隆——**这正是 P4 与 `FIX-SCROLL` 两次事故的共同成因**
（接管一条有完整状态机的路径却没枚举全分支）。

### 6.4 三个现象的可行性与代价

| 现象 | 插件层能否修 | 做法 / 代价 |
|---|---|---|
| ① 动画受"运行中"窗口限制 | ✅ 能 | 在我们自己的 group 根节点加 `data-chat-motion=""`，绕过 ChatView 的三重闸门。几行。 |
| ② 折叠无动画 | ✅ 同上 | 同上。 |
| ② 展开无动画 | ⚠️ 必须自建 | 官方 `grow = false` 写死。约 40 行高度过渡。风险：过渡期间连续触发外层 ResizeObserver。 |
| ③ 内容增长滚动瞬间跳 | ❌ 不能 | 需要克隆 `ChatView` + 视口状态机。代价不成比例。 |
| ④ 思考块无动画 | ⚠️ 必须自建 | `DisclosureRow` 的 `{open && children}` 不在 `useFlowHidden` 链上。 |

### 6.5 「加 `data-chat-motion`」这一招的风险（未验证）

在 `AutoGroupSeat` 的 `rootRef` 元素上加 `data-chat-motion=""` 确实能让闸门②
永远满足。但会连带打开一条我没枚举全的路径：

`motion.collapse()` 会调 `scheduleBatch()` → `flushBatch()` →
`foldDriver()` → `InputFoldDriver.begin()`（`use-chat-viewport.ts:246-301`）。
那段代码会计算 `base`/`target`/`removed`/留白，**并可能移动视口**。

在 `completion` 模式下 `foldDriver()` 的 `reader` 可能未绑定（`begin()` 返回 null
时 `runBatch` 会跳过），所以历史轮次折叠大概率为无操作；`next-input` 下则会真的
走批次。**这是推测，不是验证过的事实。**

按 `FIX-SCROLL.md` 第 13 节的教训（"一次性补丁要验证它真的执行了"、"接管行为
必须枚举全部触发来源"），这条路要先单独验证再上，不能直接连同其它改动一起上。

---

## 7. 当前状态

### 沿用官方，本插件零改动

| 项 | 说明 |
|---|---|
| 一轮运行中折叠时，外层滚动平滑 | 用户设 `collapseTiming: next-input` → 官方 `InputFoldDriver` |
| `capped` 翻转的三个症状 | **官方 bug，不修**。`completion` 下不出现；`next-input` 下出现 |

### 未解决（全部需要改代码，尚未实施）

| 项 | 难度 | 备注 |
|---|---|---|
| 折叠动画脱离「运行中」窗口 | 低（几行）但**有风险** | 见 6.5 |
| group body 展开动画 | 中（约 40 行） | 官方 `useFlowHidden` 写死 `grow=false` |
| 思考块折叠/展开动画 | 中（约 60 行） | 见第 4 节 |
| 内容增长时的滚动平滑 | **高（不建议）** | 需克隆 `ChatView` + 视口状态机 |
| `next-input` 下的 `capped` bug | 低（4 行）但**已决定不做** | 属官方，应向上游报告 |

### 建议的下一步

按风险从低到高、可独立验证的顺序：

1. **先验证 6.5 那招的真实影响** —— 只加 `data-chat-motion=""`，真机观察
   历史轮次折叠是否带动视口。这是后面所有 group body 改进的前提。
2. 若安全 → 同一改动顺带解决①和②的折叠部分。
3. 再做自建展开动画（group body 与思考块可以共用一套工具）。
4. ③ 明确不做，写进已知限制。

---

## 8. 2026-10-23 讨论：自建动画的接入点、外层滚动被再次提出

> 本节记录用户当天提出的两个新想法与探查结论。**未实施任何代码。**
> 对应能力矩阵 `CAPABILITY-MATRIX.md` 的 `D5` 与 `C5`。

### 8.1 新想法 A：完全独立实现展开 / 收起动画

用户提出：不再依赖官方 `flow-motion.ts`，由插件自己实现整套展开 / 收起动画。

**探查结论：可行，但真正的难点不是补间曲线。** 必须先同时复刻三件契约，
否则是**功能回退**而不只是「动画不好看」：

| 必须保留 | 官方实现 | 丢失后的后果 |
|---|---|---|
| `hidden="until-found"` 语义 | `searchable-hidden.ts`（`beforematch` 触发展开） | Ctrl+F 能命中折叠内容，但**不会**展开 |
| 逐帧滚动补偿 | `InputFoldDriver`（`use-chat-viewport.ts:328`） | 动画期间下方内容连续漂移 |
| 焦点保护 | 官方 | 展开 / 收起时焦点丢失 |

**接入点（关键约束）**：`groupAction` / `groupHeaderAction` 由 `CHAT_FLOW_INJECT`
注入（`ui-chat/src/client/apply.ts:52-61`）。
**插件克隆的 `AutoGroupSeat` 只是接收 `useGroupAction` 作为 prop，无法在内部替换**——
要换只能改写上游 inject。

这意味着本想法与「工具行自动展开」（`CAPABILITY-MATRIX.md` §5）
**共用同一套 `hookContext` 注入体系**。若两者都做，应合并成**一个 inject 补丁层**，
而不是继续堆克隆。但那是未公开 API（与 `wrap.ts` 同级），**必须先真机验证**。

**收益**：解决 §6.2 / §6.4 的「展开无动画」——即官方 `useFlowHidden` 把
`grow` 写死成 `false` 导致的现象。那是**官方设计，不是 bug**，所以只能自建。

### 8.2 新想法 B：把内层丝滑滚动搬到外层

先澄清：这与**第 5 节「外层滚动已确认不需要接管」不是同一件事**。

| | 第 5 节说的是 | 新想法 B 说的是 |
|---|---|---|
| 对象 | 外层视口的**跟随动画**（自己发消息时） | 把 group body **内部**的滚动（`capped` 的 400px）搬到外层页面滚动条 |
| 现状 | **官方本来就有**（`collapseTiming: next-input` → `InputFoldDriver`），已确认不需要接管 | 官方没有，需要插件制造 |

**结论：建议不做。** 三条独立的障碍：

1. **与上一轮的决定直接冲突。** 内层滚动的唯一来源就是 `capped` 的 400px 上限，
   而它正是用户上一轮要求**还原为官方**的地方（`grouped && (!deferCompletedTurns || open)`）。
   新想法 B 等于**再次偏离，且偏离面更大**——影响所有组的布局，不只是当前轮。
2. **去掉上限后仍然是瞬间跳。** `use-chat-scroll.ts:94-98` 的内容增长路径调用
   `reading.followTail()` **不带参数**，落到默认 `'instant'`（`use-chat-reading.ts:83`）。
   这正是 §6.3 已确认不可行的现象，新想法 B 只是让它更显眼。
3. **三条实现路线都有坑：**

| 方案 | 后果 |
|---|---|
| CSS `scroll-behavior: smooth` | 破坏官方每帧写入：每个 frame 都触发一次平滑动画 → 抖动 / 卡顿 |
| 自建 rAF 补间 | 与官方 `instant` 写入**抢同一帧的 `scrollTop`**，结果不可预测 |
| 不动 | 保持现状跳变 |

**归入 ❌，并入 §7「内容增长时的滚动平滑（高，不建议）」，写进已知限制。**

### 8.3 对 §7 待办清单的影响

| 项 | 变化 |
|---|---|
| 折叠动画脱离「运行中」窗口 | 不变（仍是低难度 + 6.5 的风险未验证，且是后续前提） |
| group body 展开动画 | 不变；接入点补充见 §8.1 |
| 思考块展开 / 收起动画 | 不变 |
| 内容增长时滚动平滑 | 不变（❌）；**新想法 B 并入此条** |
| 自建整套动画 | **新增**，见 §8.1；与「工具行自动展开」共用注入体系 |

**优先级不变**：先验证 6.5（`data-chat-motion` 的真实影响），再谈自建。

---

## 9. 2026-10-23 复验：内外层滚动策略**不一致**（精确证据）

> 用户观察：「操作组自动滚动是真滚动，外层有新行则是向上跳变」。
> 复验结论：**完全正确**，而且这不是插件造成的——是**官方自己的不一致**。

### 9.1 两条路径

| | 内层（操作组 body） | 外层（整个对话） |
|---|---|---|
| 追加位置 | `src/client/flow/use-process-scroll.ts:70` | `ui-chat/.../use-chat-scroll.ts:97` |
| 调用 | `follow.toBottom(body, metrics, 'smooth')` | `reading.followTail()`（默认 `'instant'`） |
| 表现 | **平滑真滚动** | **向上跳变一段** |
| 上限 | `min(400px, 50vh)`（`capped`） | 视口高度 |

### 9.2 关键事实：官方对自己发消息用 smooth，对模型生成用 instant

同一文件 `use-chat-scroll.ts:83`（**自己发消息**时）：

```ts
reading.followTail(current.deferCompletedTurns ? 'smooth' : 'instant')
```

而 `:97`（模型生成内容 / 新行出现）是 `reading.followTail()` —— 落到默认 `'instant'`。

即同一个「内容变多、自动跟随到底」的语义：**内层给了 `smooth`，外层给了 `instant`**。

**插件没有挑过**：内层那行 `toBottom(..., 'smooth')` 是官方原样保留的——
我们的两处改动只涉及 resize 采样（不再误判跟随意图）与新增 `realign()`。

### 9.3 为什么插件只能改内层

| | 内层 | 外层 |
|---|---|---|
| 滚动状态机归谁 | 插件**克隆**的 `use-process-scroll.ts`（123 行） | 官方 `use-chat-viewport.ts`(800) + `use-chat-reading.ts`(282) + `ChatView.tsx`(290) |
| `followTail` 的调用点 | 就在我们自己的文件里 | 在 `use-chat-scroll.ts`，**只有 `ChatView` 用** |
| 能否改 | ✅ 能 | ❌ 够不到 |

包裹 `conversation.view`（`ChatView`）只能替换它的**组件**，替换不了它内部 hook 的实参。
修外层必须克隆上述约 1370 行。

### 9.4 归属判断：若要做，应该是**独立插件**（用户已决定「先不管」）

| | 接管点 | 放哪 |
|---|---|---|
| 外层滚动（C5/C6） | `conversation.view`（ChatView 链） | **独立插件**（如 `dsh-smooth-scroll`）——与 auto-expand **零接管点重叠** |
| 自建动画（D5/D3/D4） | `conversation.chat.flow` 的 children inject（`groupAction` / `groupHeaderAction`） | **留在 auto-expand**——与它已包裹的 flow entry 是**同一个 entry**，硬拆会产生加载顺序依赖 |

**原则：按接管点划分，不按功能相关性划分。**

### 9.5 建议顺序

1. **先向上游提案**（几乎零成本、一行改动）：把 `use-chat-scroll.ts:97` 的
   `reading.followTail()` 改成 `reading.followTail('smooth')`，
   理由就是「内层已 smooth、外层 instant 是两层不一致」。
2. 上游不接，再评估独立插件（约 1370 行克隆换一个滚动手感）。
3. **不建议并入 `dsh-auto-expand`**：漂移成本必须隔离——这段代码是最容易被上游
   改动打碎的部分，而 auto-expand 的核心（三层展开）本身很稳。
