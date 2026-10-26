/**
 * 克隆自 `chat/MessageItem.tsx:163-295`（`UserStyleBubble` 与两个 pending bubble）。
 *
 * 上游：@deepseek-ai/dsh-client-ui-chat@0.2.1-rc.3，commit 1f81c047fc
 *
 * `AutoFlow` 只用到 `PendingSteeringBubble` 与 `PendingSubmissionBubble`。
 * 这两个 bubble 只在"用户刚提交、durable 消息尚未到达"的短暂窗口渲染，
 * 但它们是用户能直接感知的视觉反馈，因此完整保留其外观与行为。
 *
 * 未克隆的部分（本插件用不到）：
 *   - `UserMessageNodeView` / `ContextMessageNodeView` 等 keyed renderer
 *     （它们由官方 `conversation.chat.node` 注册，我们只包裹 assistant-step）
 *   - `CompactionItem` / `ContextInjectionRow`（同上）
 *   - `RetryNodeView` / `TurnErrorNodeView` / `TurnMaxTokensNodeView`（同上）
 */
import { useMemo, type ReactNode } from 'react'
import type { PendingSubmission } from '@deepseek-ai/dsh-api-session-controller/client'
import type { PropsRenderFactories } from '@deepseek-ai/dsh-client-ui-slots'
import type { UserTextFacts } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {
  ChatNodeOwnerProps, ChatViewSlotProps, UserContentAttachment, UserContentData, UserContentInput,
} from '../contract/slots.ts'
import { PendingIconActions } from './PendingIconActions.tsx'
import css from './pending-bubbles.module.css'

const EMPTY_TEXT_FACTS: Readonly<Partial<UserTextFacts>> = {}

/** 把原始 content 数组拆成文本、附件与其余块。 */
function contentParts(content: readonly unknown[]): {
  text: string
  attachments: UserContentAttachment[]
  rest: unknown[]
} {
  const texts: string[] = []
  const attachments: UserContentAttachment[] = []
  const rest: unknown[] = []
  for (const block of content) {
    const b = block as { type?: string; text?: string; attachment?: unknown }
    if (b.type === 'text' && typeof b.text === 'string') texts.push(b.text)
    else if (b.type === 'image' && b.attachment !== undefined) {
      attachments.push({ type: 'image', image: { attachment: (b as { attachment: never }).attachment } })
    }
    else if (b.type === 'file' && b.attachment !== undefined) {
      attachments.push({ type: 'file', file: (b as { attachment: never }).attachment })
    }
    else rest.push(block)
  }
  return { text: texts.join(''), attachments, rest }
}

/** 用户与 steering 行共用的右对齐气泡。 */
function UserStyleBubble({
  content, loadImage, renderFactorySlot, actions, pending = false, echo = false, referenceLabels,
  previewAttachments, facts: inputFacts = EMPTY_TEXT_FACTS, interactive = false,
}: {
  content: readonly unknown[]
  renderFactorySlot: PropsRenderFactories['renderFactorySlot']
  /** 气泡下方的可选 IconActions；接收拼接后的文本。 */
  actions?: (text: string) => ReactNode
  /** 这是否是 Host 权威的准入前 steering 投影。 */
  pending?: boolean
  /** 这是否是本地提交回声（不可见标记；外观与它将替换的 durable 行一致）。 */
  echo?: boolean
  /** 相邻 recall 节点关联的精确会话提及标签。 */
  referenceLabels?: readonly string[]
  /** 本地提交回声的附件，替代从内容推导的附件序列。 */
  previewAttachments?: readonly UserContentAttachment[]
  /** 文本变换的输入，与行和渲染 props 分离。 */
  facts?: Readonly<Partial<UserTextFacts>>
} & Pick<ChatNodeOwnerProps, 'loadImage'> & Pick<UserContentInput, 'interactive'>): ReactNode {
  const parts = useMemo(() => contentParts(content), [content])
  const prepared = useMemo<UserContentData>(() => ({
    text: parts.text,
    attachments: previewAttachments ?? parts.attachments,
    extraBlocks: parts.rest,
    ...(referenceLabels === undefined ? {} : { referenceLabels }),
  }), [parts, previewAttachments, referenceLabels])
  const facts = useMemo<Readonly<Partial<UserTextFacts>>>(() => ({
    ...inputFacts,
    ...(referenceLabels === undefined ? {} : { sessionLabels: referenceLabels }),
  }), [inputFacts, referenceLabels])
  return (
    <div
      className={css.userRow}
      data-pending-steering={pending || undefined}
      data-submission-echo={echo || undefined}
    >
      {renderFactorySlot('conversation.chat.user.content', {
        content: prepared,
        loadImage,
        facts,
        interactive,
      })}
      {actions?.(prepared.text)}
    </div>
  )
}

/**
 * 渲染一条 Host 权威的待处理 steering 项，视觉语言与其最终的 durable 转录节点一致。
 * @param props - 待处理内容、已授权的图片加载器与 Factory/locale 座位。
 * @returns pending steering 气泡。
 */
export function PendingSteeringBubble({ content, loadImage, renderFactorySlot, t }: {
  content: readonly unknown[]
  renderFactorySlot: PropsRenderFactories['renderFactorySlot']
  t: ChatViewSlotProps['t']
} & Pick<ChatNodeOwnerProps, 'loadImage'>): ReactNode {
  return (
    <UserStyleBubble
      content={content}
      renderFactorySlot={renderFactorySlot}
      loadImage={loadImage}
      pending
      actions={text => (
        <PendingIconActions
          text={text}
          clock="start"
          className={css.actions}
          t={t}
        />
      )}
    />
  )
}

/**
 * 渲染一条本地转录或 steering 提交回声，外观与替换它的 Host 出现一致：
 * 草稿文本加对象 URL 预览，从提交点击可见直到 durable `user/message` 或
 * steering 出现渲染。
 * @param props - 待处理提交、已授权的图片加载器与渲染座位。
 * @returns 回声用户气泡。
 */
export function PendingSubmissionBubble({ submission, loadImage, renderFactorySlot, t }: {
  submission: PendingSubmission
  renderFactorySlot: PropsRenderFactories['renderFactorySlot']
  t: ChatViewSlotProps['t']
} & Pick<ChatNodeOwnerProps, 'loadImage'>): ReactNode {
  const content = useMemo(
    () => (submission.text === '' ? [] : [{ type: 'text', text: submission.text }]),
    [submission.text],
  )
  const previewAttachments = useMemo<readonly UserContentAttachment[]>(
    () => submission.attachments.map(attachment => attachment.type === 'image'
      ? {
        type: 'image',
        image: {
          preview: {
            url: attachment.value.previewUrl,
            ...(attachment.value.name === undefined ? {} : { name: attachment.value.name }),
            ...(attachment.value.width === undefined ? {} : { width: attachment.value.width }),
            ...(attachment.value.height === undefined ? {} : { height: attachment.value.height }),
          },
        },
      }
      : { type: 'file', file: attachment.value }),
    [submission.attachments],
  )
  return (
    <UserStyleBubble
      content={content}
      previewAttachments={previewAttachments}
      renderFactorySlot={renderFactorySlot}
      loadImage={loadImage}
      pending={submission.placement === 'steering'}
      echo
      actions={text => (
        <PendingIconActions
          text={text}
          time={submission.time}
          clock="start"
          className={css.actions}
          t={t}
        />
      )}
    />
  )
}
