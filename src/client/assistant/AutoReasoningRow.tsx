/**
 * 克隆自 `chat/ReasoningRow.tsx`（102 行）。
 *
 * 上游：@deepseek-ai/dsh-client-ui-chat@0.2.1-rc.2，commit 687f282e86
 *
 * 修改点（一处）：
 *   - `useDisclosure()` → `useAutoDisclosure(running && groupOpen)`。
 *
 * `running && groupOpen` 精确实现"先发生者"折叠：
 *   - 思考不再流式（running 变假）→ 折叠
 *   - 所属 group 折叠（groupOpen 变假）→ 折叠
 *   两者任一先发生，autoOpen 都变假，`useAutoDisclosure` 丢弃手动覆盖并折叠。
 *
 * 保留不动：
 *   - 折叠态的首行摘要预览与 `TextShimmer`
 *   - 全部 `data-*` 属性（官方 CSS 依赖）
 *   - 展开时通过 `renderSlot('conversation.chat.reasoning.body')` 渲染正文
 *     ——这是**官方 binding**，因此正文排版与官方完全一致
 *   - `running` 的无障碍播报
 */
import { memo, useContext, useMemo } from 'react'
import { DisclosureRow, IconThinkOutlineRegular, TextShimmer } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsRenderSlots } from '@deepseek-ai/dsh-client-ui-slots'
import type { ChatViewSlotProps, UsePresentation } from '../contract/slots.ts'
import { useAutoDisclosure } from '../auto-disclosure.ts'
import { GroupOpenContext } from '../group-open-context.ts'
import a11yCss from '../flow/accessibility.module.css'
import css from './AutoReasoningRow.module.css'

/** 思考行的图标（官方同值）。 */
const THINK_ICON = <IconThinkOutlineRegular size={14} />

/**
 * 取文本首行。
 * @param text - 完整文本。
 * @returns 第一行（不含换行）。
 */
function firstLine(text: string): string {
  const newline = text.indexOf('\n')
  return newline === -1 ? text : text.slice(0, newline)
}

/**
 * 克隆自 `chat/ReasoningRow.tsx:16-32`。
 *
 * 流式期间，取"最新的、已完成的段落"的首行作为摘要。
 * 未完成的单行没有摘要，因此预览不会因半行文本而跳动。
 * @param text - 完整或流式思考文本。
 * @returns 摘要文本；无可用段落时为空串。
 */
function latestCompletedParagraphFirstLine(text: string): string {
  let summary = ''
  let paragraphStart = 0
  const separator = /\r?\n(?:[\t ]*\r?\n)+/g
  while (true) {
    const nextParagraph = separator.exec(text)
    const paragraphEnd = nextParagraph === null ? text.length
      : nextParagraph.index + nextParagraph[0].indexOf('\n')
    const newline = text.indexOf('\n', paragraphStart)
    if (newline !== -1 && newline <= paragraphEnd) {
      const candidate = text.slice(paragraphStart, newline).trim()
      if (candidate !== '') summary = candidate
    }
    if (nextParagraph === null) return summary
    paragraphStart = nextParagraph.index + nextParagraph[0].length
  }
}

/** `AutoReasoningRow` 的 props。 */
export interface AutoReasoningRowProps {
  /** 完整或流式思考文本。 */
  text: string
  /** 该块是否为流式尾部。 */
  running: boolean
  /** 本行思考正文的 Body Slot 渲染器。 */
  renderSlot: PropsRenderSlots<'conversation.chat.reasoning.body'>['renderSlot']
  /** 实时展示策略（决定折叠态是否显示摘要预览）。 */
  usePresentation: UsePresentation
  t: ChatViewSlotProps['t']
}

/**
 * 渲染一段助手思考，默认展开，并在思考结束或所属 group 折叠时收起。
 *
 * 折叠态的摘要省略双星号标记；展开态渲染完整 Markdown。
 * 模式变化只切换 CSS 显示，不卸载折叠态摘要。
 * @param props - 思考文本、流式状态、渲染座位与本地化。
 * @returns 思考的 disclosure。
 */
export const AutoReasoningRow = memo(function AutoReasoningRow({
  text, running, usePresentation, renderSlot, t,
}: AutoReasoningRowProps) {
  // 所属 group 的展开状态：group 折叠时思考一并折叠（"先发生者"的一半）。
  const groupOpen = useContext(GroupOpenContext)
  // ── 核心改动：自动展开策略 ──────────────────────────────────────────────
  // 官方为 `useDisclosure()`（恒从折叠开始）。这里改为：
  //   思考流式中 且 所属 group 展开 → 展开；任一条件变假 → 折叠。
  const { open: expanded, toggle } = useAutoDisclosure(running && groupOpen)
  const summaryText = running ? latestCompletedParagraphFirstLine(text) : firstLine(text)
  const summary = useMemo(() => summaryText.replaceAll('**', ''), [summaryText])
  const preview = usePresentation(policy => !expanded && summary !== ''
    && (running || policy.settledReasoningPreview))
  const collapsedContent = useMemo(() => (
    <>
      <span className={css.separator} data-shimmer-decoration aria-hidden />
      <span className={css.summary} data-streaming={running || undefined}>
        <span className={css.summaryText}>
          <TextShimmer>{summary}</TextShimmer>
        </span>
      </span>
    </>
  ), [running, summary])
  const content = useMemo(() => expanded ? (
    <div className={css.thinkBody}>
      {/* 官方 Body Slot：排版（compact Markdown）与官方完全一致 */}
      {renderSlot('conversation.chat.reasoning.body', { text, running })}
    </div>
  ) : undefined, [expanded, renderSlot, running, text])

  return (
    <div
      className={css.root}
      data-variant="think"
      data-state={running ? 'running' : 'ok'}
      data-expanded={expanded || undefined}
      data-preview={preview || undefined}
    >
      {running && <span className={a11yCss.visuallyHidden}>{t('row.running')}</span>}
      <DisclosureRow
        rowClassName={css.row}
        leadingClassName={css.leading}
        titleClassName={css.title}
        icon={THINK_ICON}
        title={t('message.think')}
        running={running}
        open={expanded}
        expandable
        expandOnRowClick
        onToggle={toggle}
        collapsedContent={collapsedContent}
      >
        {content}
      </DisclosureRow>
    </div>
  )
})
