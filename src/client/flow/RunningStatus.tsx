/**
 * 克隆自 `chat/RunningStatus.tsx`（41 行）。
 *
 * 上游：@deepseek-ai/dsh-client-ui-chat@0.2.1-rc.3，commit 1f81c047fc
 *
 * 逐字保留（含 `RunningWhaleTail`），仅改 import 路径。这是 flow 尾部的
 * 运行指示器，与折叠策略无关，必须与官方完全一致。
 */
import { memo, useEffect, useState } from 'react'
import { TextShimmer } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ChatViewSlotProps } from '../contract/slots.ts'
import { formatRunDuration, LIVE_RUN_CLOCK_INTERVAL_MS } from './flow-utils.ts'
import { RunningWhaleTail } from './RunningWhaleTail.tsx'
import a11yCss from './accessibility.module.css'
import css from './chat-flow.module.css'

/** `RunningStatus` 的 props。 */
interface RunningStatusProps {
  readonly startTime: number | undefined
  readonly t: ChatViewSlotProps['t']
}

/**
 * 在当前 Turn 内容之后显示实时已用时长，不播报每一次跳动。
 * @param props - 当前 Turn 的开始时间与本地化文案。
 * @returns 蓝色运行指示器；仅在 Session 运行时挂载。
 */
export const RunningStatus = memo(function RunningStatus({ startTime, t }: RunningStatusProps) {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    if (startTime === undefined) return
    setNow(Date.now())
    const timer = setInterval(() => { setNow(Date.now()) }, LIVE_RUN_CLOCK_INTERVAL_MS)
    return () => { clearInterval(timer) }
  }, [startTime])
  const label = startTime === undefined ? t('chat.deepDiving') : t('chat.deepDivingFor', {
    duration: formatRunDuration(Math.max(1000, now - startTime), t as unknown as (key: string, params?: Record<string, unknown>) => string)
      .map(part => part.text).join(''),
  })
  return (
    <div className={css.running} data-chat-running>
      <span className={a11yCss.visuallyHidden} role="status" aria-live="polite" aria-atomic="true">{t('chat.deepDiving')}</span>
      <span className={css.runningDivider} aria-hidden="true" />
      <span className={css.runningContent}>
        <RunningWhaleTail />
        <TextShimmer active className={css.runningText}>{label}</TextShimmer>
      </span>
    </div>
  )
})
