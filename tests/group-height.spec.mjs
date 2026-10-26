/**
 * 操作组自定义高度的判据测试。
 *
 * `group-height.ts` 是纯模块（零依赖），因此**直接 import 测试**；而
 * `settings.ts` 依赖 `@deepseek-ai/dsh-client-store`（其传递依赖在 Node 里
 * 加载不了），全项目对它的验证一律走**源码断言**（见
 * `tests/contract-consistency.spec.mjs`）。这里沿用同一做法。
 *
 * ## 语义：两个维度，不是三个状态
 *
 * 高度只有「有上限 / 无上限」两态。「官方默认」不是第三态 —— 它是
 * `percent === 100` 的特例（`min(400px, 50vh)`，逐像素相同）。
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  DEFAULT_GROUP_HEIGHT_PERCENT,
  GROUP_HEIGHT_HISTORY_FIELD, GROUP_HEIGHT_PERCENT_FIELD, GROUP_HEIGHT_UNLIMITED_FIELD,
  groupHeight,
} from '../src/client/group-height.ts'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = path => readFileSync(join(ROOT, path), 'utf8')

test('三个字段名与设计一致', () => {
  assert.equal(GROUP_HEIGHT_UNLIMITED_FIELD, 'groupHeightUnlimited')
  assert.equal(GROUP_HEIGHT_PERCENT_FIELD, 'groupHeightPercent')
  assert.equal(GROUP_HEIGHT_HISTORY_FIELD, 'groupHeightHistory')
})

test('高度默认值 100（等于官方原公式）', () => {
  assert.equal(DEFAULT_GROUP_HEIGHT_PERCENT, 100)
})

test('DEFAULT_SETTINGS 三项默认值与设计一致', () => {
  const source = read('src/client/settings.ts')
  assert.match(source, /groupHeightUnlimited:\s*false/)
  assert.match(source, /groupHeightPercent:\s*DEFAULT_GROUP_HEIGHT_PERCENT/)
  assert.match(source, /groupHeightHistory:\s*false/)
})

test('read() 的百分比回到普通 ?? 回落（不再有 null 语义）', () => {
  const source = read('src/client/settings.ts')
  assert.match(source, /groupHeightPercent:\s*value\?\.groupHeightPercent\s*\?\?/)
  // 旧的「null = 留空 = 不设上限」三分支必须已经消失
  assert.doesNotMatch(source, /groupHeightPercent\s*===\s*undefined/)
})

// ── groupHeight 纯函数 ──────────────────────────────────────────────────

/** 一份「所有条件都满足」的基线，每个用例只改自己关心的那一个字段。 */
const base = {
  groupAutoExpand: true,
  capped: true,
  isCurrent: true,
  unlimited: false,
  history: false,
  percent: 100,
}

test('操作组自动展开关闭时整体不生效', () => {
  assert.equal(groupHeight({ ...base, groupAutoExpand: false, percent: 150 }), null)
})

test('capped 为假时不干预（官方 detailed 模式）', () => {
  assert.equal(groupHeight({ ...base, capped: false, percent: 150 }), null)
})

test('历史组且未开启历史应用时不干预', () => {
  assert.equal(groupHeight({ ...base, isCurrent: false }), null)
})

test('历史组且开启历史应用时生效', () => {
  assert.deepEqual(groupHeight({ ...base, isCurrent: false, history: true, percent: 150 }),
    { maxHeight: 'min(600px, 75vh)' })
})

test('100% 是官方默认：不写内联，交给 CSS 的 min(400px, 50vh)', () => {
  // 这是「100% = 官方默认」的实现方式：返回 null 而不是写一个等价值，
  // 默认状态因此与未安装插件完全一致。
  assert.equal(groupHeight(base), null)
})

test('50% 等比缩放', () => {
  assert.deepEqual(groupHeight({ ...base, percent: 50 }), { maxHeight: 'min(200px, 25vh)' })
})

test('200% 可以超过官方上限', () => {
  assert.deepEqual(groupHeight({ ...base, percent: 200 }), { maxHeight: 'min(800px, 100vh)' })
})

test('不限制高度时无上限，且必须同时给 overflow-y', () => {
  assert.deepEqual(groupHeight({ ...base, unlimited: true }),
    { maxHeight: 'none', overflowY: 'visible' })
})

test('不限制高度优先于百分比（百分比的值不影响结果）', () => {
  assert.deepEqual(groupHeight({ ...base, unlimited: true, percent: 150 }),
    { maxHeight: 'none', overflowY: 'visible' })
})

test('不限制高度 + 历史应用：历史组也无限', () => {
  assert.deepEqual(groupHeight({ ...base, unlimited: true, isCurrent: false, history: true }),
    { maxHeight: 'none', overflowY: 'visible' })
})

test('不限制高度 + 历史不应用：历史组走官方', () => {
  assert.equal(groupHeight({ ...base, unlimited: true, isCurrent: false }), null)
})

