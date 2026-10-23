/**
 * 克隆自 `chat/AssistantMarkdown.tsx`（167 行）。
 *
 * 上游：@deepseek-ai/dsh-client-ui-chat@0.2.1-rc.2，commit 687f282e86
 *
 * 修改点（一处）：
 *   - `ReasoningRow` → `AutoReasoningRow`（接自动展开策略）。
 *   - 不再接收 `useDisclosure` prop（思考行自己用 `useAutoDisclosure`）。
 *   - 额外接收节点的 `step` 与 `anchorSeq`，原样转发给每个思考行。
 *
 * 为什么必须完整重写而不是包裹：官方 `AssistantNodeView` 内部固定引用
 * 官方 `AssistantMarkdown`，无法从外部替换其中一层。而官方
 * `AssistantNodeView` 的 children 声明（`conversation.chat.reasoning.body`
 * 与 `conversation.chat.message.images`）必须保留，因此走原地包裹 +
 * 自实现 Markdown 层（见 spec/DESIGN.md 4.4）。
 *
 * 必须逐条对齐的 6 个细节（遗漏有可见后果）：
 *   1. `hasVisible` 判定 —— 否则工具组之间出现空壳行
 *   2. `groupPart` 过滤 —— 否则 reasoning/response 重复渲染
 *   3. 空白 reasoning 跳过 —— 否则出现空思考行
 *   4. 图片组以**首块索引**为 key —— 否则流式追加时 gallery remount
 *   5. `interrupted` stopped 标记 —— 否则中断态缺标记
 *   6. `reasoningHidden` —— 否则整轮折叠时思考泄漏（第一层失效）
 */
import { Fragment, memo, useMemo, type ReactNode } from 'react'
import { fileMediaUrl } from '@deepseek-ai/dsh-util-workspace-path'
import { JsonBlock, MarkdownText } from '@deepseek-ai/dsh-client-ui-primitives'
import type { MarkdownFileMentions, MarkdownPathImages } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsRenderSlots } from '@deepseek-ai/dsh-client-ui-slots'
import type {
  ChatNodeOwnerProps, ChatViewSlotProps, UseGroupAction, UsePresentation,
} from '../contract/slots.ts'
import type { AssistantBlock } from '../contract/snapshot.ts'
import { markdownLabels } from './markdown-labels.ts'
import { AutoReasoningRow } from './AutoReasoningRow.tsx'
import css from './AutoAssistantMarkdown.module.css'

/**
 * 克隆自 `chat/AssistantMarkdown.tsx:23-28`。
 *
 * 图片目标（忽略 query/fragment 后缀）的独立回退解析。
 * @param base - 渲染时的规范 `document.baseURI`。
 * @param value - 作者书写的 Markdown 目标；URL 转义只解码一次。
 * @returns 绝对 Web 或 Desktop file-API URL；不支持的协议与非本地路径返回 undefined。
 */
