/**
 * 克隆自 `markdown-labels.ts`（16 行）。
 *
 * 上游：@deepseek-ai/dsh-client-ui-chat@0.2.1-rc.2，commit 687f282e86
 *
 * 逐字保留。为 Cordis-free 的 Markdown 原语构建本地化文案。
 */
import type { MarkdownLabels } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ChatViewSlotProps } from '../contract/slots.ts'

/**
 * 为一次 locale 修订构建完整的 Markdown chrome 文案。
 * @param t - Chat locale 座位。
 * @returns 代码块与脚注的文案。
 */
export function markdownLabels(t: ChatViewSlotProps['t']): MarkdownLabels {
  const translate = t as unknown as (key: string, params?: Record<string, unknown>) => string
  return {
    code: {
      copyLabel: translate('copy'),
      copiedLabel: translate('copied'),
      toolbarLabels: {
        codeLabel: translate('codeBlock.title'),
        wrapLabel: translate('codeBlock.wrap'),
        unwrapLabel: translate('codeBlock.unwrap'),
      },
    },
    footnotes: translate('markdown.footnotes'),
  }
}
