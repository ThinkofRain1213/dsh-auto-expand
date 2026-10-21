/**
 * 本插件用到的外部槽位声明。
 *
 * `plugins.bundle.config` 由 `@deepseek-ai/dsh-client-ui-plugin-manager`
 * 通过 declaration merging 合并进 `SlotMap`。两种获取方式：
 *
 *  1. 装那个包并 `import type {}` —— 会拖入它整棵依赖树（安装耗时且体积大）；
 *  2. **在本文件里补一份最小声明** —— 只声明我们实际用到的那个槽位。
 *
 * 本文件采用第 2 种。理由：本插件只需要这一个槽位的类型，`owner` 形状
 * 稳定且极小；引入整个 plugin-manager 依赖树只为拿一个类型不划算。
 *
 * **维护要点**：若上游改变了该槽位的 `kind`/`scope`/`owner`，本文件必须同步。
 * 漂移检测（P6）应把本文件列为对照项。上游权威定义的位置：
 * `packages/client/ui-plugin-manager/src/client/slot-contract.ts`
 * （搜索 `'plugins.bundle.config'`）。
 */
import type {} from '@deepseek-ai/dsh-client-ui-slots'

/**
 * 插件页配置区的 owner props。
 *
 * 上游同名类型 `PluginConfigViewProps` 的字段我们没有用到（`form` 是宿主
 * 配置表单，本插件走自己的 `configForms` 通道而非 `form` prop），
 * 因此声明为空对象即可满足 `PropsRuntime` 的组合约束。
 */
export interface PluginConfigViewProps {}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    /**
     * 某个 bundle 自己的配置区，按 bundle 包名分派，渲染在该 bundle 页面上
     * 「描述」与「包含的组件」之间（仅 `view: 'page'`）。
     *
     * 上游定义：`ui-plugin-manager/src/client/slot-contract.ts`。
     */
    'plugins.bundle.config': {
      kind: 'keyed'
      scope: 'root'
      owner: PluginConfigViewProps
    }
  }
}
