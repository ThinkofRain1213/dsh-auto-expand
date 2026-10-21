/**
 * 克隆自 `chat/AssistantNodeView.tsx`（51 行）。
 *
 * 上游：@deepseek-ai/dsh-client-ui-chat@0.2.1-rc.2，commit 687f282e86
 *
 * 修改点（一处）：
 *   - 渲染 `AutoAssistantMarkdown` 而非官方 `AssistantMarkdown`。
 *   - 不再向 Markdown 层传 `useDisclosure`（思考行自己管状态）。
 *
 * 保留不动（关键）：
 *   - `reasoningHidden` 的计算 —— 这是第一层（整轮折叠）的职责。
 *     当整轮折叠、该 step 是 answer step、且 `inlineReasoning` 时，
 *     思考必须隐藏。漏掉会让第一层失效、思考泄漏。
 *   - `turn-tail` 订阅与 `owner`/`mentions` 计算 —— 决定是否显示文件提及链接。
 *   - `revealProcess` —— 展开整轮。
 *
 * 为什么必须重写而非包裹：官方组件内部固定引用官方 `AssistantMarkdown`，
 * 无法从外部替换其中一层（见 spec/DESIGN.md 4.4）。
 */
import { memo, useCallback, useMemo } from 'react'
import type { InjectFace, PropsRenderSlots } from '@deepseek-ai/dsh-client-ui-slots'
import type {
  ChatNodeViewProps, PresentationInjected, TurnTailOwnerProps,
} from '../contract/slots.ts'
import { AutoAssistantMarkdown } from './AutoAssistantMarkdown.tsx'

/** 完整 props：node 视图 + presentation 注入 + 两个子 slot 的渲染器。 */
type AutoAssistantNodeViewProps = ChatNodeViewProps<'assistant-step'> & InjectFace<PresentationInjected>
  & PropsRenderSlots<'conversation.chat.reasoning.body' | 'conversation.chat.message.images'>

/**
 * 流式、已结算与已中断的 Assistant 状态共享同一个 keyed 渲染实例。
 */
export const AutoAssistantNodeView = memo(function AutoAssistantNodeView({
  node, groupPart, useGroupAction, useTurnData, turnProcess, openFile, loadImage, fileMentions,
  usePresentation, renderSlot, t,
}: AutoAssistantNodeViewProps) {
  const data = node.data
  const turn = node.location.kind === 'turn' || node.location.kind === 'step'
    ? node.location.turn
    : undefined
  const tail = useTurnData('turn-tail')
  const owner = useMemo<TurnTailOwnerProps | undefined>(() => {
    if (turn?.status !== 'closed' || data.finalNode === undefined) return undefined
    if (tail?.closing?.finalNode.seq !== data.finalNode.seq) return undefined
    return { turn, seq: data.finalNode.seq, openFile }
  }, [data.finalNode, openFile, tail, turn])
  const mentions = useMemo(
    () => owner === undefined ? undefined : fileMentions(owner),
    [fileMentions, owner],
  )
  // 第一层的职责：整轮折叠时隐藏属于该过程披露的思考。
  const reasoningHidden = turnProcess !== undefined
    && turnProcess.foldable
    && turnProcess.spec.answerStep === data.step
    && turnProcess.spec.inlineReasoning
    && !turnProcess.open
  const revealProcess = useCallback(() => { turnProcess?.setOpen(true) }, [turnProcess])
  return (
    <AutoAssistantMarkdown
      blocks={data.blocks}
      groupPart={groupPart}
      streaming={data.status === 'running'}
      interrupted={data.status === 'interrupted'}
      loadImage={loadImage}
      reasoningHidden={reasoningHidden}
      useGroupAction={useGroupAction}
      usePresentation={usePresentation}
      renderSlot={renderSlot}
      revealProcess={revealProcess}
      mentions={mentions}
      t={t}
    />
  )
})
