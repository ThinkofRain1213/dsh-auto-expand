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
 *  - **九行，没有分组标题**（页面顶部已有插件名与描述）；
 *  - 字体两级：`.title` 13/500、`.desc` 12/400；
 *  - 行内边距 16px 0，标题↔描述 6px；
 *  - 开关用官方 `Switch`，下拉用官方 `Menu` + 自定义 anchor。
 *
 * ## 九行按四组排列
 *
 * ```
 * 1 Switch  自动展开操作组
 * 2 Switch  自动展开思考过程
 * 3 下拉    思考收起时机
 * 4 Switch  自动展开工具结果
 * 5 下拉    工具收起时机
 * 6 下拉    隐藏查看按钮
 * 7 Switch  自定义展开高度
 * 8 数字    展开高度
 * 9 Switch  历史轮次也应用
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
import { useEffect, useState } from 'react'
import {
  IconChevronDownOutlineRegular, IconInfoOutlineRegular, Menu, Switch,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// 引入 `plugins.bundle.config` 的 SlotMap 声明（type-only，无运行时依赖）。
import type {} from './contract/slot-declarations.ts'
import {
  GROUP_AUTO_EXPAND_FIELD,
  GROUP_HEIGHT_CUSTOM_FIELD, GROUP_HEIGHT_HISTORY_FIELD, GROUP_HEIGHT_PERCENT_FIELD,
  INSPECT_BUTTON_HIDE_SCOPE_FIELD,
  REASONING_AUTO_EXPAND_FIELD, REASONING_COLLAPSE_TIMING_FIELD,
  TOOL_AUTO_EXPAND_FIELD, TOOL_COLLAPSE_TIMING_FIELD,
  setAutoExpandSetting, useAutoExpandSettings,
} from './settings.ts'
import { normalizeDigits } from './group-height.ts'
import { deriveSettingsCardState, type SelectRowState } from './settings-card-state.ts'
import { COLLAPSE_TIMINGS, type CollapseTiming } from './collapse-timing.ts'
import { INSPECT_BUTTON_HIDE_SCOPES, type InspectButtonHideScope } from './inspect-button-scope.ts'
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

/** 每个隐藏范围的文案键。 */
const SCOPE_LABEL_KEYS: Record<InspectButtonHideScope, SettingsKey> = {
  off: 'inspectScopeOff',
  current: 'inspectScopeCurrent',
  all: 'inspectScopeAll',
}

/**
 * 低于这个百分比时显示橙色警告。
 *
 * `10%` 对应 `min(40px, 5vh)`，已经容不下一条完整操作行（含渐隐区）。
 * 与设计文档 §6.1.2 一致。
 */
const WARN_BELOW_PERCENT = 10

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
 * 一行数字输入：名称 + 描述在左，右侧是「警告图标 + 输入框 + 单位」。
 *
 * ## 为什么是受控草稿，而不是每次输入都写 Host
 *
 * 开关是点击即写（没有中间态），但数字输入有：输入 `200` 的过程是
 * `2` → `20` → `200`。若逐字写入，中间那个 `2%` 会让操作组瞬间压到
 * `min(8px, 1vh)`，用户会看到组在打字时闪缩三次。
 *
 * 因此键入只改本地 `draft`，失焦或回车才提交。
 *
 * ## 空值 = 不设上限
 *
 * 提交空草稿时写 `null`。`0` 不是特殊值——它是普通的「过小值」，
 * 由橙色 ⓘ 劝阻但**不阻止**保存。
 *
 * ## 警告图标为什么在框外左侧
 *
 * 它表达的是「这个值太小」，不是「输入出错」。塞进框里会把它读成后者。
 * 这与 DPG 的 `LinkRow` 不同（那边有 4 种状态，框内右侧是唯一空位）。
 * @param props - 标题、描述、当前值、提交回调、锁定信息、占位符与警示文案。
 * @returns 一行设置。
 */
function NumberRow({ title, description, value, onCommit, locked, placeholder, warning, unit = '%' }: {
  readonly title: string
  readonly description: string
  /** `null` 表示不设上限。 */
  readonly value: number | null
  readonly onCommit: (next: number | null) => void
  /** 存在表示该行被上层控制：整体变灰、拒绝输入、描述已换成控制者说明。 */
  readonly locked?: { readonly hint: string }
  /** 空值时框内的灰字。 */
  readonly placeholder: string
  /** 值过小时的提示；为空表示不显示警告。 */
  readonly warning: string
  readonly unit?: string
}) {
  const [draft, setDraft] = useState(value === null ? '' : String(value))
  const [focused, setFocused] = useState(false)
  // 非聚焦时跟随外部值（例如设置被重置，或 Host 回滚）。
  // 聚焦时必须保留草稿，否则用户打字打到一半会被外部值覆盖。
  useEffect(() => {
    if (focused) return
    setDraft(value === null ? '' : String(value))
  }, [value, focused])
  const parsed = draft === '' ? null : Number(draft)
  const showWarning = !locked && parsed !== null && parsed < WARN_BELOW_PERCENT
  /**
   * 提交草稿。
   *
   * 空草稿提交 `null`（= 不设上限），这是本控件的核心语义，不偷偷填回 100。
   *
   * ## 提交后必须把草稿对齐到权威值
   *
   * `writeOptimistic` 是「先同步改快照、再异步写 Host、失败时回滚」。若提交后
   * 只依赖 `useEffect` 同步草稿，会有两个洞：
   *
   * 1. **Enter 提交不让输入框失焦**，`focused` 仍为真，`useEffect` 直接 return，
   *    于是 Host 拒绝后输入框仍显示那个**被拒绝**的值，看起来像保存成功了；
   * 2. `next === value` 的相等短路会让 `"007"` / `"000"` 这类草稿永远不回正
   *    （`Number('007') === 7 === value`），输入框长期显示 `007` 而语义是 `7`。
   *
   * 因此这里显式把草稿写回 `value` 的规范形式。Host 拒绝时 `value` 会由
   * `writeOptimistic` 回滚成旧值，下一帧的 `useEffect` 再把草稿拉回旧值。
   */
  const commit = (): void => {
    const next = draft === '' ? null : Number(draft)
    // 无论是否真的写 Host，草稿都先规范化（处理 "007"、前后空格等）。
    setDraft(next === null ? '' : String(next))
    if (next === value) return
    onCommit(next)
  }
  return (
    <div className={css.row}>
      <div className={css.rowText}>
        <div className={locked === undefined ? css.title : `${css.title} ${css.gated}`}>{title}</div>
        <div className={locked === undefined ? css.desc : `${css.desc} ${css.gated}`}>{description}</div>
      </div>
      <div className={css.numGroup}>
        {/* 固定占位：出警告时不把输入框推歪。 */}
        {/* `title` 只服务鼠标；`role` + `aria-label` 让屏幕阅读器也收到提示。 */}
        <span className={showWarning ? `${css.warnSlot} ${css.show}` : css.warnSlot}
          {...showWarning ? { title: warning, role: 'img', 'aria-label': warning } : {}}>
          {showWarning && <IconInfoOutlineRegular size={16} className={css.warnIcon} />}
        </span>
        {/* 结构与 DPG 的 `.linkField` 一致：容器只负责定位，边框/字号全在
            `<input>` 上；`%` 绝对定位在框内右端（对应 DPG 的 `.linkStatus`）。 */}
        <div className={css.numField}>
          <input
            className={css.numInput}
            type="text"
            inputMode="numeric"
            value={draft}
            placeholder={placeholder}
            disabled={locked !== undefined}
            aria-label={title}
            {...locked === undefined ? {} : { title: locked.hint }}
            onFocus={() => { setFocused(true) }}
            onChange={(event) => {
              // 强过滤：只留数字。负号、字母因此物理上不可输入。
              //
              // 全角数字必须**先归一化再过滤**：中文输入法打出的 `１５０`
              // 不符合 `\d`，直接过滤会得到空串，而空串在失焦时被解释为
              // 「用户主动清空」→ 写入 `null`（不设上限）。那比「打不进去」
              // 严重一档：用户以为设了 150%，实际把组设成撑满屏幕。
              setDraft(normalizeDigits(event.target.value))
            }}
            onBlur={() => { setFocused(false); commit() }}
            onKeyDown={(event) => {
              if (event.key !== 'Enter') return
              event.preventDefault()
              // Enter 也要失焦：否则 `focused` 仍为真，`useEffect` 不跟随
              // Host 回滚，被拒绝的值会一直留在框里（见 `commit` 的注释）。
              event.currentTarget.blur()
            }}
          />
          <span className={css.numUnit}>{unit}</span>
        </div>
      </div>
    </div>
  )
}

/**
 * 渲染九行设置。
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
  /** 隐藏范围选项；顺序即 `INSPECT_BUTTON_HIDE_SCOPES`（从松到紧）。 */
  const scopeOptions = INSPECT_BUTTON_HIDE_SCOPES.map(id => ({
    id, label: t(SCOPE_LABEL_KEYS[id]),
  }))
  return (
    <div className={css.stack}>
      <SwitchRow
        title={t('workGroupTitle' as SettingsKey)}
        description={t('workGroupDesc' as SettingsKey)}
        checked={state.workGroup.checked}
        onChange={next => { void setAutoExpandSetting(GROUP_AUTO_EXPAND_FIELD, next) }}
        {...state.workGroup.locked ? { locked: { hint: gatedByWorkGroup } } : {}}
      />
      <SwitchRow
        title={t('reasoningTitle' as SettingsKey)}
        description={state.reasoning.gatedText ? gatedByWorkGroup : t('reasoningDesc' as SettingsKey)}
        checked={state.reasoning.checked}
        onChange={next => { void setAutoExpandSetting(REASONING_AUTO_EXPAND_FIELD, next) }}
        {...state.reasoning.locked ? { locked: { hint: gatedByWorkGroup } } : {}}
      />
      <SelectRow
        title={t('reasoningTimingTitle' as SettingsKey)}
        description={state.reasoningTiming.gate === 'none'
          ? t('reasoningTimingDesc' as SettingsKey)
          : timingText(state.reasoningTiming.gate, 'gatedByReasoning')}
        value={settings.reasoningCollapseTiming}
        options={timingOptions}
        onChange={next => { void setAutoExpandSetting(REASONING_COLLAPSE_TIMING_FIELD, next) }}
        {...state.reasoningTiming.locked
          ? { locked: { hint: timingText(state.reasoningTiming.gate, 'gatedByReasoning') } }
          : {}}
      />
      <SwitchRow
        title={t('toolTitle' as SettingsKey)}
        description={state.tool.gatedText ? gatedByWorkGroup : t('toolDesc' as SettingsKey)}
        checked={state.tool.checked}
        onChange={next => { void setAutoExpandSetting(TOOL_AUTO_EXPAND_FIELD, next) }}
        {...state.tool.locked ? { locked: { hint: gatedByWorkGroup } } : {}}
      />
      <SelectRow
        title={t('toolTimingTitle' as SettingsKey)}
        description={state.toolTiming.gate === 'none'
          ? t('toolTimingDesc' as SettingsKey)
          : timingText(state.toolTiming.gate, 'gatedByTool')}
        value={settings.toolCollapseTiming}
        options={timingOptions}
        onChange={next => { void setAutoExpandSetting(TOOL_COLLAPSE_TIMING_FIELD, next) }}
        {...state.toolTiming.locked
          ? { locked: { hint: timingText(state.toolTiming.gate, 'gatedByTool') } }
          : {}}
      />
      {/* P9：查看按钮的隐藏范围。放在最后——它不参与"自动展开"那条主线，
          而是对官方入口的一次可选收纳。**永不锁死**（独立设置）。

          说明随「当前档位 × 是否失效」变化：
          - 档位是 off/all → 基础说明（只提"只影响工具行"）；
          - 档位是 current → 说明收起后交回官方；若此时自动展开本身关着，
            改说"等同于不隐藏"并点名是哪个开关 —— 不锁行，只解释。 */}
      <SelectRow
        title={t('inspectScopeTitle' as SettingsKey)}
        description={scopeDescription(settings.inspectButtonHideScope, state.inspectScopeIdle, t)}
        value={settings.inspectButtonHideScope}
        options={scopeOptions}
        onChange={next => { void setAutoExpandSetting(INSPECT_BUTTON_HIDE_SCOPE_FIELD, next) }}
      />
      {/* 高度三行（第七~九行）。
          第一行永不锁死（它自己能独立决策）；大段开关关闭时它仍可编辑，
          只是用描述说明「暂不生效」——与第六行同一套做法。 */}
      <SwitchRow
        title={t('heightCustomTitle' as SettingsKey)}
        description={state.groupHeightIdle
          ? t('heightIdle' as SettingsKey)
          : t('heightCustomDesc' as SettingsKey)}
        checked={state.heightCustom.checked}
        onChange={next => { void setAutoExpandSetting(GROUP_HEIGHT_CUSTOM_FIELD, next) }}
      />
      <NumberRow
        title={t('heightPercentTitle' as SettingsKey)}
        description={state.heightPercent.gate === 'heightCustom'
          ? t('gatedByHeightCustom' as SettingsKey)
          : t('heightPercentDesc' as SettingsKey)}
        value={settings.groupHeightPercent}
        placeholder={t('heightPercentPlaceholder' as SettingsKey)}
        warning={t('heightPercentTooSmall' as SettingsKey)}
        onCommit={next => { void setAutoExpandSetting(GROUP_HEIGHT_PERCENT_FIELD, next) }}
        {...state.heightPercent.locked ? { locked: { hint: t('gatedByHeightCustom' as SettingsKey) } } : {}}
      />
      <SwitchRow
        title={t('heightHistoryTitle' as SettingsKey)}
        description={state.heightHistory.gate === 'heightCustom'
          ? t('gatedByHeightCustom' as SettingsKey)
          : t('heightHistoryDesc' as SettingsKey)}
        checked={state.heightHistory.checked}
        onChange={next => { void setAutoExpandSetting(GROUP_HEIGHT_HISTORY_FIELD, next) }}
        {...state.heightHistory.locked
          ? { locked: { hint: t('gatedByHeightCustom' as SettingsKey) } }
          : {}}
      />
    </div>
  )
}

/**
 * 选一条说明文案。
 *
 * 只有「运行中隐藏」才需要额外解释：它依赖自动展开，开关一关就没有「运行中」
 * 可言，此时该档等同于「不隐藏」。其余两档与开关无关，用基础说明即可。
 * @param scope - 当前档位。
 * @param idle - 「运行中」档失效的原因。
 * @param t - 本地化函数。
 * @returns 说明文案。
 */
function scopeDescription(
  scope: InspectButtonHideScope,
  idle: 'none' | 'workGroup' | 'own',
  t: (key: SettingsKey) => string,
): string {
  if (scope !== 'current') return t('inspectScopeDesc')
  if (idle === 'workGroup') return t('inspectScopeDescCurrentWorkGroupOff')
  if (idle === 'own') return t('inspectScopeDescCurrentToolOff')
  return t('inspectScopeDescCurrent')
}