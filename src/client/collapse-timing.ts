/**
 * 收起时机的判据（纯函数）。
 *
 * ## 两个对象、同一套时机
 *
 * 思考行与工具行都渲染在操作组 body 内部、都以「行」为收起单位，并且都由
 * 操作组提供**同样的两个坐标**（见下表）。因此两者可用同一套时机、同一段
 * 判据——不存在「某个时机只对某一方有意义」的情形。
 *
 * 这是 2026-10-23 的修订：此前给思考裁掉了 `'next-call'`，理由是「一个 step
 * 只有一段思考」。那个理由本身没错，但**不该据此改写时机集合**：思考同样有
 * `anchorSeq`，该时机在它身上真实成立、也真的会产生不同效果（思考所属
 * 节点的 `anchorSeq` 是首条可见 chunk 的 seq，本 step 的工具一出现就会被
 * 取代）。人为裁剪只会让两个对象说两套话。
 *
 * ## 四个时机
 *
 * | # | 取值 | 文案 | 判据 | 坐标 | 收起范围 |
 * |---|---|---|---|---|---|
 * | 1 | `'self'` | 本条完成时 | `!done` | — | 本条 |
 * | 2 | `'next-call'` | 下一条操作出现时 | 自己是**最新一条已开始**的操作 | **操作级** | **永远单条** |
 * | 3 | `'next-node'` | 下一批操作出现时 | `step >= latestStep` | **批次级** | 同批多条 |
 * | 4 | `'group'` | 随操作组收起 | 恒真 | — | 全部 |
 *
 * 顺序 = 下拉展示顺序 = **展开范围由窄到宽**，也正好是收起由早到晚。
 *
 * ## 术语
 *
 * | 词 | 指什么 | 对应数据 |
 * |---|---|---|
 * | **本条** | 当前这一行（一段思考 / 一条工具调用） | 一个行实例 |
 * | **操作** | 操作组里的一个节点 | 一个 Chat Node，`anchorSeq` 唯一 |
 * | **批次** | 一次模型输出派发的全部操作 | 同一个 `step` |
 * | **操作组** | 当前轮里连续的一段工作过程 | process group |
 * | 节点 | 「操作」的底层叫法，**只出现在代码与设计文档里**，不进 UI 文案 | Chat Node |
 *
 * ## 两个坐标的真实语义
 *
 * | 坐标 | 表达 | 来源 | 稳定性 |
 * |---|---|---|---|
 * | `step` | **批次**（同一次模型输出相同） | `assistant-step → data.step`；`tool-call → data.root.step` | ⚠️ 工具的 `result` 阶段丢失，调用方用 `useRef` 固定（`useStableToolStep`） |
 * | `anchorSeq` | **单条操作实际开始的先后** | 节点自带的 `anchorSeq`，但只统计**已开始**的（见 `startedAnchorOfNode`） | ✅ 全阶段稳定 |
 *
 * ⚠️ 操作坐标**必须过滤未开始的成员**。工具节点在流式阶段（`preparing`）就被
 * 创建，`anchorSeq` 此时已经定死；若把未执行的也算进「最新」，同一次模型输出
 * 派发的多条工具会在执行前就分出胜负，只有序号最大的那条能展开——真机已复现
 * 「只有最后一条展开」。过滤后，最新者才会随执行推进而前移。
 *
 * `enabled` 由调用方算好（`开关 && group.open && group.auto`），本模块只管
 * 「时机的差异」这一段——思考与工具的判据因此逐字相同。
 */

/** 收起时机。 */
export type CollapseTiming = 'self' | 'next-call' | 'next-node' | 'group'

/**
 * 全部时机取值，顺序 = 下拉展示顺序 = 收起由早到晚。
 *
 * 思考行与工具行**共用这一份**：两者的坐标齐全，四个时机都成立。
 * Host 侧的 schema 也用它，从而两端不可能出现取值集合不一致。
 */
export const COLLAPSE_TIMINGS: readonly CollapseTiming[] = ['self', 'next-call', 'next-node', 'group']

