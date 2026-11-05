/**
 * 克隆自 `chat/AssistantNodeView.tsx`（51 行）。
 *
 * 上游：@deepseek-ai/dsh-client-ui-chat@0.2.2-rc.1，commit 66491b05e3
 *
 * 修改点（一处）：
 *   - 渲染 `AutoAssistantMarkdown` 而非官方 `AssistantMarkdown`。
 *   - 不再向 Markdown 层传 `useDisclosure`（思考行自己管状态）。
 *   - 额外下传节点的 `step` 与 `anchorSeq`（思考行收起时机的两个坐标）。
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
  ChatFileMentions, ChatNodeViewProps, ContextMenuHook, PresentationInjected, TurnTailOwnerProps,
} from '../contract/slots.ts'
import { AutoAssistantMarkdown } from './AutoAssistantMarkdown.tsx'

/**
 * 官方 `AssistantNodeInjected` 的本插件对应物。
 *
 * 上游 rc.1 起 `fileMentions` 多了一个 `getFileTriggerProps` 参数（右键菜单
 * 手势绑定），而 `resolveFilePath` 负责把记录里的路径解析成 Host 路径。
 */
export interface AutoAssistantNodeInjected extends PresentationInjected {
  /** 按当前 Session 目录解析路径。 */
  resolveFilePath: (path: string) => string
  /** 解析收尾 Turn 的文件提及，附带普通文件手势回调。 */
  fileMentions: (
    owner: TurnTailOwnerProps,
    getFileTriggerProps: NonNullable<Parameters<ChatFileMentions['forClosing']>[2]>,
  ) => ReturnType<ChatFileMentions['forClosing']>
}

/**
 * 完整 props：node 视图 + presentation 注入 + 右键菜单 hook + 两个子 slot 的渲染器。
 *
 * `ContextMenuHook` 以**交叉类型**方式声明，而不是合并进全局的
 * `SessionStandardProps` —— 后者会污染本包所有 TS 消费者，且与上游真实声明
 * 相撞时报 TS2717。
 */
type AutoAssistantNodeViewProps = ChatNodeViewProps<'assistant-step'> & InjectFace<AutoAssistantNodeInjected>
  & ContextMenuHook
  & PropsRenderSlots<'conversation.chat.reasoning.body' | 'conversation.chat.message.images'>

/**
 * 流式、已结算与已中断的 Assistant 状态共享同一个 keyed 渲染实例。
 */
export const AutoAssistantNodeView = memo(function AutoAssistantNodeView({
  node, groupPart, useGroupAction, useTurnData, turnProcess, openFile, loadImage, fileMentions,
  usePresentation, renderSlot, t, sessionId, useContextMenu, resolveFilePath,
}: AutoAssistantNodeViewProps) {
  // 我们整份替换了官方组件，宿主若没注入这个 hook（版本不匹配、被别的插件
  // 覆盖、上游拆包），直接调用会抛 TypeError 并让整行渲染崩掉 —— 违反
  // wrap.ts 的约定「所有失败都降级为插件不生效，绝不让 DSH 崩溃」。
  // 缺失时退化为「没有右键手势」，文件提及的普通点击仍照常工作。
  const { getTriggerProps } = typeof useContextMenu === 'function'
    ? useContextMenu()
    : { getTriggerProps: () => ({}) }
  const getFileTriggerProps = useCallback((path: string) => getTriggerProps(() => ({
    kind: 'file', value: { sessionId, path: resolveFilePath(path) },
  })), [getTriggerProps, sessionId, resolveFilePath])
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
    () => owner === undefined ? undefined : fileMentions(owner, getFileTriggerProps),
    [fileMentions, owner, getFileTriggerProps],
  )
  // 第一层的职责：整轮折叠时隐藏属于该过程披露的思考。
  const keepReplies = usePresentation(policy => policy.foldedReplies === 'all')
  // 保留全部回复时，回复行留在折叠外，但它的行内思考仍随折叠隐藏。
  const reasoningHidden = turnProcess !== undefined
    && turnProcess.foldable
    && (keepReplies
      ? groupPart !== 'reasoning'
      : turnProcess.spec.answerStep === data.step && turnProcess.spec.inlineReasoning)
    && !turnProcess.open
  const revealProcess = useCallback(() => { turnProcess?.setOpen(true) }, [turnProcess])
  return (
    <AutoAssistantMarkdown
      // P8 信号层：所属 `assistant-step` 节点的**两个坐标**，供思考行判断收起时机。
      //  - step      （批次坐标）：同批节点要一起展开；
      //  - anchorSeq （操作坐标）：下一条操作一出现就收起。
      // 两者都是节点级的：同一节点内的多段思考共享它们。
      step={data.step}
      anchorSeq={node.anchorSeq}
      blocks={data.blocks}
      groupPart={groupPart}
      streaming={data.status === 'running'}
      textInteractionSource={data.status === 'settled' && data.finalNode?.messageId !== undefined}
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
