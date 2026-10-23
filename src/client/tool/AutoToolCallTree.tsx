/**
 * 官方 `ToolCallTree` 的**包裹层**（P7）。
 *
 * ## 为什么是「包裹」而不是「替换」
 *
 * P4 曾用**替换**的方式接管 `tool-call`：写一个极简组件顶替官方渲染器，
 * 结果把官方 `GenericToolCard` 这条 fallback 主路径一起顶掉——`pwsh`
 * （没有专用 toolview，走 fallback）从终端卡片退化成一行纯文本。
 * 全过程见 `spec/P4-ROLLBACK.md`。
 *
 * 本文件的思路相反：官方 `ToolCallTree` **原样渲染在包裹层内部**，
 * 只覆盖它从 props 接收的那一个 `useDisclosure`，并额外提供一个状态 context。
 * 因此 toolview 的 keyed 分派、`GenericToolCard` fallback、`SubCalls` 递归
 * 全部仍是官方代码，**不需要克隆 `ui-tool` 的任何文件**。
 *
 * ## 为什么必须包裹而不是重新注册
 *
 * `SlotCore.register` 拒绝为已声明的子 slot 再声明一次（`tool.call.toolview`），
 * 而不声明 children 就拿不到 `renderSlot`，也就渲染不出任何工具行。
 * 详见 `wrap.ts` 与 `spec/DESIGN.md` 第 4 节。
 *
 * ## P8 信号层
 *
 * 包裹层把本节点的三个信号通过 `ToolRowContext` 送进每一行
 * `useAutoToolDisclosure`：
 *
 * | 信号 | 用途 |
 * |---|---|
 * | `step` | 批次坐标（「下一批操作出现时」） |
 * | `anchorSeq` | 操作坐标（「下一条操作出现时」） |
 * | `started` | 是否已走出 `preparing`（未开始的行不自动展开） |
 * | `done` | 是否已进入 `result`（「本条完成时」） |
 *
 * 为什么必须用 context：官方 `useDisclosure` 的契约是**无参调用**，hook 拿不到
 * 调用它的那一行的任何数据。context 是在不克隆官方组件的前提下，把这些
 * 节点级信号送到每一行 hook 里的唯一通道。
 */
import { useMemo, useRef, type ComponentType } from 'react'
import { toolStarted } from '../collapse-timing.ts'
import { ToolRowContext, type ToolRowState } from './tool-row-context.ts'
import { useAutoToolDisclosure } from './use-tool-disclosure.ts'

/**
 * 包裹层透传的 props。
 *
 * 官方类型是 `ToolTreeProps`（`ui-tool` 的 `contract/slots.ts`），但这里只
 * 做透传与单点覆盖，不需要引用它——这样也避免为包裹层引入跨包类型依赖。
 */
type ToolTreePassthroughProps = Record<string, unknown>

/** 包裹层能从 `props.node` 读到的部分（只声明用到的字段）。 */
interface ToolCallNodeShape {
  readonly anchorSeq: number
  readonly data: { readonly root: { readonly step?: number } }
}

/**
 * 读取工具节点当前的 `step`，并在 `result` 阶段沿用 `start` 阶段记下的值。
 *
 * ## 为什么需要记住
 *
 * 上游的 `ToolResultNode`（`ui-conversation/src/client/contract/records.ts:161-183`）
 * **不继承 `ToolCallHead`，因此根本没有 `step` 字段**——只有 `seq` / `time`。
 *
 * 后果是工具一进入 `result` 阶段，`root.step` 就变成 `undefined`。若把它当作 0，
 * 判据会立刻认为这一行「已被更新的节点取代」，于是：
 *
 * | 时刻 | 错误表现 |
 * |---|---|
 * | A 完成 | A 的 step 变 0 → 被判非最新 → **错误收起** |
 * | 全部完成 | 所有 step 都是 0，最新也是 0 → `0 >= 0` → **反而全部展开** |
 * | 下一段思考出现 | 全部 0 < 新 step → **全部收起** |
 *
 * 这三条正是真机上看到的「诡异跳变」。本 hook 把 `start` 阶段的 step 留在 ref 里，
 * `result` 阶段照用，于是同一节点的 step 在整个生命周期内保持稳定。
 *
 * ## 为什么 ref 安全
 *
 * 同一个 `tool-call` 节点在 `start → result` 之间**复用同一个组件实例**
 * （keyed slot 的 key 不变），所以 ref 活着。若节点被卸载重建（分页/滚动），
 * ref 归零——此时退化为 0，属于「拿不到信息」的保守一侧。
 * @param liveStep - 当前渲染读到的 `root.step`（`result` 阶段为 undefined）。
 * @returns 稳定的 step。
 */
function useStableToolStep(liveStep: number | undefined): number {
  const remembered = useRef(0)
  if (typeof liveStep === 'number') remembered.current = liveStep
  return remembered.current
}

/**
 * 构造 `tool-call` 的包装器：把官方 `ToolCallTree` 渲染在包裹层内部。
 *
 * 与 `makeAutoFlow` / `makeAutoAssistant` 的根本不同：那两者**替代** `inner`
 * （完全不使用它），本包装器**使用** `inner`——这正是「包裹而非替换」。
 * @param inner - 官方 `ToolCallTree` 组件。
 * @returns 覆盖 `useDisclosure`、其余 props 透传的包裹组件。
 */
export function makeAutoToolCallTree(inner: ComponentType<never>): ComponentType<never> {
  const Inner = inner as unknown as ComponentType<ToolTreePassthroughProps>

  /**
   * 官方工具行的包裹层。
   * @param props - 官方 `ToolCallTree` 的全部 props。
   * @returns 官方工具行（使用插件的自动展开状态）。
   */
  function AutoToolCallTree(props: ToolTreePassthroughProps) {
    const node = props.node as ToolCallNodeShape | undefined
    const root = node?.data.root
    // `'kind' in root` 就是官方 `ToolCallTree.tsx:11` 判定 `result` 阶段的方式。
    const done = root !== undefined && 'kind' in root
    // `preparing` 阶段参数还在流式、尚未派发执行 → 不算「已开始」。
    const started = toolStarted(root)
    // `result` 阶段的上游节点没有 step，用 ref 沿用 `start` 阶段的值（见 useStableToolStep）。
    const step = useStableToolStep(root?.step)
    // anchorSeq 是节点自带的，全阶段稳定（不随 start/result 变化）。
    const anchorSeq = node?.anchorSeq ?? 0
    const state = useMemo<ToolRowState>(
      () => ({ step, anchorSeq, started, done }),
      [step, anchorSeq, started, done],
    )
    return (
      <ToolRowContext.Provider value={state}>
        {/*
          只覆盖 `useDisclosure`，其余 props 原样透传。

          直接传模块级函数、不包 `useMemo`：官方 `ToolCall` 把 `useDisclosure`
          列入 `useMemo` 依赖（`ui-tool/.../ToolCallTree.tsx:39`），而模块级函数
          的引用天然恒定——内联新建函数会让官方的 `owner` 对象每次渲染重建。
        */}
        <Inner {...props} useDisclosure={useAutoToolDisclosure} />
      </ToolRowContext.Provider>
    )
  }

  return AutoToolCallTree as unknown as ComponentType<never>
}