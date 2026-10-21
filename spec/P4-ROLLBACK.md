# P4 回滚报告

> 阶段：P4 工具行自动展开 —— **已回滚**
> 日期：2026-10-22
> 回滚原因：破坏了 `pwsh` 等工具的渲染

---

## 1. 现象

安装 P4 版本后，`pwsh` 工具调用行从完整的终端卡片退化为**只显示工具名的纯文本行**。

| 项 | 修复前（P3） | P4 版本 |
|---|---|---|
| `pwsh` 行外观 | 终端卡片：命令、退出码、耗时、工作目录、输出、复制按钮 | 只有一个词 `pwsh` |
| 信息量 | 完整 | 几乎为零 |

---

## 2. 根因

### 2.1 直接原因

`pwsh` **没有注册专用 toolview**。官方渲染路径是：

```
tool.call.toolview keyed 分派（按工具名）
  ├─ 命中（bash / read / grep / glob / edit / write / web_* / todo_write / ask_user_question / 30+ details 工具）
  │    → 专用行组件
  └─ 未命中（pwsh / exec_command / write_stdin / terminal_* / apply_patch / read_mcp_resource …）
       → fallback: GenericToolCard
```

`GenericToolCard`（72 行）内部按顺序尝试 5 个 card model：

```ts
const terminal = terminalCardModel(block, cwd)   // pwsh 命中这里
const read = readCardModel(block, cwd, home)
const diff = diffCardModel(block)
const search = searchCardModel(block)
const web = webCardModel(block)
```

`terminal-card-model.ts:201` 明确把 `pwsh` 当作终端命令：

```ts
if (name !== 'bash' && name !== 'pwsh') return null
```

因此 `pwsh` 由 `GenericToolCard` 渲染成终端卡片。

### 2.2 我的判断失误

P4 设计时我写的理由是：

> 实际 `tool.call.toolview` 有 9 个已注册 entry，keyed 分派几乎总会命中，fallback 只在工具名未注册时出现。因此用极简实现即可。

**这个判断是错的。** 三个错误叠加：

| 错误 | 事实 |
|---|---|
| 以为 fallback 是"极少数情况" | `pwsh`、`terminal_*`、`apply_patch`、`exec_command` 等**全部**走 fallback；`pwsh` 是本会话 30+ 次的高频工具 |
| 以为 `GenericToolCard` 是可省略的"极简 fallback" | 它是**功能完整的主渲染路径**，承载 terminal / diff / read / search / web 五类卡片与 auto-review 拒绝 |
| 只数了 toolview 数量（9 个），没核对**覆盖面** | 9 个 toolview 覆盖的是特定工具名，不是工具全集 |

---

## 3. 为什么没有直接修复

修复需要让 fallback 保留官方能力。三条路径：

| 路径 | 结论 |
|---|---|
| 复用官方 `GenericToolCard` | ❌ `ui-tool/client` 只导出类型，不导出组件；tsdown purity 门禁止跨包 value import |
| 通过服务/注入获取 | ❌ `ui-tool` 不提供任何 cordis 服务 |
| 完整克隆依赖树 | ✅ 可行但代价高，见下表 |

### 克隆依赖树实测

| 文件 | 行数 |
|---|---|
| `GenericToolCard.tsx` | 72 |
| `ToolRow.tsx` | 390 |
| `tool-call-model.ts` | 314 |
| `terminal-card-model.ts` | 341 |
| `image-card-model.ts` | 212 |
| `control-details-model.ts` | 191 |
| `details-card-model.ts` | 179 |
| `inspection-details-model.ts` | 170 |
| `detail-model-shared.ts` | 149 |
| `read-card-model.ts` | 111 |
| `diff-card-model.ts` | 106 |
| `primitive-labels.ts` | 101 |
| `web-card-model.ts` | 93 |
| `search-card-model.ts` | 91 |
| `todo-diff-model.ts` | 78 |
| `auto-review-denial.ts` | 33 |
| `recorded-path.ts` | 13 |
| **合计** | **约 2644 行** |

加上 P4 已写的 514 行，P4 总规模将达约 3160 行；项目克隆总量从 2790 行增至 **约 5430 行**，几乎翻倍。

---

## 4. 决策：回滚

**理由**：

1. 当前状态是**功能倒退**，`pwsh` 卡片不可用 —— 比"没有工具自动展开"严重得多。
2. 为了"工具行自动展开"这一个特性，把克隆量翻倍到 5430 行，**代价不成比例**。
3. `terminal-card-model`（341 行）这类渲染逻辑最容易随上游变化，克隆后维护成本高。
4. 前三层（整轮、group body、思考）已全部验证通过，**保住 90% 的价值**。

---

## 5. 回滚范围

### 5.1 移除的内容

| 内容 | 处理 |
|---|---|
| `src/client/tool/`（5 个文件） | 已删除（回收站） |
| `tests/tool-auto-open.spec.mjs` | 已删除（回收站） |
| `spec/P4-REPORT.md` | 已删除（回收站，被本文件取代） |
| `@deepseek-ai/dsh-client-ui-tool` 依赖 | 已移除 |
| `tool-call` 包裹点 | 已从 `index.ts` 移除 |

### 5.2 保留的内容

前三层完整保留：

| 层 | 状态 |
|---|---|
| ① 整轮折叠 | 官方行为，未改动 |
| ② group body 自动展开 | ✅ P2 |
| ③ 思考块自动展开 | ✅ P3 |
| ④ 工具行 | **回到官方折叠**（默认状态） |

---

## 6. 回滚后验证

```
pnpm verify
  typecheck  →  通过
  build      →  lib/client.js 121.56 kB（与 P3 一致）
  test       →  33/33 通过
  smoke      →  OK
```

产物大小与 P3 完全一致（121.56 kB），确认回滚彻底。

---

## 7. 教训

### 7.1 技术教训

**"注册数量"不等于"覆盖面"。** 判断一个 fallback 是否会触发，必须核对**实际工具名的全集**，而不是已注册的 key 数量。

具体到本例：9 个 toolview 注册项覆盖了 `bash`、`read`、`grep`、`glob`、`edit`、`write`、`web_search`、`web_fetch`、`todo_write`、`ask_user_question` 及 30+ 个 details 工具，但**不覆盖** `pwsh`、`terminal_*`、`exec_command`、`apply_patch` 等。

### 7.2 流程教训

**接管一个渲染器前，必须先枚举它所有分支的产出。** 我在 P4 只验证了"toolview 命中"这一条分支，没有验证"fallback"分支的实际输出，导致破坏主路径而不自知。

正确的做法：实现前先列出该渲染器可能产出的**全部视觉形态**（终端卡片、diff 卡片、read 卡片…），逐一确认我的实现能覆盖。

### 7.3 对后续工作的约束

P5 及之后若再考虑工具行自动展开，必须：

1. 先完整克隆 `GenericToolCard` 依赖树（约 2644 行），或
2. 找到官方可复用的组件获取途径（当前不存在），或
3. 接受"仅对已注册 toolview 的工具生效"的部分方案 —— **不可接受**，因为 `pwsh` 正是主路径。

---

## 8. 当前项目状态

| 期 | 状态 |
|---|---|
| P1 骨架与包裹 | ✅ 完成并验收 |
| P2 group body 自动展开 | ✅ 完成并验收 |
| P3 思考块自动展开 | ✅ 完成并验收 |
| P4 工具行自动展开 | ❌ **已回滚** |
| P5 设置页 / 可配置时机 | 待定 |
| P6 收口与发布治理 | 待定 |

**当前版本可用**：前三层行为正常，工具行保持官方折叠。
