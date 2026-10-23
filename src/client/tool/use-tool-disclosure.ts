/**
 * 工具行的自动展开 hook。
 *
 * 它会被交给官方 `ToolCallTree` 的 `useDisclosure` prop，因此必须满足官方契约
 * （`ui-chat/src/client/contract/slots.ts:159`）：
 *
 * ```ts
 * type UseDisclosure = () => { expanded, setExpanded, toggle }
 * ```
 *
 * 即「无参调用、每次调用拥有独立状态」。官方 `ToolRow` 正是按这个契约
 * 无条件调用它的（`ui-tool/.../components/ToolRow.tsx:153`）。
 *
 * ## 判据由两段组成
 *
 * 1. **`enabled`** —— 由 `toolAutoOpen()` 算：开关 && 组展开 && 当前轮自动展开窗口；
 * 2. **时机** —— 由 `autoOpenFor()` 算：`self`（本条完成即收）/ `next-call`
 *    （下一条操作出现即收）/ `next-node`（下一批操作出现即收）/ `group`（随组收）。
 *
 * 四个时机、同一段判据，与思考行**逐字相同**——两者的差别只在信号怎么取，
 * 不在判据本身（见 `collapse-timing.ts` 头部）。
 *
 * ## 信号来源
 *
 * | 信号 | 来源 |
 * |---|---|
 * | `done` | `ToolRowContext.done`（根调用进入 `result` 阶段） |
 * | `isLatestBatch` | `ToolRowContext.step` vs `GroupOpenContext.latestStep` |
 * | `isLatestNode` | `ToolRowContext.anchorSeq` vs `GroupOpenContext.latestStartedAnchorSeq`，且本行 `started` 为真 |
 * | `timing` | `settings.toolCollapseTiming` |
 *
 * ## 引用稳定性（关键）
 *
 * 官方 `ToolCall` 把 `useDisclosure` 列入 `useMemo` 的依赖
 * （`ui-tool/.../ToolCallTree.tsx:39`），工厂引用一旦每次渲染都变，官方的
 * `owner` 对象就会反复重建。本文件导出的是**模块级函数**，引用天然恒定，
 * 所以调用方不需要再包一层 `useMemo`。
 */
import { useContext } from 'react'
import type { UseDisclosure } from '../contract/slots.ts'
import { useAutoDisclosure } from '../auto-disclosure.ts'
import { useAutoExpandSettings } from '../settings.ts'
import { GroupOpenContext } from '../group-open-context.ts'
import { autoOpenFor, isLatestAnchor, isLatestStep } from '../collapse-timing.ts'
import { toolAutoOpen } from './tool-auto-open.ts'
import { ToolRowContext } from './tool-row-context.ts'

/**
 * 官方工具行的自动展开状态。
 *
 * 契约与官方 `UseDisclosure` 完全一致：无参、每次调用独立持有状态、
 * 返回 `{ expanded, setExpanded, toggle }`。
 * @returns 当前展开状态与用户操作。
 */
export function useAutoToolDisclosure(): ReturnType<UseDisclosure> {
  const settings = useAutoExpandSettings()
  const group = useContext(GroupOpenContext)
  const row = useContext(ToolRowContext)
  const { open, setOpen, toggle } = useAutoDisclosure(autoOpenFor({
    timing: settings.toolCollapseTiming,
    done: row.done,
    // 「下一批操作出现时」用批次坐标（同 step 一起展开）。
    isLatestBatch: isLatestStep(row.step, group.latestStep),
    // 「下一条操作出现时」用操作坐标（只留最新一条**已开始**的操作）。
    // 未开始的行（参数还在流式）一律不展开：它们还没轮到。
    isLatestNode: row.started && isLatestAnchor(row.anchorSeq, group.latestStartedAnchorSeq),
    // 三合取仍由 `toolAutoOpen` 表达（它有独立单测），与思考行的 `enabled` 同构。
    enabled: toolAutoOpen({
      toolAutoExpand: settings.toolAutoExpand,
      groupOpen: group.open,
      groupAuto: group.auto,
    }),
  }))
  return { expanded: open, setExpanded: setOpen, toggle }
}