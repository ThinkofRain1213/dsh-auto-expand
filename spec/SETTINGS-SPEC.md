# 设置页规范（摘自 dsh-project-groups）

> 来源：`C:\Users\Think\Desktop\项目\dsh-project-groups`
> 依据：`DESIGN.md`（第 1473-1560 行）+ `src/client/settings-card.tsx`（831 行）+ `src/client/settings-card.module.css`（774 行）
> 目标 DSH：0.2.1-rc.2

本文档记录 P5 设置页必须遵循的规范。**所有数值都是 DPG 实测自官方插件卡片的，不是臆测。**

---

## 1. 槽位与渲染位置

### 1.1 槽位定义

```ts
/** A bundle's own configuration, keyed by the bundle's package name and
 *  rendered on the bundle's page between its description and its rows. */
'plugins.bundle.config': { kind: 'keyed'; scope: 'root'; owner: PluginConfigViewProps }
```

来源：`ui-plugin-manager/src/client/slot-contract.ts:89`

### 1.2 渲染位置

```
侧栏 → 插件 → dsh-auto-expand
  ├─ 插件描述
  ├─ [data-plugin-config]        ← 我们的卡片
  └─ 包含的组件
```

对应 `PluginManagerPage.tsx:575`。

### 1.3 `key` 必须是 bundle 名

```ts
ctx.slots.inject('plugins.bundle.config', () => ctx.slots.register({
  name: 'plugins.bundle.config',
  key: 'dsh-auto-expand',        // ← 必须是 bundle 名
  locale: SETTINGS_NS,
  inject: () => ({ hooks: { ... } }),
}, SettingsCard))
```

**原因**（DPG 实测）：

1. 页面按 `entryKey = pkg.name` 分派这个 keyed 槽位
2. `config-ledger.ts:51` 的 `keysOf('plugins.bundle.config')` → `:66` `bundles`，`configured` 就是从这个槽位的 key 投影出来的
3. **key 不匹配则整段不渲染，且无任何报错**

因此验证必须**真的驱动页面**，不能只断言"注册成功"。

### 1.4 先例

官方 `client-ui-voice-input` 的 `mount.ts:45` 用同一槽位、同一写法。DPG 的写法与它同构。

### 1.5 不要用 `form`

`PluginConfigViewProps.form` 是宿主配置表单。若设置在自有领域走自己的 RPC，应无视它——官方语音输入同样无视。

> **本插件的选择**：用官方 `configForms`，因此**会**用 `form` 背后的同一套机制（`ctx.configForms.get(namespace)`），但不直接用 `form` prop。

---

## 2. 被推翻的三个错误方案（避免重犯）

| 说法 | 实际 |
|---|---|
| 注册 `settings.plugin.item` | 该槽位在 0.1.7-rc.2 里 **0 次出现**，纯空转 |
| 注册 `settings.plugins.tab` | 槽位对，但是「设置→插件」标签页，**不是**插件自有页面 |
| 用 `PreferenceRow` 下拉行 | 它服务于 `settings.general.item`，不是这个槽位 |

**DPG 的方法教训**（原话）：

> 一直在"读源码猜"，**没有先找同槽位的完整先例**。
> 先定位"谁用了同一个槽位"，再照抄；猜测式的子品牌/组件复用一律不算依据。

---

## 3. 结构：`.stack` 包装器（必须有）

```css
.stack {
  display: flex;
  flex-direction: column;
  gap: 0;          /* ← 关键：必须为 0 */
}
```

### 为什么必须有

官方 `detailSection` 容器给子元素 `gap: 12px`。

- 若卡片返回 Fragment（不生成元素），七个块都成为它的直接子元素 → 全部被塞进 12px 间隔
- 官方插件卡片（`终端`、`网页搜索`）都包了一层内层 column，所以容器只看到一个子元素
- **间距由每块自己的 `padding` 提供，`gap` 必须为 0**

---

## 4. 间距规范（全部实测自官方）

| 用途 | 值 | 依据 |
|---|---|---|
| 行内边距 | `padding: 16px 0` | 官方设置行（`PermissionRow` / `PreferenceRow` 同款） |
| 行内 gap | `gap: 8px` | 同上 |
| 标题↔描述 | `gap: 6px` | 官方插件卡片（`终端`、`子智能体`）实测 |
| 组内 gap | `gap: 8px` | 标题与其介绍的卡片之间 |
| 组标题↔说明 | `gap: 4px` | 独立标题用的更紧值（无右侧控件） |
| 行文本右内边距 | `padding-right: 48px` | 给右侧控件留位 |

