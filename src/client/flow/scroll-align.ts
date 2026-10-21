/**
 * body 自动展开后的滚动定位判定。
 *
 * 单独成模块有唯一理由：它是纯函数，能被 `tests/scroll-align.spec.mjs`
 * 直接断言。滚动定位是 P2 修过两次的地方（`spec/FIX-SCROLL.md`），
 * 藏回组件内部就只能靠真机回归。
 */

/** 一次渲染的定位相关状态。 */
export interface ScrollAlignState {
  /** body 当前是否展开（含用户手动覆盖）。 */
  readonly open: boolean
  /** 当前展示模式是否保留 400px 高度上限（即 body 是否有内部滚动）。 */
  readonly grouped: boolean
  /** 展开状态是否仍跟随自动策略（未被用户手动覆盖）。 */
  readonly followsAuto: boolean
}

/**
 * 判断是否需要为一次自动展开补做底部定位。
 *
 * 三个条件缺一不可：
 *  - `open`：折叠态没有可滚动内容；
 *  - `grouped`：平铺模式（`.expandedBody`）没有高度上限，body 不滚动；
 *  - `followsAuto`：用户手动展开时必须交给官方 `toggle` 定位，否则已完成
 *    的 group 会被强行滚到底部，与官方（滚到顶部）不一致。
 *
 * 触发时机是 `open` / `grouped` / `followsAuto` 任一翻转，以及首次挂载。
 * `grouped` 参与判定尤其关键：Turn 从"平铺"切到"带高度上限"时，body 才
 * 第一次出现内部滚动，那才是需要定位的时刻。
 * @param previous - 上一次渲染的状态；`null` 表示首次挂载。
 * @param current - 本次渲染的状态。
 * @returns 是否需要定位到底部。
 */
export function shouldAlignBody(
  previous: ScrollAlignState | null,
  current: ScrollAlignState,
): boolean {
  if (!current.open || !current.grouped || !current.followsAuto) return false
  if (previous === null) return true
  return previous.open !== current.open
    || previous.grouped !== current.grouped
    || previous.followsAuto !== current.followsAuto
}
