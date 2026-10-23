/**
 * 设置卡片与插件元数据的本地化文案。
 *
 * 命名空间 `autoExpand` 由本插件注册，只服务设置卡片；插件页的标题与描述
 * 走 `locale/*.json` 的 `meta` 字段（由 Plugin Manager 直接读取）。
 *
 * ## 术语（2026-10-23 统一）
 *
 * UI 文案里只用这四个词，且各有确定所指：
 *
 * | 词 | 指什么 | 例子 |
 * |---|---|---|
 * | **本条** | 当前这一行 | 「本条完成时」 |
 * | **操作** | 操作组里的一个节点（一次工具调用 / 一次模型输出） | 「下一条操作出现时」 |
 * | **批次** | 一次模型输出派发的全部操作 | 「下一批操作出现时」 |
 * | **操作组** | 当前轮里连续的一段工作过程 | 「随操作组收起」 |
 *
 * 「节点 / node」是底层实现叫法，**不进 UI 文案**——它在前端语境里同时被用来
 * 指 DOM 节点、AST 节点、Chat Node，读者无从分辨。设计文档与代码注释仍用
 * 「节点」，因为它们需要与上游源码的 `ChatNode` 对齐。
 *
 * 其它约定：
 * - 中文一律「操作组」，英文一律 `process group`；
 * - 三个开关的标题动词统一为「自动展开」/ `Auto-expand`；
 * - 时机的四个选项，思考与工具**共用同一套文案**。
 */
import type {} from '@deepseek-ai/dsh-client-ui-slots'

/** 设置卡片的 locale 命名空间。 */
export const SETTINGS_NS = 'autoExpand'

/** 中文文案。 */
export const zh = {
  workGroupTitle: '自动展开操作组',
  workGroupDesc: '当前运行的一轮里，操作组默认展开；该组结束后自动收起。',
  reasoningTitle: '自动展开思考过程',
  reasoningDesc: '思考内容默认展开；按下方时机自动折叠。',
  toolTitle: '自动展开工具结果',
  toolDesc: '工具调用的结果默认展开；按下方时机自动折叠。',
  // 思考/工具开关关闭时替换对应描述的文案。它点名**控制者**，这样灰掉的
  // 开关不会读作坏掉的开关（DPG 同款做法，见 spec/SETTINGS-SPEC.md 第 7.3 节）。
  //
  // ⚠️ 这条文案里嵌着 `workGroupTitle` 的原文：改标题必须同步改这里，
  // 否则界面会显示一个已经不存在的开关名。
  //
  // 键名用 `gatedByWorkGroup` 而非 `reasoningGated`：现在被两行共用。
  reasoningTimingTitle: '思考收起时机',
  reasoningTimingDesc: '这条思考什么时候收起。',
  toolTimingTitle: '工具收起时机',
  toolTimingDesc: '这条工具结果什么时候收起。',
  // 时机选项。下拉里**不含「关闭」**——关闭是上面那个 Switch 的职责。
  // 顺序即 `COLLAPSE_TIMINGS` 的展示顺序 = 收起由早到晚。
  //
  // 四个选项对思考与工具**完全相同**：两者都由操作组提供同样的两个坐标，
  // 四个时机的语义在两边逐字一致（见 collapse-timing.ts 头部）。
  timingSelf: '本条完成时',
  timingNextCall: '下一条操作出现时',
  timingNextNode: '下一批操作出现时',
  timingGroup: '随操作组收起',
  gatedByWorkGroup: '由「自动展开操作组」控制，现已关闭',
  gatedByReasoning: '由「自动展开思考过程」控制，现已关闭',
  gatedByTool: '由「自动展开工具结果」控制，现已关闭',
} as const

/** 英文文案。 */
export const en = {
  workGroupTitle: 'Auto-expand process groups',
  workGroupDesc: 'Show each process group in the running turn; fold it once the group ends.',
  reasoningTitle: 'Auto-expand reasoning',
  reasoningDesc: 'Show reasoning by default; fold it at the timing below.',
  toolTitle: 'Auto-expand tool results',
  toolDesc: 'Show tool results by default; fold them at the timing below.',
  reasoningTimingTitle: 'Reasoning collapse timing',
  reasoningTimingDesc: 'When this reasoning row folds.',
  toolTimingTitle: 'Tool collapse timing',
  toolTimingDesc: 'When this tool row folds.',
  timingSelf: 'When this row finishes',
  timingNextCall: 'When the next operation appears',
  timingNextNode: 'When the next batch appears',
  timingGroup: 'With the process group',
  gatedByWorkGroup: 'Controlled by "Auto-expand process groups"; currently off',
  gatedByReasoning: 'Controlled by "Auto-expand reasoning"; currently off',
  gatedByTool: 'Controlled by "Auto-expand tool results"; currently off',
} as const

/** 本命名空间的文案键。 */
export type SettingsKey = keyof typeof zh

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** 本插件设置卡片的文案。 */
    autoExpand: SettingsKey
  }
}
