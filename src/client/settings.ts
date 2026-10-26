/**
 * 浏览器侧的设置源。
 *
 * 设置通过官方 `configForms` 读写（Host 设置文档），因此跨重启保留。
 *
 * 为什么用模块级单例而不是 React Context：
 *  - `AutoGroupSeat` 与 `AutoReasoningRow` 都深埋在克隆组件树里，
 *    用 Context 要逐层透传；
 *  - 本插件每个页面只有一个实例，单例不会串状态；
 *  - 组件通过 `useAutoExpandSettings()` 订阅，快照只在两个布尔真正变化时替换。
 *
 * 生命周期：模块加载时以默认值起步（默认全开），`apply()` 拿到
 * `configForms` 后接管真实值。因此即使设置服务缺失，插件仍以默认行为工作。
 */
import { useSyncExternalStore } from 'react'
import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-store'
import { writeOptimistic } from './settings-write.ts'
import type { CollapseTiming } from './collapse-timing.ts'
import {
  DEFAULT_INSPECT_BUTTON_HIDE_SCOPE, type InspectButtonHideScope,
} from './inspect-button-scope.ts'
import {
  DEFAULT_GROUP_HEIGHT_PERCENT,
  GROUP_HEIGHT_CUSTOM_FIELD, GROUP_HEIGHT_HISTORY_FIELD, GROUP_HEIGHT_PERCENT_FIELD,
} from './group-height.ts'

/** 本插件设置命名空间（= Host 半边在 `cordis.patch.yml` 里的 entry id）。 */
export const AUTO_EXPAND_NAMESPACE = 'auto-expand'

/** 字段名（与 Host schema 一致）。 */
export const GROUP_AUTO_EXPAND_FIELD = 'groupAutoExpand'
export const REASONING_AUTO_EXPAND_FIELD = 'reasoningAutoExpand'
export const TOOL_AUTO_EXPAND_FIELD = 'toolAutoExpand'
export const REASONING_COLLAPSE_TIMING_FIELD = 'reasoningCollapseTiming'
export const TOOL_COLLAPSE_TIMING_FIELD = 'toolCollapseTiming'
export const INSPECT_BUTTON_HIDE_SCOPE_FIELD = 'inspectButtonHideScope'
export {
  GROUP_HEIGHT_CUSTOM_FIELD, GROUP_HEIGHT_HISTORY_FIELD, GROUP_HEIGHT_PERCENT_FIELD,
}

/** 默认设置：三个开关默认全开；两个时机默认「下一批操作出现时」；查看按钮不隐藏。 */
export const DEFAULT_SETTINGS: AutoExpandSettings = {
  groupAutoExpand: true,
  reasoningAutoExpand: true,
  toolAutoExpand: true,
  reasoningCollapseTiming: 'next-node',
  toolCollapseTiming: 'next-node',
  inspectButtonHideScope: DEFAULT_INSPECT_BUTTON_HIDE_SCOPE,
  groupHeightCustom: false,
  groupHeightPercent: DEFAULT_GROUP_HEIGHT_PERCENT,
  groupHeightHistory: false,
}

/** 本插件设置的可观察快照。 */
export interface AutoExpandSettings {
  readonly groupAutoExpand: boolean
  readonly reasoningAutoExpand: boolean
  readonly toolAutoExpand: boolean
  /** 思考的收起时机（与工具同一取值集合）。 */
  readonly reasoningCollapseTiming: CollapseTiming
  /** 工具的收起时机（与思考同一取值集合）。 */
  readonly toolCollapseTiming: CollapseTiming
  /** 工具行「查看」按钮的隐藏范围。 */
  readonly inspectButtonHideScope: InspectButtonHideScope
  /** 操作组是否使用自定义高度。 */
  readonly groupHeightCustom: boolean
  /** 自定义高度百分比；`null` = 留空 = **不设上限**。 */
  readonly groupHeightPercent: number | null
  /** 历史轮次的操作组是否也应用自定义高度。 */
  readonly groupHeightHistory: boolean
}

/** `configForms.get()` 返回的最小契约（只取本插件用到的部分）。 */
export interface ConfigFormLike {
  getSnapshot(): { readonly value: Partial<AutoExpandSettings> | undefined }
  subscribe(listener: () => void): () => void
  set(field: string, value: unknown): Promise<boolean>
}

