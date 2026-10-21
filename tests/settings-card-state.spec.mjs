/**
 * 设置卡片联动状态的测试。
 *
 * 覆盖的是"哪个开关该变灰"这条规则。它看起来简单，但错法都很隐蔽：
 *  - 该灰没灰 → 用户拨弄一个永远不生效的开关，以为插件坏了；
 *  - 灰了却把值改成 false → 用户重新打开大段，之前的选择被悄悄丢弃；
 *  - 连大段开关一起灰 → 两个都动不了，彻底锁死设置页。
 *
 * 第三条尤其要防：大段开关是这组设置里唯一能独立决策的一层。
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { deriveSettingsCardState } from '../src/client/settings-card-state.ts'

/** 构造一组开关值。 */
function values(groupAutoExpand, reasoningAutoExpand) {
  return { groupAutoExpand, reasoningAutoExpand }
}

test('两个都开：两行都可操作，描述是常规文案', () => {
  const state = deriveSettingsCardState(values(true, true))
  assert.deepEqual(state.workGroup, { checked: true, locked: false, gatedText: false })
  assert.deepEqual(state.reasoning, { checked: true, locked: false, gatedText: false })
})

test('大段开、思考关：思考行仍可操作（不是被锁，只是关着）', () => {
  const state = deriveSettingsCardState(values(true, false))
  assert.equal(state.reasoning.checked, false)
  assert.equal(state.reasoning.locked, false, '"关着"与"被锁"是两件事')
  assert.equal(state.reasoning.gatedText, false)
})

test('大段关：思考行被锁且换文案', () => {
  const state = deriveSettingsCardState(values(false, true))
  assert.equal(state.reasoning.locked, true)
  assert.equal(state.reasoning.gatedText, true, '锁住时必须换成"由谁控制"的说明')
})

test('锁住时保留 checked 原值，不强制 false', () => {
  // 用户原本开着思考，然后关掉大段：思考开关应该灰着但**仍显示为开**。
  const state = deriveSettingsCardState(values(false, true))
  assert.equal(state.reasoning.checked, true,
    '强制成 false 会让用户重新打开大段后发现选择被丢了')
})

test('大段开关永不被锁', () => {
  for (const group of [true, false]) {
    for (const reasoning of [true, false]) {
      const state = deriveSettingsCardState(values(group, reasoning))
      assert.equal(state.workGroup.locked, false, '大段开关是唯一能独立决策的一层，不能锁')
      assert.equal(state.workGroup.gatedText, false)
      assert.equal(state.workGroup.checked, group, '工作大段的显示值必须等于实际值')
    }
  }
})

test('四种组合的完整矩阵', () => {
  const cases = [
    [true, true, false, false],
    [true, false, false, false],
    [false, true, true, true],
    [false, false, true, true],
  ]
  for (const [group, reasoning, expectedLocked, expectedGated] of cases) {
    const state = deriveSettingsCardState(values(group, reasoning))
    assert.equal(state.reasoning.locked, expectedLocked, `group=${group} 时锁状态错误`)
    assert.equal(state.reasoning.gatedText, expectedGated, `group=${group} 时文案状态错误`)
    // 无论哪种组合，大段值都原样透出。
    assert.equal(state.workGroup.checked, group)
    // 无论哪种组合，思考值都原样透出（即使被锁）。
    assert.equal(state.reasoning.checked, reasoning)
  }
})
