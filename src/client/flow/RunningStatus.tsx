/**
 * 克隆自 `chat/RunningStatus.tsx`。
 *
 * 上游：@deepseek-ai/dsh-client-ui-chat@0.2.2-rc.1，commit 66491b05e3
 *
 * 逐字保留（含 `RunningWhaleTail`），仅改 import 路径。这是 flow 尾部的
 * 运行指示器，与折叠策略无关，必须与官方完全一致。
 *
 * rc.1 新增两态：
 *   - `paused`：Client 观察不到 Session 时冻结已用时长，避免计时器空转。
 *   - `holding`：Session 已停但 Turn 尚未关闭 —— 保留槽位但不显示、不播报，
 *     这样 Turn 的动作行接替它时尾部不会抖动。
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
  /** Client 无法观察 Session 时冻结显示的时长。 */
  readonly paused: boolean
  /** 保留槽位但不显示、不播报：Session 在 Turn 关闭前就停了。 */
  readonly holding?: boolean
  readonly t: ChatViewSlotProps['t']
}

/**
 * 在当前 Turn 内容之后显示实时已用时长，不播报每一次跳动。
 * @param props - 当前 Turn 的开始时间、暂停状态与本地化文案。
 * @returns 蓝色运行指示器；Session 运行时挂载，或在 Turn 的动作行接替它之前
 * 隐身占住槽位。
 */
export const RunningStatus = memo(function RunningStatus({ startTime, paused, holding = false, t }: RunningStatusProps) {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    if (startTime === undefined || paused || holding) return
    setNow(Date.now())
    const timer = setInterval(() => { setNow(Date.now()) }, LIVE_RUN_CLOCK_INTERVAL_MS)
    return () => { clearInterval(timer) }
  }, [startTime, paused, holding])
  const label = startTime === undefined ? t('chat.deepDiving') : t('chat.deepDivingFor', {
    duration: formatRunDuration(Math.max(1000, now - startTime), t as unknown as (key: string, params?: Record<string, unknown>) => string)
      .map(part => part.text).join(''),
  })
  return (
    <div className={css.running} data-chat-running data-holding={holding ? '' : undefined} aria-hidden={holding || undefined}>
      {holding ? null : (
        <span className={a11yCss.visuallyHidden} role="status" aria-live="polite" aria-atomic="true">{t('chat.deepDiving')}</span>
      )}
      <span className={css.runningDivider} aria-hidden="true" />
      <span className={css.runningContent}>
        <RunningWhaleTail />
        <TextShimmer active={!holding} className={css.runningText}>{label}</TextShimmer>
      </span>
    </div>
  )
})
