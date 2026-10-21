/**
 * 克隆自 `ui-tool/src/client/tool/ToolCallTree.tsx`（122 行）。
 *
 * 上游：@deepseek-ai/dsh-client-ui-tool@0.2.1-rc.2，commit 687f282e86
 *
 * 修改点（两处）：
 *   1. 根调用（`isRoot === true`）注入受控的 `useDisclosure`，让工具行在运行时
 *      自动展开、返回后自动折叠。子调用沿用官方 hook，保持默认折叠。
 *   2. fallback 从 `GenericToolCard` 换成 `AutoGenericToolCard`（极简实现）。
 *
 * 为什么只改 disclosure：官方 `ToolRow` 内部是 `expanded && expandable`
 * （`ToolRow.tsx:175`），它拿到的 `useDisclosure` 由 owner props 传入。
 * 替换 hook 即可改变展开策略，无需克隆 `ToolRow`（394 行）乃至整个
 * `ui-tool` 包（约 17000 行）。
 *
 * 为什么 fallback 可以简化：`tool.call.toolview` 有 9 个已注册 entry，
 * keyed 分派几乎总会命中；fallback 只在工具名未注册时出现。克隆
 * `GenericToolCard` 会牵出 5 个 card model 与 `ToolRow`，代价不成比例。
 *
 * 必须保留的细节（遗漏有可见后果）：
 *   1. `toolCallPhase()` 三态判定 —— phase 计算错误
 *   2. `callName()` 的三态处理 —— 工具名解析错误
 *   3. `autoReviewDenied` 分支 —— 自动审核拒绝的工具显示错误卡片
 *   4. `renderSlot('tool.call.toolview')` + fallback —— 工具卡片不渲染
 *   5. 递归 `subCalls` —— 嵌套调用丢失
 *   6. `data-chat-anchor-key` / `data-chat-call-id` —— 滚动锚点失效
 */
import { memo, useMemo, type ReactNode } from 'react'
import type { ToolCallBlock } from '@deepseek-ai/dsh-client-ui-chat/client'
import type {
  ToolCallOwnerProps, ToolCallPhaseProps, ToolTreeProps,
} from './tool-contract.ts'
import { AutoGenericToolCard } from './AutoGenericToolCard.tsx'
import { makeAutoDisclosure } from './controlled-disclosure.ts'
import css from './AutoToolCallTree.module.css'

/**
 * 克隆自 `ToolCallTree.tsx:10-13`。
 *
 * 把工具调用块归约为三态之一。
 * @param block - 工具调用生命周期值。
 * @returns 带 phase 判别式的调用阶段。
 */
function toolCallPhase(block: ToolCallBlock): ToolCallPhaseProps {
  if ('kind' in block) return { phase: 'result', block }
  return block.phase === 'preparing' ? { phase: 'preparing', block } : { phase: 'start', block }
}

/**
 * 克隆自 `ToolCallTree.tsx:16-18`。
 *
 * 从当前阶段解析工具调用的 wire 名称。
 * @param call - 调用阶段值。
 * @returns 工具名；结果阶段且原调用缺失时为空串。
 */
function callName(call: ToolCallPhaseProps): string {
  return call.phase === 'result' ? call.block.call?.name ?? '' : call.block.name
}

/**
 * 克隆自 `ToolCallTree.tsx:43-46` 的内联判定。
 *
 * 判定一个已结算的调用是否被自动审核拒绝。
 *
 * 官方的判定走 `toolRowModel(toolName, block).autoReviewDenial`，但
 * `toolRowModel` 位于 `tool-call-model.ts`（314 行）并牵出多个 model 文件。
 * 这里直接读同一字段：`ToolResultNode` 上的 `autoReviewDenial` 是记录在
 * 结果节点上的元数据，不依赖 model 的派生逻辑。
 *
 * @param block - 已结算的工具调用块。
 * @returns 是否存在自动审核拒绝记录。
 */
function autoReviewDenied(block: ToolCallBlock): boolean {
  if (!('kind' in block)) return false
  const record = block as { autoReviewDenial?: unknown }
  return record.autoReviewDenial !== undefined && record.autoReviewDenial !== null
}

/** 传给 `AutoToolCall` 的公共 props 子集。 */
type ToolCallSharedProps = Pick<
  ToolTreeProps,
  'renderSlot' | 'openFile' | 'cwd' | 'inspectCall' | 'loadImage' | 'useDisclosure' | 't'
