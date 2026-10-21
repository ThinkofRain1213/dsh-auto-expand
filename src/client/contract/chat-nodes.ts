/**
 * Chat Node 与 Store 的类型引用层。
 *
 * 官方包通过 declaration merging 在 `ChatNodeDataMap` 上注册各类 Node 的
 * 载荷，因此 `ChatNode` / `ChatNodeKind` 等类型只有引用了官方包之后才有
 * 完整定义。这里集中做类型导入，供克隆组件使用。
 */
import type {} from '@deepseek-ai/dsh-client-ui-chat/client'

export type { ChatNode, ChatNodeKind } from '@deepseek-ai/dsh-client-ui-chat/client'
export type { ChatNodeStore, ChatSnapshot } from '@deepseek-ai/dsh-client-ui-chat/client'
export type { ChatStoreState, TurnProcessViewEntry } from '@deepseek-ai/dsh-client-ui-chat/client'
export type { TurnProcessSpec } from '@deepseek-ai/dsh-client-ui-chat/client'
export type { ChatGroupTree } from '@deepseek-ai/dsh-client-ui-chat/client'
export type { ProcessActivity, ProcessActivitySummary, ProcessGroupData } from '@deepseek-ai/dsh-client-ui-chat/client'
