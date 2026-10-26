# 需求：工具结果完整展示（暂不实现）

> 状态：**保留需求，暂不实现**（2026-10-27）
> 决策人：用户
> 结论：技术上没有「像接管 group 那样干净」的接缝；四条可行路径的代价都超出收益。

---

## 1. 需求

会话里工具行展开后，内容块把中间部分折叠，只留头尾几行，需要再点一次「其余 N 行」才看全。
希望**默认完整展示**，不再有这一层折叠。

截图证据（2026-10-27）：

```
⌃ 已调用工具并读取文件                      ← 操作组，已展开
    ✻ 工具调用 · ops_bash · …              ← 工具行，已展开
    ⌃ 读取 …\CHANGELOG.md                  ← 工具行，已展开
       ┌──────────────────────────────────────┐
       │ md …\CHANGELOG.md    显示 45 / 225 行 │
       │  1  # 变更记录                        │
       │  2                                    │
       │  3  本项目遵循…                       │
       │  4  `package.json` 的 `engines.dsh`…  │
       │  ── 其余 37 行   ← 卡在这里            │
       │ 42                                    │
       │ 43  ### 术语                          │
       │ 44                                    │
       │ 45  | 词 | 指什么 |                    │
       └──────────────────────────────────────┘
```

前两层（操作组、工具行）已经自动展开，卡住的是**最里面内容块的行数折叠**。

---

## 2. 现状：折叠来自三个硬编码常量

| 块 | 上限 | 常量 | 文件 |
|---|---|---|---|
| `ReadBlock`（读文件） | **8** | `CHAT_READ_MAX_LINES` | `read-card-model.ts:17` |
| `DiffBlock`（改文件） | **9** | `CHAT_DIFF_MAX_LINES` | `diff-card-model.ts:8` |
| `SearchBlock`（搜索） | **8** | `CHAT_SEARCH_MAX_LINES` | `search-card-model.ts:12` |
| `TerminalBlock`（命令输出） | **`Infinity`** | — | `ToolRow.tsx:266` |

截图里 `45 − 8 = 37`，与 `ReadBlock` 的算法完全吻合：

```ts
// ui-primitives/src/ReadBlock.tsx:106
const hidden = lines.length - maxLines   // 45 - 8 = 37
const capped = hidden > 0 && !expanded
const headLines = Math.ceil(maxLines / 2)  // 4
const tailLines = maxLines - headLines     // 4
```

**终端输出本来就不折叠**（`TerminalBlock` 传的是 `Infinity`），说明官方对四类是**逐类权衡过的**，不是随手写死。

### 一个有用的推论

`ReadBlock` / `DiffBlock` / `SearchBlock` 对 `Infinity` 的处理是安全的：

```
maxLines = Infinity
  → hidden = lines.length - Infinity = -Infinity
  → hidden > 0 = false        ⇒ 折叠按钮不渲染
  → capped = false            ⇒ 全部行渲染
```

`TerminalBlock` 的注释也明说 `Infinity disables the cap`。
**所以只要能把 `Infinity` 传进去，这个需求就实现了**——问题只在于「怎么传」。

---

## 3. 为什么没有干净路径

三处硬障碍，任何一条都足以否决「轻量接管」：

### 障碍 1：`maxLines` 在 `ToolRow` 内部写死

```tsx
// ui-tool/src/client/tool/components/ToolRow.tsx
: diffBody !== null
  ? <DiffBlock {...diffBody.card} maxLines={CHAT_DIFF_MAX_LINES} … />
  : readBody !== null
    ? <ReadBlock {...readBody} maxLines={CHAT_READ_MAX_LINES} … />
    : searchBody !== null
      ? <SearchBlock {...searchBody.card} maxLines={CHAT_SEARCH_MAX_LINES} … />
```

`ToolRowProps` **没有** `maxLines` 之类的口子（已逐字段核对 `ToolRowProps` 定义）。

### 障碍 2：`ToolRow` 不在公开导出里

`ui-tool/client` 的全部导出：

```ts
export { apply, inject } from './apply.ts'
export type { StartedToolCallViewProps, ToolCallCommonProps, ToolCallProps, … } from './contract/slots.ts'
```

**没有任何组件、没有任何模型函数。**

### 障碍 3：npm 包不含源码

```json
// packages/client/ui-tool/package.json
"files": ["locale/*.json", "lib/index.js", "lib/client.js", "lib/types/**/*.d.ts"]
```

`exports` 里虽然有 `"./src/*": "./src/*"`，但那只在 monorepo 里成立——**发布后的包里没有 `src/`**。

### 为什么 group 能干净，这个不能

| 条件 | group / 节点 | 内容块 |
|---|---|---|
| 接缝粒度 | `conversation.chat.flow` 正好是目标组件 | `tool.call.toolview` 是**整个 toolview**，`ToolRow` 在它内部 |
| 克隆依赖 | `GroupSeat` + CSS，2 个文件 | `ToolRow` 连带 9 个 `models` + 3 个子组件 + CSS |
| 内部模块可 import | 不需要 | 需要，但公开导出里没有 |

