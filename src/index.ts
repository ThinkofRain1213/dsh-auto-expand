/**
 * Host 半边：本插件的持久化设置。
 *
 * 本插件的行为全部发生在浏览器渲染层，唯一的 Host 职责是**保存设置**：
 * 三个自动展开开关，以及思考 / 工具各自的收起时机。它们跨重启保留，并被
 * 浏览器通过 `configForms` 读到。
 *
 * 机制说明（与 `ui-chat` 同构）：
 *  - 导出的 `Config` 是本 Loader entry 的设置 schema，Host 据此建立一个
 *    以 entry id 为命名空间的设置段落；
 *  - `settings.configure({ auto: false })` 只是**关闭自动生成的设置页**
 *    （我们有自己的卡片），不影响 schema 本身；
 *  - 浏览器端用 `ctx.configForms.get(entryId)` 读写这个命名空间。
 *
 * 不导出 `Config` 的话，`configForms.get()` 会拿到空 schema，写操作被拒。
 */
import type { Context, Volatile } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'

/** 浏览器读取本插件设置时使用的命名空间（= 本 Loader entry id）。 */
export const AUTO_EXPAND_NAMESPACE = 'auto-expand'

/** 设置字段名。 */
export const GROUP_AUTO_EXPAND_FIELD = 'groupAutoExpand'
export const REASONING_AUTO_EXPAND_FIELD = 'reasoningAutoExpand'
export const TOOL_AUTO_EXPAND_FIELD = 'toolAutoExpand'
export const REASONING_COLLAPSE_TIMING_FIELD = 'reasoningCollapseTiming'
export const TOOL_COLLAPSE_TIMING_FIELD = 'toolCollapseTiming'
export const INSPECT_BUTTON_HIDE_SCOPE_FIELD = 'inspectButtonHideScope'

/** 三个开关的默认值：默认全开（插件的核心价值）。 */
export const DEFAULT_GROUP_AUTO_EXPAND = true
export const DEFAULT_REASONING_AUTO_EXPAND = true
export const DEFAULT_TOOL_AUTO_EXPAND = true

/**
 * 收起时机的全部取值，**顺序 = 收起由早到晚**（与下拉展示顺序一致）。
 *
 * 思考与工具**共用这一份**：两者都由操作组提供同样的两个坐标（`step` 批次 /
 * `anchorSeq` 操作），四个时机对两方都真实成立。此前曾给思考裁掉
 * `'next-call'`，那是人为制造的不对称，已废弃（2026-10-23）。
 *
 * 与浏览器半边的 `src/client/collapse-timing.ts` 必须逐字一致——两份常量分属
 * 两个 bundle，没有类型系统能把它们串起来（`contract-consistency` 测试会守住）。
 */
export const COLLAPSE_TIMINGS = ['self', 'next-call', 'next-node', 'group'] as const

/** 收起时机。 */
export type CollapseTiming = typeof COLLAPSE_TIMINGS[number]

/** 思考的收起时机（与工具同一取值集合）。 */
export type ReasoningCollapseTiming = CollapseTiming

/** 工具的收起时机（与思考同一取值集合）。 */
export type ToolCollapseTiming = CollapseTiming

/**
 * 默认时机：思考与工具**都默认「下一批操作出现时」**（`'next-node'`，
 * 2026-10-23 用户指定）。
 *
 * 语义：该行的内容保持可见，直到组内出现更新的一批（下一次模型输出派发的
 * 操作）才收起——这样「当前正在做的那件事」始终可见，而做完的部分自动让位。
 *
 * ⚠️ 这两个默认值**不等于 P8 之前的旧行为**（旧行为是思考 `'self'`、工具
 * `'group'`）。改默认值会让已安装用户的行为发生变化，因此必须是用户的明确决定。
 */
export const DEFAULT_REASONING_COLLAPSE_TIMING: ReasoningCollapseTiming = 'next-node'
export const DEFAULT_TOOL_COLLAPSE_TIMING: ToolCollapseTiming = 'next-node'

/**
 * 「查看」按钮的隐藏范围取值，**顺序 = 下拉展示顺序 = 从松到紧**。
 *
 * - `'off'`：不隐藏（**默认**），逐字等价于未安装本插件；
 * - `'current'`：仅当前轮隐藏，历史操作组保持官方行为；
 * - `'all'`：全部轮次隐藏。
 *
 * 与浏览器半边的 `src/client/inspect-button-scope.ts` 必须逐字一致
 * （`contract-consistency` 测试会守住）。
 */
export const INSPECT_BUTTON_HIDE_SCOPES = ['off', 'current', 'all'] as const

/** 查看按钮的隐藏范围。 */
export type InspectButtonHideScope = typeof INSPECT_BUTTON_HIDE_SCOPES[number]

/**
 * 隐藏范围的默认值：`'off'`（不隐藏）。
 *
 * ⚠️ 必须是 `off`：改成别的会让已安装用户升级后**凭空少一个入口**。
 */
export const DEFAULT_INSPECT_BUTTON_HIDE_SCOPE: InspectButtonHideScope = 'off'

/** 操作组自定义高度的字段名（与浏览器半边 `group-height.ts` 同源）。 */
export const GROUP_HEIGHT_UNLIMITED_FIELD = 'groupHeightUnlimited'
export const GROUP_HEIGHT_PERCENT_FIELD = 'groupHeightPercent'
export const GROUP_HEIGHT_HISTORY_FIELD = 'groupHeightHistory'

/** 高度百分比的默认值：100 = 官方原公式，逐像素相同。 */
export const DEFAULT_GROUP_HEIGHT_PERCENT = 100

