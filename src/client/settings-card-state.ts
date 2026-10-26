/**
 * 设置卡片九行的状态推导：三个开关 + 两个收起时机 + 一个隐藏范围 + 高度三行。
 *
 * 单独成模块的理由与 `settings-write.ts` / `scroll-align.ts` 相同：这是有分支的
 * 判定逻辑，必须能被直接断言。设置卡片的 DOM 渲染需要 React 与 slot 运行时，
 * 但「哪一行该变灰」是纯数据推导。
 *
 * ## 为什么需要「变灰」
 *
 * 思考块与工具行都渲染在 group body **内部**（两者都从 `GroupOpenContext`
 * 读大段的展开状态），大段折叠时它们都不可见。所以「自动展开操作组」关掉之后，
 * 「自动展开思考过程」与「自动展开工具结果」都是**永远不会生效**的开关。
 *
 * 再往下一层：**某个开关关闭时，该层的收起时机也不生效**——没有自动展开，
 * 就没有「什么时候收起」可言。所以时机行比开关行多一道门控，而且需要知道
 * **被谁锁住**，描述里才好点名那个开关。
 */

/** 三个开关的当前值。 */
export interface SwitchValues {
  readonly groupAutoExpand: boolean
  readonly reasoningAutoExpand: boolean
  readonly toolAutoExpand: boolean
  /** 高度第一行：是否启用自定义高度。**永不被锁。** */
  readonly groupHeightCustom: boolean
  /** 高度第三行：历史轮次是否也应用。 */
  readonly groupHeightHistory: boolean
}

/** 一行开关的渲染状态。 */
export interface SwitchRowState {
  /** 显示给用户的当前值。 */
  readonly checked: boolean
  /** 是否拒绝输入并变灰。 */
  readonly locked: boolean
  /** 描述行是否应换成「由谁控制」的说明。 */
  readonly gatedText: boolean
}

/**
 * 一行下拉的渲染状态。
 *
 * 与 {@link SwitchRowState} 的区别：时机行的「值」是枚举（由调用方直接读设置），
 * 所以只需要表达「锁没锁」和「被谁锁」——后者决定描述里该点名哪个开关。
 */
export interface SelectRowState {
  /** 是否拒绝输入并变灰。 */
  readonly locked: boolean
  /** 锁定原因：`none` 未锁 / `workGroup` 由操作组开关锁 / `own` 由本层开关锁 /
   *  `heightCustom` 由高度第一行锁。 */
  readonly gate: 'none' | 'workGroup' | 'own' | 'heightCustom'
}

/**
 * 一行数字输入的渲染状态。
 *
 * 与 {@link SelectRowState} 同形，但单独命名：数字行的控件是 `<input>` 而不是
 * 下拉，将来若两者的锁定规则分化，名字已经分开了。
 */
export interface NumberRowState {
  readonly locked: boolean
  readonly gate: 'none' | 'heightCustom'
}

/**
 * 被门控的**开关行**：既带值（`checked`）又带锁定原因。
 *
 * `SwitchRowState` 只有 `locked` 没有 `gate`，而高度第三行需要知道「被谁锁」；
 * `SelectRowState` 有 `gate` 却没有 `checked`，而且是下拉的语义。
 * 两者都不合适，因此单独一个类型。
 */
export interface GatedSwitchRowState {
  readonly checked: boolean
  readonly locked: boolean
  readonly gate: 'none' | 'heightCustom'
}

/** 整张卡片的九行状态。 */
export interface SettingsCardState {
  readonly workGroup: SwitchRowState
  readonly reasoning: SwitchRowState
  readonly reasoningTiming: SelectRowState
  readonly tool: SwitchRowState
  readonly toolTiming: SelectRowState
  /** 隐藏查看按钮（P9）。**永不锁死**，与其它行不同。 */
  readonly inspectScope: SelectRowState
  /**
   * 选中「运行中隐藏」时，该档是否因自动展开关闭而**失效**。
   *
   * - `none`：有效；
   * - `workGroup` / `own`：没有「运行中」可言，该档等同于「不隐藏」。
   *
   * 这不是门控——该行照样可以操作，只是说明里要点名原因。
   */
  readonly inspectScopeIdle: 'none' | 'workGroup' | 'own'
  /** 高度第一行（开关）。**永不锁死**，与操作组开关同级。 */
  readonly heightCustom: SwitchRowState
  /** 高度第二行（数字输入），由高度第一行锁。 */
  readonly heightPercent: NumberRowState
  /**
   * 高度第三行（**开关**，不是下拉），由高度第一行锁。
   *
   * 用 {@link GatedSwitchRowState} 而不是 `SelectRowState`：后者是下拉行的类型，
   * 用在开关上会让后来者以为这一行是下拉。`checked` 也在这里给出，
   * 避免「值从 settings 取、状态从这里取」的双来源。
   */
  readonly heightHistory: GatedSwitchRowState
  /**
   * 「操作组自动展开」关闭时，高度设置**可编辑但不生效**。
   *
   * 这不是门控——行照样能操作，只是说明文案要点名原因。与
   * `inspectScopeIdle` 是同一套做法：不锁行，只在描述里解释。
   */
  readonly groupHeightIdle: boolean
}

