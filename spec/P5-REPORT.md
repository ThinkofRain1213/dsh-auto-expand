# P5 实施报告

> 阶段：P5 设置页（插件详情页的两个开关）
> DSH 目标版本：`0.2.1-rc.2`
> 真机部署：**由用户执行**

---

## 1. 阶段目标

在「侧栏 → 插件 → dsh-auto-expand」详情页里放一张设置卡片，提供**两个开关**：

| 开关 | 关掉后 |
|---|---|
| group 自动展开 | process group body 回到官方默认折叠行为 |
| 思考自动展开 | 思考块回到官方默认折叠行为 |

**没有总开关**（用户明确否决："总开关不需要，和最顶上的重复"——插件详情页顶部已有启用/停用，那是 Host 层的事，与渲染层展开策略正交）。

两个值写入 Host 设置文档，跨重启保留，改后**立即生效**（无需重载页面）。

---

## 2. 交付物

| 文件 | 作用 |
|---|---|
| `src/index.ts` | Host 半边：`Config` schema（两个 boolean，默认 `true`）+ 页面策略 `auto: false` |
| `src/client/settings.ts` | 模块级 `settingsSource`（`SnapshotStore`）+ 表单接管 + 乐观写入 |
| `src/client/settings-card.tsx` | 设置卡片：一个分组标题 + 两行 `SwitchRow` |
| `src/client/settings-card.module.css` | 按 `spec/SETTINGS-SPEC.md` 实测值写的样式 |
| `src/client/locales.ts` | `autoExpand` 命名空间的双语字典 + `LocaleNamespaceMap` 声明合并 |
| `src/client/contract/slot-declarations.ts` | 本地声明 `plugins.bundle.config` 槽位（避免安装 plugin-manager 的整棵树） |
| `src/client/contract/client-services.d.ts` | `configForms` / `locale` / `inject` 的运行时契约 |

数据流：

```
设置卡片 ──set──▶ settingsSource（乐观）──▶ configForms.set() ──▶ Host 设置文档
                        ▲                                            │
                        └────── configForms.subscribe() ◀─────────────┘
                        │
                        ▼
        AutoGroupSeat / AutoReasoningRow（useAutoExpandSettings）
```

卡片与渲染层读的是**同一个** `settingsSource` 快照，因此"开关显示"和"实际行为"不可能不一致。

---

## 3. 四个必须知道的实现约束

### 3.1 `.volatile()` 是 `configForm.set()` 的硬性前提

`schema.ts` 的 `isVolatilePath()` 会拒绝写入非 volatile 字段：

```ts
if (path.length && !isVolatilePath(schema, path)) {
  throw new Error(`Config field "${path.join('.')}" is not volatile`)
}
```

所以两个字段必须写成 `z.boolean().default(true).volatile()`。`volatile` 在这里的语义是"**可热改、改后立即生效**"，**不是**"不持久化"——值照样写进 profile 文档。

### 3.2 `auto: false` 只关自动设置页，不影响 `configForms`

`settings.describe()` 里 `autoGenerate` 只是一个标志位；只要 `volatileForm(schema)` 非空，该 namespace 仍然出现在 `describe()` 结果里，浏览器端的 `configForms.get('auto-expand')` 照样拿到表单。

不声明 `auto: false` 的话，插件详情页会**同时**出现官方自动生成的表单和本插件卡片，两套控件写同一份数据。

### 3.3 命名空间有两个不同的值，不能混

| 用途 | 值 | 出处 |
|---|---|---|
| `configForms.get(ns)` 的 namespace | `auto-expand` | = `cordis.patch.yml` 里的 Loader **entry id** |
| `plugin.bundle.config` 槽位的 `key` | `dsh-auto-expand` | = **包名**；`config-ledger.ts` 用它投影 `configured` 标志 |

写成 `register({ key: 'auto-expand' })` 不会报错，只是**整段不渲染**——`config-ledger.ts` 找不到对应 bundle，页面直接跳过这个 key。这类静默失败在 P5 排查中花了最久。

### 3.4 `ctx.get()` 有启动顺序竞态，改用 `ctx.inject()`

第一版两处都写的是 `ctx.get('settings')` / `ctx.get('configForms')` 判空。问题：`get()` 在 `apply` **那一刻**读取，服务晚到就**永久错过**，且没有任何日志。

- Host 半边错过 `settings` → 自动设置页没被关掉，页面出现重复设置区；
- Client 半边错过 `configForms` → 卡片注册了但开关写不进 Host，点了重启就丢。

改成官方统一写法（与 `llm-deepseek`、`ui-chat`、`locale` 等 20+ 个包一致）：

