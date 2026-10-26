/**
 * 操作组自定义高度的判据（纯函数）。
 *
 * ## 它控制什么
 *
 * 操作组 body 的高度上限写在 `AutoGroupSeat.module.css` 的 `.body` 上：
 *
 * ```css
 * .body          { max-height: min(400px, 50vh); overflow-y: auto; }
 * .body.expanded { max-height: none; overflow-y: visible; }
 * ```
 *
 * 本模块把「组状态 × 用户设置」翻译成一个内联 style，由 `AutoGroupSeat`
 * 贴在 body 上。**组件不再自己判断任何高度逻辑。**
 *
 * ## 为什么不重算 `grouped`
 *
 * 「这一组该不该有上限」是官方算好的：
 *
 * ```ts
 * const capped = grouped && (!deferCompletedTurns || open)
 * ```
 *
 * 本模块**消费** `capped`，不自己推导。官方 detailed 模式下 `capped` 恒假，
 * 若这里重算就会给本应无上限的组强加上限（见 Spec §6.3）。
 *
 * ## 「不设上限」为什么用 `null` 而不是 0
 *
 * `0` 在百分比语境里天然读作「最小」，用它表示「最大」需要用户反着理解，
 * 而且会让曲线在 0 处断裂（`f(0) = ∞` 但 `f(1) = 4px`）。
 *
 * 改为**留空 = 不设上限**之后，百分比曲线连续，控件里不存在任何特例值。
 * `0` 恢复成普通的「过小值」，由 UI 的橙色警告劝阻。
 *
 * ⚠️ Host schema 里这个字段**不能加 `.default()`**：实测
 * `union([z.natural(), z.const(null)]).default(100)` 会把用户存的 `null`
 * 静默改写成 `100`，直接摧毁「留空 = 无上限」这个语义。
 */

/** 是否启用自定义高度。 */
export const GROUP_HEIGHT_CUSTOM_FIELD = 'groupHeightCustom'

/** 高度百分比。`null` = 留空 = 不设上限。 */
export const GROUP_HEIGHT_PERCENT_FIELD = 'groupHeightPercent'

/** 历史轮次是否也应用自定义高度。 */
export const GROUP_HEIGHT_HISTORY_FIELD = 'groupHeightHistory'

/**
 * 高度的默认百分比：100 等于官方原公式，逐像素相同。
 */
export const DEFAULT_GROUP_HEIGHT_PERCENT = 100
