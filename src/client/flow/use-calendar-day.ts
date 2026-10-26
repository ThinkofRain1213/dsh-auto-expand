/**
 * 克隆自 `chat/use-calendar-day.ts`（25 行）。
 *
 * 上游：@deepseek-ai/dsh-client-ui-chat@0.2.1-rc.3，commit 1f81c047fc
 *
 * 组件本地的日历日跳动：memo 化的消息行在跨午夜时 props 保持稳定，
 * 因此 IconActions 的时钟需要一个本地日座位，在下一个本地午夜重新触发。
 */
import { useEffect, useState } from 'react'
import { msUntilNextLocalMidnight, startOfLocalDay } from './message-chrome.ts'

/**
 * 每个本地午夜前进的本地日历日零时刻。
 * @returns 当前本地日的午夜毫秒；跨过边界后更新。
 */
export function useCalendarDay(): number {
  const [day, setDay] = useState(() => startOfLocalDay(Date.now()))
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    const arm = (): void => {
      const now = Date.now()
      setDay(startOfLocalDay(now))
      timer = setTimeout(arm, msUntilNextLocalMidnight(now))
    }
    timer = setTimeout(arm, msUntilNextLocalMidnight(Date.now()))
    return () => { clearTimeout(timer) }
  }, [])
  return day
}
