# P1 验证报告

> 阶段：P1 骨架与包裹机制
> 日期：2026-10-21
> DSH 目标版本：`0.2.1-rc.2`
> 真机部署：**由用户执行**（本报告只覆盖构建产物与逻辑校验）

---

## 1. 阶段目标回顾

P1 的唯一目标是：**验证"原地包裹 `entry.component`"这一技法在本环境可用**，且包裹后行为与官方完全一致（pass-through，不改变任何渲染）。

这一阶段不实现任何自动展开逻辑。

---

## 2. 交付物

| 文件 | 说明 |
|---|---|
| `package.json` | 包清单，含 `dsh.bundle.patch` 与 `dsh.client` |
| `cordis.patch.yml` | 只 insert 自己，不禁用任何官方行 |
| `tsdown.config.ts` | 双产物构建（Host ESM + Client CJS closure-factory） |
| `src/index.ts` | Host 半边，空 `apply`（无 Host 贡献） |
| `src/client/index.ts` | 两个包裹点，均为 pass-through |
| `src/client/wrap.ts` | 包裹工具，含幂等、降级、还原 |
| `locale/zh.json`, `locale/en.json` | 显示元数据 |
| `icon.svg` | 插件图标 |
| `scripts/smoke-client.mjs` | 产物结构冒烟测试 |
| `tests/wrap.spec.mjs` | 包裹逻辑单元测试（10 项） |

---

## 3. 已完成验证

### 3.1 依赖解析

| 项 | 结果 |
|---|---|
| `pnpm install` | ✅ 通过（57 包，3m49s） |
| `@deepseek-ai/dsh-client-ui-chat@0.2.1-rc.2` | ✅ 存在 |
| `@deepseek-ai/dsh-client-ui-conversation@0.2.1-rc.2` | ✅ 存在 |
| `@deepseek-ai/dsh-client-ui-slots@0.2.1-rc.2` | ✅ 存在 |
| `@deepseek-ai/dsh-client-ui-primitives@0.2.1-rc.2` | ✅ 存在 |
| `@deepseek-ai/dsh-client-store@0.2.1-rc.2` | ✅ 存在 |
| `@deepseek-ai/dsh-client-locale@0.2.1-rc.2` | ✅ 存在 |
| `@deepseek-ai/dsh-client-ui-renderer@0.2.1-rc.2` | ✅ 存在 |
| `@deepseek-ai/dsh-client-ui-session@0.2.1-rc.2` | ✅ 存在 |
| **`@deepseek-ai/dsh-client-runtime`** | ❌ **0.2.x 不存在**（已移除该依赖） |

> **修正记录**：初版 `package.json` 照抄旧项目引用了 `dsh-client-runtime@0.2.1-rc.2`，导致安装失败。该包在 0.2.x 系列已被移除，`ClientContext` 类型改用 cordis 的 `Context`。

### 3.2 类型检查

```
pnpm typecheck  →  通过，0 错误
```

`tsdown.config.ts` 已从 tsconfig 的 `include` 中排除：它是构建脚本，用 JS 语义编写，不应受 `strict` + `noImplicitAny` 约束。

### 3.3 构建

```
pnpm build
  lib/index.js    0.34 kB   (ESM, Host 半边)
  lib/client.js   6.57 kB   (CJS, closure-factory)
  lib/client.js.map 10.77 kB
```

### 3.4 产物结构校验

`node scripts/smoke-client.mjs`：

```
OK: client bundle 结构校验通过
  loader id      = dsh-auto-expand
  exports        = apply, inject
  inject         = ["slots"]
  effect label   = dsh-auto-expand: 包裹 flow 与 assistant-step
  空 slots 不抛错 = 是
  订阅 slots/changed = 是
```

验证内容：

| 项 | 结果 |
|---|---|
| bundle 调用 `window.__ModuleLoader__.load` | ✅ |
| 注册的 id 与包名一致 | ✅ `dsh-auto-expand` |
| factory 执行后导出 `{ apply, inject }` | ✅ |
| `inject` 含 `slots` | ✅ |
| `apply` 注册 1 个 effect | ✅ |
| effect 返回 disposer | ✅ |
| 空 slots（官方 entry 未注册）不抛错 | ✅ |
| 订阅 `slots/changed` 重试 | ✅ |

### 3.5 externals 校验

client bundle 中 `require()` 调用只有 `react`，其余全部内联。无平台模块被打包（`SlotCore` 字样仅出现在注释中）。

