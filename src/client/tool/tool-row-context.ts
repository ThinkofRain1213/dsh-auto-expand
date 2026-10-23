/**
 * 官方工具行所在节点的信号（P8 信号层）。
 *
 * 工具行需要三个信号，分别服务于不同的收起时机：
 *
 * | 信号 | 服务时机 | 说明 |
 * |---|---|---|
 * | `done` | `'self'` | 根调用是否已进入 `result` 阶段 |
 * | `anchorSeq` | `'next-call'` | 节点序号，每节点唯一 → 永远只留最新一条 |
 * | `step` | `'next-node'` | 模型输出轮次，同批共享 → 同批一起展开 |
 *
 * ## 两个坐标
 *
 * `step` 表达「**批次**」：一次模型输出里派发的多个工具共享同一个 `step`，
 * 它们是同一批，要一起展开。`anchorSeq` 表达「**单条操作**」：串行命令时
 * 「下一条操作出现」意味着新节点一出现，前一个就收起。
 *
 * 两者缺一不可——初版只有 `anchorSeq` 导致并行工具只剩最后一个展开；
 * 只用 `step` 又无法表达「永远只留单条」。
 *
 * 思考行读的是**同一组坐标**（来自 `GroupOpenContext` 与所属 `assistant-step`
 * 节点），所以两者能用同一套时机判据。
 *
 * ## 为什么单独成文件
 *
 * `AutoToolCallTree.tsx`（Provider）与 `use-tool-disclosure.ts`（消费）都要它。
 * 若定义在 `AutoToolCallTree.tsx` 里，两者会形成**循环依赖**；而
 * `createContext()` 在模块顶层求值，循环依赖下可能拿到 `undefined`。
 */
import { createContext } from 'react'

/** 官方工具行所在节点的信号。 */
export interface ToolRowState {
  /** 本 `tool-call` 节点的 `step`（模型输出轮次，批次坐标）。 */
  readonly step: number
  /** 本 `tool-call` 节点的 `anchorSeq`（节点序号，操作坐标）。 */
  readonly anchorSeq: number
  /**
   * 根调用是否**已经开始执行**（走出 `preparing`）。
   *
   * 「下一条操作出现时」要求未开始的行不展开：工具参数还在流式时节点就已存在，
   * 此时展示/收起它只会造成「还没轮到却先亮一下」的错觉。
   */
  readonly started: boolean
  /** 根调用是否已进入 `result` 阶段（即执行完毕）。 */
  readonly done: boolean
}

/**
 * 工具行节点信号的默认值。
 *
 * 工具行一定渲染在 Provider 内，此默认值只作防御：`started: false` / `done: false`
 * 表示「视为未开始、未完成」——信息缺失时不自动展开，也不误判完成。
 */
export const ToolRowContext = createContext<ToolRowState>({
  step: 0, anchorSeq: 0, started: false, done: false,
})
