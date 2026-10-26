/**
 * 克隆自 `chat/ChatFlow.tsx`（61 行）。
 *
 * 上游：@deepseek-ai/dsh-client-ui-chat@0.2.1-rc.3，commit 1f81c047fc
 *
 * 修改点（仅一处）：
 *   - `ChatNodeSeat` → `AutoNodeSeat`，`ChatGroupSeat` → `AutoGroupSeat`。
 *
 * 不可改动（关键）：
 *   - `entries` 的顺序与 `chatRenderKey` 的用法 → React key 稳定性与滚动锚点
 *   - `pendingRows` 的 splice 位置 → 本地回声的挂载身份
 *   - `RunningStatus` 的尾部位置
 */
import { memo } from 'react'
import type { ChatFlowSlotProps } from '../contract/slots.ts'
import { AutoNodeSeat } from './AutoNodeSeat.tsx'
import { AutoGroupSeat } from './AutoGroupSeat.tsx'
import { chatRenderKey } from './flow-utils.ts'
import { PendingSteeringBubble, PendingSubmissionBubble } from './pending-bubbles.tsx'
import { RunningStatus } from './RunningStatus.tsx'

/**
 * 渲染 flow，不添加 DOM 父节点、不改变 keyed 行的位置。
 */
export const AutoFlow = memo(function AutoFlow({
  entries, pendingInputs, lastInputTurn, deferCollapse,
  useSession, useChat, useChatNode, useChatNodeBottom, useChatNodeProcess, useChatGroup, usePresentation,
  useStore, actions, renderSlot, renderFactorySlot, t, useGroupAction, useGroupHeaderAction,
  cwd, openFile, inspectCall, forkAt, loadImage, fileMentions,
}: ChatFlowSlotProps) {
  const nodeStore = useChat(snapshot => snapshot.nodes)
  const running = useSession(snapshot => snapshot.running)
  const latestTurnAnchor = useChat(snapshot => snapshot.navigation.items().at(-1)?.anchorKey)
  const runningStartTime = useChatNode(latestTurnAnchor ?? '', (node) => {
    const location = node?.location
    return location?.kind === 'turn' || location?.kind === 'step'
      ? location.turn.status === 'open' ? location.turn.start?.time : undefined
      : undefined
  })
  const seatProps = {
    nodeStore, useChatNode, useChatNodeBottom, useChatNodeProcess, usePresentation,
    useStore, actions, renderSlot, t, useGroupAction, deferCollapse,
    cwd, openFile, inspectCall, forkAt, loadImage, fileMentions,
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
  const pendingRows = pendingInputs.map(item => 'requestId' in item ? (
    <PendingSubmissionBubble key={item.requestId} submission={item}
      loadImage={loadImage} renderFactorySlot={renderFactorySlot} t={t} />
  ) : (
    <PendingSteeringBubble key={item.id} content={item.content}
      loadImage={loadImage} renderFactorySlot={renderFactorySlot} t={t} />
  ))
  const tail = entries.at(-1)
  const node = tail?.kind === 'node' ? nodeStore.get(tail.key) : undefined
  // 空的开始控件跟在一条本地转录回声之后，绝不跟 steering。
  // 所有行共享这一个 keyed 列表，因此插入控件时回声保持挂载。
  if (node?.kind === 'turn-process' && node.location.kind === 'turn'
    && node.location.turn.status === 'open' && node.location.turn.turn !== lastInputTurn) {
    const index = pendingInputs.findIndex(item => 'requestId' in item && item.placement === 'transcript')
    if (index !== -1) rows.splice(rows.length - 1, 0, ...pendingRows.splice(index, 1))
  }
  return [...rows, ...pendingRows, ...running ? [<RunningStatus key="running" startTime={runningStartTime} t={t} />] : []]
})