/**
 * 推导九行的渲染状态。
 *
 * 四条规则：
 *
 *  1. **操作组开关永不被锁**。它是这组设置里唯一能独立决策的一层；
 *  2. **操作组关闭 → 思考/工具开关被锁**。它们确实不会生效；
 *  3. **开关关闭 → 该层的时机行被锁**，且锁定原因记为 `own`；操作组关闭时
 *     记为 `workGroup`（优先），这样描述里点名的是最近的那一层的控制者；
 *  4. **锁住时保留 `checked` 原值，不强制 `false`**。这样重新打开上层后，
 *     用户之前的选择原样回来（DPG 的 `injectDoc` 行是同样的处理）。
 *
 * @param values - 当前设置。
 * @returns 九行各自的渲染状态。
 */
export function deriveSettingsCardState(values: SwitchValues): SettingsCardState {
  // 开关行的锁定条件：都渲染在 group body 内部，操作组不开就无从生效。
  const innerLocked = !values.groupAutoExpand
  /**
   * 时机行的锁定原因：先看操作组（更上层），再看本层开关。
   * @param enabled - 该层自己的自动展开开关。
   * @returns 锁定原因。
   */
  const timingGate = (enabled: boolean): SelectRowState['gate'] => {
    if (!values.groupAutoExpand) return 'workGroup'
    if (!enabled) return 'own'
    return 'none'
  }
  const reasoningGate = timingGate(values.reasoningAutoExpand)
  const toolGate = timingGate(values.toolAutoExpand)
  return {
    workGroup: { checked: values.groupAutoExpand, locked: false, gatedText: false },
    reasoning: {
      checked: values.reasoningAutoExpand,
      locked: innerLocked,
      gatedText: innerLocked,
    },
    reasoningTiming: { locked: reasoningGate !== 'none', gate: reasoningGate },
    tool: {
      checked: values.toolAutoExpand,
      locked: innerLocked,
      gatedText: innerLocked,
    },
    toolTiming: { locked: toolGate !== 'none', gate: toolGate },
    // 隐藏查看按钮：**永不锁死**（用户明确要求它是独立设置）。
    //
    // 但「运行中隐藏」这一档依赖自动展开：`enabled = 工具开关 && 组展开 && 组自动`
    // 为假时没有「运行中」可言，该档实际等同于「不隐藏」。这不是门控——
    // 行照样可操作，只是说明文案要点名原因（`inspectScopeIdle`）。
    inspectScope: { locked: false, gate: 'none' },
    // 优先报操作组（更上层），与时机行的 gate 规则一致。
    inspectScopeIdle: !values.groupAutoExpand ? 'workGroup'
      : !values.toolAutoExpand ? 'own'
        : 'none',
    // 高度第一行：与操作组开关同级——**自己能独立决策，永不被锁**。
    //
    // 理由：它保存的是用户偏好（「我想要 150%」这个意图），即使当前大段开关
    // 关闭也仍然有效，关掉再打开时应原样回来。强行灰化会让用户以为设置丢了。
    // 大段关闭时高度确实不生效，但那由 `groupHeightIdle` 用文案说明，不锁行
    // ——与第六行（隐藏查看按钮）同一套做法。
    heightCustom: {
      checked: values.groupHeightCustom,
      locked: false,
      gatedText: false,
    },
    // 后两行只被高度第一行锁。注意这里**不复用** `timingGate()`：那个函数先看
    // 大段开关再看本层，而高度三行与大段开关的锁定关系是「不锁、只说明」，
    // 用它会错误地把 `workGroup` 报成 gate。
    heightPercent: values.groupHeightCustom
      ? { locked: false, gate: 'none' }
      : { locked: true, gate: 'heightCustom' },
    // `checked` 从这里给出（读 `values.groupHeightHistory`），而不是让渲染层
    // 直接从 settings 取 —— 那样这一行就有两个数据来源，`SwitchValues` 里的
    // `groupHeightHistory` 会变成一个没人读的悬空字段。
    heightHistory: {
      checked: values.groupHeightHistory,
      locked: !values.groupHeightCustom,
      gate: values.groupHeightCustom ? 'none' : 'heightCustom',
    },
    groupHeightIdle: !values.groupAutoExpand,
  }
}