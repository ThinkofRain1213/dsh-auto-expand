/**
 * 克隆自 `chat/ChatGroupSeat.tsx`（203 行）。
 *
 * 上游：@deepseek-ai/dsh-client-ui-chat@0.2.1-rc.2，commit 687f282e86
 *
 * 修改点（四处，其余逐字保留）：
 *   1. 本地 `useDisclosure()` → `useAutoDisclosure(!closed)`：body 默认展开，
 *      group 关闭时自动折叠一次（这是本插件的核心行为）。
 *   2. 新增自动展开时的滚动定位：官方 `toggle` 里有 `initialize(...)`，
 *      但自动展开不经过它，必须在同一帧显式补上（`initialize` + `realign`）。
 *   3. 新增 `GroupOpenContext.Provider`：把 body 展开状态下发给内层思考块。
 *   4. `useProcessScroll` 解构出新增的 `realign`。
 *
 * 保留不动（关键）：
 *   - `capped` 计算 → 400px 高度上限
 *   - `useGroupHeaderAction` → header 显隐动画
 *   - `bodyRef = useGroupAction(grouped && !open, reveal)` → 折叠动画与焦点保护
 *   - `useProcessScroll` → 内部滚动跟随与边缘渐变
 *   - 全部 `data-*` 属性 → 官方 CSS 与测试依赖
 */
