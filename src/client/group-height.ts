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
 * 若这里重算就会给本应无上限的组强加上限。
 *
 * ## 两个维度，不是三个状态
 *
 * 高度只有两个**本质不同**的状态：
 *
 * | 状态 | 含义 |
 * |---|---|
 * | 有上限 | `min(N*4px, N*0.5vh)` |
 * | 无上限 | 内容随对话滚动 |
 *
 * 「官方默认」不是第三种状态 —— 它是「有上限」在 `N = 100` 时的特例：
 * `min(100*4px, 100*0.5vh)` 恰好等于官方的 `min(400px, 50vh)`，逐像素相同。
 *
 * 因此 `percent === 100` 时返回 `null`（不写内联样式），完全交给 CSS ——
 * 「100% 等于官方默认」因此是**字面意义上**的等价，不是一个还需要特殊处理的档位。
 *
 * ⚠️ 早先的版本用 `percent: number | null`、以「留空」表示无上限。那让
 * schema 不能加 `.default()`、`read()` 不能写 `??`、类型四处传染 `null` ——
 * 都是**用一个特殊值去补偿缺失的状态槽位**的代价。现在无上限由独立布尔表达，
 * 这些代价全部消失。
 */

/** 是否不限制高度（无上限）。 */
export const GROUP_HEIGHT_UNLIMITED_FIELD = 'groupHeightUnlimited'

/** 高度百分比。100 = 官方默认，逐像素相同。 */
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
   * 卡片里的「自动展开操作组」开关（`groupAutoExpand`）。
   *
   * 关闭时「自动展开」不存在，高度设置没有可作用的对象。
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
  /** 是否不限制高度。 */
  readonly unlimited: boolean
  /** 历史轮次是否也应用。 */
  readonly history: boolean
  /** 高度百分比；100 = 官方默认。 */
  readonly percent: number
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
  readonly overflowY?: 'visible'
}

/**
 * 算出某一组 body 应有的高度。
 *
 * 规则按顺序命中，先命中先返回：
 *
 * | # | 条件 | 结果 |
 * |---|---|---|
 * | 0 | `!groupAutoExpand` | `null`（整个功能不生效） |
 * | 1 | `!capped` | `null`（官方本就不设上限） |
 * | 2 | `!isCurrent && !history` | `null`（历史组不应用） |
 * | 3 | `unlimited` | 无上限，成对给 `overflow-y` |
 * | 4 | `percent === 100` | `null`（与官方逐像素相同，不干预） |
 * | 5 | 其他 | `min(percent*4 px, percent*0.5 vh)` |
 *
 * 第 4 条是「100% = 官方默认」的实现：不写任何内联样式，让 `.body` 的
 * `min(400px, 50vh)` 原样生效。这样默认状态与未安装插件**完全一致**。
 *
 * @param input - 组状态与当前设置。
 * @returns 内联样式；`null` 表示不写 style，交给 CSS class。
 */
export function groupHeight(input: GroupHeightInput): GroupHeightStyle | null {
  if (!input.groupAutoExpand) return null
  if (!input.capped) return null
  if (!input.isCurrent && !input.history) return null
  if (input.unlimited) return { maxHeight: 'none', overflowY: 'visible' }
  // 100% 就是官方默认，不写内联 —— 让 CSS 的 min(400px, 50vh) 原样生效。
  if (input.percent === DEFAULT_GROUP_HEIGHT_PERCENT) return null
  return { maxHeight: `min(${input.percent * 4}px, ${input.percent * 0.5}vh)` }
}
