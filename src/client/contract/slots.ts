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
  ChatFileMentions, ChatNodeHookContext, ChatNodeOwnerProps, ChatFlowSlotProps, ChatNodeViewProps,
  ChatViewSlotProps, UsePresentation, UseDisclosure, UseChatNodeTurnData,
  PresentationInjected, TurnTailOwnerProps, UseGroupAction,
} from '@deepseek-ai/dsh-client-ui-chat/client'

export type {
  ChatFileMentions, ChatNodeHookContext, ChatNodeOwnerProps, ChatFlowSlotProps, ChatNodeViewProps,
  ChatViewSlotProps, UsePresentation, UseDisclosure, UseChatNodeTurnData,
  PresentationInjected, TurnTailOwnerProps, UseGroupAction,
}

/**
 * 用户内容相关的类型。官方从 `ui-conversation` 导出，但 pending bubble
 * 需要的几个类型在 chat 包的 `contract/slots.ts` 里重新导出过，这里
 * 直接从 chat 包取，避免多一个 peer 依赖路径。
 */
export type {
  UserContentAttachment, UserContentData, UserContentInput,
} from '@deepseek-ai/dsh-client-ui-chat/client'

/**
 * 右键菜单手势绑定的形状。
 *
 * 上游声明在 `@deepseek-ai/dsh-client-ui-context-menu`，但本仓库没有安装
 * 该包（`ui-chat` 的 peer 只有 cordis，它属于隐式依赖）。这里按它在
 * Markdown 文件提及链路里的**实际落点**补一份最小结构：`forClosing` 收到
 * 它，最终只用作 `MarkdownFileMentions.resolve()` 返回值的
 * `contextMenuProps`，而那是 `Pick<HTMLAttributes<HTMLElement>,
 * 'onContextMenu' | 'onKeyDown' | 'tabIndex'>`。
 *
 * 运行时不受影响：该 hook 由宿主 scope 标准面注入，`wrapEntry` 保留官方
 * component 的派发路径。**上游若改签名，此处必须同步。**
 */
export type ContextMenuTriggerProps =
  Pick<import('react').HTMLAttributes<HTMLElement>, 'onContextMenu' | 'onKeyDown' | 'tabIndex'>

/**
 * 补 `useContextMenu` 进 session 作用域标准面。
 *
 * 上游由 `@deepseek-ai/dsh-client-ui-context-menu` 做同样的合并，本仓库没装
 * 那个包，因此类型层缺失。**只在类型层补**：运行时该 hook 由宿主注入，
 * `wrapEntry` 不改官方 component 的派发路径。
 */
declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SessionStandardProps {
    /** 当前 Session 作用域的右键菜单手势工厂。 */
    useContextMenu: () => { getTriggerProps: (build: () => unknown) => ContextMenuTriggerProps }
  }
}
