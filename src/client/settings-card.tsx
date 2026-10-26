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
import { useEffect, useId, useState, type ReactNode } from 'react'
import {
  IconChevronDownOutlineRegular, Menu, SettingsValueField, Switch,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// 引入 `plugins.bundle.config` 的 SlotMap 声明（type-only，无运行时依赖）。
import type {} from './contract/slot-declarations.ts'
import {
  GROUP_AUTO_EXPAND_FIELD,
  GROUP_HEIGHT_UNLIMITED_FIELD, GROUP_HEIGHT_HISTORY_FIELD, GROUP_HEIGHT_PERCENT_FIELD,
  INSPECT_BUTTON_HIDE_SCOPE_FIELD,
  REASONING_AUTO_EXPAND_FIELD, REASONING_COLLAPSE_TIMING_FIELD,
  TOOL_AUTO_EXPAND_FIELD, TOOL_COLLAPSE_TIMING_FIELD,
  setAutoExpandSetting, useAutoExpandSettings,
} from './settings.ts'
import { DEFAULT_GROUP_HEIGHT_PERCENT, normalizeDigits } from './group-height.ts'
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
function NumberRow({ title, description, value, onCommit, locked, warning, fieldId, overriddenLabel, resetLabel }: {
  readonly title: string
  readonly description: string
  /** 当前百分比。100 = 官方默认。 */
  readonly value: number
  readonly onCommit: (next: number) => void
  /** 存在表示该行被上层控制：整体变灰、拒绝输入、描述已换成控制者说明。 */
  readonly locked?: { readonly hint: string }
  /** 值过小时的提示；为空表示不显示警告。 */
  readonly warning: string
  /** 官方字段要求稳定 id，用于 label 与控件的关联。 */
  readonly fieldId: string
  /** 「已覆盖」徽章的文案。 */
  readonly overriddenLabel: string
  /** 「恢复默认」按钮的文案。 */
  readonly resetLabel: string
}) {
  const [draft, setDraft] = useState(String(value))
  const [focused, setFocused] = useState(false)
  // 非聚焦时跟随外部值（例如设置被重置，或 Host 回滚）。
  // 聚焦时必须保留草稿，否则用户打字打到一半会被外部值覆盖。
  useEffect(() => {
    if (focused) return
    setDraft(String(value))
  }, [value, focused])
  const parsed = draft === '' ? null : Number(draft)
  /**
   * 值过小时把它标成「无效」，让官方组件在自己的提示位显示警示文案。
   *
   * 这不是真正的非法值（`0`、`5` 都能保存），只是**过小**。借用 `invalid` 通道
   * 是因为官方 `SettingsValueField` 只有这一个提示位：它会用 `invalidLabel`
   * 替换 `hint`，并把边框染成错误色。若另造一套提示，就会与官方字段的语义打架。
   */
  const tooSmall = locked === undefined && parsed !== null && parsed < WARN_BELOW_PERCENT
  /** 偏离默认值（100%）时显示「已覆盖 / 恢复默认」。 */
  const overridden = value !== DEFAULT_GROUP_HEIGHT_PERCENT
  /**
   * 提交草稿。
   *
   * **空草稿提交默认值 100**（而不是 0 或旧值）：100 就是官方默认，
   * 「清空」因此等价于「恢复默认」，这是数字字段里最符合直觉的语义。
   *
   * ## 为什么由外层 `<div onBlurCapture>` 触发
   *
   * 官方 `SettingsValueField` 只暴露 `onEdit` / `onReset`，没有 `onBlur` 钩子。
   * 但 React 的 `blur` 事件**不冒泡**——所以外层要用 capture 阶段才能收到。
   *
   * ## 提交后必须把草稿对齐到权威值
   *
   * `writeOptimistic` 是「先同步改快照、再异步写 Host、失败时回滚」。若提交后
   * 只依赖 `useEffect` 同步草稿，会有两个洞：
   *
   * 1. 失焦那一刻 `focused` 刚变 false 但 `useEffect` 尚未跑完，被 Host 拒绝的
   *    值会短暂留在框里；
   * 2. `next === value` 的相等短路会让 `"007"` / `"000"` 这类草稿永远不回正
   *    （`Number('007') === 7 === value`），输入框长期显示 `007` 而语义是 `7`。
   *
   * 因此这里显式把草稿写回 `value` 的规范形式。
   */
  const commit = (): void => {
    const next = draft === '' ? DEFAULT_GROUP_HEIGHT_PERCENT : Number(draft)
    // 无论是否真的写 Host，草稿都先规范化（处理 "007"、前后空格等）。
    setDraft(String(next))
    if (next === value) return
    onCommit(next)
  }
  return (
    /* 外层只负责捕获焦点事件（官方 `SettingsValueField` 没有暴露 `onFocus` /
        `onBlur`），**不能带任何纵向 padding** —— 那个 div 内部的官方组件自己
       已经有 `.field { padding: 12px 0 }`，再包一层带 padding 的容器会让这一行
       的上下留白比其它行多一倍（24px vs 12px），肉眼立刻看出这一格是错的。

       锁定时加 `.fieldGated`：官方组件只把 `disabled` 传给 `<input>`
       （`fields.module.css` 的 `.input:disabled` 只改文字色），label 与 hint
       不变灰。但本卡片里其它行被锁时是整行变灰的（`.gated`），两类行必须一致。 */
    <div
      className={locked === undefined ? css.fieldSlot : `${css.fieldSlot} ${css.fieldGated}`}
      onFocusCapture={() => { setFocused(true) }}
      onBlurCapture={() => { setFocused(false); commit() }}
    >
      <SettingsValueField
        id={fieldId}
        /* 单位写进标题，不用框内后缀——这是官方字段的标准做法
           （对比「命令超时（毫秒）」）。 */
        label={title}
        hint={description}
        text={draft}
        invalid={tooSmall}
        /* 官方字段的「已覆盖 / 恢复默认」——偏离默认值时才出现。
           走官方通道而不是自己造按钮：几何、hover、disabled 全部由组件提供。 */
        overridden={overridden}
        overriddenLabel={overriddenLabel}
        /* 点「恢复默认」把值写回 100，并立刻对齐草稿。 */
        onReset={() => {
          setDraft(String(DEFAULT_GROUP_HEIGHT_PERCENT))
          onCommit(DEFAULT_GROUP_HEIGHT_PERCENT)
        }}
        resetLabel={resetLabel}
        invalidLabel={warning}
        numeric
        disabled={locked !== undefined}
        {...locked === undefined ? {} : { title: locked.hint }}
        onEdit={(text) => {
          // 强过滤：只留数字。负号、字母因此物理上不可输入。
          //
          // 全角数字必须**先归一化再过滤**：中文输入法打出的 `１５０`
          // 不符合 `\d`，直接过滤会得到空串，而空串在失焦时会被回填成
          // 默认值 100 —— 用户以为设了 150%，实际把设置悄悄重置了。
          setDraft(normalizeDigits(text))
        }}
      />
    </div>
  )
}

/**
 * 一个一级分组：`<h3>` 标题 + 组内各行。
 *
 * ## 为什么定义在模块级而不是 `SettingsCard` 内部
 *
 * 早先它写在 `SettingsCard` 函数体里。那样**每次渲染都会创建新的组件类型**，
 * React 认为整棵子树是全新的，于是**卸载重建**每个分组——表现为：
 *
 * - 开关的切换动画消失（不是更新，是重建）；
 * - 点击开关后页面跳到顶部（DOM 节点被移除又插入，滚动位置丢失）。
 *
 * 组件定义在渲染过程中产生，是 React 里最典型的性能与状态 bug 来源。
 * 挪到模块级后，组件类型稳定，React 走正常的更新路径。
 * @param props - 分组标题、`aria-labelledby` 的锚点 id、是否在顶部画分隔线、组内各行。
 * @returns 一个分节（可能带前置分隔线）。
 */
function Section({ id, title, divider, children }: {
  readonly id: string
  readonly title: string
  /**
   * 是否在本组上方画一条分隔线（第一组不画）。
   *
   * 线是**独立元素**而不是 `<section>` 的 `border-top`：`border` 属于某一个块，
   * 会让它的 padding 不对称，线就贴到上方那组的内容上（详见 CSS 的 `.rule` 注释）。
   * 独立元素落在两组各自的 `padding: 16px 0` 之间，天然居中。
   */
  readonly divider: boolean
  readonly children: ReactNode
}) {
  return (
    <>
      {divider && <div className={css.rule} role="presentation" />}
      <section className={css.section} aria-labelledby={id}>
        <h3 className={css.heading} id={id}>{title}</h3>
        {children}
      </section>
    </>
  )
}

/**
 * 渲染四个分组、九个设置项。
 *
 * 没有卡片级标题：插件详情页顶部已经写着插件名和描述。
 *
 * 设置状态来自模块级 `settingsSource`（见 `settings.ts`），因此本卡片与
 * 渲染层的展开策略读的是**同一个**快照，不可能不一致。
 * @param props - 槽位运行时与 locale 座位。
 * @returns 设置卡片。
 */
export function SettingsCard({ t }: SettingsCardProps) {
  const settings = useAutoExpandSettings()
  const state = deriveSettingsCardState(settings)
  /** 分组标题的 `id` 前缀，用于 `aria-labelledby` 与 `<h3>` 的配对。 */
  const sectionId = useId()
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
      <Section id={`${sectionId}-workgroup`} title={t('groupWorkGroup' as SettingsKey)} divider={false}>
        <SwitchRow
          title={t('workGroupTitle' as SettingsKey)}
          description={t('workGroupDesc' as SettingsKey)}
          checked={state.workGroup.checked}
          onChange={next => { void setAutoExpandSetting(GROUP_AUTO_EXPAND_FIELD, next) }}
          {...state.workGroup.locked ? { locked: { hint: gatedByWorkGroup } } : {}}
        />
      </Section>

      <Section id={`${sectionId}-reasoning`} title={t('groupReasoning' as SettingsKey)} divider>
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
      </Section>

      <Section id={`${sectionId}-tool`} title={t('groupTool' as SettingsKey)} divider>
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
        {/* P9：查看按钮的隐藏范围。它只影响工具行，因此归在「工具」组。
            **永不锁死**（独立设置）。 */}
        <SelectRow
          title={t('inspectScopeTitle' as SettingsKey)}
          description={scopeDescription(settings.inspectButtonHideScope, state.inspectScopeIdle, t)}
          value={settings.inspectButtonHideScope}
          options={scopeOptions}
          onChange={next => { void setAutoExpandSetting(INSPECT_BUTTON_HIDE_SCOPE_FIELD, next) }}
        />
      </Section>

      <Section id={`${sectionId}-height`} title={t('groupHeight' as SettingsKey)} divider>
        {/* 「不限制高度」永不锁死（高度组里唯一能独立决策的控件）；大段开关关闭时
            它仍可编辑，只是用描述说明「暂不生效」——与第六行同一套做法。 */}
        <SwitchRow
          title={t('heightUnlimitedTitle' as SettingsKey)}
          description={state.groupHeightIdle
            ? t('heightIdle' as SettingsKey)
            : t('heightUnlimitedDesc' as SettingsKey)}
          checked={state.heightUnlimited.checked}
          onChange={next => { void setAutoExpandSetting(GROUP_HEIGHT_UNLIMITED_FIELD, next) }}
        />
        {/* 后两项与上面的开关一样**各自独占整行**——不再两列并排。
            三行因此与卡片其它行完全同构（横向开关行 + 纵向字段行），
            间距也统一走 `.row` / 官方字段各自的 `padding: 12px 0`。

            百分比框**只被「不限制高度」锁**：无上限时那个数字没有意义。
            历史开关**不受任何门控**——它表达应用范围，与高度值正交。 */}
        <NumberRow
          title={t('heightPercentTitle' as SettingsKey)}
          fieldId={`${sectionId}-height-percent`}
          description={state.heightPercent.gate === 'unlimited'
            ? t('gatedByHeightUnlimited' as SettingsKey)
            : t('heightPercentDesc' as SettingsKey)}
          value={settings.groupHeightPercent}
          warning={t('heightPercentTooSmall' as SettingsKey)}
          overriddenLabel={t('heightOverridden' as SettingsKey)}
          resetLabel={t('heightReset' as SettingsKey)}
          onCommit={next => { void setAutoExpandSetting(GROUP_HEIGHT_PERCENT_FIELD, next) }}
          {...state.heightPercent.locked
            ? { locked: { hint: t('gatedByHeightUnlimited' as SettingsKey) } }
            : {}}
        />
        <SwitchRow
          title={t('heightHistoryTitle' as SettingsKey)}
          description={t('heightHistoryDesc' as SettingsKey)}
          checked={state.heightHistory.checked}
          onChange={next => { void setAutoExpandSetting(GROUP_HEIGHT_HISTORY_FIELD, next) }}
        />
      </Section>
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