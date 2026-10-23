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
 *  - **五行，没有分组标题**（页面顶部已有插件名与描述）；
 *  - 字体两级：`.title` 13/500、`.desc` 12/400；
 *  - 行内边距 16px 0，标题↔描述 6px；
 *  - 开关用官方 `Switch`，下拉用官方 `Menu` + 自定义 anchor。
 *
 * ## 五行按三组排列
 *
 * ```
 * 1 Switch  自动展开操作组
 * 2 Switch  自动展开思考过程
 * 3 下拉    思考收起时机
 * 4 Switch  自动展开工具结果
 * 5 下拉    工具收起时机
 * ```
 *
 * 同一对象的开关与时机**相邻**，读起来就是「这一层开不开、什么时候收」。
 *
 * ## 门控有两层
 *
 * 1. 思考/工具都渲染在 group body **内部**，操作组折叠时不可见 →
 *    操作组开关关闭时，第 2~5 行全部变灰；
 * 2. 没有自动展开就没有「什么时候收起」→ 某层开关关闭时，它自己的时机行
 *    也变灰，并在描述里点名控制者。
 *
 * 不把依赖关系显示出来，UI 就在撒谎——用户会反复拨弄一个毫无反应的控件。
 */
import { useState } from 'react'
import { IconChevronDownOutlineRegular, Menu, Switch } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// 引入 `plugins.bundle.config` 的 SlotMap 声明（type-only，无运行时依赖）。
import type {} from './contract/slot-declarations.ts'
import { setAutoExpandSetting, useAutoExpandSettings } from './settings.ts'
import { deriveSettingsCardState, type SelectRowState } from './settings-card-state.ts'
import { COLLAPSE_TIMINGS, type CollapseTiming } from './collapse-timing.ts'
import type { SettingsKey } from './locales.ts'
import css from './settings-card.module.css'

/** 完整 props：槽位运行时 + locale 座位。 */
export type SettingsCardProps =
  PropsRuntime<'plugins.bundle.config'>
  & PropsLocale<'autoExpand'>

/** 每个时机的文案键。 */
const TIMING_LABEL_KEYS: Record<CollapseTiming, SettingsKey> = {
  self: 'timingSelf',
  'next-call': 'timingNextCall',
  'next-node': 'timingNextNode',
  group: 'timingGroup',
}

/**
 * 一行开关：名称 + 描述 + 右侧 Switch。
 * @param props - 标题、描述、当前值、写入回调，以及可选的"被上层开关锁住"信息。
 * @returns 一行设置。
 */
function SwitchRow({ title, description, checked, onChange, locked }: {
  readonly title: string
  readonly description: string
  readonly checked: boolean
  readonly onChange: (next: boolean) => void
  /** 存在表示该行由另一个开关控制：整体变灰、拒绝输入、描述已换成控制者说明。 */
  readonly locked?: { readonly hint: string }
}) {
  return (
    <div className={css.row}>
      <div className={css.rowText}>
        <div className={locked === undefined ? css.title : `${css.title} ${css.gated}`}>{title}</div>
        <div className={locked === undefined ? css.desc : `${css.desc} ${css.gated}`}>{description}</div>
      </div>
      {/* `Switch` 的 `label` 是无障碍名称，由渲染站点提供。
          官方原语的契约里 `title` 就是"为什么这个开关被锁住"的悬停文本。 */}
      <Switch
        checked={checked}
        onChange={onChange}
        label={title}
        disabled={locked !== undefined}
        {...locked === undefined ? {} : { title: locked.hint }}
      />
    </div>
  )
}

/**
 * 一行下拉：名称 + 描述 + 右侧 selector 按钮。
 *
 * 结构与 DPG 的设置卡片（`dsh-project-groups/src/client/settings-card.tsx:366-397`）
 * 及官方 `PreferenceRow` 一致：左侧文字，右侧一个 pill 按钮 + `Menu` 弹出选项。
 *
 * **`portal` 必须开**：卡片在插件页的滚动 detail 列里，就地展开的列表会被
 * `overflow` 裁剪（DPG 的同款注释）。
 * @param props - 标题、描述、当前值、选项、写入回调，以及可选的锁定信息。
 * @returns 一行设置。
 */
