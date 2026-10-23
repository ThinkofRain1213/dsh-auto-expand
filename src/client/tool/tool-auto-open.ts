/**
 * 工具行自动展开的判据（纯函数）。
 *
 * 单独成模块的理由与 `scroll-align.ts` / `settings-card-state.ts` 相同：
 * 这是有分支的判定逻辑，必须能被直接断言。hook 需要 React dispatcher，
 * 但「这一行该不该自动展开」是纯数据推导。
 *
 * ## 为什么是三个条件的合取
 *
 * ```
 * toolAutoOpen = 开关 && 本组 body 展开 && 本组处于当前轮的自动展开窗口
 * ```
 *
 * **第三个条件是最容易漏掉的一个。** `groupOpen` 单独用会出问题：
 * 用户手动展开一个**历史** group 时 `groupOpen` 为真，若只看它，历史大段里
 * 的工具行就会全部自动弹出，直接破坏本插件「历史轮次完全不受影响」的核心
 * 承诺（`spec/CAPABILITY-MATRIX.md` E1）。
 *
 * `groupAuto` 取 `AutoGroupSeat` 里已有的
 * `settings.groupAutoExpand && !(closed === true)`——它恰好就是「这一组是不是
 * 当前轮里正在自动展开的那一组」。
 *
 * 四种组合的语义见 `spec/P7-PLAN.md` §3.1。
 */

/** 判据输入。 */
export interface ToolAutoOpenInput {
  /** 用户开关：工具行是否自动展开。 */
  readonly toolAutoExpand: boolean
  /** 所属 group body 当前是否展开（含用户手动覆盖）。 */
  readonly groupOpen: boolean
  /** 所属 group 是否处于「当前轮的自动展开窗口」。 */
  readonly groupAuto: boolean
}

/**
 * 判断某个工具行是否应处于自动展开状态。
 * @param input - 用户开关与本组的两个状态。
 * @returns 是否自动展开。
 */
export function toolAutoOpen(input: ToolAutoOpenInput): boolean {
  return input.toolAutoExpand && input.groupOpen && input.groupAuto
}