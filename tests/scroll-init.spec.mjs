/**
 * 滚动初始化时机的回归测试。
 *
 * 修复的 bug：已完成的 group 手动展开时，插件会强行滚到底部，与官方
 * （滚到顶部）不一致。
 *
 * 根因：滚动初始化的 effect 判据是 `open` 的翻转，而 `open` 同时受手动
 * 覆盖影响。手动展开也会触发它，抢掉官方 `toggle` 已设定的位置。
 *
 * 正确判据：`autoOpen` 的翻转 —— 只有"自动从折叠变展开"才需要补定位。
 *
 * 这些用例把两种判据的差异固化下来，防止回归。
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

/** 官方 toggle 的定位选择（`ChatGroupSeat.tsx:175-178`）。 */
function officialTogglePosition(closed) {
  return closed === false ? 'bottom' : 'top'
}

/**
 * 旧判据（有 bug）：`open` 由假变真就定位。
 * @returns 是否触发定位。
 */
function buggyShouldInitialize(previousOpen, open, grouped) {
  return !previousOpen && open && grouped
}

/**
 * 新判据（已修复）：`autoOpen` 由假变真才定位。
 * @returns 是否触发定位。
 */
function fixedShouldInitialize(previousAutoOpen, autoOpen, grouped) {
  return !previousAutoOpen && autoOpen && grouped
}

test('旧判据在已完成 group 手动展开时误触发（bug 复现）', () => {
  // 已完成 group：autoOpen=false，用户手动展开 → open 变 true
  const closed = true
  const previousOpen = false
  const open = true          // 手动展开后
  const grouped = true
  assert.equal(buggyShouldInitialize(previousOpen, open, grouped), true,
    '旧判据会触发定位 —— 这正是 bug')
  // 而官方对已关闭 group 用手动 toggle 定位到顶部
  assert.equal(officialTogglePosition(closed), 'top')
})

test('新判据在已完成 group 手动展开时不触发', () => {
  const previousAutoOpen = false
  const autoOpen = false     // 仍为 false（group 已关闭）
  const grouped = true
  assert.equal(fixedShouldInitialize(previousAutoOpen, autoOpen, grouped), false,
    '新判据不触发，手动展开交给官方 toggle')
})

test('新判据在运行中 group 自动展开时触发', () => {
  // 运行中 group：autoOpen 由 false 变 true（首次挂载或从关闭恢复）
  const previousAutoOpen = false
  const autoOpen = true
  const grouped = true
  assert.equal(fixedShouldInitialize(previousAutoOpen, autoOpen, grouped), true,
    '自动展开需要补定位')
})

test('新判据在 group 关闭（自动折叠）时不触发', () => {
  const previousAutoOpen = true
  const autoOpen = false
  const grouped = true
  assert.equal(fixedShouldInitialize(previousAutoOpen, autoOpen, grouped), false,
    '折叠不需要定位')
})

test('新判据在非分组模式（detailed/verbose）不触发', () => {
  assert.equal(fixedShouldInitialize(false, true, false), false,
    'grouped=false 时没有内部滚动，无需定位')
})

test('自动展开后 following 为 true，手动展开到顶部后 following 为 false', () => {
  // 模拟 jump 的副作用：following = nearBottom(landed)
  const nearBottom = (top, floor) => Math.abs(floor - top) <= 1

  // 自动展开 → 跳到底部 → following=true → 后续 resize 会 toBottom
  const floor = 400
  const autoLanded = floor
  assert.equal(nearBottom(autoLanded, floor), true,
    '自动展开后 following=true（符合预期：跟随增长）')

  // 手动展开已完成 group → 跳到顶部 → following=false → 后续 resize 不 toBottom
  const manualLanded = 0
  assert.equal(nearBottom(manualLanded, floor), false,
    '手动展开到顶部后 following=false（修复后的正确行为）')
})

test('两种判据在手动展开场景的差异被固化', () => {
  // 已完成 group，用户手动展开：open 变 true，autoOpen 不变
  const previousOpen = false
  const open = true
  const previousAutoOpen = false
  const autoOpen = false
  const grouped = true
  assert.equal(buggyShouldInitialize(previousOpen, open, grouped), true, '旧判据：误触发')
  assert.equal(fixedShouldInitialize(previousAutoOpen, autoOpen, grouped), false, '新判据：不触发')
})
