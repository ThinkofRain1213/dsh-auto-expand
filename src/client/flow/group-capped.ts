/**
 * group body 的高度上限判定。
 *
 * 单独成模块的理由与 `scroll-align.ts` / `settings-write.ts` 相同：这是有分支的
 * 判定逻辑，必须能被直接断言。它同时是**一处与官方的有意偏离**，所以需要自己的
 * 位置来说明为什么。
 *
 * ## 官方公式在折叠动画下是错的
 *
 * 官方 `ChatGroupSeat.tsx:182`：
 *
 * ```ts
 * const capped = grouped && (!deferCompletedTurns || open)
 * ```
 *
 * 注释称"正在关闭的 body 保留平铺高度，使过渡从屏幕上的样子开始"——但在
 * `collapseTiming === 'next-input'` 时这句话恰好不成立。
 *
 * `capped` 决定 body 用 `.body`（`max-height: min(400px, 50vh)`，内部滚动）
 * 还是 `.expandedBody`（`max-height: none`，全部摊开）。公式里带 `open` 意味着
 * 折叠那一刻 `open` 变 false、`capped` 同时变 false，body 在动画测量**之前**
 * 就被摊成完整高度。三个症状由此而来：
 *
 * | 位置 | 读到的数字 | 症状 |
 * |---|---|---|
 * | `flow-motion.ts:370` 的 `element.offsetHeight` | 完整内容高度（几千 px） | **上面跳变**（动画从完整高度收起） |
 * | `use-chat-viewport.ts:259` 的 `removed += box.height` | 同上 | **下面被拉上去**（视口位移算大） |
 * | `use-chat-viewport.ts:282` 的 `setSpacer(...)` | 同上 | **最下面凭空多出空白** |
 *
 * 三者是同一个数字算错的三种表现。
 *
 * ## 为什么官方自己没发现
 *
 * `DEFAULT_COLLAPSE_TIMING = 'completion'`，那时 `deferCompletedTurns` 为假，
 * `capped` 恒等于 `grouped`、与 `open` 无关，折叠前后 body 都是 400px 上限
 * ——正好是"屏幕上的样子"，动画正确。只有切到 `next-input` 才会暴露。
 *
 * ## 修法
 *
 * `capped` 是 body 的**布局属性**（要不要 400px 上限），不该随展开状态变化。
 */

/**
 * 判断 group body 是否应用 400px 高度上限。
 *
 * **与官方的唯一差异**：不依赖 `open`、也不依赖 `deferCompletedTurns`。
 * 折叠时 body 保持上限，`flow-motion` 才能测到屏幕上那个 400px。
 *
 * @param grouped - 当前展示模式是否保留 group 的高度上限。
 *   为假时（`detailed` 模式下运行中的 Turn、`verbose` 模式）body 本就完全平铺，
 *   不存在上限可言。
 * @returns body 是否应该带上限。
 */
export function isBodyCapped(grouped: boolean): boolean {
  return grouped
}
