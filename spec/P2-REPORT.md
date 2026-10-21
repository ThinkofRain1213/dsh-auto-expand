# P2 实施报告

> 阶段：P2 第二层（process group body 自动展开）
> 日期：2026-10-21
> DSH 目标版本：`0.2.1-rc.2`
> 真机部署：**由用户执行**（本报告只覆盖构建产物与逻辑校验）

---

## 1. 阶段目标

让**当前运行 Turn 内**的 process group body 默认展开，在该 group 关闭时自动折叠一次；保留 group header 与 400px 高度上限；历史轮次完全不动。

---

## 2. 实际交付

### 2.1 文件清单

| 文件 | 行数 | 来源 | 说明 |
|---|---|---|---|
| `src/client/auto-disclosure.ts` | 57 | 新写 | 自动状态 + 一次性覆盖的状态机 |
| `src/client/group-open-context.ts` | 11 | 新写 | 跨层下发 group 展开状态 |
| `src/client/contract/chat-contract.ts` | 108 | 克隆 | 官方内部纯函数副本 |
| `src/client/contract/slots.ts` | 36 | 新写 | 类型引用层 |
| `src/client/contract/chat-nodes.ts` | 14 | 新写 | 类型引用层 |
| `src/client/contract/snapshot.ts` | 6 | 新写 | 类型引用层 |
| `src/client/contract/group-tree.ts` | 8 | 新写 | 类型引用层 |
| `src/client/contract/turn-process.ts` | 3 | 新写 | 类型引用层 |
| `src/client/contract/stores.ts` | 3 | 新写 | 类型引用层 |
| `src/client/flow/flow-utils.ts` | 110 | 克隆 | `chatRenderKey` / `hiddenOrCollapsing` / `processTitle` / `formatRunDuration` |
| `src/client/flow/use-scroll-follow.ts` | 182 | 克隆 | 滚动跟随内核（逐字） |
| `src/client/flow/use-process-scroll.ts` | 88 | 克隆 | 内部滚动跟随与边缘渐变（逐字） |
| `src/client/flow/AutoNodeSeat.tsx` | 192 | 克隆 | 仅换 group 组件引用 |
| `src/client/flow/AutoGroupSeat.tsx` | 243 | 克隆 | **核心改动**：三处 |
| `src/client/flow/AutoFlow.tsx` | 84 | 克隆 | 仅换两个 seat 引用 |
| `src/client/flow/RunningStatus.tsx` | 41 | 克隆 | 逐字 |
| `src/client/flow/RunningWhaleTail.tsx` | 19 | 克隆 | 逐字 |
| `src/client/flow/message-chrome.ts` | 47 | 克隆 | 时间工具子集 |
| `src/client/flow/use-calendar-day.ts` | 25 | 克隆 | 逐字 |
| `src/client/flow/PendingIconActions.tsx` | 82 | 克隆 | 去掉 branch/usage 分支 |
| `src/client/flow/pending-bubbles.tsx` | 148 | 克隆 | `UserStyleBubble` + 两个 bubble |
| `src/client/flow/*.module.css` | 4 个 | 克隆 | 样式 |
| `src/client/flow/running-whale@2x.png` | 21 KB | 拷贝 | 运行指示器动画 |

**合计约 1600 行**（含 CSS），其中新增逻辑约 110 行。

### 2.2 核心改动（`AutoGroupSeat`）

只有三处：

**改动 1：自动展开策略**

```ts
// 官方：const { expanded: open, setExpanded: setOpen } = useDisclosure()
const { open, setOpen, toggle: toggleDisclosure } = useAutoDisclosure(!(closed === true))
```

**改动 2：自动展开的滚动初始化**

```ts
const previousOpen = useRef(open)
useEffect(() => {
  if (!previousOpen.current && open && grouped) initialize('bottom')
  previousOpen.current = open
}, [open, grouped, initialize])
```

这一处是 P2 最容易漏的点：官方 `toggle` 里有 `initialize(...)`，但自动展开不经过 `toggle`。漏掉会导致 body 展开后停在顶部、看不到最新进展。

**改动 3：下发 group 展开状态**

```tsx
<GroupOpenContext.Provider value={open}>
  <GroupMembers {...props} members={members} />
</GroupOpenContext.Provider>
```

为 P3 的第三层准备。

### 2.3 保持不变（关键）

| 内容 | 原因 |
|---|---|
| `capped` 计算 | 400px 高度上限（S-2） |
| `useGroupHeaderAction` | header 显隐动画 |
| `bodyRef = useGroupAction(grouped && !open, reveal)` | 折叠动画与焦点保护 |
| `useProcessScroll` | 内部滚动跟随、边缘渐变 |
| 全部 `data-*` 属性 | 官方 CSS 与测试依赖 |
| 第一层（整轮折叠）全部逻辑 | 不属本插件范围 |

---

## 3. 验证结果

### 3.1 类型检查

```
pnpm typecheck  →  通过，0 错误
```

### 3.2 构建

```
pnpm build
  lib/index.js      0.34 kB   (ESM, Host 半边)
  lib/client.js   102.67 kB   (CJS, closure-factory)
  lib/client.js.map 103.79 kB
```

产物从 P1 的 6.57 kB 增至 102.67 kB，增量来自克隆组件（约 1600 行）与内嵌的鲸鱼图片（21 KB → base64 约 29 KB）。

### 3.3 单元测试

