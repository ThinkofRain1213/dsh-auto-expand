/**
 * 克隆自 `chat/ChatNodeSeat.tsx`（174 行）。
 *
 * 上游：@deepseek-ai/dsh-client-ui-chat@0.2.1-rc.3，commit 1f81c047fc
 *
 * 修改点（仅一处）：
 *   - 渲染 `AutoGroupSeat` 而非官方 `ChatGroupSeat`（`AutoFlow` 中分发）。
 *
 * 其余逻辑逐字保留，包括第一层（整轮折叠）的全部判定、`disclosureReset`
 * 机制、以及 `data-*` 属性。第一层不属本插件范围，必须与官方完全一致。
 */
import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import { JsonBlock } from '@deepseek-ai/dsh-client-ui-primitives'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type {
  ConversationLocationDataStore, ConversationTurnDataMap,
} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {
  ChatNodeHookContext, ChatNodeOwnerProps, ChatFlowSlotProps, UsePresentation,
} from '../contract/slots.ts'
import type { ChatNode } from '../contract/chat-nodes.ts'
import type { ChatNodeStore } from '../contract/snapshot.ts'
import { isAtOrOutside, turnProcessAlwaysOpen, turnProcessOpen } from '../contract/chat-contract.ts'
import { hiddenOrCollapsing } from './flow-utils.ts'
import css from './chat-flow.module.css'

/** `ChatNodeSeat` 的 props：owner 份额 + flow 层传入的座位。 */
export interface AutoNodeSeatProps extends ChatNodeOwnerProps {
  readonly nodeKey: string
  /** 替换后的 Builder 必须重新绑定 keyed hooks，即使引用与 key 未变。 */
  readonly nodeStore: ChatNodeStore
  readonly useChatNode: ChatFlowSlotProps['useChatNode']
  readonly useChatNodeProcess: ChatFlowSlotProps['useChatNodeProcess']
  readonly usePresentation: UsePresentation
  readonly useStore: ChatFlowSlotProps['useStore']
  readonly actions: ChatFlowSlotProps['actions']
  readonly renderSlot: ChatFlowSlotProps['renderSlot']
  readonly t: ChatFlowSlotProps['t']
  readonly useChatNodeBottom: ChatFlowSlotProps['useChatNodeBottom']
  readonly deferCollapse: boolean
  readonly useGroupAction: ChatFlowSlotProps['useGroupAction']
}

/** 按 Node 的判别式分派 owner props（与官方同名类型等价）。 */
type RoutedChatNodeOwner = {
  [Kind in ChatNode['kind']]: ChatNodeOwnerProps & { readonly node: ChatNode<Kind> }
}[ChatNode['kind']]

/** 取 Node 所属 Turn 的数据存储。 */
function turnDataOf(node: ChatNode | undefined): ConversationLocationDataStore<ConversationTurnDataMap> | undefined {
  const location = node?.location
  return location?.kind === 'turn' || location?.kind === 'step' ? location.turn.data : undefined
}

/** 取 Node 所属 Turn 编号。 */
function turnOf(node: ChatNode | undefined): number | undefined {
  const location = node?.location
  return location?.kind === 'turn' || location?.kind === 'step' ? location.turn.turn : undefined
}

/**
 * 订阅、应用 Turn 级可见性，并按稳定的 Context key 分发。
 *
 * 策略读取只选择本座位自己的结论，因此模式变化只重渲染可见性真正改变的座位。
 */
