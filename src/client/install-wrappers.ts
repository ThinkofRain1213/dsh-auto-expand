/**
 * 包裹安装逻辑。
 *
 * 刻意与 React 组件实现分离：这里只处理「往 slot entry 上写 component」的
 * 生命周期，不 import 任何 UI 代码，因此可以被 `node --test` 直接加载做单测。
 *
 * 背景：插件通过**原地替换 `entry.component`** 接管渲染。这种做法的最大
 * 风险不是渲染本身，而是**所有权**——谁装的、谁该还原、另一个实例（或另一个
 * 插件）后来改过没有。本项目已经踩过一次（见 `spec/P4-ROLLBACK.md`），
 * 这里把所有权规则集中在一处。
 */
import type { ComponentType } from 'react'
import { NOOP, wrapEntry, type StoredEntryLike } from './wrap.ts'

/** `ctx.slots` 的最小形状：只取用到的部分。 */
export interface SlotsService {
  entries(key: string): readonly StoredEntryLike[]
  inject(key: string, callback: () => () => void): () => void
  register(options: Record<string, unknown>, component: unknown): () => void
}

/** 本模块需要的客户端 context。 */
export interface WrapperContext {
  readonly slots: SlotsService
  on(event: 'slots/changed', listener: (key: string) => void): () => void
}

/** 三个包裹目标各自的组件。 */
export interface WrapperComponents {
  /** `conversation.chat.flow` 的替代组件。 */
  readonly flow: ComponentType<never>
  /** `conversation.chat.node:assistant-step` 的替代组件。 */
  readonly assistant: ComponentType<never>
  /** `conversation.chat.node:tool-call` 的包装器工厂。 */
  readonly tool: (inner: ComponentType<never>) => ComponentType<never>
}

/** 包裹目标：flow（single slot，无 key）。 */
export const FLOW_TARGET = { slot: 'conversation.chat.flow' } as const

/** 包裹目标：assistant-step（keyed slot）。 */
export const ASSISTANT_TARGET = { slot: 'conversation.chat.node', key: 'assistant-step' } as const

/** 包裹目标：tool-call（keyed slot）。 */
export const TOOL_TARGET = { slot: 'conversation.chat.node', key: 'tool-call' } as const

/**
 * 在 slot 变化后重新尝试包裹，直到三个目标都成功。
 *
 * 包裹必须等官方 entry 注册之后才能进行，而插件激活顺序与 slot 注册顺序
 * 没有硬保证，因此这里订阅 `slots/changed` 做重试。每次事件后重新读取
 * `ctx.slots.entries(...)`，因为 entry 数组会在注册变化时被替换。
 * @param ctx - 客户端 context。
 * @param components - 三个目标各自的组件实现。
 * @param tag - 日志前缀。
 * @returns 还原全部包裹并停止监听的函数。
 */
export function installWrappers(
  ctx: WrapperContext,
  components: WrapperComponents,
  tag = '[dsh-auto-expand]',
): () => void {
  const restores: Array<() => void> = []
  /**
   * 已安装记录：entry 对象身份 + 当时写入的组件身份。
   *
   * 不能用一个只增不减的 `done` 集合：槽位条目可能被重建（新对象、组件回到
   * 官方实现），那时必须重新包裹；否则 `slots/changed` 来了也会被当成
   * 「已完成」跳过，自动展开静默失效。
   */
  const installed = new Map<string, { entry: StoredEntryLike; component: unknown }>()

  /**
   * Step 0 诊断：`tool-call` 包裹的生效报告只打印一次。
   *
   * 为什么需要它：`wrapEntry` 在 entry 不存在、组件不可包裹、或 entry 被
   * 上游冻结时，都会**静默**降级为 NOOP（刻意设计——绝不让 DSH 崩溃）。
   * 但这意味着「插件不生效」与「官方行为」在真机上一模一样。
   */
  let toolReportDone = false

  /**
   * 尝试包裹一个目标。
   * @param id - 去重标识。
   * @param target - slot 名与可选 key。
   * @param make - 包装器工厂。
   * @returns 该目标是否已包裹（本次成功，或此前已成功）。
   */
  const attempt = (
    id: string,
    target: { slot: string; key?: string },
    make: (inner: ComponentType<never>) => ComponentType<never>,
  ): boolean => {
    const entries = ctx.slots.entries(target.slot)
    const entry = entries.find(candidate =>
      target.key === undefined || candidate.options.key === target.key)
    if (entry === undefined) return false

    const record = installed.get(id)
    // 同一条 entry 且组件仍是本插件写入的那个：已经装好，无需动作。
    if (record !== undefined && record.entry === entry && record.component === entry.component) {
      return true
    }

    const restore = wrapEntry(entries, target, make as never, tag)
    if (restore === NOOP) return false
    installed.set(id, { entry, component: entry.component })
    restores.push(restore)
    return true
  }

  const sync = (): void => {
    attempt('flow', FLOW_TARGET, () => components.flow)
    attempt('assistant', ASSISTANT_TARGET, () => components.assistant)
    // Step 0 诊断：只报告一次，避免 `slots/changed` 重试时刷屏。
    if (!toolReportDone && attempt('tool', TOOL_TARGET, components.tool)) {
      toolReportDone = true
      console.info(`${tag} tool-call 包裹已生效（Step 0 诊断：未出现此行即表示包裹被静默降级）`)
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
    installed.clear()
  }
}