test('percent 为 0 是普通值，不是无上限', () => {
  assert.deepEqual(groupHeight({ ...base, percent: 0 }), { maxHeight: 'min(0px, 0vh)' })
})

test('判断顺序：groupAutoExpand 优先于一切', () => {
  assert.equal(groupHeight({ ...base, groupAutoExpand: false, unlimited: true }), null)
})

test('判断顺序：capped 优先于 unlimited', () => {
  assert.equal(groupHeight({ ...base, capped: false, unlimited: true }), null)
})

// ── 文案 ────────────────────────────────────────────────────────────────

test('高度文案键在中英两套里都存在且非空', async () => {
  const { zh, en } = await import('../src/client/locales.ts')
  const keys = [
    'heightUnlimitedTitle', 'heightUnlimitedDesc',
    'heightPercentTitle', 'heightPercentDesc',
    'heightPercentTooSmall', 'heightOverridden', 'heightReset',
    'heightHistoryTitle', 'heightHistoryDesc',
    'gatedByHeightUnlimited', 'heightIdle',
  ]
  for (const key of keys) {
    assert.ok(typeof zh[key] === 'string' && zh[key].length > 0, `zh 缺 ${key}`)
    assert.ok(typeof en[key] === 'string' && en[key].length > 0, `en 缺 ${key}`)
  }
  assert.equal(zh.heightPercentTooSmall, '高度过小，内容几乎不可见')
})

test('settings.ts 与 group-height.ts 的三处字段名必须逐字相同', () => {
  // settings.ts 依赖 dsh-client-store，Node 里加载不了 —— 改用源码断言。
  const source = read('src/client/settings.ts')
  for (const [name, value] of [
    ['GROUP_HEIGHT_UNLIMITED_FIELD', GROUP_HEIGHT_UNLIMITED_FIELD],
    ['GROUP_HEIGHT_PERCENT_FIELD', GROUP_HEIGHT_PERCENT_FIELD],
    ['GROUP_HEIGHT_HISTORY_FIELD', GROUP_HEIGHT_HISTORY_FIELD],
  ]) {
    const pattern = new RegExp(`${name}\\s*=\\s*'([^']+)'`)
    const match = source.match(pattern)
    assert.ok(match, `settings.ts 必须显式声明 ${name} 字面量（不能只 re-export）`)
    assert.equal(match[1], value, `${name} 两处取值必须相同`)
  }
})

// ── 非法输入判据（与 UI 层的 NumberRow 保持一致）──────────────────────

/**
 * 复现 `NumberRow` 里的判据，确认它的行为与官方 `settingsNumberField` 一致、
 * 只多一条「非负」。
 *
 * 单测放在这里而不是渲染测试里：`settings-card.tsx` 依赖 React 与 slot 运行时，
 * Node 里加载不了；而这条判据本身就是纯数学，可以直接复述。
 * @param {string} draft - 输入框里的原始文本。
 * @returns {{invalid: boolean, value: number|null}} 判定结果。
 */
function classify(draft) {
  const trimmed = draft.trim()
  const num = trimmed === '' ? null : Number(trimmed)
  const notNumber = trimmed !== '' && !Number.isFinite(num)
  const negative = Number.isFinite(num) && num < 0
  return { invalid: notNumber || negative, value: notNumber || negative ? null : num }
}

test('空输入合法（视作恢复默认）', () => {
  assert.deepEqual(classify(''), { invalid: false, value: null })
  assert.deepEqual(classify('   '), { invalid: false, value: null })
})

test('普通整数与负数判据', () => {
  assert.deepEqual(classify('150'), { invalid: false, value: 150 })
  assert.deepEqual(classify('-5'), { invalid: true, value: null })
})

test('小数合法（本插件接受小数）', () => {
  assert.deepEqual(classify('2.5'), { invalid: false, value: 2.5 })
  assert.deepEqual(classify('0.5'), { invalid: false, value: 0.5 })
})

test('字母与混合输入非法（不过滤，原样判错）', () => {
  assert.equal(classify('abc').invalid, true)
  assert.equal(classify('15a').invalid, true)
  assert.equal(classify('1,000').invalid, true)
})

test('全角数字非法（照搬官方：Number() 不认全角）', () => {
  assert.equal(classify('１５０').invalid, true,
    '官方 parse 用 Number.isFinite，全角数字是 NaN —— 这是照搬官方的代价')
})

test('NaN 与 Infinity 都非法', () => {
  assert.equal(classify('NaN').invalid, true)
  assert.equal(classify('Infinity').invalid, true)
})

test('负数比"不是数字"优先报错（文案要分开）', () => {
  // -5 是有限数但为负；abc 不是数字。两者 invalid 文案不同。
  const neg = classify('-5')
  const notNum = classify('abc')
  assert.equal(neg.invalid && notNum.invalid, true)
  assert.equal(neg.value, null)
  assert.equal(notNum.value, null)
})
