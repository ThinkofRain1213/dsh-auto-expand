/**
 * 把自动展开策略包装成官方 `UseDisclosure` 形状的 hook 工厂。
 *
 * 为什么需要这一层：官方 `ToolRow` 内部调用 `useDisclosure()` 取得
 * `{ expanded, setExpanded, toggle }`（`ui-tool/.../ToolRow.tsx:153`），
 * 而这个 hook 由 `conversation.chat.node` 的注入面提供并逐层透传。
 *
 * 我们无法修改 `ToolRow`（那要克隆整个 ui-tool 包），但可以**替换传给它的
 * hook**——只要返回值形状一致，`ToolRow` 完全察觉不到差异。
 *
 * React 约束：工厂本身不调用 hook，只在返回的 hook 内调用。`ToolRow` 每次
 * 渲染固定调用一次 `useDisclosure()`，因此 hook 调用顺序稳定。
 */
import type { UseDisclosure } from '../contract/slots.ts'
import { useAutoDisclosure } from '../auto-disclosure.ts'

/**
 * 构造一个跟随 `autoOpen` 的受控 disclosure hook。
 *
 * 返回的 hook 与官方 `UseDisclosure` 形状一致：
 * - `expanded` 由 `autoOpen` 与用户覆盖共同决定
 * - `setExpanded` / `toggle` 写入用户覆盖
 *
 * `autoOpen` 变化时 `useAutoDisclosure` 会丢弃覆盖，实现"自动转换只发生一次"。
 *
 * @param autoOpen - 当前"应当处于"的自动状态（如工具是否仍在运行）。
 * @returns 可直接传给官方 `ToolRow` 的 `useDisclosure`。
 */
export function makeAutoDisclosure(autoOpen: boolean): UseDisclosure {
  return function useControlledDisclosure() {
    const { open, setOpen, toggle } = useAutoDisclosure(autoOpen)
    return { expanded: open, setExpanded: setOpen, toggle }
  }
}

/**
 * 原样转发官方 hook（用于子调用等需要保持官方行为的场景）。
 * @param inner - 官方提供的 `useDisclosure`。
 * @returns 同一个 hook 引用。
 */
export function keepOfficialDisclosure(inner: UseDisclosure): UseDisclosure {
  return inner
}