### `.row` 与 `.rowText`

```css
.row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 16px 0;
}

.rowText {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-right: 48px;
}
```

**为什么复制而不 import**：client bundle 纯度门禁（`tsdown.config.ts`）禁止跨插件 value 导入。**官方自己也复制。**

---

## 5. 字体规范（三级层次）

| 类 | 字号 / 字重 / 行高 | 用途 |
|---|---|---|
| `.title` | **13px / 500 / 19.5px** | 设置项名称 |
| `.groupTitle` | **13px / 600 / 19.5px** | 分组标题（比 title 重一档） |
| `.desc` | **12px / 400 / 18px** | 描述文字 |
| `.selector` | **13px / 500 / 19.5px** | 下拉触发器（与 title 同级） |
| `.modalBody` | 14px / 400 / 22px | 对话框正文 |

### 关键细节：500 vs 600 的层级

DPG 明确记录了一次修正：

> 早期版本把 `.title` 和 `.groupTitle` 都设成 500，让"所有命名某物的文字看起来一样"。那是本卡片自己的简化，**它压平了两个层级**。

官方插件卡片（`子智能体`）的对比是：
- **h3 13px/600** 用于分节标题
- **字段标签 13px/500**

**这一档字重差就是"标题"与"另一个行名称"的区别。**

### 颜色 token

| 用途 | token |
|---|---|
| 主标签 | `var(--dsw-alias-label-primary)` |
| 三级标签 | `var(--dsw-alias-label-tertiary)` |
| 次要标签 | `var(--dsw-alias-label-secondary)` |
| 被门控（灰化） | `var(--dsw-alias-label-dimmed)` |

---

## 6. 划线规范

### 6.1 正确写法

```css
.rule {
  flex: none;
  margin: 0;                                    /* ← 关键 */
  border-top: 0.5px solid var(--dsw-alias-border-l2);
}
```

**`margin: 0` 是整个设计的核心**：

- 相邻两块各自 `padding: 16px 0` 已形成 32px 间隔
- 划线插在中间 → 「内容到线」16px，「线到内容」16px
- 内容到内容仍是 32px（与无划线时一致）

**因此划线是"按构造居中"的**：位置由两侧 padding 决定，不是由自己的 margin 决定。

**不变量**：上下两块的 padding 必须相同。若一方改变，划线会偏向另一方，不再表示"边界"。

### 6.2 两个反面案例（DPG 记录）

| 错误做法 | 后果 |
|---|---|
| 用 `border-bottom` 挂在相邻块上 | 那块自己的 padding 失衡 |
| 用 `margin: 16px 0` | 变成 64px 间隔，划线**加倍了间距**而非标记它 |

### 6.3 但卡片体通常不画分隔线

DPG 2026-10-12 用户决定：**去掉卡片体的分隔线**。

理由：官方插件卡片（`终端`、`网页搜索`）在共享容器里**根本不画分隔线**。加上分隔线后，由于 `detailSection` 的 12px 间隔，规则看起来属于上面那块，而 12px 落在另一侧。

**结论**：分隔线只用于特定分组边界，不是每块都画。

---

## 7. 控件规范

### 7.1 下拉：`Menu` 而非原生 `<select>`

```css
.selector {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  height: 36px;
  padding: 0 14px;
  border: none;
  border-radius: var(--dsw-radius-md);
  background: var(--dsw-alias-bg-module-platform);
  font: inherit;
  font-size: 13px;
  font-weight: 500;
  line-height: 19.5px;
  color: var(--dsw-alias-label-primary);
  cursor: pointer;
}

.selector:hover {
  background: var(--dsw-alias-interactive-bg-hover);
}
```

### 为什么不用原生 `<select>`

官方语音输入用原生 `<select>`，**弹出层由操作系统绘制、CSS 管不到** → **深色主题下弹白底**（用户截图实测）。

`Menu`（`@deepseek-ai/dsh-client-ui-primitives`，在 `PLATFORM_MODULES` 内）自带主题浮层、勾选态、键盘导航。

DPG 实测的弹出层填充：

| 主题 | 填充 |
|---|---|
| light | `rgba(248,249,250,0.58)` |
| dark | `rgba(67,69,74,0.45)` |

### 7.2 开关：`Switch` 原语

来自 `@deepseek-ai/dsh-client-ui-primitives`。

DPG 的门控规范：**被门控的标签必须自己灰化**，因为 `Switch` 灰化但旁边的纯文本标记不会。

```css
.gated {
  color: var(--dsw-alias-label-dimmed);
}
```

### 7.3 禁用态：用颜色而非 `opacity`

