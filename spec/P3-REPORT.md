# P3 实施报告

> 阶段：P3 第三层（思考块自动展开）
> 日期：2026-10-22
> DSH 目标版本：`0.2.1-rc.2`
> 真机部署：**由用户执行**

---

## 1. 阶段目标

让思考块**默认展开**，并在「思考结束」或「所属 group 折叠」**先发生者**时自动折叠；保留官方折叠态的摘要预览；**沿用官方无高度上限的展开态**。

---

## 2. 一处设计修正

设计阶段我曾问"思考展开后是否加高度上限"，这是**错误的提问**。

核实 `ReasoningRow.module.css` 官方注释：

```css
/* The uncapped body scrolls with the conversation; keep its collapse toggle
   reachable. Compact Markdown code banners stay in flow below this header. */
```

官方思考正文**没有高度上限**，随对话一起滚动。全项目只有 group body 有 `max-height: min(400px, 50vh)`。

| 元素 | 官方行为 |
|---|---|
| group body | `min(400px, 50vh)` 内部滚动 |
| **思考正文** | **无上限，随对话滚动** |

原因：group 是"过程容器"（内部滚动便于收束），思考是正文的一部分（随文档流）。

**P3 因此不做任何高度处理**，直接沿用官方展开态。

---

## 3. 交付物

| 文件 | 行数 | 处理 |
|---|---|---|
| `src/client/assistant/markdown-labels.ts` | 20 | 克隆（逐字） |
| `src/client/assistant/AutoReasoningRow.tsx` | 137 | 克隆 + 改 disclosure |
| `src/client/assistant/AutoAssistantMarkdown.tsx` | 190 | 重写 |
| `src/client/assistant/AutoAssistantNodeView.tsx` | 73 | 重写 |
| `src/client/assistant/AutoReasoningRow.module.css` | 65 | 克隆 |
| `src/client/assistant/AutoAssistantMarkdown.module.css` | 71 | 克隆 |
| `tests/reasoning-auto-open.spec.mjs` | 118 | 新增 |

**合计约 674 行**，其中新增逻辑约 70 行。

---

## 4. 核心改动

### 4.1 `AutoReasoningRow`

```ts
const groupOpen = useContext(GroupOpenContext)
const { open: expanded, toggle } = useAutoDisclosure(running && groupOpen)
```

`running && groupOpen` 精确实现"先发生者"：

| 事件 | autoOpen | 结果 |
|---|---|---|
| 思考不再流式 | `running` → false | 折叠 |
| group 折叠 | `groupOpen` → false | 折叠 |
| 两者同时 | 都 false | 折叠 |

任一先发生，`useAutoDisclosure` 丢弃手动覆盖并折叠。**无需额外逻辑。**

### 4.2 `running` 的来源

由 `AutoAssistantMarkdown` 传入，与官方定义一致：

```tsx
running={streaming && i === last}
```

`i === last` 保证只有最后一个 block 是 running，**自动满足 T-3**（只保留最后一段思考展开）。

### 4.3 复刻的 6 个关键细节

| 细节 | 官方位置 | 遗漏后果 |
|---|---|---|
| `hasVisible` 判定 | `AssistantMarkdown.tsx:71-74` | 工具组之间出现空壳行 |
| `groupPart` 过滤 | `:79-80` | reasoning/response 重复渲染 |
| 空白 reasoning 跳过 | `:95` | 出现空思考行 |
| 图片组以首块索引为 key | `:110-121` | 流式追加时 gallery remount |
| `interrupted` stopped 标记 | `:149-151` | 中断态缺标记 |
| **`reasoningHidden`** | `AssistantNodeView.tsx:28-32` | **整轮折叠时思考泄漏，第一层失效** |

`reasoningHidden` 的计算原样保留在 `AutoAssistantNodeView`：

```ts
const reasoningHidden = turnProcess !== undefined
  && turnProcess.foldable
  && turnProcess.spec.answerStep === data.step
  && turnProcess.spec.inlineReasoning
  && !turnProcess.open
```

### 4.4 思考正文仍走官方 Slot

```tsx
renderSlot('conversation.chat.reasoning.body', { text, running })
```

这是**官方 binding**（由包裹保留的 children 声明注入），因此正文排版（compact Markdown）与官方**完全一致**。这是本设计相对"自实现 Markdown"的关键优势。

---

## 5. 验证结果

### 5.1 类型检查

```
pnpm typecheck  →  通过，0 错误
```

### 5.2 构建

```
pnpm build
  lib/index.js      0.34 kB
  lib/client.js   121.56 kB   (P2: 102.67 kB，增量 18.89 kB)
  lib/client.js.map 139.01 kB
```

### 5.3 单元测试

```
pnpm test  →  33/33 通过
```

