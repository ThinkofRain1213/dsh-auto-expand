/**
 * 所属操作组的展开状态与两个坐标，供内层行（思考行、工具行）判断收起时机。
 *
 * ## 四个字段
 *
 * - `open` —— body 的**实际**展开状态（含用户的手动覆盖）；
 * - `auto` —— 该操作组是否处于**当前轮的自动展开窗口**
 *   （`AutoGroupSeat` 已有的 `settings.groupAutoExpand && !(closed === true)`）；
 * - `latestStep` —— 本组**最新成员**的 `step`（批次坐标），供「下一批操作出现时」；
 * - `latestStartedAnchorSeq` —— 本组**最新一条已开始的操作**的 `anchorSeq`
 *   （操作坐标），供「下一条操作出现时」。
 *
 * `open` 与 `auto` 必须分开：历史操作组被用户手动展开时 `open === true` 但
 * `auto === false`，若内层行只看 `open`，用户一展开历史大段，里面的行就会全部
 * 自动弹出，直接破坏「历史轮次完全不受影响」的承诺（`CAPABILITY-MATRIX.md` E1）。
 *
 * ## 为什么要两个坐标
 *
 * | 坐标 | 语义 | 用途 |
 * |---|---|---|
 * | `step` | **批次**：一次模型输出派发的全部操作共享同一值 | 同批多条**一起**展开 |
 * | `anchorSeq` | **单条**：每个节点唯一 | 串行时「永远只留最新的一条操作」 |
 *
 * ## 为什么操作坐标必须带「已开始」
 *
 * 工具节点在**流式阶段**（`preparing`）就已被创建，`anchorSeq` 此时已经定死。
 * 若直接取「成员里最大的 anchorSeq」，同一次模型输出派发的多条工具会在执行前
 * 就分出胜负——最后一条永远最大，其余几条永远不展开（真机已复现）。
 *
 * 只统计**已开始**（走出 `preparing`）的成员，最新者才会随执行推进而前移：
 *
 * | 时刻 | 已开始成员 | `latestStartedAnchorSeq` |
 * |---|---|---|
 * | 三条都在 preparing | 只有思考节点 | 思考的 anchorSeq |
 * | A 开始执行 | 思考、A | A |
 * | A 完成、B 未开始 | 思考、A | A（A 保持展开） |
 * | B 开始执行 | 思考、A、B | B（A 收起、B 展开） |
 *
 * ## 默认值
 *
 * `open: true` 沿用 P3 以来的取值：`groupPart === 'response'` 的渲染发生在
 * 组之外、没有 Provider，取默认值不影响——响应区没有思考块。
 * `auto: false` 保证没有 Provider 时不会有任何内层行被自动展开。
 * 两个坐标的 `undefined` 被 `isLatestStep` / `isLatestAnchor` 视为「最新」——
 * **信息缺失时保守地保持展开**，而不是错误地收起。
 */
import { createContext } from 'react'

/** 所属操作组的展开状态与两个坐标。 */
export interface GroupOpenState {
  /** body 当前是否展开（含用户手动覆盖）。 */
  readonly open: boolean
  /** 该操作组是否处于「当前轮的自动展开窗口」。 */
  readonly auto: boolean
  /** 本组最新成员的 `step`（批次坐标）；尚无成员时为 `undefined`。 */
  readonly latestStep: number | undefined
  /**
   * 本组**最新一条已开始的操作**的 `anchorSeq`（操作坐标）；尚无已开始成员时为 `undefined`。
   *
   * 「已开始」= 思考节点（恒已开始）或走出 `preparing` 的工具节点。
   */
  readonly latestStartedAnchorSeq: number | undefined
}

/** 所属操作组的状态；无 Provider 时按「展开、但不自动展开内层行」处理。 */
export const GroupOpenContext = createContext<GroupOpenState>({
  open: true,
  auto: false,
  latestStep: undefined,
  latestStartedAnchorSeq: undefined,
})
