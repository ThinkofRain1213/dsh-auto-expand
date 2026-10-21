/**
 * 浏览器半边的挂载入口。
 *
 * 本插件不注册任何 slot，而是**原地包裹**两个已注册的渲染组件：
 *
 *  1. `conversation.chat.flow`        —— 承载第二层（process group body）的展开策略
 *  2. `conversation.chat.node`
 *     key `assistant-step`            —— 承载第三层（思考块）的展开策略
 *
 * 选择原地包裹而非重新注册的原因见 `wrap.ts` 与 `spec/DESIGN.md` 第 4 节：
 * 官方 entry 已声明我们需要的子 slot，重新注册会被 SlotCore 拒绝；而
 * `entriesOfSlot` 对 single slot 只返回首个 entry，第二个注册永远不会渲染。
 *
 * P1 阶段：两个包裹点都是 **pass-through**（原样渲染），只验证包裹技法本身
 * 可行——能找到 entry、能替换组件、新组件能拿到完整的 renderSlot / inject /
 * store / locale props、卸载后能还原。行为与官方完全一致。
 */
import { createElement, type ComponentType } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import { NOOP, wrapEntry, type StoredEntryLike } from './wrap.ts'

/** 日志前缀。 */
const TAG = '[dsh-auto-expand]'

/**
 * 本插件依赖的 cordis 服务。
 *
 * `slots` 是唯一硬依赖（包裹的目标）。包裹本身另有 `slots/changed` 重试兜底，
 * 因此即使激活顺序不理想也不会漏包。
 */
export const inject = ['slots']

/**
 * 包裹目标形状。`ctx.slots` 的类型来自 `@deepseek-ai/dsh-client-ui-slots` 的
 * 声明合并，这里只取用到的两个方法，避免把整个 registry 类型拖进来。
 */
interface SlotsService {
  entries(key: string): readonly StoredEntryLike[]
}

/** 带 `slots` 与事件订阅能力的客户端 context。 */
type ClientContext = Context & {
  readonly slots: SlotsService
  on(name: string, listener: (...args: never[]) => void): () => void
}

/** 包裹目标：flow（single slot，无 key）。 */
const FLOW_TARGET = { slot: 'conversation.chat.flow' } as const

/** 包裹目标：assistant-step（keyed slot）。 */
const ASSISTANT_TARGET = { slot: 'conversation.chat.node', key: 'assistant-step' } as const

/**
 * 构造一个 pass-through 包装器。
 *
 * 它接受被包裹的原组件，返回一个转发全部 props 的新组件。P1 阶段用它验证
 * 包裹链路；后续阶段会在这里换成真正的实现（AutoFlow / AutoAssistantNodeView）。
 *
 * 刻意不做 memo：包装层只转发 props，memo 与否不影响正确性，而原组件本身
 * 已经是 memo 的，重复 memo 只会增加比较成本。
 * @param inner - 被包裹的原组件。
 * @returns 转发全部 props 的包装组件。
 */
function makePassThrough(inner: ComponentType<never>): ComponentType<never> {
  const PassThrough = (props: never): ReturnType<typeof createElement> =>
    createElement(inner as ComponentType<never>, props)
  // 调试用：让 React DevTools 显示来源，也让重复包裹在日志里可辨认。
  const name = (inner as { displayName?: string }).displayName ?? inner.name
  PassThrough.displayName = `AutoExpand(${name === '' ? 'Anonymous' : name})`
  return PassThrough
}

/**
 * 在 slot 变化后重新尝试包裹，直到两个目标都成功。
 *
 * 包裹必须等官方 entry 注册之后才能进行，而插件激活顺序与 slot 注册顺序
 * 没有硬保证，因此这里订阅 `slots/changed` 做重试。每次事件后重新读取
 * `ctx.slots.entries(...)`，因为 entry 数组会在注册变化时被替换。
 * @param ctx - 客户端 context。
 * @returns 还原全部包裹并停止监听的函数。
 */
function installWrappers(ctx: ClientContext): () => void {
  const restores: Array<() => void> = []
  // 每个目标只包裹一次；包裹成功后置位，避免 slots/changed 反复触发重复包裹。
  const done = new Set<string>()

  /**
   * 尝试包裹一个目标。
   * @param id - 去重标识。
   * @param target - slot 名与可选 key。
   */
  const attempt = (id: string, target: { slot: string; key?: string }): void => {
    if (done.has(id)) return
    const entries = ctx.slots.entries(target.slot)
    const restore = wrapEntry(entries, target, makePassThrough as never, TAG)
    if (restore === NOOP) return
    done.add(id)
    restores.push(restore)
  }

  const sync = (): void => {
    attempt('flow', FLOW_TARGET)
    attempt('assistant', ASSISTANT_TARGET)
  }

  sync()
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
 * @param ctx - 客户端 context，携带 slot 注册表。
 */
export function apply(ctx: Context): void {
  ctx.effect(() => installWrappers(ctx as ClientContext), 'dsh-auto-expand: 包裹 flow 与 assistant-step')
}