/**
 * 模块级设置源。
 *
 * 默认值起步；`attachSettingsForm()` 成功后跟随 Host 的真实值。
 */
export const settingsSource: SnapshotStore<AutoExpandSettings> = createSnapshotStore(DEFAULT_SETTINGS)

/** 已接管的表单，保证重复接管不会叠加订阅。 */
let attached: { form: ConfigFormLike; dispose: () => void } | undefined

/**
 * 订阅一个 `configForms` 表单，并在任一设置变化时更新 `settingsSource`。
 *
 * 只在**设置值真正变化**时替换快照，因此表单的 `status`/`revision`
 * 抖动不会引起下游重渲染。
 * @param form - 官方 configForms 表单，命名空间为本插件 entry id。
 * @returns 释放订阅的函数。
 */
export function attachSettingsForm(form: ConfigFormLike): () => void {
  attached?.dispose()

  const read = (): AutoExpandSettings => {
    const value = form.getSnapshot().value
    return {
      groupAutoExpand: value?.groupAutoExpand ?? DEFAULT_SETTINGS.groupAutoExpand,
      reasoningAutoExpand: value?.reasoningAutoExpand ?? DEFAULT_SETTINGS.reasoningAutoExpand,
      toolAutoExpand: value?.toolAutoExpand ?? DEFAULT_SETTINGS.toolAutoExpand,
      reasoningCollapseTiming:
        value?.reasoningCollapseTiming ?? DEFAULT_SETTINGS.reasoningCollapseTiming,
      toolCollapseTiming: value?.toolCollapseTiming ?? DEFAULT_SETTINGS.toolCollapseTiming,
      inspectButtonHideScope:
        value?.inspectButtonHideScope ?? DEFAULT_SETTINGS.inspectButtonHideScope,
      groupHeightCustom: value?.groupHeightCustom ?? DEFAULT_SETTINGS.groupHeightCustom,
      // 这里**不能**用 `?? DEFAULT`：那会把用户明确清空（`null`）读成 100，
      // 「留空 = 不设上限」这个语义就丢了。只有 `undefined`（从未设置）才回落默认。
      groupHeightPercent: value?.groupHeightPercent === undefined
        ? DEFAULT_SETTINGS.groupHeightPercent
        : value.groupHeightPercent,
      groupHeightHistory: value?.groupHeightHistory ?? DEFAULT_SETTINGS.groupHeightHistory,
    }
  }

  const sync = (): void => {
    const next = read()
    const current = settingsSource.getSnapshot()
    if (next.groupAutoExpand === current.groupAutoExpand
      && next.reasoningAutoExpand === current.reasoningAutoExpand
      && next.toolAutoExpand === current.toolAutoExpand
      && next.reasoningCollapseTiming === current.reasoningCollapseTiming
      && next.toolCollapseTiming === current.toolCollapseTiming
      && next.inspectButtonHideScope === current.inspectButtonHideScope
      && next.groupHeightCustom === current.groupHeightCustom
      && next.groupHeightPercent === current.groupHeightPercent
      && next.groupHeightHistory === current.groupHeightHistory) return
    settingsSource.set(next)
  }

  // 接管时立刻对齐一次：初始快照可能仍是默认值。
  sync()
  const unsubscribe = form.subscribe(sync)
  const dispose = (): void => {
    unsubscribe()
    if (attached?.form === form) attached = undefined
  }
  attached = { form, dispose }
  return dispose
}

/**
 * 写入一个开关。
 *
 * 乐观：先更新本地快照，再写 Host；写失败时回滚到 Host 的值。
 * 这样开关切换不会因为 RPC 往返而卡顿。具体规则与回滚时机见
 * `settings-write.ts`（那里是可单测的纯逻辑）。
 * @param field - 字段名。
 * @param value - 新值。
 * @returns 写入是否被 Host 接受。
 */
export async function setAutoExpandSetting<Field extends keyof AutoExpandSettings>(
  field: Field,
  value: AutoExpandSettings[Field],
): Promise<boolean> {
  return writeOptimistic(settingsSource, attached?.form, field, value)
}

/**
 * 订阅本插件的设置。
 * @returns 当前设置快照。
 */
export function useAutoExpandSettings(): AutoExpandSettings {
  return useSyncExternalStore(
    settingsSource.subscribe,
    settingsSource.getSnapshot,
    settingsSource.getSnapshot,
  )
}
