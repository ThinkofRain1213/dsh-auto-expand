/**
 * 操作组自定义高度的判据测试。
 *
 * `group-height.ts` 是纯模块（零依赖），因此**直接 import 测试**；而
 * `settings.ts` 依赖 `@deepseek-ai/dsh-client-store`（其传递依赖在 Node 里
 * 加载不了），全项目对它的验证一律走**源码断言**（见
 * `tests/contract-consistency.spec.mjs`）。这里沿用同一做法。
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  DEFAULT_GROUP_HEIGHT_PERCENT,
  GROUP_HEIGHT_CUSTOM_FIELD, GROUP_HEIGHT_HISTORY_FIELD, GROUP_HEIGHT_PERCENT_FIELD,
  groupHeight,
} from '../src/client/group-height.ts'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = path => readFileSync(join(ROOT, path), 'utf8')

test('三个字段名与设计一致', () => {
  assert.equal(GROUP_HEIGHT_CUSTOM_FIELD, 'groupHeightCustom')
  assert.equal(GROUP_HEIGHT_PERCENT_FIELD, 'groupHeightPercent')
  assert.equal(GROUP_HEIGHT_HISTORY_FIELD, 'groupHeightHistory')
})

test('高度默认值 100（等于官方原公式）', () => {
  assert.equal(DEFAULT_GROUP_HEIGHT_PERCENT, 100)
})

test('DEFAULT_SETTINGS 三项默认值与设计一致', () => {
  const source = read('src/client/settings.ts')
  assert.match(source, /groupHeightCustom:\s*false/)
  assert.match(source, /groupHeightPercent:\s*DEFAULT_GROUP_HEIGHT_PERCENT/)
  assert.match(source, /groupHeightHistory:\s*false/)
})

test('read() 对 groupHeightPercent 不能用 ?? 回退（会吃掉用户清空的 null）', () => {
  const source = read('src/client/settings.ts')
  // 必须存在 `=== undefined` 的三分支判断
  assert.match(source, /groupHeightPercent\s*===\s*undefined/)
  // 且该字段不得出现在 `?? DEFAULT_SETTINGS` 形式里
  assert.doesNotMatch(source, /groupHeightPercent:\s*value\?\.groupHeightPercent\s*\?\?/)
})

// ── groupHeight 纯函数 ──────────────────────────────────────────────────

/** 一份「所有条件都满足」的基线，每个用例只改自己关心的那一个字段。 */
const base = {
  groupAutoExpand: true,
  capped: true,
  isCurrent: true,
  custom: true,
  history: false,
  percent: 100,
}

test('操作组自动展开关闭时整体不生效（Spec 6.5 第 0 条）', () => {
  assert.equal(groupHeight({ ...base, groupAutoExpand: false, percent: 150 }), null)
})

test('capped 为假时不干预（官方 detailed 模式）', () => {
  assert.equal(groupHeight({ ...base, capped: false, percent: 150 }), null)
})

test('高度开关关闭时不干预', () => {
  assert.equal(groupHeight({ ...base, custom: false }), null)
})

test('历史组且未开启历史应用时不干预', () => {
  assert.equal(groupHeight({ ...base, isCurrent: false }), null)
})

test('历史组且开启历史应用时生效', () => {
  assert.deepEqual(groupHeight({ ...base, isCurrent: false, history: true }),
    { maxHeight: 'min(400px, 50vh)' })
})

test('100% 等于官方原公式，逐像素相同', () => {
  assert.deepEqual(groupHeight(base), { maxHeight: 'min(400px, 50vh)' })
})

test('50% 等比缩放', () => {
  assert.deepEqual(groupHeight({ ...base, percent: 50 }), { maxHeight: 'min(200px, 25vh)' })
})

test('200% 可以超过官方上限', () => {
  assert.deepEqual(groupHeight({ ...base, percent: 200 }), { maxHeight: 'min(800px, 100vh)' })
})

test('percent 为 null 时无上限，且必须同时给 overflow-y', () => {
  assert.deepEqual(groupHeight({ ...base, percent: null }),
    { maxHeight: 'none', overflowY: 'visible' })
})

test('percent 为 0 是普通值，不是无上限', () => {
  assert.deepEqual(groupHeight({ ...base, percent: 0 }), { maxHeight: 'min(0px, 0vh)' })
})

test('判断顺序：groupAutoExpand 优先于一切', () => {
  // 即便其它条件全都满足，第 0 条也先命中
  assert.equal(groupHeight({ ...base, groupAutoExpand: false, percent: null }), null)
})