DPG 记录了一个重要陷阱：

> `opacity: .4` 让卡片成为独立合成层。点击页面上任何 `Switch`（有动画，会提升/降级层）时，卡片会以不同底色重新合成一帧 —— 实测为一单位亮度下跌，**表现为闪烁**。

**正确做法**：用 `color-mix` 逐项预乘 40%，而非 `opacity`。

```css
.cube:disabled {
  color: color-mix(in srgb, var(--dsw-alias-label-primary) 40%, var(--dsw-alias-bg-base));
  border-color: color-mix(in srgb, var(--dsw-alias-border-l4) 40%, transparent);
}
```

**注意**：已有 alpha 的 token（如边框）用 `transparent` 混合缩放 alpha；不透明 token 用 `bg-base` 混合得到不透明结果。

---

## 8. 焦点环规范

```css
/* 共享 token，不用字面 2px */
outline: var(--dsw-focus-ring-width, 2px) solid var(--dsw-alias-state-business-primary);
outline-offset: 1px;
```

行内控件（半径会被裁剪）：

```css
outline: var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));
outline-offset: -2px;
```

---

## 9. 注册写法

```ts
ctx.slots.inject('plugins.bundle.config', () => ctx.slots.register({
  name: 'plugins.bundle.config',
  key: 'dsh-auto-expand',
  locale: SETTINGS_NS,
  inject: () => ({
    hooks: {
      // 声明在 hooks 隔间 → 渲染器绑定成 useXxx 选择器 hook
      groupAutoExpand: clientGroupAutoExpand,
      reasoningAutoExpand: clientReasoningAutoExpand,
    },
    setGroupAutoExpand,
    setReasoningAutoExpand,
  }),
}, SettingsCard))
```

### `inject` 的 `hooks` 隔间

声明为 `hooks: { xxx }` 的 observable 会被绑定成 `useXxx` 选择器 hook（`ui-slots` 的 `bindInjectSources`）。这与 DPG 的 `target: clientNewSessionTarget` → `useTarget` 同构。

---

## 10. 验证要求

### 10.1 探针必须驱动页面

DPG 的 `probe-settings-card.mjs`（361 行）断言模式：

```js
const card = () => page.locator('[data-plugin-config]').first()

check('the Plugins page renders a configuration section for this bundle',
  await page.locator('[data-plugin-config]').count() > 0,
  `sections: ${await page.locator('[data-plugin-config]').count()}`)

check('it carries this plugin\'s copy', cardText.includes(CARD_COPY))

check('the popup is themed rather than the OS light fill', ...)

check('choosing an option stores it on the Host', ...)

check('and the trigger shows the new choice', ...)
```

### 10.2 反向对照

DPG 的做法：**在旧 bundle 上跑同一探针，确认它会失败**。

> 旧 bundle 上 `[data-plugin-config]` **sections: 0**，3 项失败、其余优雅跳过。

这证明探针真的在检验功能，而不是恒真。

### 10.3 主题双色验证

```js
await page.emulateMedia({ colorScheme: 'light' })
// 断言弹出层填充
await page.emulateMedia({ colorScheme: 'dark' })
// 断言弹出层填充
```

---

## 11. 本项目的适用性

| DPG 规范 | 本项目是否适用 | 说明 |
|---|---|---|
| 槽位 `plugins.bundle.config` | ✅ 完全适用 | 同一页面 |
| `key` = bundle 名 | ✅ 完全适用 | `dsh-auto-expand` |
| `.stack` 包装器 | ✅ 必须 | 同一容器 |
| 间距/字体/划线 | ✅ 完全适用 | 同一页面 |
| `Menu` 下拉 | ⚠️ 本期不用 | 本期只有两个开关，无下拉 |
| `Switch` 原语 | ✅ 使用 | 两个开关都用它 |
| 禁用态用颜色 | ✅ 适用 | 若开关互相门控 |
| 探针驱动页面 | ✅ 必须 | 但本项目暂不建探针环境 |
| 不用 `form` | ⚠️ 部分适用 | 我们用 `configForms`，但不直接用 `form` prop |

---

## 12. 与 DPG 的关键差异

| 维度 | DPG | dsh-auto-expand |
|---|---|---|
| 设置存储 | 自有 storage-domain + 自有 RPC | **官方 configForms**（Host 设置文档） |
| Host 半边 | 需要（大量逻辑） | 只需 `Config` schema + `settings.configure` |
| RPC | 自建 | 不需要（configForms 自带） |
| 设置项 | 新会话落点、工作区、注入开关等 | 两个布尔开关 |
