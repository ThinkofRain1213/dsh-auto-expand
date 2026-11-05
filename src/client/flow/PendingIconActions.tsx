/**
 * 克隆自 `chat/MessageIconActions.tsx` 中 pending bubble 用到的部分。
 *
 * 上游：@deepseek-ai/dsh-client-ui-chat@0.2.2-rc.1，commit 66491b05e3
 *
 * pending bubble 只用到"时钟 + 复制"这一条 actions 行，不带 branch / usage。
 * 因此这里只保留 `text` / `time` / `clock` / `className` 四个输入，去掉
 * `onBranch`、`branchUnavailable`、`extraActions`、`usageAction` 分支。
 *
 * rc.1 起复制反馈改用官方 `useClipboardCopy`（内部同样带重复点击闸门与
 * 卸载清理），因此这里不再手写 copied/copyPending/copyTimer/copyEpoch。
 */
import {
  IconCheckOutlineRegular, IconCopyOutlineRegular, Tooltip, useClipboardCopy,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { ChatViewSlotProps } from '../contract/slots.ts'
import { formatMessageClock } from './message-chrome.ts'
import { useCalendarDay } from './use-calendar-day.ts'
import css from './pending-bubbles.module.css'

/** `PendingIconActions` 的 props。 */
export interface PendingIconActionsProps {
  /** 要复制的文本。 */
  text: string
  /** 事件时间；省略时不显示时钟。 */
  time?: number | undefined
  /** 时钟位于起始侧或结束侧。 */
  clock: 'start' | 'end'
  className?: string | undefined
  t: ChatViewSlotProps['t']
}

/**
 * 用户与 pending bubble 共用的"复制 / 时钟"图标行。
 * @param props - 复制文本、事件时间、时钟侧与额外类名。
 * @returns actions 行元素。
 */
export function PendingIconActions({ text, time, clock, className, t }: PendingIconActionsProps) {
  const day = useCalendarDay()
  const { copied, onCopy } = useClipboardCopy(text)
  const clockEl = time === undefined ? null : (
    <span className={clock === 'start' ? css.timeStart : css.timeEnd}>
      {formatMessageClock(time, t as unknown as (key: string, params?: Record<string, unknown>) => string, day)}
    </span>
  )
  return (
    <div className={className === undefined ? css.actions : `${css.actions} ${className}`} data-clock={clock}>
      {clock === 'start' ? clockEl : null}
      <Tooltip label={copied ? t('copied' as never) : t('copy' as never)} side="bottom">
        <button type="button" className={css.action} aria-label={copied ? t('copied' as never) : t('copy' as never)} onClick={onCopy}>
          {copied ? <IconCheckOutlineRegular /> : <IconCopyOutlineRegular />}
        </button>
      </Tooltip>
      {clock === 'end' ? clockEl : null}
    </div>
  )
}
