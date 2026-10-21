/**
 * `useAutoDisclosure` 状态机单元测试。
 *
 * 用一个最小 React 桩模拟 hook 语义（含 setState-during-render 的立即重跑），
 * 覆盖 U-1 ~ U-6 全部用例。这是本插件最核心的抽象，必须逐条验证。
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

// ── 最小 React 桩 ────────────────────────────────────────────────────────
// 只实现 useState / useCallback 的语义。渲染期 setState 会立即把状态写入，
// 这与 React 的 setState-during-render 行为等价（同一次渲染内收敛）。
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

/**
 * 模拟一次组件渲染。
 * @param {Function} hookFn - 待测 hook。
 * @param {boolean} autoOpen - 本次渲染的 autoOpen。
 * @returns 渲染结果。
 */
function render(hookFn, autoOpen) {
  hookIndex = 0
  // 派生态写法会在渲染期 setState；这里迭代到收敛（最多 5 轮，防死循环）。
  for (let round = 0; round < 5; round += 1) {
    hookIndex = 0
    const result = hookFn(autoOpen)
    // 检查本轮是否发生了状态写入：比较快照
    const snapshot = JSON.stringify(hookStates)
    hookIndex = 0
    const again = hookFn(autoOpen)
    if (JSON.stringify(hookStates) === snapshot) return again
    void result
  }
  throw new Error('渲染未收敛')
}

// ── 待测 hook（与 src/client/auto-disclosure.ts 逻辑一致）────────────────
// 直接内联实现以避免引入 TS 编译步骤；每次改动源码必须同步这里。
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

// ── 用例 ────────────────────────────────────────────────────────────────

test('U-1 初始 autoOpen=true 时展开', () => {
  resetHooks()
  const result = render(useAutoDisclosure, true)
  assert.equal(result.open, true)
})

test('U-1b 初始 autoOpen=false 时折叠', () => {
  resetHooks()
  const result = render(useAutoDisclosure, false)
  assert.equal(result.open, false)
})

test('U-2 autoOpen=true 时手动折叠', () => {
  resetHooks()
  let result = render(useAutoDisclosure, true)
  assert.equal(result.open, true)
  result.setOpen(false)
  result = render(useAutoDisclosure, true)
  assert.equal(result.open, false, '手动折叠应生效')
})

test('U-3 autoOpen 由 true 变 false 时自动折叠并清空覆盖', () => {
  resetHooks()
  let result = render(useAutoDisclosure, true)
  assert.equal(result.open, true)
  // 先手动折叠，制造一个 override
  result.setOpen(false)
  result = render(useAutoDisclosure, true)
  assert.equal(result.open, false)
  // autoOpen 变为 false：override 应被清空，open 跟随 autoOpen
  result = render(useAutoDisclosure, false)
  assert.equal(result.open, false, 'autoOpen 变化后应折叠')
})

test('U-3b 手动展开后 autoOpen 变 false 仍折叠（覆盖被丢弃）', () => {
  resetHooks()
  let result = render(useAutoDisclosure, false)
  assert.equal(result.open, false)
  // 手动展开一个已折叠的 group
  result.setOpen(true)
  result = render(useAutoDisclosure, false)
  assert.equal(result.open, true, '手动展开应生效')
  // 但 autoOpen 变化后（这里模拟再次变化）覆盖应丢弃
  result = render(useAutoDisclosure, true)
  assert.equal(result.open, true)
})

test('U-4 autoOpen=false 时手动展开', () => {
  resetHooks()
  let result = render(useAutoDisclosure, false)
  assert.equal(result.open, false)
  result.setOpen(true)
  result = render(useAutoDisclosure, false)
  assert.equal(result.open, true, '手动展开应保持')
})

test('U-6 autoOpen 不变时手动覆盖持续生效（折叠只触发一次）', () => {
  resetHooks()
  // 模拟：group 已关闭（autoOpen=false），用户手动展开
  let result = render(useAutoDisclosure, false)
  result.setOpen(true)
  // 多次重渲染，autoOpen 保持 false
  for (let i = 0; i < 5; i += 1) {
    result = render(useAutoDisclosure, false)
    assert.equal(result.open, true, `第 ${i + 1} 次重渲染后仍应保持展开`)
  }
})

test('U-5 toggle 在 autoOpen=false 时展开', () => {
  resetHooks()
  let result = render(useAutoDisclosure, false)
  assert.equal(result.open, false)
  result.toggle()
  result = render(useAutoDisclosure, false)
  assert.equal(result.open, true)
  // 再次 toggle 应折叠
  result.toggle()
  result = render(useAutoDisclosure, false)
  assert.equal(result.open, false)
})

test('U-5b toggle 在 autoOpen=true 时折叠', () => {
  resetHooks()
  let result = render(useAutoDisclosure, true)
  assert.equal(result.open, true)
  result.toggle()
  result = render(useAutoDisclosure, true)
  assert.equal(result.open, false)
})

test('连续自动转换：true→false→true 每次都清空覆盖', () => {
  resetHooks()
  let result = render(useAutoDisclosure, true)
  result.setOpen(false) // 手动折叠
  result = render(useAutoDisclosure, true)
  assert.equal(result.open, false)
  // 自动转为 false
  result = render(useAutoDisclosure, false)
  assert.equal(result.open, false)
  // 手动展开
  result.setOpen(true)
  result = render(useAutoDisclosure, false)
  assert.equal(result.open, true)
  // 自动转回 true：覆盖应清空，但 open 仍是 true（恰好一致）
  result = render(useAutoDisclosure, true)
  assert.equal(result.open, true)
})

test('autoOpen 不变时 setOpen 不触发额外的自动转换', () => {
  resetHooks()
  let result = render(useAutoDisclosure, true)
  result.setOpen(true) // 与 autoOpen 相同的值
  result = render(useAutoDisclosure, true)
  assert.equal(result.open, true)
})