| 文件 | 用例数 | 覆盖 |
|---|---|---|
| `auto-disclosure.spec.mjs` | 11 | U-1~U-6 状态机 |
| `wrap.spec.mjs` | 10 | 包裹幂等/降级/还原 |
| `reasoning-auto-open.spec.mjs` | 12 | 第三层"先发生者" + T-3 |

第三层 12 项覆盖：

| 用例 | 验证点 |
|---|---|
| 4 项真值表 | `running × groupOpen` 全组合 |
| 先发生者：思考先结束 | 不等 group |
| 先发生者：group 先折叠 | 不等思考 |
| T-3 三项 | 只有最后一段 running；同一时刻严格只有一段 |
| 历史轮次 | `streaming=false` 时折叠 |
| 状态序列 | 只有一次 true→false 转换 |

### 5.4 产物结构校验

```
pnpm smoke
OK: client bundle 结构校验通过
  平台模块外部化 = react, react/jsx-runtime,
                   @deepseek-ai/dsh-client-ui-primitives,
                   @deepseek-ai/dsh-client-store
```

`@deepseek-ai/dsh-util-workspace-path` 已正确**内联**（未出现在 require 列表），符合官方 `INLINE_SAFE` 分类。

---

## 6. 实现中遇到的问题

| 问题 | 修正 |
|---|---|
| 缺 `dsh-util-workspace-path` 依赖 | 装为 devDependency，加入 `INLINE_SAFE` |
| `contract/slots.ts` 缺 3 个类型导出 | 补 `PresentationInjected` / `TurnTailOwnerProps` / `UseGroupAction` |
| `contract/snapshot.ts` 缺 `AssistantBlock` | 补导出 |
| `makePassThrough` 变成死代码 | 移除 |

---

## 7. 待用户实测

### 7.1 第三层验收

| 编号 | 场景 | 期望 |
|---|---|---|
| A-1 | 思考流式输出 | **展开**，正文可读，无高度限制 |
| A-4 | 思考结束（开始写正文或调工具） | **折叠**，显示首行摘要 |
| A-5 | group 折叠时思考仍在流式 | 随 group 一起不可见 |
| T-3 | 多段思考（思考→工具→思考） | 只有当前流式那段展开 |
| — | 折叠态摘要 | 首行预览，`**` 标记已去除 |
| — | 整轮折叠 | 思考随第一层隐藏 |
| — | 历史轮次 | 与官方完全一致 |
| — | 长思考 | 完整展开，随对话滚动 |

### 7.2 回归（P2 不应被破坏）

| 编号 | 场景 | 期望 |
|---|---|---|
| A-2 | group 关闭 | body 折叠一次 |
| A-8 | 手动展开已折叠 group | 保持展开 |
| A-9 | group 超 400px | 内部滚动 + 边缘渐变 |
| — | 手动展开已折叠思考 | 保持展开，不被自动收回 |

### 7.3 重点观察项

1. **思考默认展开是否过重** —— 如果模型思考很长，页面会很快被撑满。官方无上限是设计如此，但实际观感需确认。若过重，后续可考虑加"只展开最后 N 行"的变体。

2. **折叠时机是否突兀** —— 思考结束瞬间折叠，可能和工具行出现同时发生，视觉上是一次高度跳变。观察是否需要延迟。

3. **`renderSlot` 是否正常** —— 思考正文和图片都依赖它。若正文空白或图片不显示，说明 `renderSlot` 透传失败，需排查。

4. **P2 行为是否被破坏** —— 第三层改动不应影响 group body 的展开/折叠。

---

## 8. 已知限制

| 限制 | 说明 |
|---|---|
| 工具行未处理 | 在 P4 单独实现 |
| `detailed` / `verbose` 模式 | 第二层回退官方；第三层仍生效（思考在 assistant-step 内，不受分组影响） |
| 依赖未公开 API | `entry.component` 改写 |
| 克隆代码会漂移 | 约 2270 行克隆（P2 1600 + P3 674） |

---

## 9. 下一步：P4 工具行

P4 第一件事是**验证一个关键技术分叉**：

工具行在 `ui-tool` 独立包（约 17000 行），通过 `conversation.chat.node` 的 `tool-call` key 注册，使用与思考行相同的 `useDisclosure`（`ToolRow.tsx:153`）。

**分叉点**：`CHAT_NODE_INJECT` 是导出常量，且 `childRec.spec = childSpec` 是引用赋值（`ui-slots/src/index.ts:1297`）。理论上改写它的 `hooks.disclosure` 工厂，可让所有 node 渲染拿到受控 hook，**无需克隆 17000 行**。

但有两个不确定点需实测：

1. `cachedSlotInject` 按对象身份缓存 `factories`，改写内容不触发失效
2. 工具行的 autoOpen 判据（"该工具仍在运行"）需要工具状态，而 `ToolRow` 的 props 未必提供

| 结果 | 后续工作量 |
|---|---|
| 注入改写可行 | 约 100 行 |
| 不可行 | 需克隆 `ui-tool` 核心（数千行） |