export function localPathMediaUrl(base: string, value: string): string | undefined {
  let path: string
  try { path = decodeURIComponent(value.split(/[?#]/u)[0] ?? '') }
  catch { return undefined } // 畸形的 URL 转义无法定位文件。
  return fileMediaUrl(base, path)
}

/** `AutoAssistantMarkdown` 的 props。 */
export interface AutoAssistantMarkdownProps extends
  Pick<PropsRenderSlots<'conversation.chat.reasoning.body' | 'conversation.chat.message.images'>, 'renderSlot'>,
  Pick<ChatNodeOwnerProps, 'loadImage'> {
  /** 该 `assistant-step` 节点的 `step`（模型输出轮次，批次坐标），转发给每个思考行。 */
  step: number
  /** 该 `assistant-step` 节点的 `anchorSeq`（节点序号，操作坐标），转发给每个思考行。 */
  anchorSeq: number
  /** 只渲染请求的业务部分，保留原始 block 索引。 */
  groupPart?: string | undefined
  blocks: readonly AssistantBlock[]
  streaming: boolean
  /** 已中止 Turn 的冻结部分：渲染时带停止标记。 */
  interrupted?: boolean | undefined
  /** 隐藏属于 Turn 级过程披露的思考。 */
  reasoningHidden?: boolean | undefined
  /** 由 node 座位绑定到当前视口的过程隐藏。 */
  useGroupAction: UseGroupAction
  /** 思考摘要的实时展示策略。 */
  usePresentation: UsePresentation
  /** 展开隐藏此思考的 disclosure。 */
  revealProcess?: (() => void) | undefined
  /** 该 Assistant 所属结束 Turn 的已解析散文文件提及。 */
  mentions?: MarkdownFileMentions | undefined
  /** 所属视图的 locale 座位，作为普通 prop 传入。 */
  t: ChatViewSlotProps['t']
}

/** 把非空白 reasoning 块渲染为独立 disclosure，与回复并列。 */
export const AutoAssistantMarkdown = memo(function AutoAssistantMarkdown({
  step, anchorSeq, blocks, streaming, interrupted, loadImage, groupPart,
  reasoningHidden = false, usePresentation, revealProcess, mentions, renderSlot, useGroupAction, t,
}: AutoAssistantMarkdownProps) {
  // 按 locale 修订稳定（t 身份在切换时变化）：每次渲染新建对象会让
  // MarkdownText 每个 chunk 都重建组件表。
  const labels = useMemo(() => markdownLabels(t), [t])
  // MarkdownText 会 memo 自己的词表；让它的身份跨渲染稳定。
  const pathImages = useMemo<MarkdownPathImages>(() => {
    return { resolve: value => localPathMediaUrl(document.baseURI, value) }
  }, [])
  const last = blocks.length - 1
  // 工具调用头在 chat 视图的分组阶段渲染为工具行，因此只含这些头的节点
  // （或空节点）会在工具组之间画出空的根 —— 除非仍有可见内容，否则跳过外壳。
  const hasVisible = streaming
    || interrupted === true
    || blocks.some(block => block.kind !== 'tool-call')
  if (!hasVisible) return null
  const rendered: ReactNode[] = []
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i]
    if (block === undefined) continue
    if (groupPart === 'reasoning' && block.kind !== 'reasoning') continue
    if (groupPart === 'response' && block.kind === 'reasoning') continue
    switch (block.kind) {
      case 'text':
        rendered.push(
          <MarkdownText
            key={i}
            text={block.text}
            streaming={streaming}
            labels={labels}
            fileMentions={mentions}
            pathImages={pathImages}
          />,
        )
        break
      case 'reasoning':
        // 只有非空白文本产生独立行；空白的流式尾部不产生行。
        if (block.text.trim() === '') break
        rendered.push(
          <ProcessReasoning
            key={i}
            hidden={reasoningHidden}
            reveal={revealProcess}
            useGroupAction={useGroupAction}
          >
            {/* 只有最后一个 block 是 running —— 这自动满足"只保留最后一段思考展开" */}
            <AutoReasoningRow
              step={step}
              anchorSeq={anchorSeq}
              text={block.text}
              running={streaming && i === last}
              usePresentation={usePresentation}
              renderSlot={renderSlot}
              t={t}
            />
          </ProcessReasoning>,
        )
        break
      case 'image': {
        // 连续的 image 块共享一个 gallery，使多张图铺成行，而不是各自
        // 开一个单图组。以组的**首块索引**为 key：流式追加扩展该组时
        // 只增长 `images`，不会在 key 偏移后 remount gallery。
        const start = i
        const group = [block]
        while (i + 1 < blocks.length) {
          const next = blocks[i + 1]
          if (next === undefined || next.kind !== 'image') break
          group.push(next)
          i += 1
        }
        rendered.push(
          <Fragment key={start}>
            {renderSlot('conversation.chat.message.images', {
              images: group.map(({ attachment }) => ({ attachment })), loadImage, align: 'start',
            })}
          </Fragment>,
        )
        break
      }
      // 由 ChatView 分组为工具行；上面的 hasVisible 已跳过空外壳。
      case 'tool-call':
        break
      default:
        rendered.push(
          <JsonBlock
            key={i}
            label={t('message.unknownBlock')}
            payload={block.block}
            truncatedLabel={total => t('json.truncated', { total })}
          />,
        )
    }
  }
  return (
    <div className={css.root} data-streaming={streaming || undefined}>
      <div className={css.body}>
        {rendered}
        {interrupted && (groupPart === undefined || groupPart === 'response'
          || !blocks.some(block => block.kind !== 'reasoning' && block.kind !== 'tool-call'))
          && <span className={css.stopped}>{t('message.stopped')}</span>}
      </div>
    </div>
  )
})

/**
 * 克隆自 `chat/AssistantMarkdown.tsx:157-165`。
 *
 * 把一段思考包进受 Turn 级可见性控制的容器。`useGroupAction` 绑定折叠
 * 动画与浏览器查找的 reveal。
 */
function ProcessReasoning({ hidden, reveal, useGroupAction, children }: {
  hidden: boolean
  reveal?: (() => void) | undefined
  useGroupAction: UseGroupAction
  children: ReactNode
}) {
  const ref = useGroupAction(hidden, reveal ?? NOOP)
  return <div ref={ref} data-turn-process-inline={hidden || undefined}>{children}</div>
}

/** 空操作。 */
const NOOP = (): void => {}
