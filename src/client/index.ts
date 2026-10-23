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
import { NOOP, wrapEntry, type StoredEntryLike } from './wrap.ts'
import { AutoFlow } from './flow/AutoFlow.tsx'
import { AutoAssistantNodeView } from './assistant/AutoAssistantNodeView.tsx'
import { makeAutoToolCallTree } from './tool/AutoToolCallTree.tsx'
import { SettingsCard } from './settings-card.tsx'
import { SETTINGS_NS, en, zh } from './locales.ts'
import { AUTO_EXPAND_NAMESPACE, attachSettingsForm, type ConfigFormLike } from './settings.ts'
import type { AutoExpandClientContext, AutoExpandSettingsContext } from './contract/client-services.d.ts'

/** 日志前缀。 */
const TAG = '[dsh-auto-expand]'

/**
 * 本插件依赖的 cordis 服务。
 *
 * `slots` 是硬依赖（包裹目标 + 设置卡片槽位）。`locale` 与 `configForms`
 * 通过可选注入接入：缺失时插件以默认设置与原始 key 文案工作，而不是整体失效。
 */
export const inject = ['slots']

/** `ctx.slots` 的最小形状：只取用到的 `entries` 与设置卡片注册所需的两个方法。 */
interface SlotsService {
  entries(key: string): readonly StoredEntryLike[]
  inject(key: string, callback: () => () => void): () => void
  register(options: Record<string, unknown>, component: unknown): () => void
}

/**
 * 带 `slots` 的客户端 context。
 *
 * 只补上本插件用到的成员（`slots` 与 `on`）；其余成员由动态代理在运行时
 * 提供，不需要在类型层面出现。
 */
type ClientContext = AutoExpandClientContext & {
  readonly slots: SlotsService
}

/** 包裹目标：flow（single slot，无 key）。 */
const FLOW_TARGET = { slot: 'conversation.chat.flow' } as const

/** 包裹目标：assistant-step（keyed slot）。 */
const ASSISTANT_TARGET = { slot: 'conversation.chat.node', key: 'assistant-step' } as const

/**
 * 包裹目标：tool-call（keyed slot）。
 *
 * 与 `ASSISTANT_TARGET` 同属 `conversation.chat.node` 这个 keyed slot，
 * 因此 `slots/changed` 的监听条件无需改动即可覆盖它。
 */
const TOOL_TARGET = { slot: 'conversation.chat.node', key: 'tool-call' } as const

/**
 * 构造 flow 的包装器：返回 `AutoFlow`。
 *
 * `AutoFlow` 是官方 `ChatFlow` 的克隆，只把两个 seat 组件换成自动展开版本。
 * 它需要官方 entry 的全部 props（含 `renderSlot`、`useGroupAction`、`useStore`），
 * 这些都由包裹保留的 inject/children 声明自动提供。
 * @param _inner - 官方 `ChatFlow`（本实现完全替代它，不使用）。
 * @returns `AutoFlow` 组件。
 */
function makeAutoFlow(_inner: ComponentType<never>): ComponentType<never> {
  return AutoFlow as unknown as ComponentType<never>
}

/**
 * 构造 assistant-step 的包装器：返回 `AutoAssistantNodeView`。
 *
 * 它是官方 `AssistantNodeView` 的重写：保留全部 props 与 `reasoningHidden`
 * 计算，只把内层 Markdown 层换成 `AutoAssistantMarkdown`，让思考行接入
 * 自动展开策略。
 * @param _inner - 官方 `AssistantNodeView`（本实现完全替代它）。
 * @returns `AutoAssistantNodeView` 组件。
 */
function makeAutoAssistant(_inner: ComponentType<never>): ComponentType<never> {
  return AutoAssistantNodeView as unknown as ComponentType<never>
}

/**
 * 在 slot 变化后重新尝试包裹，直到三个目标都成功。
 *
 * 包裹必须等官方 entry 注册之后才能进行，而插件激活顺序与 slot 注册顺序
 * 没有硬保证，因此这里订阅 `slots/changed` 做重试。每次事件后重新读取
 * `ctx.slots.entries(...)`，因为 entry 数组会在注册变化时被替换。
 * @param ctx - 客户端 context。
 * @returns 还原全部包裹并停止监听的函数。
 */
function installWrappers(ctx: ClientContext): () => void {
  const restores: Array<() => void> = []
  const done = new Set<string>()

  /**
   * Step 0 诊断：`tool-call` 包裹的生效报告只打印一次。
   *
   * 为什么需要它：`wrapEntry` 在 entry 不存在、组件不可包裹、或 entry 被
   * 上游冻结时，都会**静默**降级为 NOOP（刻意设计——绝不让 DSH 崩溃）。
   * 但这意味着「插件不生效」与「官方行为」在真机上一模一样。
   *
   * Step 0 的全部意义就是证明「包裹官方工具行」零副作用，因此必须能区分
   * 这两种结果。只在 Step 0 的验证期需要，Step 2 后可保留（升级排查有用）。
   */
  let toolReportDone = false

  /**
   * 尝试包裹一个目标。
   * @param id - 去重标识。
   * @param target - slot 名与可选 key。
   * @param make - 包装器工厂。
   * @returns 该目标是否已包裹（本次成功，或此前已成功）。
   */
  const attempt = (id: string, target: { slot: string; key?: string }, make: (inner: ComponentType<never>) => ComponentType<never>): boolean => {
    if (done.has(id)) return true
    const entries = ctx.slots.entries(target.slot)
    const restore = wrapEntry(entries, target, make as never, TAG)
    if (restore === NOOP) return false
    done.add(id)
    restores.push(restore)
    return true
  }

  const sync = (): void => {
    attempt('flow', FLOW_TARGET, makeAutoFlow)
    attempt('assistant', ASSISTANT_TARGET, makeAutoAssistant)
    // Step 0 诊断：只报告一次，避免 `slots/changed` 重试时刷屏。
    if (!toolReportDone && attempt('tool', TOOL_TARGET, makeAutoToolCallTree)) {
      toolReportDone = true
      console.info(`${TAG} tool-call 包裹已生效（Step 0 诊断：未出现此行即表示包裹被静默降级）`)
    }
  }

  sync()
  // `tool-call` 与 `assistant-step` 同属 `conversation.chat.node`，此条件已覆盖两者。
  const off = ctx.on('slots/changed', (key: string) => {
    if (key === FLOW_TARGET.slot || key === ASSISTANT_TARGET.slot) sync()
  })

  return () => {
    off()
    for (const restore of restores.splice(0)) restore()
    done.clear()
  }
}

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
  client.effect(() => installWrappers(client), 'dsh-auto-expand: 包裹 flow、assistant-step 与 tool-call')

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
