/**
 * 自动状态 + 一次性手动覆盖的 disclosure。
 *
 * 为什么不用官方 `use-disclosure.ts`：官方语义是"重置版本变化时整体重置"，
 * 而本插件需要的是"自动状态变化时丢弃手动覆盖、之后由手动接管"。两者在
 * "折叠只触发一次"这一点上不同。
 *
 * 为什么用派生态而非 useEffect：`useEffect` 会在自动转换后先渲染一帧旧状态，
 * 视觉上是一次闪烁。渲染期 setState 会让 React 立即重跑本组件，不产生额外帧。
 * 这与 `ui-renderer` 的 `useMaybeIncarnation`（scoped-slots.tsx:737-765）同源。
 */
import { useCallback, useState } from 'react'

/** 自动状态 + 一次性手动覆盖的 disclosure。 */
export interface AutoDisclosure {
  /** 当前是否展开。 */
  readonly open: boolean
  /**
   * 当前展开状态是否仍跟随自动状态（即未被用户覆盖）。
   *
   * 用于区分"插件自动展开"与"用户手动展开"：前者需要补滚动定位，
   * 后者必须交给官方 `toggle`，否则已完成的 group 会被强行滚到底部。
   */
  readonly following: boolean
  /** 用户显式设置展开状态。 */
  setOpen(open: boolean): void
  /** 用户切换展开状态。 */
  toggle(): void
}

/**
 * 跟随自动状态的 disclosure，允许用户覆盖一次。
 *
 * `autoOpen` 一旦变化，手动覆盖立即丢弃，渲染回到新的 `autoOpen`。
 * 这条规则实现"折叠只触发一次"：group 从"未关闭"变"已关闭"时自动折叠，
 * 此后 `autoOpen` 恒为 false，用户手动展开即永久保持。
 *
 * @param autoOpen - 当前"应当处于"的自动状态。
 * @returns 当前展开状态、是否仍跟随自动，以及用户操作。
 */
export function useAutoDisclosure(autoOpen: boolean): AutoDisclosure {
  // 已观察到的 autoOpen。与当前值不同说明发生了自动转换。
  const [seen, setSeen] = useState(autoOpen)
  // 用户覆盖。undefined 表示跟随自动。
  const [override, setOverride] = useState<boolean | undefined>(undefined)

  // 派生态：渲染期检测变化并同步。React 的 setState-during-render 会立即
  // 重跑本组件，不产生额外的可见帧。
  if (autoOpen !== seen) {
    setSeen(autoOpen)
    setOverride(undefined)
  }

  const open = override ?? autoOpen
  const setOpen = useCallback((next: boolean) => { setOverride(next) }, [])
  const toggle = useCallback(() => {
    // `prev` 可能是 undefined（跟随自动），此时以当前 autoOpen 取反。
    setOverride(prev => !(prev ?? autoOpen))
  }, [autoOpen])

  return { open, following: override === undefined, setOpen, toggle }
}
