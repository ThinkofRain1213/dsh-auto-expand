# P4 实施报告

> 阶段：P4 第四层（工具行自动展开）
> 日期：2026-10-22
> DSH 目标版本：`0.2.1-rc.2`
> 真机部署：**由用户执行**

---

## 1. 阶段目标

让**根级工具调用**在运行时展开、返回后折叠；子调用保持官方默认折叠；group 折叠时联动收起。

---

## 2. 路线选择：为什么没有克隆 17000 行

工具行位于 `ui-tool` 独立包（约 17000 行）。实现前评估了三条路径：

| 路径 | 结论 | 原因 |
|---|---|---|
| 改写 `CHAT_NODE_INJECT.hooks.disclosure` | ❌ 放弃 | 三个硬问题，见 2.1 |
| 用 `nodeStore.turnDataSource` 判断"是否有更新的工具" | ❌ 不可行 | `tool-call` 渲染器的 `ToolTreeProps` 里没有 `nodeStore` |
| **包裹 `tool-call` 渲染器，注入受控 hook** | ✅ 采用 | `ToolCallTree` 只有 122 行 |

### 2.1 为什么放弃改写注入面

`CHAT_NODE_INJECT` 是导出常量，`childRec.spec = childSpec` 是引用赋值（`ui-slots/src/index.ts:1297`），理论上可改写。但：

| 问题 | 说明 |
|---|---|
| **缓存时机** | `cachedSlotInject` 按对象身份用 WeakMap 缓存 `factories`，改写发生在首次渲染后则不生效 |
| **无法区分行类型** | 该注入面服务于**所有** `conversation.chat.node` 渲染（工具/命令/错误行），统一改成自动展开会误伤 |
| **拿不到 autoOpen 判据** | `useDisclosure` 是无参 hook，拿不到工具的 `phase` |

第三条是硬阻塞：即使改写成功，也无法让工具行"按运行状态自动展开"。

### 2.2 采用方案的关键洞察

官方 `ToolRow` 内部只有一个判断（`ToolRow.tsx:175`）：

```ts
const open = expanded && expandable
```

而 `expanded` 来自它接收的 `useDisclosure`。**替换这个 hook 即可改变展开策略，无需改 `ToolRow`。**

因此只需克隆 `ToolCallTree`（122 行），在传给 owner 时替换 `useDisclosure`。

---

## 3. 交付物

| 文件 | 行数 | 处理 |
|---|---|---|
| `src/client/tool/controlled-disclosure.ts` | 48 | 新增 |
| `src/client/tool/tool-contract.ts` | 16 | 新增（类型引用层） |
| `src/client/tool/AutoToolCallTree.tsx` | 197 | 克隆 + 两处改动 |
| `src/client/tool/AutoGenericToolCard.tsx` | 45 | 新增（极简 fallback） |
| `src/client/tool/AutoToolCallTree.module.css` | 33 | 克隆 + 新增 fallback 样式 |
| `tests/tool-auto-open.spec.mjs` | 175 | 新增 |

**合计约 514 行**，其中新增逻辑约 90 行。

---

## 4. 核心改动

### 4.1 受控 disclosure 工厂

```ts
export function makeAutoDisclosure(autoOpen: boolean): UseDisclosure {
  return function useControlledDisclosure() {
    const { open, setOpen, toggle } = useAutoDisclosure(autoOpen)
    return { expanded: open, setExpanded: setOpen, toggle }
  }
}
```

返回的 hook 形状与官方 `UseDisclosure` **完全一致**（只有 `expanded` / `setExpanded` / `toggle`），`ToolRow` 察觉不到差异。

React 约束：工厂本身不调用 hook，只在返回的 hook 内调用；`ToolRow` 每次渲染固定调用一次，顺序稳定。

### 4.2 autoOpen 判据

```tsx
const controlled = useMemo(
  () => (isRoot ? makeAutoDisclosure(phase !== 'result') : useDisclosure),
  [isRoot, phase, useDisclosure],
)
```

| phase | 含义 | autoOpen |
|---|---|---|
| `preparing` | 准备中 | **展开** |
| `start` | 已发起、未返回 | **展开** |
| `result` | 已返回 | **折叠** |

### 4.3 子调用保持官方

```tsx
isRoot={false}   // 递归渲染子调用时
```

`isRoot === false` 时直接用官方 `props.useDisclosure`，保持默认折叠。

### 4.4 fallback 简化

官方 fallback 是 `GenericToolCard`（72 行），它依赖 5 个 card model 与 `ToolRow`（394 行），牵出 `tool-call-model`（314 行）等整套内部实现。

实际 `tool.call.toolview` 有 **9 个已注册 entry**（bash / read / read_image / file-mutation / search / web / todo / details / ask-question），keyed 分派几乎总会命中。fallback 只在**工具名未注册**时出现。

因此用 `AutoGenericToolCard`（45 行）：显示工具名，保持 24px 行高，不试图复刻卡片。

### 4.5 保留的细节

| 细节 | 遗漏后果 |
|---|---|
| `toolCallPhase()` 三态判定 | phase 计算错误 |
| `callName()` 三态处理 | 工具名解析错误 |
| `autoReviewDenied` 分支 | 自动审核拒绝的工具显示错误卡片 |
| `renderSlot('tool.call.toolview')` + fallback | 工具卡片不渲染 |
| 递归 `subCalls` | 嵌套调用丢失 |
| `data-chat-anchor-key` / `data-chat-call-id` | 滚动锚点失效 |