export const AutoNodeSeat = memo(function AutoNodeSeat({
  nodeKey, groupPart, useChatNode, useChatNodeProcess, usePresentation,
  cwd, openFile, inspectCall, forkAt,
  loadImage, fileMentions, useStore, actions, renderSlot, t, useChatNodeBottom, deferCollapse, useGroupAction,
}: AutoNodeSeatProps) {
  const bottom = useChatNodeBottom(nodeKey)
  const node = useChatNode(nodeKey)
  const routedNode = node as ChatNode | undefined
  const turn = turnOf(routedNode)
  const processPresentation = useChatNodeProcess(nodeKey)
  const processSpec = processPresentation?.spec
  const storedOpen = useStore(state => processSpec !== undefined
    && turnProcessOpen(state, processSpec, bottom === true && deferCollapse))
  const liveProcess = processPresentation !== undefined && !processPresentation.turnClosed
  const interleavedInput = processPresentation?.hasInterleavedInput === true
  const alwaysOpen = liveProcess || interleavedInput || turnProcessAlwaysOpen(routedNode)
  const processOpen = alwaysOpen || storedOpen
  const setOpen = useCallback((open: boolean) => {
    if (processSpec !== undefined && !alwaysOpen) {
      actions.setTurnProcessOpen(processSpec.turn, processSpec.answerStep ?? 0, open)
    }
  }, [actions, processSpec, alwaysOpen])
  const foldCompleted = usePresentation(policy => policy.foldCompletedTurns)
  // 已加载的结束让部分历史 Turn 无需起点也可参与折叠。
  const processWindowReady = processSpec !== undefined
    && processPresentation !== undefined
    && foldCompleted
    && processPresentation.turn === processSpec.turn
    && (processPresentation.turnStarted || processPresentation.turnClosed)
  const processMember = routedNode !== undefined
    && processWindowReady
    && !isAtOrOutside(routedNode, 'turn')
    && routedNode.anchorSeq >= processSpec.processStartSeq
    && (liveProcess || processSpec.answerAnchorSeq === null || routedNode.anchorSeq < processSpec.answerAnchorSeq
      || (groupPart === 'reasoning' && routedNode.kind === 'assistant-step' && routedNode.data.step === processSpec.answerStep))
  const processAnswer = routedNode !== undefined
    && processWindowReady
    && !liveProcess
    && groupPart !== 'reasoning'
    && routedNode.kind === 'assistant-step'
    && routedNode.data.step === processSpec.answerStep
  const ownsDisclosure = routedNode?.kind === 'turn-process' || processAnswer
  const foldable = processWindowReady
    && (liveProcess || processMember || ownsDisclosure)
  const turnProcess = useMemo(() => processSpec === undefined
    ? undefined
    : {
      spec: processSpec,
      foldable,
      hasContent: !interleavedInput && (processPresentation?.hasExternalProcess === true || processSpec.inlineReasoning),
      open: processOpen,
      setOpen,
    }, [
    foldable, interleavedInput, processOpen, processSpec, processPresentation?.hasExternalProcess, setOpen,
  ])
  const controllerInactive = routedNode?.kind === 'turn-process'
    && foldCompleted && !foldable
  const compactAnswer = processAnswer
    && foldable
    && processPresentation.compactAnswer
    && !processOpen
  const processHidden = controllerInactive || (foldable && processMember && !processOpen)
  const revealProcess = useCallback(() => {
    if (processMember) setOpen(true)
  }, [processMember, setOpen])
  const wrapperRef = useGroupAction(processHidden, revealProcess)
  const [disclosureReset] = useState(() => createSnapshotStore(0))
  const turnData = turnDataOf(routedNode)
  const hookContext = useMemo<ChatNodeHookContext>(
    () => ({ turnData, disclosureReset, useGroupAction }), [turnData, disclosureReset, useGroupAction],
  )
  useEffect(() => {
    if (processMember && processHidden && wrapperRef.current !== null && hiddenOrCollapsing(wrapperRef.current)) {
      disclosureReset.set(disclosureReset.getSnapshot() + 1)
    }
  }, [processMember, processHidden, wrapperRef, disclosureReset])
  const owner = useMemo<ChatNodeOwnerProps | null>(() => node === undefined
    ? null
    : {
      ...groupPart === undefined ? {} : { groupPart },
      cwd,
      openFile,
      inspectCall,
      forkAt,
      loadImage,
      fileMentions,
      turnProcess,
    }, [
    node, groupPart, cwd, openFile, inspectCall, forkAt,
    loadImage, fileMentions, turnProcess,
  ])
  if (routedNode === undefined || owner === null) return null
  // 运行时按 Node 的判别式分派：每个 Node 的判别式就是与它一起传入的 keyed
  // slot 条目。TypeScript 不会自行把含联合成员的对象分发为对象联合。
  const routedOwner = { ...owner, node: routedNode } as RoutedChatNodeOwner
  const flowKey = groupPart === undefined || groupPart === 'response' ? routedNode.key : JSON.stringify([routedNode.key, groupPart])
  return (
    <div
      ref={wrapperRef}
      className={css.flowItem}
      data-chat-anchor-key={flowKey}
      data-chat-flow-key={flowKey}
      data-chat-paging-anchor={routedNode.kind !== 'turn-process' || undefined}
      data-chat-node-key={routedNode.key}
      data-chat-group-part={groupPart}
      data-chat-flow-kind={routedNode.kind}
      data-chat-turn={turn}
      data-turn-process-member={processMember || undefined}
      data-turn-process-hidden={processHidden || undefined}
      data-turn-process-answer={compactAnswer || undefined}
    >
      {renderSlot('conversation.chat.node', routedOwner, {
        entryKey: routedNode.kind,
        hookContext,
        fallback: (
          <JsonBlock
            label={t('message.unknownSurface', { type: routedNode.kind })}
            payload={routedNode.data}
            truncatedLabel={total => t('json.truncated', { total })}
          />
        ),
      })}
    </div>
  )
})
