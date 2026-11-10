/**
 * 浏览器半边的挂载入口。
 *
 * 本插件不注册任何 slot，而是**原地包裹**已注册的渲染组件：
 *
 *  1. `conversation.chat.flow`        —— 第二层（process group body）的展开策略
 *  2. `conversation.chat.node`
 *     key `assistant-step`            —— 第三层（思考块）的展开策略（P3）
 *  3. `conversation.chat.node`
 *     key `tool-call`                 —— 第四层（工具行）的展开策略（P7）
 *
 * 选择原地包裹而非重新注册的原因见 `wrap.ts` 与 `spec/DESIGN.md` 第 4 节：
 * 官方 entry 已声明我们需要的子 slot，重新注册会被 SlotCore 拒绝；而
 * `entriesOfSlot` 对 single slot 只返回首个 entry，第二个注册永远不会渲染。
 *
 * ## 关于工具行（P7）
 *
 * P4 曾尝试接管 `tool-call` 并**回滚**：当时用的是**替换**渲染器，把官方
 * `GenericToolCard` fallback 一并顶掉，导致 `pwsh` 等走 fallback 的工具
 * 退化成纯文本。见 `spec/P4-ROLLBACK.md`。
 *
 * P7 改用**包裹**：官方 `ToolCallTree` 原样渲染在包裹层内部，toolview 分派
 * 与 fallback 全部保留，**无需克隆任何 `ui-tool` 代码**。
 *
 * **当前处于 Step 0**：包裹层只做恒等透传，**不改变任何行为**。目的见
 * `spec/P7-PLAN.md` §4.1——先在真机证明包裹零副作用，通过后才在 Step 2
 * 替换 `useDisclosure`。
 */
import type { ComponentType } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import { installWrappers } from './install-wrappers.ts'
import { AutoFlow } from './flow/AutoFlow.tsx'
import { AutoAssistantNodeView } from './assistant/AutoAssistantNodeView.tsx'
import { makeAutoToolCallTree } from './tool/AutoToolCallTree.tsx'
import { SettingsCard } from './settings-card.tsx'
import { SETTINGS_NS, en, zh } from './locales.ts'
import { AUTO_EXPAND_NAMESPACE, attachSettingsForm, type ConfigFormLike } from './settings.ts'
import type { AutoExpandClientContext, AutoExpandSettingsContext } from './contract/client-services.d.ts'

/**
 * 本插件依赖的 cordis 服务。
 *
 * `slots` 是硬依赖（包裹目标 + 设置卡片槽位）。`locale` 与 `configForms`
 * 通过可选注入接入：缺失时插件以默认设置与原始 key 文案工作，而不是整体失效。
 */
export const inject = ['slots']

/**
 * 三个包裹目标各自的组件实现。
 *
 * 所有权与重试逻辑在 `install-wrappers.ts` 中，与 React 实现分离，
 * 因此那份逻辑可以被 `node --test` 直接覆盖。
 */
const WRAPPER_COMPONENTS = {
  flow: AutoFlow as unknown as ComponentType<never>,
  assistant: AutoAssistantNodeView as unknown as ComponentType<never>,
  tool: makeAutoToolCallTree,
} as const

/**
 * 挂载浏览器半边。
 *
 * 两件事：
 *  1. 包裹三个渲染组件——**核心功能**，只依赖 `slots`，永远挂载；
 *  2. 设置卡片与两个开关——**可选功能**，`locale` 与 `configForms` 就绪时
 *     才挂载。缺任意一个就让插件以默认值（全开）工作，而不是整体失效。
 *
 * 第 2 步用 `ctx.inject(deps, cb)` 而不是 `ctx.get()` 判空：`get()` 在
 * `apply` 时刻读，服务晚到就永久错过；`inject` 没有这个竞态，且子作用域
 * 随父 fiber 一起销毁，不需要手动清理。
 * @param ctx - 客户端 context，携带 slot 注册表。
 */
export function apply(ctx: Context): void {
  const client = ctx as unknown as AutoExpandClientContext

  // ── 核心：渲染包裹 ──────────────────────────────────────────────────
  client.effect(() => installWrappers(client, WRAPPER_COMPONENTS), 'dsh-auto-expand: 包裹 flow、assistant-step 与 tool-call')

  // ── 可选：设置页 ────────────────────────────────────────────────────
  client.inject(['locale', 'configForms'], (scope) => {
    const scoped = scope as unknown as AutoExpandSettingsContext

    scoped.effect(() => scoped.locale.register(SETTINGS_NS, { zh, en }), 'dsh-auto-expand: 字典')

    // key 必须是本包的 bundle 名（见 settings-card.tsx 顶部注释）。
    scoped.slots.inject('plugins.bundle.config', () => scoped.slots.register({
      name: 'plugins.bundle.config',
      key: 'dsh-auto-expand',
      locale: SETTINGS_NS,
    }, SettingsCard))

    // 命名空间 = Host 半边的 Loader entry id，必须与 cordis.patch.yml 一致。
    scoped.effect(() => attachSettingsForm(
      scoped.configForms.get<Record<string, boolean>>(AUTO_EXPAND_NAMESPACE) as unknown as ConfigFormLike,
    ), 'dsh-auto-expand: 接管设置')
  })
}
