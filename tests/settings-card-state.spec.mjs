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

/**
 * 构造一组开关值。
 * @param {boolean} groupAutoExpand - 大段开关。
 * @param {boolean} reasoningAutoExpand - 思考行开关。
 * @param {boolean} toolAutoExpand - 工具行开关；默认与思考行同开。
 * @returns {object} 三个开关的值。
 */
function values(groupAutoExpand, reasoningAutoExpand, toolAutoExpand = true) {
  return { groupAutoExpand, reasoningAutoExpand, toolAutoExpand }
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

// ── 工具行（P7）：与思考行共享「大段关闭即被锁」这条规则 ──────────────────

test('三个都开：工具行也可操作，描述是常规文案', () => {
  const state = deriveSettingsCardState(values(true, true, true))
  assert.deepEqual(state.tool, { checked: true, locked: false, gatedText: false })
})

test('大段关：工具行被锁且换文案，但保留 checked 原值', () => {
  const state = deriveSettingsCardState(values(false, true, true))
  assert.equal(state.tool.locked, true)
  assert.equal(state.tool.gatedText, true, '锁住时必须换成"由谁控制"的说明')
  assert.equal(state.tool.checked, true,
    '强制成 false 会让用户重新打开大段后发现选择被丢了')
})

test('大段开、工具关：工具行仍可操作（"关着"与"被锁"是两件事）', () => {
  const state = deriveSettingsCardState(values(true, true, false))
  assert.equal(state.tool.checked, false)
  assert.equal(state.tool.locked, false)
  assert.equal(state.tool.gatedText, false)
})

test('思考行与工具行的锁状态始终一致（两者都渲染在 group body 内部）', () => {
  for (const group of [true, false]) {
    for (const reasoning of [true, false]) {
      for (const tool of [true, false]) {
        const state = deriveSettingsCardState(values(group, reasoning, tool))
        assert.equal(state.tool.locked, state.reasoning.locked,
          `group=${group} 时两行锁状态不一致`)
        assert.equal(state.tool.gatedText, state.reasoning.gatedText)
        // 两行各自的值都原样透出（即使被锁）。
        assert.equal(state.reasoning.checked, reasoning)
        assert.equal(state.tool.checked, tool)
      }
    }
  }
})

// ── 时机行（P8）：比开关行多一层门控 ────────────────────────────────────

test('时机行：三行都开时未锁', () => {
  const state = deriveSettingsCardState(values(true, true, true))
  assert.equal(state.reasoningTiming.gate, 'none')
  assert.equal(state.reasoningTiming.locked, false)
  assert.equal(state.toolTiming.gate, 'none')
  assert.equal(state.toolTiming.locked, false)
})

test('时机行：操作组关闭时被操作组锁', () => {
  const state = deriveSettingsCardState(values(false, true, true))
  assert.equal(state.reasoningTiming.gate, 'workGroup')
  assert.equal(state.reasoningTiming.locked, true)
  assert.equal(state.toolTiming.gate, 'workGroup')
  assert.equal(state.toolTiming.locked, true)
})

test('时机行：本层开关关闭时被自己锁，且不影响另一层', () => {
  const state = deriveSettingsCardState(values(true, false, true))
  assert.equal(state.reasoningTiming.gate, 'own', '没有自动展开就没有收起时机')
  assert.equal(state.reasoningTiming.locked, true)
  assert.equal(state.toolTiming.gate, 'none', '工具层不受思考开关影响')
})

test('时机行：操作组与本层同时关闭时，优先报告操作组', () => {
  // 描述里应该点名最近的那一层控制者；操作组在更上层，先讲它。
  const state = deriveSettingsCardState(values(false, false, false))
  assert.equal(state.reasoningTiming.gate, 'workGroup')
  assert.equal(state.toolTiming.gate, 'workGroup')
})

test('时机行门控的全组合矩阵', () => {
  for (const group of [true, false]) {
    for (const own of [true, false]) {
      const state = deriveSettingsCardState(values(group, own, true))
      const expectedGate = !group ? 'workGroup' : own ? 'none' : 'own'
      assert.equal(state.reasoningTiming.gate, expectedGate,
        `group=${group} own=${own} 时思考时机行的锁定原因错误`)
      assert.equal(state.reasoningTiming.locked, expectedGate !== 'none')
    }
  }
})

// ── P9：隐藏查看按钮行 ──────────────────────────────────────────────────

test('隐藏范围：永不锁死（独立设置）', () => {
  // 用户明确要求这一行完全独立，不被操作组/思考/工具任何开关锁死。
  for (const group of [true, false]) {
    for (const reasoning of [true, false]) {
      for (const tool of [true, false]) {
        const state = deriveSettingsCardState(values(group, reasoning, tool))
        assert.equal(state.inspectScope.locked, false,
          `group=${group} reasoning=${reasoning} tool=${tool} 时该行不应被锁`)
        assert.equal(state.inspectScope.gate, 'none')
      }
    }
  }
})

test('隐藏范围：「运行中」档会因自动展开关闭而失效（idle）', () => {
  // 不锁死 ≠ 有效：选「运行中隐藏」时，若自动展开本身关了，
  // 就没有「运行中」可言，该档实际等同于「不隐藏」。说明文案要点名原因。
  assert.equal(deriveSettingsCardState(values(true, true, true)).inspectScopeIdle, 'none')
  assert.equal(deriveSettingsCardState(values(false, true, true)).inspectScopeIdle, 'workGroup',
    '操作组不自动展开 → 没有运行中')
  assert.equal(deriveSettingsCardState(values(true, true, false)).inspectScopeIdle, 'own',
    '工具行不自动展开 → 没有运行中')
  assert.equal(deriveSettingsCardState(values(false, true, false)).inspectScopeIdle, 'workGroup',
    '两者都关时优先报操作组（更上层）')
})

test('隐藏范围：思考开关不影响 idle', () => {
  assert.equal(deriveSettingsCardState(values(true, false, true)).inspectScopeIdle, 'none',
    '思考开关与工具的运行状态无关')
})