---

## 5. 四层折叠的完整行为

P4 完成后，四层全部就位：

| 层 | 展开条件 | 折叠时机 |
|---|---|---|
| ① 整轮 | Turn 运行中（官方） | Turn 结束（官方） |
| ② group body | `!closed` | group 关闭 |
| ③ 思考 | `running && groupOpen` | 思考结束 **或** group 折叠（先发生者） |
| ④ 工具行（根） | `phase !== 'result'` | 工具返回 **或** group 折叠 |

**group 折叠时工具行自动折叠**——不需要写代码。官方 `ChatNodeSeat` 在 group 隐藏时递增 `disclosureReset`（`ChatNodeSeat.tsx:120-124`），`useDisclosure(version)` 因此重置为折叠。我们在 P2 已原样保留该机制。

---

## 6. 验证结果

### 6.1 类型检查

```
pnpm typecheck  →  通过，0 错误
```

### 6.2 构建

```
pnpm build
  lib/index.js      0.34 kB
  lib/client.js   132.56 kB   (P3: 121.56 kB，增量 11.00 kB)
```

### 6.3 单元测试

```
pnpm test  →  43/43 通过
```

| 文件 | 用例数 | 覆盖 |
|---|---|---|
| `auto-disclosure.spec.mjs` | 11 | U-1~U-6 状态机 |
| `wrap.spec.mjs` | 10 | 包裹幂等/降级/还原 |
| `reasoning-auto-open.spec.mjs` | 12 | 第三层"先发生者" + T-3 |
| `tool-auto-open.spec.mjs` | 10 | 第四层 hook 契约 + 判据 |

第四层 10 项覆盖：

| 用例 | 验证点 |
|---|---|
| hook 形状 | 只有三个字段，与官方一致 |
| 3 项 phase 判据 | preparing/start 展开、result 折叠 |
| 子调用 | 三种 phase 都不自动展开 |
| phase 变化 | 只有一次 true→false 转换 |
| 手动展开已返回工具 | 保持展开 |
| 手动折叠运行中工具 | 保持折叠 |
| phase 变化丢弃覆盖 | start→result 时用户覆盖被丢弃 |
| group 联动 | 官方 `disclosureReset` 版本语义 |

### 6.4 产物结构校验

```
pnpm smoke  →  OK
```

平台模块外部化正常：`react`、`react/jsx-runtime`、`ui-primitives`、`client-store`。

---

## 7. 实现中遇到的问题

| 问题 | 修正 |
|---|---|
| 初版引用未定义的 `toolRowModel` | 改为直接读 `block.autoReviewDenial` 字段 |
| `GenericToolCard` 依赖链过深（5 个 model + ToolRow 394 行） | 改为极简 `AutoGenericToolCard` |
| 缺 `ui-tool` 类型依赖 | 装为 devDependency |

---

## 8. 待用户实测

### 8.1 第四层验收

| 编号 | 场景 | 期望 |
|---|---|---|
| — | 工具准备中 | 行展开 |
| — | 工具执行中 | 行展开，输出可见 |
| — | 工具返回 | 行折叠，显示摘要 |
| — | 手动展开已返回的工具 | 保持展开 |
| — | 手动折叠运行中的工具 | 保持折叠 |
| — | 子调用（`run_code` 内部） | **保持官方折叠** |
| — | group 折叠 | 工具行随之折叠 |
| — | 历史轮次 | 与官方完全一致 |

### 8.2 回归（前三层不应被破坏）

| 编号 | 场景 | 期望 |
|---|---|---|
| A-1 | group body 默认展开 | 正常 |
| A-2 | group 关闭折叠 | 正常 |
| A-4 | 思考结束折叠 | 正常 |
| — | 整轮折叠 | 正常 |

### 8.3 重点观察项

1. **工具展开后是否过高** —— 工具的输入/输出可能很长。官方展开态无高度限制，与思考一致。若过重，后续可考虑上限。

2. **未注册工具的 fallback** —— 如果出现只显示工具名的行，说明该工具名没有对应的 toolview。这是预期行为，但需确认不影响常用工具（bash/read/write/edit/search 等都有注册）。

3. **phase 切换是否抖动** —— `preparing → start → result` 三次变化。观察是否有视觉抖动。

4. **子调用是否真的保持折叠** —— `run_code` 内部的 read/bash 应保持默认折叠。

---

## 9. 已知限制

| 限制 | 说明 |
|---|---|
| 工具折叠时机固定为"返回即折" | 可配置版本（"下一个工具出现才折"）需跨节点信号，留待 P5 |
| 未注册工具显示极简 fallback | 不复刻 `GenericToolCard` 的 variant 推断 |
| `detailed` / `verbose` 模式 | 第二层回退官方；第三、四层仍生效 |
| 依赖未公开 API | 三个包裹点全部依赖 `entry.component` 改写 |
| 克隆代码会漂移 | 约 2790 行克隆（P2 1600 + P3 674 + P4 514） |

---

## 10. 下一步

P5 计划（待确认）：

1. **可配置折叠时机** —— 需要先在 `AutoFlow` 层计算"最新工具/思考"，通过 Context 下发，才能实现"下一个工具出现才折"
2. **设置页** —— 插件详情页的独立设置项
3. **P6 收口** —— 漂移检测、回归、发布治理
