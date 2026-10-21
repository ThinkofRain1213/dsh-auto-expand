/**
 * `ui-tool` 契约的类型引用层。
 *
 * 上游：@deepseek-ai/dsh-client-ui-tool@0.2.1-rc.2，commit 687f282e86
 *
 * 只做类型导入，不产生 value 依赖（见 tsdown.config.ts 的 purity 门）。
 * `ToolTreeProps` 由官方通过 declaration merging 定义，包含
 * `PropsRuntime<'conversation.chat.node', 'tool-call'>`，因此自带
 * `node`、`useChatNode`、`useGroupAction` 等 node 级能力。
 */
import type {
  ToolCallOwnerProps, ToolCallPhaseProps, ToolTreeProps,
} from '@deepseek-ai/dsh-client-ui-tool/client'

export type { ToolCallOwnerProps, ToolCallPhaseProps, ToolTreeProps }
