/**
 * 所属 group 的展开状态，供内层思考块判断"是否该跟随折叠"。
 *
 * 默认 `true`：`groupPart === 'response'` 的渲染发生在 group 之外，此时没有
 * Provider，取默认值不影响——响应区没有思考块。
 */
import { createContext } from 'react'

/** 所属 process group 当前是否展开。 */
export const GroupOpenContext = createContext<boolean>(true)
