/**
 * 克隆自 `chat/ChatFlow.tsx`。
 *
 * 上游：@deepseek-ai/dsh-client-ui-chat@0.2.2-rc.1，commit 66491b05e3
 *
 * 修改点（仅一处）：
 *   - `ChatNodeSeat` → `AutoNodeSeat`，`ChatGroupSeat` → `AutoGroupSeat`。
 *
 * 不可改动（关键）：
 *   - `entries` 的顺序与 `chatRenderKey` 的用法 → React key 稳定性与滚动锚点
 *   - `pendingRows` 的三段分组与 splice 位置 → 本地回声的挂载身份
 *   - `RunningStatus` 的尾部位置
 */
import { memo, type ReactElement } from 'react'
import type { PendingSubmission } from '@deepseek-ai/dsh-api-session-controller/client'
import type { ChatFlowSlotProps } from '../contract/slots.ts'
import { AutoNodeSeat } from './AutoNodeSeat.tsx'
import { AutoGroupSeat } from './AutoGroupSeat.tsx'
import { chatRenderKey } from './flow-utils.ts'
import { PendingSteeringBubble, PendingSubmissionBubble } from './pending-bubbles.tsx'
import { RunningStatus } from './RunningStatus.tsx'

/** 一条本地提交回声，或没有本地提交的 Host 侧待处理 steering 项。 */
type PendingInput = ChatFlowSlotProps['pendingInputs'][number]

/**
 * 回声是否是本地提交，而不是 Host 侧待处理 steering 项。
 * @param item - 待处理输入项。
 * @returns 是本地提交时为真。
 */
function isLocalSubmission(item: PendingInput): item is PendingSubmission {
  return 'requestId' in item
}

/**
 * 回声是否是会开启新 Turn 的本地提交。
 * @param item - 待处理输入项。
 * @returns 是转录回声时为真。
 */
function isTranscriptEcho(item: PendingInput): boolean {
  return isLocalSubmission(item) && item.placement === 'transcript'
}

/**
 * 渲染 flow，不添加 DOM 父节点、不改变 keyed 行的位置。
 */
export const AutoFlow = memo(function AutoFlow({
  entries, pendingInputs, lastInputTurn, deferCollapse,
  useSession, useChat, useChatNode, useChatNodeBottom, useChatNodeProcess, useChatGroup, usePresentation, useConnectionState,
  useStore, actions, renderSlot, renderFactorySlot, t, useGroupAction, useGroupHeaderAction,
  cwd, openFile, inspectCall, forkAt, loadImage,
}: ChatFlowSlotProps) {
  const nodeStore = useChat(snapshot => snapshot.nodes)
  const running = useSession(snapshot => snapshot.running)
  const disconnected = useConnectionState(state => state === 'disconnected' || state === 'connecting')
  const latestTurnAnchor = useChat(snapshot => snapshot.navigation.items().at(-1)?.anchorKey)
  const runningStartTime = useChatNode(latestTurnAnchor ?? '', (node) => {
    const location = node?.location
    return location?.kind === 'turn' || location?.kind === 'step'
      ? location.turn.status === 'open' ? location.turn.start?.time : undefined
      : undefined
  })
  const latestTurnOpen = useChatNode(latestTurnAnchor ?? '', (node) => {
    const location = node?.location
    return (location?.kind === 'turn' || location?.kind === 'step') && location.turn.status === 'open'
  })
  // Session 已停但最新 Turn 还没关闭：保留 status 槽位（隐藏），
  // 等该 Turn 的动作行在同一次提交里接替它，尾部因此不会先塌一下。
  const holding = !running && latestTurnOpen
  const seatProps = {
    nodeStore, useChatNode, useChatNodeBottom, useChatNodeProcess, usePresentation,
    useStore, actions, renderSlot, t, useGroupAction, deferCollapse,
    cwd, openFile, inspectCall, forkAt, loadImage,
  }
  const rows = entries.map((entry) => {
    switch (entry.kind) {
      case 'node':
        return <AutoNodeSeat {...seatProps} key={chatRenderKey(entry)} nodeKey={entry.key}
          {...entry.groupPart === undefined ? {} : { groupPart: entry.groupPart }} />
      case 'group':
        return <AutoGroupSeat {...seatProps} key={chatRenderKey(entry)} groupKey={entry.key}
          useChat={useChat} useChatGroup={useChatGroup} useGroupHeaderAction={useGroupHeaderAction} />
      default: {
        const exhaustive: never = entry
        throw new Error(`未知的 RenderEntry：${JSON.stringify(exhaustive)}`)
      }
    }
  })
  // 转录回声会开启正在运行的 Turn，因此排在 status 之前；steering 与 Inbox
  // 回声排在它之后，status 因而始终停在运行中 Turn 的尾部。
  //
  // 第一条转录回声开启的是下一个 Turn，该 Turn 的首次 claim 会把它之前已经
  // 等待的 steering 一并取走；这些回声按 claim 顺序排在同一个 Turn 的最前面。
  const firstTranscript = pendingInputs.findIndex(isTranscriptEcho)
  const leadingRows: ReactElement[] = []
  const openingRows: ReactElement[] = []
  const pendingRows: ReactElement[] = []
  for (const [index, item] of pendingInputs.entries()) {
    const row = isLocalSubmission(item)
      ? <PendingSubmissionBubble key={item.requestId} submission={item}
        loadImage={loadImage} renderFactorySlot={renderFactorySlot} t={t} />
      : <PendingSteeringBubble key={item.id} content={item.content}
        loadImage={loadImage} renderFactorySlot={renderFactorySlot} t={t} />
    if (index <= firstTranscript) leadingRows.push(row)
    else if (isTranscriptEcho(item)) openingRows.push(row)
    else pendingRows.push(row)
  }
  const tail = entries.at(-1)
  const node = tail?.kind === 'node' ? nodeStore.get(tail.key) : undefined
  // 空的开始控件跟在「引领它那个 Turn」的回声之后。
  // 所有行共享这一个 keyed 列表，因此插入控件时回声保持挂载。
  if (node?.kind === 'turn-process' && node.location.kind === 'turn'
    && node.location.turn.status === 'open' && node.location.turn.turn !== lastInputTurn) {
    rows.splice(rows.length - 1, 0, ...leadingRows.splice(0))
  }
  // 行插在 keyed status 之前、回声在它之后，因此 React 永远不会移动 status 的
  // DOM 节点。running 位与 Turn 结束是分开到达的：该位清零后，一个仍开着的
  // 最新 Turn 会继续占着 status 槽位（隐藏），直到它的动作行在同一次提交里接手。
  return [
    ...rows, ...leadingRows, ...openingRows,
    ...running || holding ? [<RunningStatus key="running" startTime={runningStartTime} paused={disconnected}
      holding={holding} t={t} />] : [],
    ...pendingRows,
  ]
})