```ts
ctx.inject(['settings'], child => { child.effect(() => child.settings.configure({ auto: false }, ctx.fiber)) })

ctx.inject(['locale', 'configForms'], scope => {
  scope.effect(() => scope.locale.register(SETTINGS_NS, { zh, en }))
  scope.slots.inject('plugins.bundle.config', () => scope.slots.register({ ... }, SettingsCard))
  scope.effect(() => attachSettingsForm(scope.configForms.get(AUTO_EXPAND_NAMESPACE)))
})
```

`ctx.inject` 是 `ctx.plugin({ inject, apply })` 的简写：依赖就绪才启动子作用域，父 fiber 销毁时一并销毁，不需要手动清理。

**核心展开逻辑仍然只依赖 `slots` 一个硬注入**——`locale`/`configForms` 缺失时插件以默认值（全开）工作，而不是整体失效。

---

## 4. 构建配置的一处修正

`host` bundle 第一版 35.64 kB，原因 `@deepseek-ai/schemastery` 被打进了产物。它必须和 `@deepseek-ai/cordis` 一样保持 external——Host 运行时只加载一份。

```ts
// tsdown.config.ts（node 构建）
external: ['@deepseek-ai/cordis', '@deepseek-ai/schemastery'],
```

| | 修正前 | 修正后 |
|---|---|---|
| `lib/index.js` | 35.64 kB | **1.72 kB** |

客户端产物 `lib/client.js` 131.84 kB（含 ~2790 行克隆组件与 CSS），平台模块全部 external。

### 4.1 `schemastery` 必须在 `dependencies`

Host 半边 `import z from '@deepseek-ai/schemastery'` 是**运行时** import，不是类型 import。它不能像客户端包那样靠宿主的 ModuleLoader 解析，而是走 Node 的 ESM 解析链：从 `lib/index.js` 向上找 `node_modules`。

pnpm 的隔离结构下，一个包只能解析它在 `package.json` 里声明过的依赖。放在 `devDependencies` 里，开发环境能用（项目树里有），**用户安装后就会 `ERR_MODULE_NOT_FOUND`**，整个插件（含核心展开）加载失败。

官方 `@deepseek-ai/dsh-web-app` 同样是把它放 `dependencies`、`@deepseek-ai/cordis` 留 `peerDependencies`：

| 包 | 字段 | 理由 |
|---|---|---|
| `@deepseek-ai/cordis` | `peerDependencies` | 必须与宿主**同一实例**（服务注册表、`instanceof`） |
| `@deepseek-ai/schemastery` | `dependencies` | 纯库，schema 只按属性访问被消费，副本可共存 |
| `@deepseek-ai/dsh-client-*` | `peerDependencies` | 客户端产物 external，由宿主 ModuleLoader 提供 |


---

## 5. 验证

```
pnpm typecheck   ✅ 0 error
pnpm build       ✅ index.js 1.72 kB / client.js 131.84 kB
pnpm test        ✅ 40 pass / 0 fail
pnpm smoke       ✅ 结构校验通过
```

`scripts/smoke-client.mjs` 扩展为两个场景：

| 场景 | 断言 |
|---|---|
| `locale` / `configForms` 都缺失 | 只注册 1 个 effect（包裹）；**不**注册设置卡片；仍订阅 `slots/changed` |
| 两个服务齐备 | 3 个 effect；1 张卡片，`key = dsh-auto-expand`、`locale = autoExpand`；字典注册到 `autoExpand` |

smoke 的 fake ctx 需要同时支持 `ctx.<name>` 与 `ctx.get('<name>')` 两种读法（cordis 实际如此），否则子作用域里的 `scope.locale` 是 undefined。

---

## 6. 真机测试清单（用户执行）

1. 打开「侧栏 → 插件」，找到 **dsh-auto-expand**，进详情页；
2. 确认描述与「包含的组件」之间出现卡片：一个分组标题 + 两行开关，**没有**官方自动生成的表单区；
3. 关掉「group 自动展开」→ 新开一轮对话，group body 应是官方默认折叠态；
4. 关掉「思考自动展开」→ 思考块应是官方默认折叠态；
5. 两个都关掉 → 完全等于官方行为（插件只剩"不改变任何东西"）；
6. 重启 DSH → 两个开关的位置保持不变；
7. 深浅色主题各看一遍：分组标题 13/600、行标题 13/500、描述 12/400，间距 16px 0 / 6px，无重复分隔线。

---

## 7. 未做

- **总开关**：用户明确否决。
- **折叠时机可配置**（如"工具调用后立即折叠" vs "group 折叠时"）：不在本阶段范围。
- **工具行自动展开**：见 `spec/P4-ROLLBACK.md`，需要克隆 `GenericToolCard` 全树（~2644 行），代价不成比例。
