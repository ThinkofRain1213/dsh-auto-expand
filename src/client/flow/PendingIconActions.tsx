/**
 * 克隆自 `chat/MessageIconActions.tsx`（115 行）中 pending bubble 用到的部分。
 *
 * 上游：@deepseek-ai/dsh-client-ui-chat@0.2.1-rc.3，commit 1f81c047fc
 *
 * pending bubble 只用到"时钟 + 复制"这一条 actions 行，不带 branch / usage。
 * 因此这里只保留 `text` / `time` / `clock` / `className` 四个输入，去掉
 * `onBranch`、`branchUnavailable`、`extraActions`、`usageAction` 分支。
 *
 * 复制行为逐字保留：成功后 1 秒内显示对勾，窗口内重复点击不叠加计时器。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  IconCheckOutlineRegular, IconCopyOutlineRegular, Tooltip, writeClipboard,
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
  // 与 CodeBlock 相同的成功反馈：写入后短暂换成对勾，并用闸门避免
  // 窗口内重复点击既重复复制又叠加计时器。
  const [copied, setCopied] = useState(false)
  const copyPending = useRef(false)
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const copyEpoch = useRef(0)
  useEffect(() => () => {
    copyEpoch.current += 1
    copyPending.current = false
    if (copyTimer.current !== null) clearTimeout(copyTimer.current)
  }, [])
  const onCopy = useCallback(() => {
    if (copied || copyPending.current) return
    const epoch = copyEpoch.current
    copyPending.current = true
    void writeClipboard(text).then((ok) => {
      if (epoch !== copyEpoch.current) return
      copyPending.current = false
      if (!ok) return
      setCopied(true)
      copyTimer.current = setTimeout(() => {
        copyTimer.current = null
        setCopied(false)
      }, 1000)
    })
  }, [copied, text])
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