### 3.6 包裹逻辑单元测试

`node --test tests/wrap.spec.mjs`：**10/10 通过**

| 用例 | 覆盖点 |
|---|---|
| 正常包裹并还原 | 主路径 |
| 幂等 | 同一组件不二次包裹 |
| entry 不存在 | 静默跳过 |
| key 不匹配 | 静默跳过 |
| 组件不可包裹 | 降级不抛错 |
| 包装器抛错 | 降级不抛错 |
| 包装器返回非组件 | 降级不抛错 |
| entry 冻结 | 降级不抛错 |
| `isWrappable` 判定 | 函数/exotic/其余 |
| 还原时不覆盖第三方写入 | 安全还原 |

---

## 4. 待用户实测验证

以下必须在真机确认，本地无法覆盖：

| 编号 | 验证项 | 通过标准 |
|---|---|---|
| V-1 | 插件能被 Plugin Manager 识别 | 出现在插件列表，显示标题与描述 |
| V-2 | 安装后页面正常加载 | 控制台无错误 |
| V-3 | flow 包裹后能拿到 `renderSlot` | 消息列表正常渲染 |
| V-4 | flow 包裹后能拿到 `useGroupAction` | group 折叠动画正常 |
| V-5 | flow 包裹后能拿到 `useStore`/`actions` | 整轮折叠可点击 |
| V-6 | assistant-step 包裹后能拿到 `renderSlot` | 思考正文、图片正常 |
| V-7 | 包裹后 React key 稳定 | 滚动位置、翻页锚点正常 |
| V-8 | 所有渲染与未安装时视觉一致 | 逐像素对比无差异 |
| V-9 | 卸载后完全恢复 | 无残留 DOM / 样式 |
| V-10 | React DevTools 可见包装层 | 组件名显示 `AutoExpand(...)` |

### 4.1 判断包裹是否生效

若 V-3~V-8 全部通过但看不出差异，说明 pass-through 正常工作。可通过以下方式确认包裹确实发生：

1. **React DevTools**：查找 `AutoExpand(ChatFlow)` / `AutoExpand(AssistantNodeView)`（V-10）
2. **控制台**：包裹失败时会打印 `[dsh-auto-expand] 无法包裹 ...`；成功则静默
3. **DOM 检查**：`data-slot="conversation.chat.flow"` 结构应完全不变

### 4.2 已知的观察点

| 现象 | 判断 |
|---|---|
| 控制台有 `[dsh-auto-expand] 未能包裹` | 官方 entry 未找到或组件不可包裹 → 需排查 |
| 页面空白 | 包裹后 props 丢失 → 严重，需回滚 |
| 视觉有细微差异 | pass-through 不该有差异 → 检查是否误改 props |

---

## 5. 技术结论

### 5.1 已验证可行

1. **构建链路完整**：双产物、closure-factory 格式、externals 隔离全部正确
2. **包裹逻辑健壮**：所有失败路径都降级为"插件不生效"，不会让 DSH 崩溃
3. **幂等与还原正确**：支持 `slots/changed` 重试，卸载能干净还原

### 5.2 仍需实测确认

**`entry.component` 改写是否真的生效** —— 这是 P1 的核心假设，只能在真机验证。本地只能证明代码逻辑正确，无法证明 slot 渲染层会读取被替换的 component。

风险依据：`SlotOutlet` 渲染时读 `host.entriesOfSlot(slotKey)`（`ui-renderer/src/client/scoped-slots.tsx:1118`），返回的是 `StoredEntry` 对象引用，其 `component` 字段在渲染时被读取。改写该字段应生效。但这是推断，需实测。

### 5.3 若 V-3~V-8 失败

回退方案：

| 失败点 | 回退 |
|---|---|
| component 改写无效 | 转向 patch 官方 bundle（用户已排除，因要分发） |
| 包裹后 props 丢失 | 检查是否错误地拦截了 props 转发 |
| 官方 entry 找不到 | 打印实际 slot 的 entries 诊断 |

---

## 6. 下一步

P1 通过后进入 P2：

1. 实现 `useAutoDisclosure` + 单元测试
2. 克隆 `ChatFlow` / `ChatNodeSeat` / `ChatGroupSeat`
3. `AutoGroupSeat` 接入自动展开
4. 滚动初始化（`initialize('bottom')`）

在 P1 实测结果回来前，不推进 P2。