function SelectRow<T extends string>({ title, description, value, options, onChange, locked }: {
  readonly title: string
  readonly description: string
  readonly value: T
  readonly options: readonly { readonly id: T; readonly label: string }[]
  readonly onChange: (next: T) => void
  /** 存在表示该行被上层控制：整体变灰、拒绝输入、描述已换成控制者说明。 */
  readonly locked?: { readonly hint: string }
}) {
  const [open, setOpen] = useState(false)
  const selectedLabel = options.find(option => option.id === value)?.label ?? ''
  return (
    <div className={css.row}>
      <div className={css.rowText}>
        <div className={locked === undefined ? css.title : `${css.title} ${css.gated}`}>{title}</div>
        <div className={locked === undefined ? css.desc : `${css.desc} ${css.gated}`}>{description}</div>
      </div>
      <Menu
        open={open}
        onClose={() => { setOpen(false) }}
        items={options.map(option => ({ id: option.id, label: option.label }))}
        selectedId={value}
        onSelect={(id) => { setOpen(false); onChange(id as T) }}
        align="end"
        portal
        anchor={(
          <button
            type="button"
            className={css.selector}
            aria-haspopup="menu"
            aria-expanded={open}
            disabled={locked !== undefined}
            {...locked === undefined ? {} : { title: locked.hint }}
            onClick={() => { setOpen(next => !next) }}
          >
            {selectedLabel}
            <IconChevronDownOutlineRegular className={css.chevron} />
          </button>
        )}
      />
    </div>
  )
}

/**
 * 渲染五行设置。
 *
 * 没有分组标题：插件详情页顶部已经写着插件名和描述。
 *
 * 设置状态来自模块级 `settingsSource`（见 `settings.ts`），因此本卡片与
 * 渲染层的展开策略读的是**同一个**快照，不可能不一致。
 * @param props - 槽位运行时与 locale 座位。
 * @returns 设置卡片。
 */
export function SettingsCard({ t }: SettingsCardProps) {
  const settings = useAutoExpandSettings()
  const state = deriveSettingsCardState(settings)
  // 操作组关闭时，后四行共用这条说明。
  const gatedByWorkGroup = t('gatedByWorkGroup' as SettingsKey)
  /**
   * 时机行被锁时的描述：点名最近的那一层控制者。
   * @param gate - 锁定原因。
   * @param ownKey - 本层开关的说明文案键。
   * @returns 描述文本。
   */
  const timingText = (gate: SelectRowState['gate'], ownKey: SettingsKey): string => {
    if (gate === 'workGroup') return gatedByWorkGroup
    if (gate === 'own') return t(ownKey)
    return ''
  }
  // 两个下拉的选项**相同**：思考与工具都由操作组提供同样的两个坐标
  // （step 批次 / anchorSeq 操作），四个时机对两边都真实成立。
  /** 时机选项；顺序即 `COLLAPSE_TIMINGS`。两个下拉共用。 */
  const timingOptions = COLLAPSE_TIMINGS.map(id => ({
    id, label: t(TIMING_LABEL_KEYS[id]),
  }))
  return (
    <div className={css.stack}>
      <SwitchRow
        title={t('workGroupTitle' as SettingsKey)}
        description={t('workGroupDesc' as SettingsKey)}
        checked={state.workGroup.checked}
        onChange={next => { void setAutoExpandSetting('groupAutoExpand', next) }}
        {...state.workGroup.locked ? { locked: { hint: gatedByWorkGroup } } : {}}
      />
      <SwitchRow
        title={t('reasoningTitle' as SettingsKey)}
        description={state.reasoning.gatedText ? gatedByWorkGroup : t('reasoningDesc' as SettingsKey)}
        checked={state.reasoning.checked}
        onChange={next => { void setAutoExpandSetting('reasoningAutoExpand', next) }}
        {...state.reasoning.locked ? { locked: { hint: gatedByWorkGroup } } : {}}
      />
      <SelectRow
        title={t('reasoningTimingTitle' as SettingsKey)}
        description={state.reasoningTiming.gate === 'none'
          ? t('reasoningTimingDesc' as SettingsKey)
          : timingText(state.reasoningTiming.gate, 'gatedByReasoning')}
        value={settings.reasoningCollapseTiming}
        options={timingOptions}
        onChange={next => { void setAutoExpandSetting('reasoningCollapseTiming', next) }}
        {...state.reasoningTiming.locked
          ? { locked: { hint: timingText(state.reasoningTiming.gate, 'gatedByReasoning') } }
          : {}}
      />
      <SwitchRow
        title={t('toolTitle' as SettingsKey)}
        description={state.tool.gatedText ? gatedByWorkGroup : t('toolDesc' as SettingsKey)}
        checked={state.tool.checked}
        onChange={next => { void setAutoExpandSetting('toolAutoExpand', next) }}
        {...state.tool.locked ? { locked: { hint: gatedByWorkGroup } } : {}}
      />
      <SelectRow
        title={t('toolTimingTitle' as SettingsKey)}
        description={state.toolTiming.gate === 'none'
          ? t('toolTimingDesc' as SettingsKey)
          : timingText(state.toolTiming.gate, 'gatedByTool')}
        value={settings.toolCollapseTiming}
        options={timingOptions}
        onChange={next => { void setAutoExpandSetting('toolCollapseTiming', next) }}
        {...state.toolTiming.locked
          ? { locked: { hint: timingText(state.toolTiming.gate, 'gatedByTool') } }
          : {}}
      />
    </div>
  )
}