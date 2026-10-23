/**
 * 「查看」按钮的隐藏范围判据（纯函数）。
 *
 * ## 它控制什么
 *
 * 官方工具行上的「查看」按钮由**一个信号**决定是否渲染：
 *
 * | 位置 | 判据 |
 * |---|---|
 * | `ToolRow.tsx:357`（通用工具行） | `inspect !== undefined` |
 * | `QuestionToolRow.tsx:57`（提问行） | `inspect !== undefined` |
 * | `bash-sample.tsx:158`（bash 示例行） | `inspect !== undefined` |
 * | `ToolRow.tsx:325` → `ToolDetails` 的 `hasInspect` | 同上 |
 * | `ToolRow.module.css:126` 的 `.inspectButton` 占位 | 同上（不渲染则行高消失） |
 *
 * 而 `inspect` 由 `ToolCallTree.tsx:38` 从 props 的 `inspectCall` 派生：
 *
 * ```ts
 * inspect: inspectCall === undefined ? undefined : () => { inspectCall(callId) }
 * ```
 *
 * 所以本插件只需在包裹层决定**是否把 `inspectCall` 透传下去**，五个渲染点
 * 会一起存亡——不改 CSS，不克隆 `ToolRow`。
 *
 * ## 三档
 *
 * | 取值 | 语义 |
 * |---|---|
 * | `'off'` | 不隐藏（**默认**）。原样透传，逐字等价于未安装本插件 |
 * | `'current'` | 仅当前轮隐藏。历史操作组（`auto === false`）保持官方行为 |
 * | `'all'` | 全部轮次隐藏 |
 *
 * 「当前轮」的判据复用 `GroupOpenContext.auto`（该操作组处于当前轮的自动展开
 * 窗口），与操作组开关、思考/工具开关同源，不引入新概念。
 *
 * ## 未知取值为什么回落到 `off`
 *
 * 字段可能来自旧存档（没有这个键）或未来被改名。回落到 `off` 意味着「行为
 * 不变」，是唯一安全的默认——若回落到 `all`，用户升级后会莫名其妙地丢掉按钮。
 */

/** 查看按钮的隐藏范围。 */
export type InspectButtonHideScope = 'off' | 'current' | 'all'

/**
 * 全部取值，顺序 = 下拉展示顺序 = **从松到紧**。
 *
 * Host 侧的 schema 也用它，从而两端不可能出现取值集合不一致。
 */
export const INSPECT_BUTTON_HIDE_SCOPES: readonly InspectButtonHideScope[] = ['off', 'current', 'all']

/**
 * 默认值：`'off'`（不隐藏）。
 *
 * ⚠️ 必须是 `off`：改成别的会让已安装用户升级后**凭空少一个入口**。契约测试
 * 会守住这一条。
 */
export const DEFAULT_INSPECT_BUTTON_HIDE_SCOPE: InspectButtonHideScope = 'off'

/** {@link inspectCallFor} 的输入。 */
export interface InspectButtonScopeInput {
  /** 用户选定的隐藏范围。未知取值按 `'off'` 处理。 */
  readonly scope: InspectButtonHideScope | undefined
  /** 该工具行所属操作组是否处于**当前轮**的自动展开窗口。 */
  readonly auto: boolean
  /** 上游原本提供的回调；官方设置关闭时为 `undefined`。 */
  readonly inspectCall: ((callId: string) => void) | undefined
}

/**
 * 按隐藏范围决定**透传给官方组件**的 `inspectCall`。
 *
 * 返回 `undefined` 时，官方会把 `inspect` 也算成 `undefined`，于是按钮、它
 * 预留的那一行高度、以及详情卡右侧给按钮让位的 88px 内边距**一起消失**。
 *
 * 返回原回调时，行为与未安装本插件完全一致。
 *
 * ## 绝不能返回空函数
 *
 * 官方判的是 `inspect !== undefined`，不是「按钮能不能用」。返回一个空函数
 * 会造出一个**渲染出来、点了没反应**的按钮——比不隐藏更糟。
 *
 * @param input - 档位、当前轮状态与上游回调。
 * @returns 应透传的回调；`undefined` 表示不渲染按钮。
 */
export function inspectCallFor(input: InspectButtonScopeInput): ((callId: string) => void) | undefined {
  // 上游本就没有入口（官方「显示代码工作视图」关闭）时，任何档位都保持没有。
  // 这一条同时挡住了「凭空造回调」——见上面「绝不能返回空函数」。
  if (input.inspectCall === undefined) return undefined
  switch (input.scope) {
    // 仅当前轮：历史组的 auto 为假，交回官方。
    case 'current':
      return input.auto ? undefined : input.inspectCall
    // 全部轮次。
    case 'all':
      return undefined
    // 'off' 以及任何未知取值：原样透传。
    default:
      return input.inspectCall
  }
}
