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
import {
  autoOpenFor, isLatestAnchor, isLatestStep, type CollapseTiming,
} from '../collapse-timing.ts'

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

// ── 完整判据：三合取 + 收起时机 ─────────────────────────────────────────

/** {@link toolRowAutoOpen} 的输入。 */
export interface ToolRowAutoOpenInput extends ToolAutoOpenInput {
  /** 收起时机（四档）。 */
  readonly timing: CollapseTiming
  /** 本条（根调用）是否已完成。 */
  readonly done: boolean
  /** 本条是否已经开始执行（走出 `preparing`）。 */
  readonly started: boolean
  /** 本条所属节点的 `step`（批次坐标）。 */
  readonly step: number
  /** 本条所属节点的 `anchorSeq`（操作坐标）。 */
  readonly anchorSeq: number
  /** 所属操作组最新一批的 `step`。 */
  readonly latestStep: number | undefined
  /** 所属操作组最新一条**已开始**操作的 `anchorSeq`。 */
  readonly latestStartedAnchorSeq: number | undefined
}

/**
 * 判断某个工具行**此刻是否应处于自动展开状态**。
 *
 * 这把「三合取」（{@link toolAutoOpen}）与「收起时机」（`autoOpenFor`）合成
 * 一个判据，是工具行状态的**唯一来源**：
 *
 * | 调用方 | 用途 |
 * |---|---|
 * | `use-tool-disclosure.ts` | 决定这一行是否展开 |
 * | `AutoToolCallTree.tsx` | 决定「查看」按钮是否隐藏（P9） |
 *
 * ## 为什么必须共用
 *
 * 「运行中隐藏查看按钮」的语义就是「这一行还展开着 → 藏按钮；收起了 → 交回
 * 官方」。若两处各算各的，就会出现「行已经收起了、按钮却还藏着」这种不一致。
 * 因此这里抽成一个纯函数，两处调用**同一个**。
 *
 * @param input - 三合取条件、收起时机与两个坐标。
 * @returns 是否应自动展开。
 */
export function toolRowAutoOpen(input: ToolRowAutoOpenInput): boolean {
  return autoOpenFor({
    timing: input.timing,
    done: input.done,
    // 「下一批操作出现时」用批次坐标（同 step 一起展开）。
    isLatestBatch: isLatestStep(input.step, input.latestStep),
    // 「下一条操作出现时」用操作坐标（只留最新一条**已开始**的操作）。
    // 未开始的行（参数还在流式）一律不展开：它们还没轮到。
    isLatestNode: input.started && isLatestAnchor(input.anchorSeq, input.latestStartedAnchorSeq),
    enabled: toolAutoOpen({
      toolAutoExpand: input.toolAutoExpand,
      groupOpen: input.groupOpen,
      groupAuto: input.groupAuto,
    }),
  })
}