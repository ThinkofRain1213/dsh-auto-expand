/**
 * 克隆自 `chat/ReasoningRow.tsx`（102 行）。
 *
 * 上游：@deepseek-ai/dsh-client-ui-chat@0.2.1-rc.2，commit 687f282e86
 *
 * 修改点（一处）：
 *   - `useDisclosure()` → `useAutoDisclosure(autoOpenFor(...))`（可配置的收起时机）。
 *
 * 收起时机这一层是 2026-10-23 的修订：此前思考行只有「流式中 && 组展开」这一
 * 条硬编码规则（等价于时机 1「本条完成时」），现在与工具行**共用同一套四个
 * 时机、同一段判据**（`collapse-timing.ts`）。两者的差别只在信号怎么取：
 * 思考的 `done` 是「不再是流式尾部」，坐标直接来自所属 `assistant-step` 节点。
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
import { useAutoExpandSettings } from '../settings.ts'
import { autoOpenFor, isLatestAnchor, isLatestStep } from '../collapse-timing.ts'
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
  /**
   * 该思考块所属 `assistant-step` 节点的 `step`（模型输出轮次，**批次坐标**）。
   *
   * 「下一批操作出现时」用它与组内最新 step 比较——同一次模型输出里派发的
   * 操作共享同一 step，所以同批节点会**一起**保持展开。
   */
  readonly step: number
  /**
   * 该思考块所属 `assistant-step` 节点的 `anchorSeq`（节点序号，**操作坐标**）。
   *
   * 「下一条操作出现时」用它与组内最新 anchorSeq 比较。这个值是**节点级**的
   * （`assistant.ts:266`：`firstVisibleSeq ?? settled.seq`），本 step 内的任一段
   * 思考共享它——因此同一节点内的多段思考在操作级判据下同进同退，这是语义本身
   * 的结果，不是缺陷。
   */
  readonly anchorSeq: number
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
 * 渲染一段助手思考，收起时机由设置决定（默认「下一批操作出现时」）。
 *
 * 折叠态的摘要省略双星号标记；展开态渲染完整 Markdown。
 * 模式变化只切换 CSS 显示，不卸载折叠态摘要。
 * @param props - 思考文本、两个坐标、流式状态、渲染座位与本地化。
 * @returns 思考的 disclosure。
 */
export const AutoReasoningRow = memo(function AutoReasoningRow({
  step, anchorSeq, text, running, usePresentation, renderSlot, t,
}: AutoReasoningRowProps) {
  // 所属操作组的展开状态与两个坐标（P8 信号层）。
  const group = useContext(GroupOpenContext)
  // 设置：开关 + 收起时机。
  const settings = useAutoExpandSettings()
  // ── 核心改动：自动展开策略 ──────────────────────────────────────────────
  // 官方为 `useDisclosure()`（恒从折叠开始）。这里改为判据：
  //   enabled       ：开关开 && 组展开 && 处于当前轮自动展开窗口
  //   done          ：这段思考不再是流式尾部
  //   isLatestBatch ：按 step 判断本行是否属于本组最新一批（批次坐标）
  //   isLatestNode  ：按 anchorSeq 判断本行是否是最新一条**已开始**的操作（操作坐标）
  //
  // 思考所属的 assistant-step 节点一出现就在流式产出内容，恒视为「已开始」；
  // 而工具节点要走出 `preparing` 才算。两者因此共用同一段判据，只是信号取法不同。
  const { open: expanded, toggle } = useAutoDisclosure(autoOpenFor({
    timing: settings.reasoningCollapseTiming,
    done: !running,
    isLatestBatch: isLatestStep(step, group.latestStep),
    isLatestNode: isLatestAnchor(anchorSeq, group.latestStartedAnchorSeq),
    enabled: settings.reasoningAutoExpand && group.open && group.auto,
  }))
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
