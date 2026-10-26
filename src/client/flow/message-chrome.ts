/**
 * 克隆自 `chat/message-chrome.ts`（100 行）中的时间与时长工具。
 *
 * 上游：@deepseek-ai/dsh-client-ui-chat@0.2.1-rc.3，commit 1f81c047fc
 *
 * 只保留 pending bubble 的时钟与运行时长需要的部分。
 */

/** 本地日历日的零时刻（本地午夜的毫秒）。 */
export function startOfLocalDay(ms: number): number {
  const d = new Date(ms)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/** 距 `ms` 之后下一个本地午夜的毫秒数（至少 1ms）。 */
export function msUntilNextLocalMidnight(ms: number): number {
  const next = new Date(ms)
  next.setHours(24, 0, 0, 0)
  return Math.max(next.getTime() - ms, 1)
}

/**
 * 为消息 IconActions 生成紧凑的本地时间戳。
 * 同一日历日 → `HH:mm`；今年更早 → `clock.md` 模板 + 时钟；其他年份 → `clock.ymd`。
 * @param time - 源 Session 事件的 Unix 毫秒。
 * @param t - 提供 `clock.md` / `clock.ymd` 模板的翻译函数。
 * @param now - 日/年切分的参考时刻（默认当前时钟）。
 * @returns 带日期判断的时钟字符串（24 小时制，零填充）。
 */
export function formatMessageClock(
  time: number,
  t: (key: string, params?: Record<string, unknown>) => string,
  now: number = Date.now(),
): string {
  const pad2 = (n: number): string => String(n).padStart(2, '0')
  const d = new Date(time)
  const n = new Date(now)
  const clock = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`
  if (
    d.getFullYear() === n.getFullYear()
    && d.getMonth() === n.getMonth()
    && d.getDate() === n.getDate()
  ) {
    return clock
  }
  const params = { y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate() }
  const md = d.getFullYear() === n.getFullYear() ? t('clock.md', params) : t('clock.ymd', params)
  return `${md} ${clock}`
}
