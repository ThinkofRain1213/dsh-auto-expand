/**
 * 克隆自 `chat/use-process-scroll.ts`（88 行）。
 *
 * 上游：@deepseek-ai/dsh-client-ui-chat@0.2.1-rc.3，commit 1f81c047fc
 *
 * 修改点（两处，其余逐字保留）：
 *   1. `sync` 的 resize 分支不再用当次几何重判跟随意图。
 *      **根因**：body 默认开启滚动锚定（`overflow-anchor: auto`），内容在
 *      视口上方变高时浏览器会主动改 `scrollTop`。`ScrollFollow.sample()` 把
 *      「scrollTop 变了」当成「读者滚了」，于是把跟随关掉。本插件 P3 的思考
 *      自动展开正是"body 内部一次性大幅长高"的来源，因此典型触发场景是
 *      大段思考展开。跟随一旦被关掉不会自恢复（`toBottom` 是唯一恢复路径，
 *      而它的入口条件就是"已在跟随"），于是表现为滚动永久失效，直到读者
 *      手动滚到底。
 *   2. 新增 `realign()`：立即执行一次 resize 校准。
 *      `initialize()` 只是记下意图，要等**下一次** `sync('resize')` 才被消费；
 *      自动展开若在此之后没有尺寸变化，这次定位就永远丢失。`realign` 让
 *      调用方能在 DOM 更新后的同一帧里把意图兑现。
 *
 * 逐字保留其余部分：这是 group body 的内部滚动跟随与边缘渐变，与
 * `AutoGroupSeat` 的 400px 上限配合工作。简化会改变手感，因此不做精简。
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
 * @returns 边缘渐变、DOM 事件绑定、一次性定位意图的登记，以及立即兑现它的校准。
 */
export function useProcessScroll(
  bodyRef: RefObject<HTMLDivElement>, contentRef: RefObject<HTMLDivElement>, open: boolean, grouped: boolean,
): {
  edges: ScrollEdges
  events: Pick<DOMAttributes<HTMLDivElement>, 'onScroll' | 'onWheel' | 'onTouchStart' | 'onPointerDown' | 'onKeyDown'>
  initialize: (position: 'top' | 'bottom') => void
  realign: () => void
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
      } else if (cause === 'resize') {
        // ── 改动 1：内容增长不是读者行为 ──────────────────────────────────
        // 浏览器滚动锚定会在内容变高时主动改 `scrollTop`；把它当成"读者上滚"
        // 会永久关掉跟随（`following` 一旦为 false，只有手动滚到底才恢复）。
        // 因此这里只用当次几何刷新采样基线，**绝不**据此重判跟随意图。
        follow.sample(metrics, false)
        if (follow.active) metrics = follow.toBottom(body, metrics, 'smooth')
      } else {
        const wasAnimating = follow.animating
        if (cause === 'scrollend') follow.settle(metrics)
        else follow.sample(metrics)
        if (follow.active && cause === 'scrollend' && wasAnimating) {
          metrics = follow.toBottom(body, metrics, 'smooth')
        }
      }
      next = { canScrollUp: metrics.top > 1, canScrollDown: metrics.top < metrics.floor - 1 }
    } else follow.reset()
    setEdges(previous => previous.canScrollUp === next.canScrollUp && previous.canScrollDown === next.canScrollDown
      ? previous : next)
  }, [bodyRef, follow])
  // ── 改动 2：立即兑现 initialize 登记的意图 ─────────────────────────────
  // `initialize` 只写 `initialPosition`，消费它的唯一入口是 `sync('resize')`。
  // 自动展开不经过官方 `toggle`，之后若没有尺寸变化，这次定位就永远丢失。
  const realign = useCallback(() => { sync('resize') }, [sync])
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
  return { edges, events, initialize, realign }
}