/**
 * 判断某行所属节点是否属于所属操作组的**最新一批**（按 `step`）。
 *
 * 这是「下一批操作出现时」用的批次级判据：同一次模型输出里并行发起的多个
 * 操作共享同一个 `step`，因此它们会被判定为同一批、**一起**保持展开。
 *
 * 用 `>=` 而不是 `==`：组内最新 `step` 单调不减，正常流程下两者等价；但成员
 * 列表暂时不完整时 `>=` 只会多展开、不会误收，是安全的一侧。
 *
 * `latestStep === undefined`（空组、或尚未拿到成员）时**视为最新**：
 * 拿不到信息时保守地保持展开，而不是错误地收起。
 * @param step - 该行所属节点的 `step`（模型输出轮次）。
 * @param latestStep - 所属操作组最新成员的 `step`。
 * @returns 是否属于最新一批。
 */
export function isLatestStep(step: number, latestStep: number | undefined): boolean {
  return latestStep === undefined || step >= latestStep
}

/**
 * 判断某行所属节点是否为所属操作组的**最新一条已开始的操作**（按 `anchorSeq`）。
 *
 * 这是「下一条操作出现时」用的操作级判据：只有组内**已开始**的成员里
 * `anchorSeq` 最大的那一条展开；下一条开始执行时，前一条立刻收起。
 * 已经做完但还没有后续操作接手的，保持展开（`anchorSeq` 不变，判据仍为真）。
 *
 * `latestAnchorSeq === undefined` 时同样**视为最新**——与 {@link isLatestStep}
 * 保持一致：信号缺失时不要误收用户正在看的内容。
 * @param anchorSeq - 该行所属节点的 `anchorSeq`（节点序号）。
 * @param latestAnchorSeq - 所属操作组**最新一条已开始**成员的 `anchorSeq`（`GroupOpenContext.latestStartedAnchorSeq`）。
 * @returns 是否是最新一条已开始的操作。
 */
export function isLatestAnchor(anchorSeq: number, latestAnchorSeq: number | undefined): boolean {
  return latestAnchorSeq === undefined || anchorSeq >= latestAnchorSeq
}

/**
 * 从一个 Chat 节点里取出它的 `step`（模型输出轮次）。
 *
 * 两类节点的 `step` 来源不同：
 *
 * | 节点类型 | 路径 |
 * |---|---|
 * | `assistant-step` | `node.data.step`（`AssistantChatData.step`） |
 * | `tool-call` | `node.data.root.step`（`ToolCallHead.step`） |
 *
 * ⚠️ 工具的 `result` 阶段没有 `step`（`ToolResultNode` 不继承 `ToolCallHead`），
 * 因此返回 `undefined`。调用方那里用 `useRef` 固定了它（`useStableToolStep`）。
 *
 * 其它节点（`user`、`turn-trigger`、`context` 等）没有 step，返回 `undefined`。
 * @param node - 任意 Chat 节点，或 undefined。
 * @returns 该节点的 step；不适用时为 undefined。
 */
export function stepOfNode(node: unknown): number | undefined {
  if (node === null || typeof node !== 'object') return undefined
  const record = node as {
    readonly kind?: unknown
    readonly data?: { readonly step?: unknown; readonly root?: { readonly step?: unknown } }
  }
  if (record.kind === 'assistant-step') {
    const step = record.data?.step
    return typeof step === 'number' ? step : undefined
  }
  if (record.kind === 'tool-call') {
    const step = record.data?.root?.step
    return typeof step === 'number' ? step : undefined
  }
  return undefined
}

/**
 * 判断「一条操作」是否**已经开始执行**（工具行侧）。
 *
 * 上游把工具调用的生命周期分成三段（`ToolCallBlock`）：
 *
 * | 阶段 | 含义 | 是否已开始 |
 * |---|---|---|
 * | `preparing` | 参数还在流式输出，尚未派发 | **否** |
 * | `start` | `tool/call` 已到达，正在执行 | 是 |
 * | `result` | `tool/result` 已到达，执行完毕 | 是 |
 *
 * 这个区分是「下一条操作出现时」能正确工作的前提：同一次模型输出里的多条
 * 工具在**流式阶段就全部建好了节点**，若把 `preparing` 也算作「已出现」，
 * 它们会从第一帧起就互相取代，最后只剩节点序号最大的那条能展开。
 * @param root - `node.data.root`（工具根调用块），可为 undefined。
 * @returns 是否已经开始执行。
 */
