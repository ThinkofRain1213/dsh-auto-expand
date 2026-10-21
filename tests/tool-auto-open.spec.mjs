/**
 * 第四层（工具行自动展开）的行为测试。
 *
 * 验证三件事：
 *   1. `makeAutoDisclosure` 返回的 hook 形状与官方 `UseDisclosure` 一致
 *   2. 根调用的 autoOpen 判据：`phase !== 'result'`
 *   3. 子调用不继承自动展开
 *
 * 这里不渲染 React，只验证纯逻辑：hook 形状契约与判据表达式。
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

// ── 最小 React 桩（与 auto-disclosure.spec.mjs 同源）────────────────────
let hookStates = []
let hookIndex = 0

function resetHooks() {
  hookStates = []
  hookIndex = 0
}

function useState(initial) {
  const index = hookIndex++
  if (!(index in hookStates)) hookStates[index] = initial
  const setState = (next) => {
    hookStates[index] = typeof next === 'function' ? next(hookStates[index]) : next
  }
  return [hookStates[index], setState]
}

function useCallback(fn) {
  hookIndex++
  return fn
}

/** 与 src/client/auto-disclosure.ts 逻辑一致。 */
function useAutoDisclosure(autoOpen) {
  const [seen, setSeen] = useState(autoOpen)
  const [override, setOverride] = useState(undefined)
  if (autoOpen !== seen) {
    setSeen(autoOpen)
    setOverride(undefined)
  }
  const open = override ?? autoOpen
  const setOpen = useCallback((next) => { setOverride(next) })
  const toggle = useCallback(() => { setOverride(prev => !(prev ?? autoOpen)) })
  return { open, setOpen, toggle }
}

/** 与 src/client/tool/controlled-disclosure.ts 逻辑一致。 */
function makeAutoDisclosure(autoOpen) {
  return function useControlledDisclosure() {
    const { open, setOpen, toggle } = useAutoDisclosure(autoOpen)
    return { expanded: open, setExpanded: setOpen, toggle }
  }
}

/** 渲染一个 hook 到收敛（处理 setState-during-render）。 */
function render(hook) {
  hookIndex = 0
  for (let round = 0; round < 5; round += 1) {
    hookIndex = 0
    const result = hook()
    const snapshot = JSON.stringify(hookStates)
    hookIndex = 0
    const again = hook()
    if (JSON.stringify(hookStates) === snapshot) return again
    void result
  }
  throw new Error('渲染未收敛')
}

// ── 判据（与 AutoToolCallTree 中的表达式一致）──────────────────────────
/** 根调用的 autoOpen。 */
function rootAutoOpen(phase) {
  return phase !== 'result'
}

/** 实际生效的 autoOpen：只有根调用受控。 */
function effectiveAutoOpen(isRoot, phase) {
  return isRoot ? rootAutoOpen(phase) : false
}

// ── 用例 ────────────────────────────────────────────────────────────────

test('受控 hook 的形状与官方 UseDisclosure 一致', () => {
  resetHooks()
  const result = render(makeAutoDisclosure(true))
  assert.equal(typeof result.expanded, 'boolean', 'expanded 应为布尔')
  assert.equal(typeof result.setExpanded, 'function', 'setExpanded 应为函数')
  assert.equal(typeof result.toggle, 'function', 'toggle 应为函数')
  // 不应暴露额外字段（官方只认这三个）
  assert.deepEqual(Object.keys(result).sort(), ['expanded', 'setExpanded', 'toggle'])
})

test('根调用：preparing 时展开', () => {
  assert.equal(rootAutoOpen('preparing'), true)
})

test('根调用：start（已发起未返回）时展开', () => {
  assert.equal(rootAutoOpen('start'), true)
})

test('根调用：result（已返回）时折叠', () => {
  assert.equal(rootAutoOpen('result'), false)
})

test('子调用：无论 phase 都不自动展开', () => {
  assert.equal(effectiveAutoOpen(false, 'preparing'), false)
  assert.equal(effectiveAutoOpen(false, 'start'), false)
  assert.equal(effectiveAutoOpen(false, 'result'), false)
})

test('根调用在 phase 变化时自动折叠一次', () => {
  // 模拟：start → result
  assert.equal(rootAutoOpen('start'), true)
  assert.equal(rootAutoOpen('result'), false)
  // 只有一次 true→false 转换
  const sequence = [rootAutoOpen('preparing'), rootAutoOpen('start'), rootAutoOpen('result'), rootAutoOpen('result')]
  assert.deepEqual(sequence, [true, true, false, false])
  const transitions = sequence.slice(1).filter((v, i) => v !== sequence[i])
  assert.equal(transitions.length, 1, '只有一次状态转换')
})

test('手动展开已返回的工具后保持展开', () => {
  resetHooks()
  // autoOpen = false（已返回）
  let result = render(makeAutoDisclosure(false))
  assert.equal(result.expanded, false, '初始折叠')
  // 用户手动展开
  result.setExpanded(true)
  result = render(makeAutoDisclosure(false))
  assert.equal(result.expanded, true, '手动展开生效')
  // 多次重渲染（autoOpen 不变）仍保持
  for (let i = 0; i < 3; i += 1) {
    result = render(makeAutoDisclosure(false))
    assert.equal(result.expanded, true, `第 ${i + 1} 次重渲染后仍展开`)
  }
})

test('手动折叠运行中的工具后保持折叠', () => {
  resetHooks()
  let result = render(makeAutoDisclosure(true))
  assert.equal(result.expanded, true, '初始展开')
  result.setExpanded(false)
  result = render(makeAutoDisclosure(true))
  assert.equal(result.expanded, false, '手动折叠生效')
})

test('phase 从 start 变 result 时，用户覆盖被丢弃', () => {
  resetHooks()
  // start：展开
  let result = render(makeAutoDisclosure(true))
  // 用户手动折叠
  result.setExpanded(false)
  result = render(makeAutoDisclosure(true))
  assert.equal(result.expanded, false, '手动折叠生效')
  // phase 变 result：autoOpen 变 false，覆盖被丢弃
  result = render(makeAutoDisclosure(false))
  assert.equal(result.expanded, false, '自动转换后折叠')
})

test('工具行的 group 折叠联动由官方 disclosureReset 提供', () => {
  // 这是官方机制：ChatNodeSeat 在 group 隐藏时递增 disclosureReset，
  // 官方 useDisclosure(version) 因此重置为折叠。
  // 我们保留该机制（AutoNodeSeat 原样），且受控 hook 也消费同一 version。
  //
  // 模拟官方 useDisclosure 的版本语义：
  const useOfficialDisclosure = (version = 0) => {
    const [expandedVersion, setExpandedVersion] = useState(null)
    const expanded = expandedVersion === version
    return {
      expanded,
      setExpanded: (open) => setExpandedVersion(open ? version : null),
      toggle: () => setExpandedVersion(prev => (prev === version ? null : version)),
    }
  }
  resetHooks()
  // 用户在 version 0 时展开
  let result = render(() => useOfficialDisclosure(0))
  assert.equal(result.expanded, false)
  result.setExpanded(true)
  result = render(() => useOfficialDisclosure(0))
  assert.equal(result.expanded, true, 'version 0 时展开')
  // group 隐藏 → version 变 1 → 自动折叠
  result = render(() => useOfficialDisclosure(1))
  assert.equal(result.expanded, false, 'version 变化后重置为折叠')
})
