/**
 * Host 半边：本插件的持久化设置。
 *
 * 本插件的行为全部发生在浏览器渲染层，唯一的 Host 职责是**保存两个开关**，
 * 让它们跨重启保留，并被浏览器通过 `configForms` 读到。
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

/** 两个开关的默认值：默认全开（插件的核心价值）。 */
export const DEFAULT_GROUP_AUTO_EXPAND = true
export const DEFAULT_REASONING_AUTO_EXPAND = true

/** 本插件的持久化设置。 */
export interface AutoExpandSettings {
  /** 当前运行的 process group body 是否自动展开。 */
  groupAutoExpand: boolean
  /** 流式中的思考块是否自动展开。 */
  reasoningAutoExpand: boolean
}

/** 运行时设置投影到浏览器。 */
export interface Config {
  groupAutoExpand: Volatile<boolean>
  reasoningAutoExpand: Volatile<boolean>
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
