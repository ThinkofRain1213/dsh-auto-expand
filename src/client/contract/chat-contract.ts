/**
 * 官方内部契约的纯函数副本。
 *
 * 这些函数在官方包里没有从 `@deepseek-ai/dsh-client-ui-chat/client` 导出，
 * 只能在此重实现。每个函数都标注了官方出处，便于升级时对照。
 *
 * 上游：@deepseek-ai/dsh-client-ui-chat@0.2.1-rc.2，commit 687f282e86
 */
import type { ChatNode, ChatStoreState, TurnProcessSpec, TurnProcessViewEntry } from '@deepseek-ai/dsh-client-ui-chat/client'

/** 克隆自 `contract/group-tree.ts`：分组树位置，由外向内。 */
export type ChatGroupTree = 'exchange' | 'input' | 'turn' | 'process'

/** 位置深度表（与官方同值）。 */
const DEPTH: Readonly<Record<ChatGroupTree, number>> = { exchange: 0, input: 1, turn: 2, process: 3 }

/**
 * 克隆自 `contract/group-tree.ts:35-37`。
 *
 * 判断 Node 是否位于某个分组树位置或其外层。
 * @param node - Chat Node（只需 groupTree 字段）。
 * @param position - 要比较的分组树位置。
 * @returns Node 的位置是 `position` 或更外层。
 */
export function isAtOrOutside(node: Pick<{ groupTree?: ChatGroupTree | undefined }, 'groupTree'>, position: ChatGroupTree): boolean {
  return node.groupTree !== undefined && DEPTH[node.groupTree] <= DEPTH[position]
}

/**
 * 克隆自 `contract/turn-process.ts:53-58`。
 *
 * 让进行中、已停止、已失败的 Turn 保持展开。
 * @param node - 承载所属 Turn 的 Node。
 * @returns 整轮折叠是否不可用。
 */
export function turnProcessAlwaysOpen(node: ChatNode | undefined): boolean {
  const location = node?.location
  if (location?.kind !== 'turn' && location?.kind !== 'step') return false
  const reason = location.turn.end?.data.reason.kind
  return location.turn.status === 'open' || reason === 'aborted' || reason === 'interrupted' || reason === 'error'
}

/**
 * 克隆自 `stores.ts:21-26`。
 *
 * 读取某个 Turn 的手动展开选择。
 * @param state - Chat store 快照。
 * @param turn - 所属 Turn。
 * @returns 该 Turn 的存储条目（若存在）。
 */
export function storedTurnProcessEntry(
  state: Readonly<ChatStoreState>,
  turn: number,
): Readonly<TurnProcessViewEntry> | undefined {
  return state.turnProcesses.find(entry => entry.turn === turn)
}

/**
 * 克隆自 `stores.ts:36-44`。
 *
 * 一个可折叠 Turn 的 process 是否展开：读者对当前回答代际的选择优先；
 * 否则最新已完成的 Turn 保持展开直到下一次输入，更早的 Turn 折叠。
 * @param state - Chat store 快照。
 * @param spec - 该 Turn 的 process 规格。
 * @param defaultOpen - 该 Turn 是否豁免自动折叠。
 * @returns 生效的展开状态。
 */
export function turnProcessOpen(
  state: Readonly<ChatStoreState>,
  spec: Pick<TurnProcessSpec, 'turn' | 'answerStep'>,
  defaultOpen: boolean,
): boolean {
  const stored = storedTurnProcessEntry(state, spec.turn)
  if (stored === undefined || stored.answerStep !== (spec.answerStep ?? 0)) return defaultOpen
  return stored.collapsed !== true
}
