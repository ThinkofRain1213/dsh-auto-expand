/**
 * 本插件的设置卡片，渲染在「侧栏 → 插件 → dsh-auto-expand」页面。
 *
 * 槽位 `plugins.bundle.config` 是按 bundle 名分派的 keyed slot，页面把它渲染
 * 在「描述」与「包含的组件」之间。**key 必须是本包的 bundle 名**：
 * `config-ledger.ts` 把这个槽位的 key 投影成 `configured` 标志，
 * key 不匹配则整段不渲染且无任何报错。
 *
 * 样式严格遵循 DPG 的设置页规范（`spec/SETTINGS-SPEC.md`）：
 *  - `.stack` 包装器是必需的：官方 `detailSection` 容器给子元素 12px gap，
 *    若本卡片返回 Fragment，所有块会被塞进那个间隔；
 *  - **只有两行开关，没有分组标题**（页面顶部已有插件名与描述）；
 *  - 字体两级：`.title` 13/500、`.desc` 12/400；
 *  - 行内边距 16px 0，标题↔描述 6px；
 *  - 开关用官方 `Switch` 原语。
 */
import { Switch } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// 引入 `plugins.bundle.config` 的 SlotMap 声明（type-only，无运行时依赖）。
import type {} from './contract/slot-declarations.ts'
import { setAutoExpandSetting, useAutoExpandSettings } from './settings.ts'
import type { SettingsKey } from './locales.ts'
import css from './settings-card.module.css'

/** 完整 props：槽位运行时 + locale 座位。 */
export type SettingsCardProps =
  PropsRuntime<'plugins.bundle.config'>
  & PropsLocale<'autoExpand'>

/**
 * 一行开关：名称 + 描述 + 右侧 Switch。
 * @param props - 标题、描述、当前值与写入回调。
 * @returns 一行设置。
 */
function SwitchRow({ title, description, checked, onChange }: {
  readonly title: string
  readonly description: string
  readonly checked: boolean
  readonly onChange: (next: boolean) => void
}) {
  return (
    <div className={css.row}>
      <div className={css.rowText}>
        <div className={css.title}>{title}</div>
        <div className={css.desc}>{description}</div>
      </div>
      {/* `Switch` 的 `label` 是无障碍名称，由渲染站点提供。 */}
      <Switch checked={checked} onChange={onChange} label={title} />
    </div>
  )
}

/**
 * 渲染两个自动展开开关。
 *
 * 只有两行开关，**没有分组标题**：插件详情页顶部已经写着插件名和描述，
 * 再加一个「自动展开」小标题是重复信息。
 *
 * 设置状态来自模块级 `settingsSource`（见 `settings.ts`），因此本卡片与
 * 渲染层的展开策略读的是**同一个**快照，不可能不一致。
 * @param props - 槽位运行时与 locale 座位。
 * @returns 设置卡片。
 */
export function SettingsCard({ t }: SettingsCardProps) {
  const settings = useAutoExpandSettings()
  return (
    <div className={css.stack}>
      <SwitchRow
        title={t('workGroupTitle' as SettingsKey)}
        description={t('workGroupDesc' as SettingsKey)}
        checked={settings.groupAutoExpand}
        onChange={next => { void setAutoExpandSetting('groupAutoExpand', next) }}
      />
      <SwitchRow
        title={t('reasoningTitle' as SettingsKey)}
        description={t('reasoningDesc' as SettingsKey)}
        checked={settings.reasoningAutoExpand}
        onChange={next => { void setAutoExpandSetting('reasoningAutoExpand', next) }}
      />
    </div>
  )
}
