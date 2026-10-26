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

/** {@link groupHeight} 的输入：组状态与当前设置。 */
export interface GroupHeightInput {
  /**
   * 卡片第一行的开关（`groupAutoExpand`）。
   *
   * 关闭时「自动展开」不存在，高度设置没有可作用的对象 —— Spec §6.5 的第 0 条。
   */
  readonly groupAutoExpand: boolean
  /**
   * 官方判据 `capped = grouped && (!deferCompletedTurns || open)` 的结果。
   *
   * **必须由调用方传入，不要在这里重算**：`grouped` 为假（官方 detailed 平铺
   * 模式）时 `capped` 恒假，重算会给本应无上限的组强加上限。
   */
  readonly capped: boolean
  /** 该组是否属于「当前正在运行」，即 `closed === false`。 */
  readonly isCurrent: boolean
  /** 是否启用自定义高度。 */
  readonly custom: boolean
  /** 历史轮次是否也应用。 */
  readonly history: boolean
  /** 高度百分比；`null` = 留空 = 不设上限。 */
  readonly percent: number | null
}

/** 应贴到 body 上的内联样式。 */
export interface GroupHeightStyle {
  readonly maxHeight: string
  /**
   * 只在「不设上限」时出现。
   *
   * 实测：只写 `max-height: none` 而元素仍是 `.body` 时，`overflow-y: auto`
   * 会**继续裁剪**超出可视区的内容，`scrollbar-gutter: stable` 也仍保留
   * 滚动条预留宽度。必须成对写 `overflow-y: visible` 才与真正平铺等价。
   */
  readonly overflowY?: string
}

/**
 * 算出某一组 body 应有的高度。
 *
 * 规则按顺序命中，先命中先返回（Spec §6.5 + §6.2）：
 *
 * | # | 条件 | 结果 |
 * |---|---|---|
 * | 0 | `!groupAutoExpand` | `null`（整个功能不生效） |
 * | 1 | `!capped` | `null`（官方本就不设上限） |
 * | 2 | `!custom` | `null`（走官方） |
 * | 3 | `!isCurrent && !history` | `null`（历史组不应用） |
 * | 4 | `percent === null` | 无上限，成对给 `overflow-y` |
 * | 5 | 其他 | `min(percent*4 px, percent*0.5 vh)` |
 *
 * @param input - 组状态与当前设置。
 * @returns 内联样式；`null` 表示不写 style，交给 CSS class。
 */
export function groupHeight(input: GroupHeightInput): GroupHeightStyle | null {
  if (!input.groupAutoExpand) return null
  if (!input.capped) return null
  if (!input.custom) return null
  if (!input.isCurrent && !input.history) return null
  // 留空 = 用户明确选择不设上限。
  if (input.percent === null) return { maxHeight: 'none', overflowY: 'visible' }
  return { maxHeight: `min(${input.percent * 4}px, ${input.percent * 0.5}vh)` }
}
