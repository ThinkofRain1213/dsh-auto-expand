/**
 * 克隆自 `chat/use-scroll-follow.ts`（182 行）。
 *
 * 上游：@deepseek-ai/dsh-client-ui-chat@0.2.1-rc.2，commit 687f282e86
 *
 * 逐字保留，仅去掉对 `useState` 之外无关内容的依赖。这是 process group
 * 内部滚动跟随的内核，任何简化都会改变手感（边缘渐变、scrollend 处理、
 * 平滑动画中断），因此不做精简。
 *
 * 独立于分页与 DOM 观察器的底部跟随意图与原生滚动。
 */
import { useState } from 'react'

/** 滚动位置、调用方给出的下限与视口高度；原始测量使用物理下限。 */
export interface ViewportMetrics {
  readonly top: number
  readonly floor: number
  readonly height: number
}

/**
 * 读取一个滚动容器，不测量其子元素。
 * @param element - 滚动元素。
 * @returns 当前位置与范围。
 */
export function scrollMetrics(element: HTMLElement): ViewportMetrics {
  const height = element.clientHeight
  return { top: element.scrollTop, height, floor: Math.max(0, element.scrollHeight - height) }
}

/** 一个滚动容器的跟随意图；原生动画进度不算读者移动。 */
export class ScrollFollow {
  private static readonly owners = new WeakMap<HTMLElement, ScrollFollow>()
  private target: number | null = null
  private sampledTop: number | undefined

  /**
   * @param following - 初始跟随意图。
   * @param threshold - 距底部可接受的距离（像素）。
   */
  constructor(private following: boolean, private readonly threshold: number) {}

  /**
   * 找到已挂载的控制器，用于阅读位置补偿。
   * @param element - 可选的跟随所有者所在的滚动容器。
   * @returns 其控制器（若已绑定）。
   */
  static forElement(element: HTMLElement): ScrollFollow | undefined { return this.owners.get(element) }

  /**
   * 与同一滚动容器的阅读位置补偿共享此控制器。
   * @param element - 被拥有的滚动容器。
   * @returns 卸载或关闭时解除关联。
   */
  bind(element: HTMLElement): () => void {
    ScrollFollow.owners.set(element, this)
    return () => { if (ScrollFollow.owners.get(element) === this) ScrollFollow.owners.delete(element) }
  }

  /**
   * 独立于当前偏移量暴露跟随意图。
   * @returns 内容增长时是否应跟随底部。
   */
  get active(): boolean { return this.following }

  /**
   * 在接受读者输入前暴露未完成的原生运动。
   * @returns 原生跟随动画是否有未完成的目标。
   */
  get animating(): boolean { return this.target !== null }

  /**
   * 使用此滚动容器自己的容差判定到达底部。
   * @param metrics - 当前滚动几何。
   * @returns 位置是否在跟随阈值内。
   */
  nearBottom(metrics: ViewportMetrics): boolean { return Math.abs(metrics.floor - metrics.top) <= this.threshold }

  /**
   * 提交调用方拥有的跟随决策，不移动滚动容器。
   * @param active - 外部提交的跟随意图。
   */
  setFollowing(active: boolean): void {
    this.following = active
    if (!active) this.target = null
  }

  /** 将下一次可见布局采纳为新的阅读位置。 */
  reset(): void {
    this.setFollowing(false)
    this.sampledTop = undefined
  }

  /**
   * 在原生动画期间保留意图的同时采纳已交付的滚动。
   * @param metrics - 当前几何。
   * @param movedByReader - 调用方归因；省略时比较上次采样位置。
   * @returns 更新后的跟随意图。
   */
  sample(metrics: ViewportMetrics, movedByReader = this.sampledTop === undefined
    || Math.abs(metrics.top - this.sampledTop) > 0.5): boolean {
    this.sampledTop = metrics.top
    if (!this.animating && movedByReader) this.following = this.nearBottom(metrics)
    return this.active
  }

  /**
   * 结算原生滚动；偏离目标的停止会释放跟随意图。
   * @param metrics - scrollend 时实际交付的几何。
   * @returns 完成或中断原生运动后的跟随意图。
   */
  settle(metrics: ViewportMetrics): boolean {
    const target = this.target
    this.target = null
    return this.sample(metrics, target === null ? undefined
      : Math.abs(metrics.top - Math.min(target, metrics.floor)) > this.threshold)
  }

  /**
   * 立即定位并采纳结果跟随意图。
   * @param element - 滚动元素。
   * @param metrics - 定位前的几何。
   * @param top - 请求的偏移量，被钳制到已测量范围。
   * @returns 定位后的几何。
   */
  jump(element: HTMLElement, metrics: ViewportMetrics, top: number): ViewportMetrics {
    const animated = this.animating
    this.target = null
    const target = Math.max(0, Math.min(metrics.floor, top))
    if (animated) element.scrollTo({ top: target, behavior: 'instant' })
    else if (target !== metrics.top) element.scrollTop = target
    const landed = { ...metrics, top: element.scrollTop }
    this.sampledTop = landed.top
    this.following = this.nearBottom(landed)
    return landed
  }

  /**
   * 跟随已测量的底部，对平滑请求尊重减少动效偏好。
   * 平滑请求保留未完成目标；立即跟随更新会在内容改变底部时重定目标。
   * 容差内的定位在无未完成动画时立即执行。
   * @param element - 滚动元素。
   * @param metrics - 当前几何。
   * @param behavior - 内容增长的动画方式，或已在动画时立即定位。
   * @returns 当前几何；平滑请求在原生滚动交付前保留起始位置。
   */
  toBottom(element: HTMLElement, metrics: ViewportMetrics, behavior: 'instant' | 'smooth'): ViewportMetrics {
    this.following = true
    if (metrics.top === metrics.floor) return this.jump(element, metrics, metrics.floor)
    if (behavior === 'instant' && this.animating) {
      // 内容在未完成动画下增长：重定目标而非直接切到底部。
      if (this.target !== metrics.floor) {
        this.target = metrics.floor
        element.scrollTo({ top: metrics.floor, behavior: 'smooth' })
      }
      return metrics
    }
    if (behavior === 'instant' || (!this.animating && this.nearBottom(metrics))) return this.jump(element, metrics, metrics.floor)
    if (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return this.jump(element, metrics, metrics.floor)
    }
    if (this.target === null) {
      this.target = metrics.floor
      element.scrollTo({ top: metrics.floor, behavior: 'smooth' })
    }
    return metrics
  }

  /**
   * 在读者手势前取消原生运动；只有后续实际移动才改变跟随意图。
   * @param element - 滚动元素。
   * @param metrics - 中断时的位置。
   */
  interrupt(element: HTMLElement, metrics: ViewportMetrics): void {
    if (!this.animating) return
    this.target = null
    this.sampledTop = metrics.top
    element.scrollTo({ top: metrics.top, behavior: 'instant' })
  }
}

/**
 * 保留一个独立的跟随控制器，滚动采样不触发 React 更新。
 * @param initial - 初始跟随意图。
 * @param threshold - 距底部可接受的距离（像素）。
 * @returns 由调用方的滚动与尺寸处理器共享的稳定控制器。
 */
export function useScrollFollow(initial: boolean, threshold: number): ScrollFollow {
  const [follow] = useState(() => new ScrollFollow(initial, threshold))
  return follow
}