/** 本插件的持久化设置。 */
export interface AutoExpandSettings {
  /** 当前运行的 process group body 是否自动展开。 */
  groupAutoExpand: boolean
  /** 流式中的思考块是否自动展开。 */
  reasoningAutoExpand: boolean
  /** 当前运行的 process group 内的工具行是否自动展开。 */
  toolAutoExpand: boolean
  /** 思考行的收起时机（与工具同一取值集合）。 */
  reasoningCollapseTiming: ReasoningCollapseTiming
  /** 工具行的收起时机（与思考同一取值集合）。 */
  toolCollapseTiming: ToolCollapseTiming
  /** 工具行「查看」按钮的隐藏范围。 */
  inspectButtonHideScope: InspectButtonHideScope
  /** 操作组是否**不限制**高度。 */
  groupHeightUnlimited: boolean
  /** 高度百分比；100 = 官方默认，**逐像素相同**。 */
  groupHeightPercent: number
  /** 历史轮次的操作组是否也应用自定义高度。 */
  groupHeightHistory: boolean
}

/** 运行时设置投影到浏览器。 */
export interface Config {
  groupAutoExpand: Volatile<boolean>
  reasoningAutoExpand: Volatile<boolean>
  toolAutoExpand: Volatile<boolean>
  reasoningCollapseTiming: Volatile<ReasoningCollapseTiming>
  toolCollapseTiming: Volatile<ToolCollapseTiming>
  inspectButtonHideScope: Volatile<InspectButtonHideScope>
  groupHeightUnlimited: Volatile<boolean>
  groupHeightPercent: Volatile<number>
  groupHeightHistory: Volatile<boolean>
}

/**
 * 设置 schema。
 *
 * `.default(...)` 在 parse 时生效，因此旧存档（缺字段）会读出默认值，
 * 无需迁移逻辑。
 */
export const Config = z.object({
  [GROUP_AUTO_EXPAND_FIELD]: z.boolean().default(DEFAULT_GROUP_AUTO_EXPAND).volatile(),
  [REASONING_AUTO_EXPAND_FIELD]: z.boolean().default(DEFAULT_REASONING_AUTO_EXPAND).volatile(),
  [TOOL_AUTO_EXPAND_FIELD]: z.boolean().default(DEFAULT_TOOL_AUTO_EXPAND).volatile(),
  // enum 写法照官方 `ui-chat/src/chat-settings.ts:75`。
  // 两个字段**共用同一取值集合**（思考与工具的真实坐标相同）。
  [REASONING_COLLAPSE_TIMING_FIELD]: z.union([...COLLAPSE_TIMINGS])
    .default(DEFAULT_REASONING_COLLAPSE_TIMING).volatile(),
  [TOOL_COLLAPSE_TIMING_FIELD]: z.union([...COLLAPSE_TIMINGS])
    .default(DEFAULT_TOOL_COLLAPSE_TIMING).volatile(),
  [INSPECT_BUTTON_HIDE_SCOPE_FIELD]: z.union([...INSPECT_BUTTON_HIDE_SCOPES])
    .default(DEFAULT_INSPECT_BUTTON_HIDE_SCOPE).volatile(),
  [GROUP_HEIGHT_UNLIMITED_FIELD]: z.boolean().default(false).volatile(),
  // 百分比回到普通的 `.natural().default(100)`：100 就是官方默认，逐像素相同。
  // `.natural()` 同时挡住负数与小数（实测：`z.number()` 两者都放过）。
  [GROUP_HEIGHT_PERCENT_FIELD]: z.natural().default(DEFAULT_GROUP_HEIGHT_PERCENT).volatile(),
  [GROUP_HEIGHT_HISTORY_FIELD]: z.boolean().default(false).volatile(),
})

/**
 * Host 半边用到的 context 形状。
 *
 * cordis 的 `Context` 是动态代理：`inject`/`effect`/`fiber`/`settings` 由反射层
 * 在运行时提供，不在静态类型上（见 `cordis/lib/types/context.d.ts`），因此这里
 * 显式声明。官方插件在各自主机入口里用的是同样的处理。
 */
interface AutoExpandHostContext {
  /** 可选依赖注入：`settings` 就绪后才执行回调。 */
  inject(deps: readonly string[], callback: (scope: AutoExpandHostContext) => void): unknown
  /** 注册由本 fiber 拥有的副作用。 */
  effect(callback: () => () => void, label?: string): () => void
  /** 本插件的 fiber，作为设置页策略的归属。 */
  fiber: unknown
  /** 官方设置服务（只用 `configure`）。 */
  settings: {
    /**
     * 注册本插件的设置页策略。
     * @param presentation - `auto: false` 表示不生成自动设置页。
     * @param owner - 策略归属的 fiber。
     * @returns 注销函数。
     */
    configure(presentation: { auto?: boolean }, owner?: unknown): () => void
  }
}

/**
 * 挂载 Host 半边。
 *
 * 只做一件事：注册一条页面策略，声明本插件的设置**不使用**自动生成的设置页
 * ——因为它有自己的卡片（浏览器的 `plugins.bundle.config` 槽位）。
 *
 * 用 `ctx.inject(['settings'], ...)` 而不是 `ctx.get('settings')` 判空：
 * 后者在 `apply` 那一刻读取，`settings` 晚到就永久错过，结果是插件详情页
 * 同时出现官方自动设置页和本插件的卡片。`inject` 没有这个竞态。
 * @param ctx - 插件 context。
 */
export function apply(ctx: Context): void {
  const host = ctx as unknown as AutoExpandHostContext
  host.inject(['settings'], (scope) => {
    scope.effect(
      () => scope.settings.configure({ auto: false }, host.fiber),
      'dsh-auto-expand: 设置页策略',
    )
  })
}
