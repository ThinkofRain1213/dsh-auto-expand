/**
 * 原地包裹工具。
 *
 * 为什么不是重新注册 slot：`SlotCore.register` 拒绝为已声明的子 slot 再声明一次
 * （`packages/client/ui-slots/src/index.ts` 的 "is already declared" 检查），
 * 而官方 flow entry 已声明 `conversation.chat.node`。不声明 children 就收不到
 * `renderSlot`，也就渲染不了任何行。因此只能改写 `entry.component`：
 * entry 的 children 声明、inject 工厂、locale 与 store 全部保留。
 *
 * 代价：这是未公开 API。所有失败都降级为"插件不生效"，绝不让 DSH 崩溃。
 */

/**
 * 本工具读写的 entry 形状。只声明真正用到的字段，避免依赖 slot 包的运行时值
 * （它只能做类型导入，见 tsdown 的 purity 门）。
 */
export interface StoredEntryLike {
  component: unknown
  options: { key?: string }
}

/** 包裹目标：slot 名 + keyed slot 的 key（single slot 省略 key）。 */
export interface WrapTarget {
  readonly slot: string
  readonly key?: string
}

/** 包装器工厂：接收原组件，返回替换它的组件。 */
export type WrapperFactory = (inner: never) => unknown

/**
 * 已包裹的组件 → 它包裹的**原始**组件。
 *
 * 用 Map 而不是 Set：接管一个既有包裹时需要知道该还原成什么。
 */
const wrappedComponents = new WeakMap<object, unknown>()

/**
 * 每条 entry 当前的包裹所有权令牌。
 *
 * 为什么需要：插件被重新应用时，新实例可能**先**跑起来、旧实例的异步销毁
 * **后**才完成。旧实现里旧实例的还原会无条件把 component 写回官方版本，
 * 把新实例的包裹一起抹掉——表现就是「自动展开突然失效，直到重启」。
 * 令牌保证只有当前所有者才能还原。
 */
const owners = new WeakMap<object, symbol>()

/**
 * 从候选组件中筛出可包裹的（函数或 exotic component）。
 * @param value - 待检查的组件值。
 * @returns 是否是可包裹的组件。
 */
export function isWrappable(value: unknown): boolean {
  return typeof value === 'function'
    || (typeof value === 'object' && value !== null && '$$typeof' in value)
}

/**
 * 在目标 entry 上原地替换 component。
 *
 * 幂等与所有权：
 *  - 同一 `inner` 不会被**叠加**包裹两次；
 *  - 若 `entry.component` 已经是本插件此前某个实例的包裹，本次调用**接管**
 *    所有权并返回一个受令牌保护的还原函数（而不是返回 NOOP 放任旧实例
 *    稍后把包裹撤掉）。
 *
 * 安全：entry 不存在、组件不可包裹、赋值被拒时都不抛错，只返回 NOOP 或记录警告。
 *
 * @param entries - 当前 slot 的全部注册项（来自 `ctx.slots.entries(slot)`）。
 * @param target - 目标 slot 与 key。
 * @param make - 包装器工厂。
 * @param tag - 日志前缀，便于定位是哪个包裹点失败。
 * @returns 还原函数；未发生包裹时返回空操作。
 */
export function wrapEntry(
  entries: readonly StoredEntryLike[],
  target: WrapTarget,
  make: WrapperFactory,
  tag: string,
): () => void {
  const entry = entries.find(candidate =>
    target.key === undefined || candidate.options.key === target.key)
  if (entry === undefined) return NOOP

  const token = Symbol('dsh-auto-expand wrapper owner')
  const current = entry.component

  // 已经是本插件的包裹（来自更早的实例）：接管，而不是再包一层。
  if (wrappedComponents.has(current as object)) {
    const original = wrappedComponents.get(current as object)
    owners.set(entry as object, token)
    return () => {
      if (owners.get(entry as object) !== token) return
      owners.delete(entry as object)
      if (entry.component === current) entry.component = original
    }
  }

  const inner = current
  if (!isWrappable(inner)) {
    console.warn(`${tag} 无法包裹 ${target.slot}${target.key === undefined ? '' : `:${target.key}`}`
      + '：组件不可包裹，插件在该位置不生效')
    return NOOP
  }

  let outer: unknown
  try {
    outer = make(inner as never)
  } catch (error) {
    console.error(`${tag} 构造 ${target.slot} 包装器失败，插件在该位置不生效`, error)
    return NOOP
  }
  if (!isWrappable(outer)) {
    console.error(`${tag} 为 ${target.slot} 构造的包装器不是组件，插件在该位置不生效`)
    return NOOP
  }

  try {
    entry.component = outer
  } catch (error) {
    // 上游若把 entry 冻结，这里就是失效点。降级而非抛错。
    console.error(`${tag} 无法写入 ${target.slot} 的 component（entry 可能被冻结），插件不生效`, error)
    return NOOP
  }

  wrappedComponents.set(outer as object, inner)
  owners.set(entry as object, token)
  return () => {
    // 已被更新的实例接管：不要还原，否则会把别人的包裹撤掉。
    if (owners.get(entry as object) !== token) return
    owners.delete(entry as object)
    if (entry.component === outer) entry.component = inner
  }
}

/** 空操作。 */
export const NOOP = (): void => {}
