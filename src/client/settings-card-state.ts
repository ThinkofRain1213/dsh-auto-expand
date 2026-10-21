/**
 * 设置卡片的两行开关状态。
 *
 * 单独成模块的理由与 `settings-write.ts` / `scroll-align.ts` 相同：这是有分支的
 * 判定逻辑，必须能被直接断言。设置卡片的 DOM 渲染需要 React 与 slot 运行时，
 * 但"哪一行该变灰、开关该不该响应"是纯数据推导。
 *
 * ## 为什么需要"变灰"
 *
 * 思考块渲染在 group body **内部**（`AutoReasoningRow` 通过 `GroupOpenContext`
 * 读大段的展开状态），大段折叠时思考不可见。所以"展开工作大段"关掉之后，
 * "展开思考过程"是一个**永远不会生效**的开关。
 *
 * 两个开关在界面上却长得完全独立。不把依赖关系显示出来，UI 就在撒谎——用户会
 * 反复拨弄一个毫无反应的开关，只会认为插件坏了。
 */

/** 两个开关的当前值。 */
export interface SwitchValues {
  readonly groupAutoExpand: boolean
  readonly reasoningAutoExpand: boolean
}

/** 一行开关的渲染状态。 */
export interface SwitchRowState {
  /** 显示给用户的当前值。 */
  readonly checked: boolean
  /** 是否拒绝输入并变灰。 */
  readonly locked: boolean
  /** 描述行是否应换成"由谁控制"的说明。 */
  readonly gatedText: boolean
}

/** 整张卡片的两行状态。 */
export interface SettingsCardState {
  readonly workGroup: SwitchRowState
  readonly reasoning: SwitchRowState
}

/**
 * 推导两个开关的渲染状态。
 *
 * 三条规则：
 *
 *  1. **大段开关永不被锁**。它是这组设置里唯一能独立决策的一层；
 *  2. **大段关闭 → 思考开关被锁**。它确实不会生效，让用户能拨动是在骗人；
 *  3. **锁住时保留 `checked` 原值，不强制 `false`**。这样重新打开大段后，
 *     用户之前对思考的选择原样回来（DPG 的 `injectDoc` 行是同样的处理）。
 *
 * @param values - 当前设置。
 * @returns 两行各自的渲染状态。
 */
export function deriveSettingsCardState(values: SwitchValues): SettingsCardState {
  const reasoningLocked = !values.groupAutoExpand
  return {
    workGroup: { checked: values.groupAutoExpand, locked: false, gatedText: false },
    reasoning: {
      checked: values.reasoningAutoExpand,
      locked: reasoningLocked,
      gatedText: reasoningLocked,
    },
  }
}
