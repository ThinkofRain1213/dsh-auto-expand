/**
 * 极简的工具卡片 fallback。
 *
 * 官方 `ToolCallTree` 的 fallback 是 `GenericToolCard`（72 行），后者又依赖
 * 5 个 card model 与 `ToolRow`（394 行），最终牵出 `tool-call-model`（314 行）
 * 等一整套 `ui-tool` 内部实现——克隆它等于把整个包拖进来。
 *
 * 实际上 `tool.call.toolview` 有 9 个已注册 entry（bash / read / read_image /
 * file-mutation / search / web / todo / details / ask-question），
 * `renderSlot` 的 keyed 分派几乎总会命中其中之一。fallback 只在**工具名未注册**
 * 时出现（例如第三方工具或未来新增工具）。
 *
 * 因此这里用最小实现：显示工具名与阶段，保持行高与官方一致，不试图复刻卡片。
 * 这样既不引入庞大依赖，也不会在正常情况下被看到。
 */
import { memo } from 'react'
import type { ToolCallOwnerProps, ToolTreeProps } from './tool-contract.ts'
import css from './AutoToolCallTree.module.css'

/** `AutoGenericToolCard` 的 props：owner 载荷 + 渲染站点的 locale 座位。 */
export type AutoGenericToolCardProps = ToolCallOwnerProps & {
  t: ToolTreeProps['t']
}

/**
 * 渲染一个未注册工具的最小行。
 *
 * 与官方 `GenericToolCard` 的差异：不推断 variant、不渲染参数/结果卡片。
 * 只保证行存在、可展开、显示工具名，使未知工具不至于完全不可见。
 * @param props - 调用 owner 数据与 locale 座位。
 * @returns 最小工具行。
 */
export const AutoGenericToolCard = memo(function AutoGenericToolCard({
  toolName, t,
}: AutoGenericToolCardProps) {
  const translate = t as unknown as (key: string, params?: Record<string, unknown>) => string
  return (
    <div className={css.fallbackRow} data-tool-fallback={toolName || undefined}>
      <span className={css.fallbackTitle}>
        {toolName === '' ? translate('tool.unknown') : toolName}
      </span>
    </div>
  )
})
