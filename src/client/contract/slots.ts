/**
 * Chat slot 契约的类型引用层。
 *
 * 这些类型由官方包通过 declaration merging 提供，本插件只做类型导入，
 * 不产生 value 依赖（见 tsdown.config.ts 的 purity 门）。
 *
 * 之所以集中到一个文件：`AutoFlow` / `AutoNodeSeat` / `AutoGroupSeat` 等
 * 克隆组件需要与官方完全一致的 props 形状，而官方没有导出这些组件的
 * 具体 props 类型（它们从 `ChatFlowSlotProps` 推导）。
 */
import type {
  ChatNodeHookContext, ChatNodeOwnerProps, ChatFlowSlotProps, ChatNodeViewProps,
  ChatViewSlotProps, UsePresentation, UseDisclosure, UseChatNodeTurnData,
} from '@deepseek-ai/dsh-client-ui-chat/client'

export type {
  ChatNodeHookContext, ChatNodeOwnerProps, ChatFlowSlotProps, ChatNodeViewProps,
  ChatViewSlotProps, UsePresentation, UseDisclosure, UseChatNodeTurnData,
}

/**
 * 用户内容相关的类型。官方从 `ui-conversation` 导出，但 pending bubble
 * 需要的几个类型在 chat 包的 `contract/slots.ts` 里重新导出过，这里
 * 直接从 chat 包取，避免多一个 peer 依赖路径。
 */
export type {
  UserContentAttachment, UserContentData, UserContentInput,
} from '@deepseek-ai/dsh-client-ui-chat/client'
