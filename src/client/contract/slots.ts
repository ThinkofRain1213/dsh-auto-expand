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
 * 右键菜单 hook 的形状。
 *
 * **刻意不合并进 `SessionStandardProps`**：本包 `types` 指向 `src/`，任何
 * TypeScript 消费者都会把这里的声明拉进自己的程序；若同时存在
 * `@deepseek-ai/dsh-client-ui-context-menu` 的真实合并，两个同名成员类型不
 * 一致会触发 TS2717。改为让组件以自己的 props 交叉类型声明它（交叉类型取
 * 交集，不产生全局声明冲突）。
 */
export interface ContextMenuHook {
  /** 把一个手势构造函数包装成可展开到元素上的触发属性。 */
  useContextMenu: () => { getTriggerProps: (build: () => unknown) => ContextMenuTriggerProps }
}