export function toolStarted(root: unknown): boolean {
  if (root === null || typeof root !== 'object') return false
  // `'kind' in root` 就是官方 `ToolCallTree.tsx:10` 判定 `result` 阶段的方式。
  if ('kind' in root) return true
  return (root as { readonly phase?: unknown }).phase !== 'preparing'
}

/**
 * 从一个 Chat 节点里取出「它**开始执行**时的节点序号」；尚未开始时返回 `undefined`。
 *
 * 这是「下一条操作出现时」用的操作坐标。与 {@link stepOfNode} 的区别：
 *
 * | 坐标 | 表达 | 未开始时 |
 * |---|---|---|
 * | `step` | 批次（同一次模型输出） | 有值 |
 * | 本函数 | 单条操作**实际开始**的先后 | **`undefined`** |
 *
 * 为什么要过滤未开始的：工具节点在**流式阶段**（`preparing`）就被创建，
 * `anchorSeq` 此时已经定死。若直接拿它比较，同一次模型输出派发的多条工具会
 * 在执行前就分出「谁最大」，于是只有序号最大的那条能展开。只把**已开始**的
 * 成员纳入比较，最新者才会随执行推进而前移——这正是「当前跑哪条就展示哪条，
 * 下一条开始执行时上一条才收起」。
 *
 * 两类节点的判定：
 *
 * | 节点类型 | 视为已开始的条件 |
 * |---|---|
 * | `assistant-step` | 一出现即在流式产出内容，恒为已开始 |
 * | `tool-call` | `root` 非 `preparing`（见 {@link toolStarted}） |
 * @param node - 任意 Chat 节点，或 undefined。
 * @returns 已开始时返回该节点的 `anchorSeq`；未开始或不适用时返回 `undefined`。
 */
export function startedAnchorOfNode(node: unknown): number | undefined {
  if (node === null || typeof node !== 'object') return undefined
  const record = node as {
    readonly kind?: unknown
    readonly anchorSeq?: unknown
    readonly data?: { readonly root?: unknown }
  }
  const anchorSeq = record.anchorSeq
  if (typeof anchorSeq !== 'number') return undefined
  if (record.kind === 'assistant-step') return anchorSeq
  if (record.kind !== 'tool-call') return undefined
  return toolStarted(record.data?.root) ? anchorSeq : undefined
}

/** {@link autoOpenFor} 的输入。 */
export interface CollapseTimingInput {
  /** 收起时机。 */
  readonly timing: CollapseTiming
  /** 该行自身的工作是否已经做完（思考不再是流式尾部 / 工具已进入 `result`）。 */
  readonly done: boolean
  /** 该行是否属于所属操作组的**最新一批**（按 `step`，批次级判据）。 */
  readonly isLatestBatch: boolean
  /**
   * 该行是否为所属操作组里**最新一条已开始**的操作（按 `anchorSeq`，操作级判据）。
   *
   * 未开始的行（工具还在 `preparing`）由调用方直接传 `false`。
   */
  readonly isLatestNode: boolean
  /** 上游是否允许自动展开：`开关 && group.open && group.auto`。 */
  readonly enabled: boolean
}

/**
 * 判断某行此刻是否应处于自动展开状态。
 *
 * 思考行与工具行调用的是同一个函数、同一组字段——两者的差别只在**信号怎么
 * 取**（`done` 是 `!running` 还是 `result` 阶段、`step` 要不要 `useRef` 固定），
 * 不在判据本身。
 * @param input - 收起时机与两个判据信号。
 * @returns 是否自动展开。
 */
export function autoOpenFor(input: CollapseTimingInput): boolean {
  if (!input.enabled) return false
  switch (input.timing) {
    // 本条做完就收。
    case 'self':
      return !input.done
    // 操作级：只留最新的一条操作，下一条一出现前面的立刻收。
    case 'next-call':
      return input.isLatestNode
    // 批次级：同批一起留，等下一批出现。
    case 'next-node':
      return input.isLatestBatch
    // 留到所属操作组结束。
    case 'group':
      return true
  }
}