>

/** 一个原子调用，经 Tool 拥有的 keyed slot 分派。 */
const AutoToolCall = memo(function AutoToolCall({
  renderSlot, callId, toolName, call, openFile, cwd, home, inspectCall, loadImage, useDisclosure, t, children,
  isRoot,
}: ToolCallSharedProps & {
  callId: string
  toolName: string
  call: ToolCallPhaseProps
  home?: string | undefined
  children?: ReactNode
  /** 是否为根调用；只有根调用启用自动展开。 */
  isRoot: boolean
}) {
  // ── 核心改动：根调用注入受控 disclosure ────────────────────────────────
  // 未返回（preparing / start）→ 展开；已返回（result）→ 折叠。
  // 子调用保持官方行为（默认折叠，点击展开）。
  //
  // 依赖 `call.phase` 而非整个 `call`：phase 从 start 变 result 时重建 hook，
  // 但 `useAutoDisclosure` 内部的 useState 会保留用户覆盖。
  const phase = call.phase
  const controlled = useMemo(
    () => (isRoot ? makeAutoDisclosure(phase !== 'result') : useDisclosure),
    [isRoot, phase, useDisclosure],
  )
  const owner: ToolCallOwnerProps = useMemo(() => ({
    callId,
    toolName,
    ...call,
    openFile,
    cwd,
    home,
    loadImage,
    useDisclosure: controlled,
    inspect: inspectCall === undefined ? undefined : () => { inspectCall(callId) },
  }), [callId, toolName, call, openFile, cwd, home, loadImage, inspectCall, controlled])
  const denied = useMemo(() => call.phase === 'result' && autoReviewDenied(call.block), [call])
  return (
    <div
      className={css.callRow}
      data-chat-anchor-key={`call:${callId}`}
      data-chat-call-id={callId}
    >
      {denied
        ? <AutoGenericToolCard {...owner} t={t} />
        : renderSlot('tool.call.toolview', owner, {
          entryKey: toolName,
          fallback: <AutoGenericToolCard {...owner} t={t} />,
        })}
      {children}
    </div>
  )
})

/** 递归分支：渲染一个调用及其子调用。 */
const AutoToolCallBranch = memo(function AutoToolCallBranch({
  renderSlot, block, cwd, home, openFile, inspectCall, loadImage, useDisclosure, t, isRoot,
}: ToolCallSharedProps & {
  block: ToolCallBlock
  home?: string | undefined
  isRoot: boolean
}) {
  const call = useMemo(() => toolCallPhase(block), [block])
  return (
    <AutoToolCall
      renderSlot={renderSlot}
      callId={call.block.callId}
      toolName={callName(call)}
      call={call}
      openFile={openFile}
      cwd={cwd}
      home={home}
      inspectCall={inspectCall}
      useDisclosure={useDisclosure}
      loadImage={loadImage}
      isRoot={isRoot}
      t={t}
    >
      {call.phase !== 'preparing' && call.block.subCalls.length > 0 ? (
        <div className={css.subCalls} data-subcalls>
          {call.block.subCalls.map(child => (
            <AutoToolCallBranch
              key={child.callId}
              renderSlot={renderSlot}
              block={child}
              cwd={cwd}
              home={home}
              openFile={openFile}
              inspectCall={inspectCall}
              useDisclosure={useDisclosure}
              loadImage={loadImage}
              // 子调用不继承自动展开：保持官方默认折叠。
              isRoot={false}
              t={t}
            />
          ))}
        </div>
      ) : null}
    </AutoToolCall>
  )
})

/**
 * 渲染一个根级工具调用及其递归子调用，全部经同一原子 keyed 分派。
 * @param props - 整个工具的所有者数据与 Tool 拥有的子 slot 份额。
 * @returns 工具调用树。
 */
export function AutoToolCallTree({
  renderSlot, node, cwd, openFile, inspectCall, loadImage, useDisclosure, useHostInfo, t,
}: ToolTreeProps) {
  const home = useHostInfo(info => info.home)
  return (
    <AutoToolCallBranch
      renderSlot={renderSlot}
      block={node.data.root}
      cwd={cwd}
      home={home}
      openFile={openFile}
      inspectCall={inspectCall}
      useDisclosure={useDisclosure}
      loadImage={loadImage}
      // 根调用启用自动展开。
      isRoot
      t={t}
    />
  )
}
