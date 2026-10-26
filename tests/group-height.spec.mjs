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
