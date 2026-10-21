/**
 * 克隆自 `chat/use-process-scroll.ts`（88 行）。
 *
 * 上游：@deepseek-ai/dsh-client-ui-chat@0.2.1-rc.2，commit 687f282e86
 *
 * 逐字保留。这是 group body 的内部滚动跟随与边缘渐变，与 `AutoGroupSeat`
 * 的 400px 上限配合工作。简化会改变手感，因此不做精简。
 */
import { useCallback, useLayoutEffect, useMemo, useRef, useState, type DOMAttributes, type KeyboardEvent, type RefObject } from 'react'
import { scrollMetrics, useScrollFollow } from './use-scroll-follow.ts'

/** 滚动容器的上下边缘是否还有内容。 */
interface ScrollEdges { readonly canScrollUp: boolean; readonly canScrollDown: boolean }

const AT_REST: ScrollEdges = { canScrollUp: false, canScrollDown: false }
const SCROLL_KEYS = new Set(['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '])

/**
 * 观察一个 group 的 body 与内容，不与外层转录的跟随意图耦合。
 * 滚轮、触摸开始、任意指针按下，以及未被阻止的滚动按键都会中断进行中的动画，
 * 包括来自可编辑控件的事件；随后由位置采样决定跟随意图。
 * @param bodyRef - 带上限的滚动 body。
 * @param contentRef - 无上限的内容元素，其尺寸变化报告增长。
 * @param open - 本地展开状态。
 * @param grouped - 当前展示模式是否保留 group 的高度上限。
 * @returns 边缘渐变、DOM 事件绑定，以及手动展开时的一次性定位。
 */
export function useProcessScroll(
  bodyRef: RefObject<HTMLDivElement>, contentRef: RefObject<HTMLDivElement>, open: boolean, grouped: boolean,
): {
  edges: ScrollEdges
  events: Pick<DOMAttributes<HTMLDivElement>, 'onScroll' | 'onWheel' | 'onTouchStart' | 'onPointerDown' | 'onKeyDown'>
  initialize: (position: 'top' | 'bottom') => void
} {
  const follow = useScrollFollow(false, 1)
  const initialPosition = useRef<'top' | 'bottom' | null>(null)
  const [edges, setEdges] = useState<ScrollEdges>(AT_REST)
  const initialize = useCallback((position: 'top' | 'bottom') => { initialPosition.current = position }, [])
  const sync = useCallback((cause: 'resize' | 'scroll' | 'scrollend') => {
    const body = bodyRef.current
    let next = AT_REST
    if (body !== null && body.closest('[hidden], [data-group-expanded-mode]') === null) {
      let metrics = scrollMetrics(body)
      const initial = cause === 'resize' ? initialPosition.current : null
      if (initial !== null) {
        metrics = follow.jump(body, metrics, initial === 'bottom' ? metrics.floor : 0)
        if (initial === 'top') follow.setFollowing(false)
        initialPosition.current = null
      } else {
        const wasAnimating = follow.animating
        if (cause === 'scrollend') follow.settle(metrics)
        else follow.sample(metrics)
        if (follow.active && (cause === 'resize' || (cause === 'scrollend' && wasAnimating))) {
          metrics = follow.toBottom(body, metrics, 'smooth')
        }
      }
      next = { canScrollUp: metrics.top > 1, canScrollDown: metrics.top < metrics.floor - 1 }
    } else follow.reset()
    setEdges(previous => previous.canScrollUp === next.canScrollUp && previous.canScrollDown === next.canScrollDown
      ? previous : next)
  }, [bodyRef, follow])
  const interrupt = useCallback(() => {
    const body = bodyRef.current
    if (body !== null && follow.animating) follow.interrupt(body, scrollMetrics(body))
  }, [bodyRef, follow])
  const events = useMemo(() => ({
    onScroll: () => { sync('scroll') },
    onWheel: interrupt,
    onTouchStart: interrupt,
    onPointerDown: interrupt,
    onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => {
      if (!event.defaultPrevented && SCROLL_KEYS.has(event.key)) interrupt()
    },
  }), [interrupt, sync])

  useLayoutEffect(() => {
    interrupt()
    follow.reset()
    if (!grouped || !open) initialPosition.current = null
  }, [follow, grouped, interrupt, open])
  useLayoutEffect(() => {
    const body = bodyRef.current
    if (body === null || !open || typeof ResizeObserver === 'undefined') return
    const unbind = follow.bind(body)
    const observer = new ResizeObserver(() => { sync('resize') })
    const onScrollEnd = (event: Event): void => { if (event.target === body) sync('scrollend') }
    body.addEventListener('scrollend', onScrollEnd)
    observer.observe(body)
    if (contentRef.current !== null) observer.observe(contentRef.current)
    return () => {
      unbind()
      observer.disconnect()
      body.removeEventListener('scrollend', onScrollEnd)
    }
  }, [bodyRef, contentRef, follow, open, sync])
  return { edges, events, initialize }
}
