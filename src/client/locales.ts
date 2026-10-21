/**
 * 设置卡片与插件元数据的本地化文案。
 *
 * 命名空间 `autoExpand` 由本插件注册，只服务设置卡片；插件页的标题与描述
 * 走 `locale/*.json` 的 `meta` 字段（由 Plugin Manager 直接读取）。
 */
import type {} from '@deepseek-ai/dsh-client-ui-slots'

/** 设置卡片的 locale 命名空间。 */
export const SETTINGS_NS = 'autoExpand'

/** 中文文案。 */
export const zh = {
  sectionTitle: '自动展开',
  groupTitle: '展开工作大段',
  groupDesc: '当前运行的一轮里，工作大段展开显示内容；该段结束后自动收起。',
  reasoningTitle: '展开思考过程',
  reasoningDesc: '思考内容在流式输出时展开；思考结束或所属大段收起时自动折叠。',
} as const

/** 英文文案。 */
export const en = {
  sectionTitle: 'Auto-expand',
  groupTitle: 'Expand work groups',
  groupDesc: 'Show the body of each work group in the running turn; fold it once that group ends.',
  reasoningTitle: 'Expand reasoning',
  reasoningDesc: 'Open reasoning while it streams; fold it when reasoning ends or its group folds.',
} as const

/** 本命名空间的文案键。 */
export type SettingsKey = keyof typeof zh

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** 本插件设置卡片的文案。 */
    autoExpand: SettingsKey
  }
}
