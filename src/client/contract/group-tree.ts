/**
 * 分组树位置的类型引用。
 *
 * 实际实现（`isAtOrOutside` 与深度表）在 `chat-contract.ts`，因为那里还
 * 放了同类的其它纯函数副本。这里只重导出类型，保持 import 路径语义清晰。
 */
export type { ChatGroupTree } from '@deepseek-ai/dsh-client-ui-chat/client'
export { isAtOrOutside } from './chat-contract.ts'