import { memo, useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ComponentProps, type ReactNode } from 'react'
import {
  IconAgentPresetOutlineRegular, IconApiOutlineRegular, IconBrowseOutlineRegular, IconChevronDownOutlineRegular,
  IconChevronUpOutlineRegular, IconCodeOutlineRegular, IconEditOutlineRegular, IconGlobeOutlineRegular,
  IconPlanOutlineRegular, IconQuestionOutlineRegular, IconSearchOutlineRegular, IconSparkleRegular,
  IconThinkOutlineRegular, TextShimmer,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { GroupKey, NodeReference } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { ChatStoreState, ProcessActivity } from '@deepseek-ai/dsh-client-ui-chat/client'
import type { ChatFlowSlotProps } from '../contract/slots.ts'
import { turnProcessOpen } from '../contract/chat-contract.ts'
import { useAutoDisclosure } from '../auto-disclosure.ts'
import { useAutoExpandSettings } from '../settings.ts'
import { GroupOpenContext } from '../group-open-context.ts'
import { AutoNodeSeat } from './AutoNodeSeat.tsx'
import { chatRenderKey, hiddenOrCollapsing, processTitle } from './flow-utils.ts'
import { useProcessScroll } from './use-process-scroll.ts'
import { shouldAlignBody, type ScrollAlignState } from './scroll-align.ts'
import css from './AutoGroupSeat.module.css'

/** 座位 props：去掉 `nodeKey`/`groupPart` 后的 `AutoNodeSeat` props。 */
type SeatProps = Omit<ComponentProps<typeof AutoNodeSeat>, 'nodeKey' | 'groupPart'>

/** `AutoGroupSeat` 的 props。 */
export type AutoGroupSeatProps = SeatProps & {
  readonly groupKey: GroupKey
  readonly useChatGroup: ChatFlowSlotProps['useChatGroup']
  readonly useGroupHeaderAction: ChatFlowSlotProps['useGroupHeaderAction']
}

/** 运行中标题变化的最小停留时长（官方同值）。 */
const PROCESS_TITLE_MINIMUM_MS = 150

/** 标题可显示的活动类别，含"正在思考"。 */
type ProcessTitleActivity = ProcessActivity | 'thinking'

/** 运行中标题的完整状态。 */
interface LiveProcessTitle {
  readonly activity: ProcessTitleActivity
  readonly detail: string
  readonly preparing: boolean
}

/** 每个活动类别的图标（官方同表）。 */
const PROCESS_ICONS: Record<ProcessTitleActivity, ReactNode> = {
  thinking: <IconThinkOutlineRegular />,
  read: <IconBrowseOutlineRegular size={14} />,
  readImage: <IconBrowseOutlineRegular size={14} />,
  search: <IconSearchOutlineRegular size={14} />,
  edit: <IconEditOutlineRegular size={14} />,
  write: <IconEditOutlineRegular size={14} />,
  webSearch: <IconGlobeOutlineRegular />,
  webFetch: <IconBrowseOutlineRegular size={14} />,
  subagents: <IconAgentPresetOutlineRegular size={14} />,
  plan: <IconPlanOutlineRegular />,
  questions: <IconQuestionOutlineRegular />,
  tools: <IconSparkleRegular size={14} />,
  commands: <IconApiOutlineRegular />,
  code: <IconCodeOutlineRegular size={14} />,
}

/** 两个运行中标题是否等价。 */
function sameLiveProcessTitle(left: LiveProcessTitle, right: LiveProcessTitle): boolean {
  return left.activity === right.activity && left.detail === right.detail && left.preparing === right.preparing
}

/**
 * 克隆自 `chat/ChatGroupSeat.tsx:59-82`。
 *
 * 让运行中标题至少停留 150ms，避免高频抖动。
 * @param desired - 期望显示的标题状态。
 * @param active - 该 group 是否仍在运行。
 * @returns 当前应显示的标题状态。
 */
function useStableLiveProcessTitle(desired: LiveProcessTitle, active: boolean): LiveProcessTitle {
  const [displayed, setDisplayed] = useState(desired)
  const displayedRef = useRef(displayed)
  const desiredRef = useRef(desired)
  const displayedAtRef = useRef(Date.now())
  useEffect(() => {
    desiredRef.current = desired
    if (!active || sameLiveProcessTitle(displayedRef.current, desired)) return
    const remaining = PROCESS_TITLE_MINIMUM_MS - (Date.now() - displayedAtRef.current)
    const commit = (): void => {
      const next = desiredRef.current
      displayedRef.current = next
      displayedAtRef.current = Date.now()
      setDisplayed(next)
    }
    if (remaining <= 0) {
      commit()
      return
    }
    const timer = setTimeout(commit, remaining)
    return () => { clearTimeout(timer) }
  }, [active, desired.activity, desired.detail, desired.preparing])
  return active ? displayed : desired
}

/** 组内成员的渲染列表。 */
const GroupMembers = memo(function GroupMembers({ members, ...props }: SeatProps & {
  readonly members: readonly NodeReference[]
}) {
  return members.map(member => <AutoNodeSeat {...props} key={chatRenderKey(member)} nodeKey={member.key}
    {...member.groupPart === undefined ? {} : { groupPart: member.groupPart }} />)
})

/** process group 的标题按钮。 */
const ProcessGroupHeader = memo(function ProcessGroupHeader({ groupKey, useChatGroup, usePresentation, t, open, bodyId, toggle }: {
  readonly groupKey: GroupKey
  readonly useChatGroup: ChatFlowSlotProps['useChatGroup']
  readonly usePresentation: ChatFlowSlotProps['usePresentation']
  readonly t: ChatFlowSlotProps['t']
  readonly open: boolean
  readonly bodyId: string
  readonly toggle: () => void
}) {
  const data = useChatGroup(groupKey, group => group?.data)
  const detailed = usePresentation(policy => data?.closed === false && policy.liveProcessDetail)
  const live = useStableLiveProcessTitle({
    activity: data?.summary.running ?? 'thinking',
    detail: data?.summary.runningDetail ?? '',
    preparing: data?.summary.preparing === true,
  }, data !== undefined && !data.closed)
  if (data === undefined) return null
  const label = data.closed ? processTitle(data.summary, t as unknown as (key: string, params?: Record<string, unknown>) => string)
    : live.preparing ? t(`message.stepProcess.prepare.${live.activity === 'thinking' ? 'tools' : live.activity}`)
      : t(`message.stepProcess.${live.activity}`)
  const detail = detailed && !data.closed ? live.detail : ''
  const title = detail === '' ? label : `${label}${t('message.turnProcess.separator')}${detail}`
  const activity = data.closed ? data.summary.counts[0]?.kind ?? 'thinking' : live.activity
  return (
    <button type="button" className={css.title} aria-expanded={open} aria-controls={bodyId}
      data-process-activity={activity} onClick={(event) => { event.currentTarget.focus(); toggle() }}>
      <span className={css.leading} aria-hidden="true">
        <span className={css.activityIcon} data-step-process-icon>{PROCESS_ICONS[activity]}</span>
        <span className={css.chevron} data-step-process-chevron>
          {open ? <IconChevronUpOutlineRegular /> : <IconChevronDownOutlineRegular />}
        </span>
      </span>
      <TextShimmer active={!data.closed}>
        <TextShimmer className={css.label}>{title}</TextShimmer>
      </TextShimmer>
    </button>
  )
})

/**
 * 渲染一个 process group：本地自动展开策略 + 现有的外层 Turn 可见性。
 *
 * 与官方唯一的语义差异：body 的初始展开状态由 `!closed` 决定，而非恒为折叠。
 */
export const AutoGroupSeat = memo(function AutoGroupSeat({ groupKey, useChatGroup, useGroupHeaderAction, ...props }: AutoGroupSeatProps) {
  const members = useChatGroup(groupKey, group => group?.members)
  const turn = useChatGroup(groupKey, group => group?.data.turn)
  const closed = useChatGroup(groupKey, group => group?.data.closed)
  const foldCompleted = props.usePresentation(policy => policy.foldCompletedTurns)
  // 设置开关：关闭时该层回到官方行为（恒折叠），与顶部整轮折叠互不影响。
  const settings = useAutoExpandSettings()
  // ── 改动 1：自动展开策略 ────────────────────────────────────────────────
  // 官方为 `useDisclosure()`（恒从折叠开始）。这里改为跟随 group 的关闭状态：
  // 未关闭 → 展开；关闭时 autoOpen 变 false → 丢弃手动覆盖 → 折叠一次。
  //
  // 开关关闭时 autoOpen 恒为 false，等价于官方的"始终折叠"。
  const autoOpen = settings.groupAutoExpand && !(closed === true)
  const { open, setOpen, toggle: toggleDisclosure, following: followsAuto } = useAutoDisclosure(autoOpen)
  const firstKey = members?.[0]?.key ?? ''
  const bottom = props.useChatNodeBottom(firstKey)
  const deferCollapse = bottom === true && props.deferCollapse
  const presentation = props.useChatNodeProcess(firstKey)
  const turnLocation = props.useChatNode(firstKey, (node) => {
    const location = node?.location
    return location?.kind === 'turn' || location?.kind === 'step' ? location.turn : undefined
  })
  // Detailed 让最新完成的 Turn 像运行中一样平铺，直到下一次输入。
  const grouped = props.usePresentation(policy => policy.stepGrouping === 'collapsed'
    || (policy.stepGrouping === 'history' && turnLocation?.status !== 'open' && !deferCollapse))
  const reason = turnLocation?.end?.data.reason.kind
  const alwaysOpen = presentation?.turnClosed === false || presentation?.hasInterleavedInput === true
    || reason === 'aborted' || reason === 'interrupted' || reason === 'error'
  const spec = presentation?.spec
  const selectOpen = useCallback((state: Readonly<ChatStoreState>) => spec !== undefined
    && turnProcessOpen(state, spec, deferCollapse), [spec, deferCollapse])
  const storedOpen = props.useStore(selectOpen)
  const outerHidden = foldCompleted && presentation?.turnClosed === true && spec !== undefined
    && !alwaysOpen && !storedOpen
  const revealOuter = useCallback(() => {
    if (spec !== undefined && !alwaysOpen) props.actions.setTurnProcessOpen(spec.turn, spec.answerStep ?? 0, true)
  }, [props.actions, spec, alwaysOpen])
  const rootRef = props.useGroupAction(outerHidden, revealOuter)
  // header 在平铺的最新 Turn 变成历史时出现；它在折叠时钟上增长，同时 body 关闭。
  // 整个 Turn 正在折叠的 group 在开始关闭的那一帧从不显示 header。
  const headerRef = useRef<HTMLDivElement>(null)
  const deferCompletedTurns = props.usePresentation(policy => policy.collapseTiming === 'next-input')
  useGroupHeaderAction(headerRef, !grouped || (deferCompletedTurns && outerHidden))
  useEffect(() => {
    if (outerHidden && rootRef.current !== null && hiddenOrCollapsing(rootRef.current)) setOpen(false)
  }, [outerHidden, rootRef, setOpen])
  const reveal = useCallback(() => { setOpen(true) }, [setOpen])
  const bodyRef = props.useGroupAction(grouped && !open, reveal)
  const contentRef = useRef<HTMLDivElement>(null)
  const bodyId = useId()
  const { edges, events, initialize, realign } = useProcessScroll(bodyRef, contentRef, open, grouped)
  // ── 改动 2：自动展开的滚动定位 ──────────────────────────────────────────
  // 官方 `toggle` 在**手动**展开时调用 `initialize(...)`；自动展开不经过它，
  // 若不补这一步，body 会停在 `scrollTop = 0`。
  //
  // 三处必须同时到位，缺一不可：
  //   1. 判据用 `actual`（open ∥ grouped）而不是 `open` 单独：Turn 从"平铺"
  //      变成"带 400px 上限"时（`grouped` 翻转），body 才第一次出现内部滚动。
  //   2. 用 `useLayoutEffect` 而不是 `useEffect`：`useProcessScroll` 里消费
  //      `initialize` 意图的是 ResizeObserver 回调，它早于被动副作用。
  //   3. 调 `realign()` 把意图**立即**兑现：自动展开后若没有新的尺寸变化，
  //      单靠 `initialize` 会永远等不到消费，定位就丢了。
  //
  // `followsAuto` 排除用户手动展开：那种情况由 `toggle` 自己决定位置
  // （已完成的 group 滚到顶部，与官方一致）。判定逻辑见 `scroll-align.ts`。
  const previousShape = useRef<ScrollAlignState | null>(null)
  useLayoutEffect(() => {
    const current = { open, grouped, followsAuto }
    if (shouldAlignBody(previousShape.current, current)) {
      initialize('bottom')
      realign()
    }
    previousShape.current = current
  }, [open, grouped, followsAuto, initialize, realign])
  const toggle = useCallback(() => {
    if (!open) initialize(closed === false ? 'bottom' : 'top')
    toggleDisclosure()
  }, [closed, initialize, open, toggleDisclosure])
  if (members === undefined) return null
  // 高度上限只作用于读者打开的 group；正在关闭的 body 保留平铺高度，
  // 使过渡从屏幕上的样子开始，而不是先跳到上限。
  const capped = grouped && (!deferCompletedTurns || open)
  const classes = [css.body, !capped ? css.expandedBody : '',
    capped && edges.canScrollUp ? css.fadeTop : '', capped && edges.canScrollDown ? css.fadeBottom : '']
  return (
    <div ref={rootRef} className={css.root} data-chat-group-key={groupKey}
      data-chat-flow-key={groupKey} data-chat-anchor-key={`group:${groupKey}`} data-chat-turn={turn}
      data-chat-paging-anchor={grouped && !open || undefined}
      data-step-process data-group-expanded-mode={!grouped || undefined}>
      <div ref={headerRef}>
        <ProcessGroupHeader groupKey={groupKey} useChatGroup={useChatGroup}
          usePresentation={props.usePresentation} t={props.t} open={open} bodyId={bodyId} toggle={toggle} />
      </div>
      <div ref={bodyRef} id={bodyId} className={classes.join(' ')} data-step-process-body
        data-scroll-up={edges.canScrollUp || undefined} data-scroll-down={edges.canScrollDown || undefined}
        {...events}>
        <div ref={contentRef} className={css.content} data-step-process-content data-chat-flow="">
          {/* 改动 3：把 body 展开状态下发给内层思考块（P3 使用） */}
          <GroupOpenContext.Provider value={open}>
            <GroupMembers {...props} members={members} />
          </GroupOpenContext.Provider>
        </div>
      </div>
    </div>
  )
})