```
pnpm test  →  21/21 通过
```

| 文件 | 用例数 | 覆盖 |
|---|---|---|
| `tests/auto-disclosure.spec.mjs` | 11 | U-1~U-6 状态机全部路径 |
| `tests/wrap.spec.mjs` | 10 | 包裹幂等、降级、还原 |

`useAutoDisclosure` 的 11 项覆盖：

| 用例 | 验证点 |
|---|---|
| U-1 / U-1b | 初始 autoOpen 决定展开/折叠 |
| U-2 | autoOpen=true 时手动折叠 |
| U-3 | autoOpen 变化时清空覆盖 |
| U-3b | 手动展开后自动转换仍生效 |
| U-4 | autoOpen=false 时手动展开保持 |
| U-6 | **autoOpen 不变时覆盖持续生效（折叠只触发一次）** |
| U-5 / U-5b | toggle 双向 |
| 连续转换 | true→false→true 每次都清空 |
| 同值 setOpen | 不触发额外转换 |

### 3.4 产物结构校验

```
pnpm smoke
OK: client bundle 结构校验通过
  loader id          = dsh-auto-expand
  exports            = apply, inject
  inject             = ["slots"]
  effect label       = dsh-auto-expand: 包裹 flow 与 assistant-step
  平台模块外部化     = react, @deepseek-ai/dsh-client-ui-primitives, @deepseek-ai/dsh-client-store, react/jsx-runtime
  空 slots 不抛错    = 是
  订阅 slots/changed = 是
```

### 3.5 图片内嵌校验

```
lib/client.js 中 running-whale@2x.png 的文件引用：无
data:image/png;base64 出现：是
```

样式表内联注入的 `<style>` 没有文件位置，相对 `url()` 会 404。构建期在**原始 CSS 上**（早于 `JSON.stringify` 包装）替换成 data URL 解决。

---

## 4. 实现中遇到的问题与修正

| 问题 | 原因 | 修正 |
|---|---|---|
| `pnpm install` 失败 | 照抄旧项目引用 `dsh-client-runtime@0.2.1-rc.2`，该包在 0.2.x 已移除 | 改用 cordis `Context` |
| 相对路径错误 | `flow/` 在 `src/client/flow/`，应为 `../contract/` 而非 `../../contract/` | 批量修正 6 个文件 |
| 类型缺失 | 官方未导出组件 props 类型 | 建 `contract/` 类型引用层 |
| 缺 `api-session-controller` | `PendingSubmission` 类型来源 | 装为 devDependency |
| 图片未内嵌 | CSS 内联注入无文件位置 | 加 `inlineCssImages`，在 `load` 阶段替换 |
| `transform` 钩子破坏字面量 | 拿到的是已 `JSON.stringify` 的模块源码 | 改到 `load` 阶段、原始 CSS 上替换 |

---

## 5. 待用户实测

### 5.1 第二层验收

| 编号 | 场景 | 期望 |
|---|---|---|
| A-1 | 新 Turn 开始 | group body 可见，header 保留 |
| A-2 | group 关闭（中间回复或新工具边界） | body 折叠一次，header 保留 |
| A-8 | 手动展开已折叠 group | 保持展开，不被自动收回 |
| A-9 | 内容超 400px | 内部滚动 + 上下边缘渐变 |
| A-10 | 展开态内容增长 | 跟随到底部；滚轮后停止跟随 |
| — | 历史 Turn | 与未安装时**完全一致** |

### 5.2 一致性

| 编号 | 场景 | 期望 |
|---|---|---|
| C-1 | `compact` / `standard` | 第二层生效 |
| C-1 | `detailed` / `verbose` | 回退官方（不分组，无 group 可展开） |
| C-2 | 两种 `collapseTiming` | 第一层逻辑不受影响 |
| — | 整轮折叠可点击 | 行为不变 |
| — | 翻页加载锚点 | 行为不变 |

### 5.3 重点观察项

1. **展开时机是否合理**：`closed` 在中间回复或新工具边界时变 true。一个 group 可能展开几秒就折叠。如果观感太短，需调整判据（这是设计阶段已确认的行为，但需实测确认是否符合直觉）。

2. **滚动跟随**：body 展开后应从底部开始。若停在顶部，说明 `initialize('bottom')` 未生效。

3. **400px 上限**：内容超过时应出现内部滚动条与边缘渐变。若没有上限，说明 `capped` 计算有问题。

4. **历史轮次零差异**：这是最重要的验收项。装与不装，历史消息应完全一致。

---

## 6. 已知限制

| 限制 | 说明 |
|---|---|
| `detailed` / `verbose` 模式无效 | 这两个模式下运行中不分组，`AutoGroupSeat` 不挂载 |
| 依赖未公开 API | `entry.component` 改写不在 slot 契约内 |
| 克隆代码会漂移 | 1600 行克隆需在 DSH 升级时对照 |

---

## 7. 下一步

P2 实测通过后进入 P3：

1. 重写 `AutoAssistantNodeView`（替换官方 `AssistantNodeView`）
2. 自实现 `AutoAssistantMarkdown`
3. `AutoReasoningRow` 接入 `useAutoDisclosure(running && groupOpen)`
4. 联通 `GroupOpenContext`，实现"先发生者"折叠

P3 的关键优势：思考正文仍走官方 `renderSlot('conversation.chat.reasoning.body')`，排版与官方完全一致。
