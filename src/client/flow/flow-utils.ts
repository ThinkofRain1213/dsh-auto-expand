/**
 * flow 层的共享工具。
 *
 * 这些函数在官方包里没有从 `@deepseek-ai/dsh-client-ui-chat/client` 导出，
 * 只能在此重实现。每个函数都标注了官方出处与上游 commit，便于升级时对照。
 *
 * 上游：@deepseek-ai/dsh-client-ui-chat@0.2.1-rc.2
 * commit：687f282e86
 */
import type { RenderEntry } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { ProcessActivitySummary } from '@deepseek-ai/dsh-client-ui-chat/client'

/**
 * 克隆自 `chat/render-entry.ts`（16 行）。
 *
 * 为两种分组引用生成稳定的 React key。切换展示模式时 key 不变，
 * 这是滚动位置与组件身份保持稳定的前提。
 * @param entry - 与展示模式无关的渲染引用。
 * @returns 无冲突的 React key。
 */
export function chatRenderKey(entry: RenderEntry): string {
  switch (entry.kind) {
    case 'node': return JSON.stringify(['node', entry.key, entry.groupPart ?? null])
    case 'group': return JSON.stringify(['group', entry.key])
    default: {
      // 官方用 assertNever；这里不引入 dsh-util-values，直接抛错等价。
      const exhaustive: never = entry
      throw new Error(`未知的 RenderEntry：${JSON.stringify(exhaustive)}`)
    }
  }
}

/**
 * 克隆自 `chat/flow-motion.ts:98-100`。
 *
 * 判断一行是否已隐藏或正在折叠。`ChatNodeSeat` 用它决定何时重置内层 disclosure。
 * @param element - 受 Turn 级可见性控制的元素。
 * @returns 已有 hidden 属性或折叠过渡未完成。
 */
export function hiddenOrCollapsing(element: HTMLElement): boolean {
  return element.hasAttribute('hidden') || element.dataset.chatMotion === 'collapse'
}

/**
 * 克隆自 `chat/step-process.ts`（28 行）。
 *
 * 用已关闭 group 的前三个活动类别组合本地化标题，不显示计数。
 * @param summary - 该区间的排名活动与阶段证据。
 * @param t - Chat 命名空间翻译函数。
 * @returns 次级 disclosure 的标题。
 */
export function processTitle(
  summary: ProcessActivitySummary,
  t: (key: string, params?: Record<string, unknown>) => string,
): string {
  const labels = summary.counts.slice(0, 3).map(({ kind }) => t(`message.stepProcess.done.${kind}`))
  const first = labels[0]
  if (first === undefined) return t('message.stepProcess.done.thinking')
  const continuation = (label: string): string => label.charAt(0).toLowerCase() + label.slice(1)
  const second = labels[1]
  if (second === undefined) return first
  if (labels.length === 2) {
    const prefix = t('message.stepProcess.sharedPrefix')
    const shared = prefix !== '' && first.startsWith(prefix) && second.startsWith(prefix)
    return t('message.stepProcess.joinTwo', { first, second: continuation(shared ? second.slice(prefix.length) : second) })
  }
  const title = [first, ...labels.slice(1).map(continuation)].join(t('message.stepProcess.comma'))
  return summary.counts.length > 3 ? t('message.stepProcess.more', { title }) : title
}

/**
 * 克隆自 `chat/message-chrome.ts:54-64`。
 *
 * 生成已运行时长的片段（数字 + 本地化单位）。
 * @param ms - 毫秒；负数归零，小数向下取整。
 * @param t - 提供单位与尾随空格的翻译函数。
 * @returns 按显示顺序排列的数字与单位，无前导零。
 */
export function formatRunDuration(
  ms: number,
  t: (key: string, params?: Record<string, unknown>) => string,
): Array<{ readonly text: string; readonly numeric: boolean }> {
  const total = Math.max(0, Math.floor(ms / 1000))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor(total / 60) % 60
  const seconds = total % 60
  const parts: Array<{ readonly text: string; readonly numeric: boolean }> = []
  if (hours > 0) parts.push({ text: String(hours), numeric: true }, { text: t('duration.hourUnit'), numeric: false })
  if (total >= 60) parts.push({ text: String(minutes), numeric: true }, { text: t('duration.minuteUnit'), numeric: false })
  parts.push({ text: String(seconds), numeric: true }, { text: t('duration.secondUnit'), numeric: false })
  return parts
}

/** 克隆自 `chat/message-chrome.ts:13`：整秒实时时钟的刷新间隔。 */
export const LIVE_RUN_CLOCK_INTERVAL_MS = 1000