**「干净」不是一种接缝，是「克隆 + 替换」付了代价换来的。** group 小到可以整个克隆，内容块大到不能。

---

## 4. 四条路径的完整对比

| 路径 | 做法 | 文件量 | 缺陷 |
|---|---|---|---|
| **A. 克隆全链路** | 克隆 `ToolRow` + 9 models + 3 组件 + CSS + 7 toolview，注册覆盖 `tool.call.toolview` | **约 21 个**（29 → 50） | 接管全部工具行渲染；上游一改就要跟 |
| **B. 重写精简版 read 工具行** | 自己算 `toolRowModel` 等价逻辑 + 自写行 chrome | 约 280 行**自写**代码 | 视觉/动画/错误态可能与官方不一致 |
| **C. DOM 自动点击** | 观察 `button[aria-expanded="false"][class*="_expand"]` 并 `click()` | 约 80~120 行 | 可能闪一帧；可能破坏手动收起；依赖类名 |
| **D. 不做** | — | 0 | — |

### 路径 C 的选择器已验证是精确的

四个内容块的折叠按钮**全部**用 `css.expand`：

| 组件 | 折叠按钮 className |
|---|---|
| `ReadBlock` | `css.expand` |
| `DiffBlock` | `css.expand` |
| `SearchBlock` | `css.expand` |
| `TerminalBlock` | `css.expand` |

而 `DisclosureRow` / `JsonTree` / `Menu` 用的是各自不同的类名，所以
`button[aria-expanded="false"][class*="_expand"]` **不会误伤**它们。

路径 C 的真正问题不在选择器，而在行为：

1. **闪烁** —— 先渲染折叠态，再被点击展开。MutationObserver 回调在微任务、早于绘制，大概率看不到，但未在真机验证。
2. **破坏手动收起** —— 用 `WeakSet` 记住已点过的元素，用户收起后若 DOM 元素被复用则不再展开；若 React 重建元素则会再次展开。
3. **依赖 `_expand` 类名** —— 官方改名后**静默失效**（回到折叠），不报错。

---

## 5. 决定

**暂不实现。**

理由：

1. 官方四个值里终端已经是 `Infinity`，说明「哪类该折叠」是**逐类权衡过的设计**，不是遗漏。
2. 插件绕过它需要接管整个工具行渲染（A）或写一份平行实现（B），风险和收益不成比例。
3. 最轻的 C 会破坏「用户手动收起」这个交互，而且依赖未在真机验证的时序假设。

---

## 6. 将来从哪个入口接手

### 6.1 如果官方改了这两处之一，路自然就有了

- `ToolRowProps` 增加 `maxLines` / `fullOutput` 之类字段
- 或把 `CHAT_*_MAX_LINES` 做成设置项（`ui-settings-chat` 之类）

那时只需在 `conversation.chat.node` 的 `tool-call` 包裹层把值传下去——**和现在接管 group 一样干净**。

### 6.2 如果一定要做，从路径 C 开始

它零克隆、可随时删除。实现骨架：

```ts
const seen = new WeakSet<Element>()

const expandAll = (): void => {
  for (const btn of document.querySelectorAll<HTMLButtonElement>(
    'button[aria-expanded="false"][class*="_expand"]',
  )) {
    if (seen.has(btn)) continue
    seen.add(btn)
    btn.click()
  }
}

let scheduled = false
new MutationObserver(() => {
  if (scheduled) return
  scheduled = true
  requestAnimationFrame(() => { scheduled = false; expandAll() })
}).observe(document.body, { childList: true, subtree: true })
```

**上线前必须在真机确认三件事**：

1. 展开时是否能看到一帧折叠态
2. 用户手动收起后是否会被强行再展开
3. 流式输出时 `requestAnimationFrame` 节流是否足够（长会话性能）

### 6.3 顺带应该向上游提的 feature request

> 希望把 `CHAT_READ_MAX_LINES` / `CHAT_DIFF_MAX_LINES` / `CHAT_SEARCH_MAX_LINES`
> 暴露为设置项，或允许工具行展开时完整显示。

成本只有一段话，改完所有插件和用户都受益。

---

## 7. 相关的既有边界

如果将来实现，还有一个未决问题：**生效范围**。

插件当前的设计是「历史轮次完全不动」。而内容块的折叠在**历史轮次里同样存在**，路径 C 的
`document.body` 级观察会**全局生效**，与该边界冲突。

若要保留边界，需要先找到「当前运行轮次」的 DOM 锚点。`ToolCallTree` 的包裹层能拿到
`closed` 之类的轮次状态（见 `AutoGroupSeat` 的 `isCurrent` 用法），但**内容块在 DOM 上如何归属到某一轮**尚未调研。
