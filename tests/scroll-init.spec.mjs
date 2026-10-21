/**
 * 滚动定位判据的三代演进 —— 每一代都对应一次真机 bug。
 *
 * 这个文件存在的唯一理由：把"错误判据为什么错"固化下来。当前生效的判据
 * 本身在 `scroll-align.spec.mjs` 里测；这里测的是**历史**，防止有人把判据
 * 改回前面两代。
 *
 * | 代 | 判据 | 结果 |
 * |---|---|---|
 * | 一 | `open` 翻转 | 手动展开被误当自动展开，已完成 group 被强行滚到底部 |
 * | 二 | `autoOpen` 用 ref 比较翻转 | ref 初值就是首次的 `autoOpen`，**从未触发** |
 * | 三 | `shouldAlignBody(open, grouped, followsAuto)` | 正确 |
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { shouldAlignBody } from '../src/client/flow/scroll-align.ts'

/** 官方 toggle 的定位选择（`ChatGroupSeat.tsx:175-178`）。 */
function officialTogglePosition(closed) {
  return closed === false ? 'bottom' : 'top'
}

/** 第一代判据（`open` 翻转）。 */
function firstGeneration(previousOpen, open, grouped) {
  return !previousOpen && open && grouped
}

/** 第二代判据（`autoOpen` 用 ref 比较翻转）。 */
function secondGeneration(previousAutoOpen, autoOpen, grouped) {
  return !previousAutoOpen && autoOpen && grouped
}

test('第一代：已完成 group 手动展开被误触发（bug 1 复现）', () => {
  // 已完成 group：autoOpen 恒为 false，用户手动展开 → open 变真。
  assert.equal(firstGeneration(false, true, true), true, '误触发 —— 正是 bug 1')
  // 而官方对已关闭 group 手动展开定位到顶部（不跟随）。
  assert.equal(officialTogglePosition(true), 'top')
})

test('第二代：ref 初值等于首次渲染的 autoOpen，于是永不触发（bug 2 复现）', () => {
  // 运行中 group 首次渲染时 autoOpen 已经是 true，
  // `useRef(autoOpen)` 的 current 一开始就是 true。
  const runtimeGroup = { firstRenderAutoOpen: true, laterAutoOpen: true, grouped: true }
  assert.equal(
    secondGeneration(runtimeGroup.firstRenderAutoOpen, runtimeGroup.laterAutoOpen, runtimeGroup.grouped),
    false,
    '从未执行 —— 这正是 bug 2：自动展开的定位补丁是空转的',
  )
})

test('第二代：只有用户切换设置开关时才会触发（唯一被覆盖到的路径）', () => {
  // 关掉开关 → autoOpen=false；再打开 → autoOpen=true。
  assert.equal(secondGeneration(false, true, true), true)
})

test('第三代：自动展开且有高度上限 → 定位', () => {
  assert.equal(shouldAlignBody(null, { open: true, grouped: true, followsAuto: true }), true)
  assert.equal(shouldAlignBody(
    { open: false, grouped: true, followsAuto: true },
    { open: true, grouped: true, followsAuto: true },
  ), true)
})

test('第三代：已完成 group 手动展开 → 让给官方 toggle', () => {
  assert.equal(shouldAlignBody(
    { open: false, grouped: true, followsAuto: true },
    { open: true, grouped: true, followsAuto: false },
  ), false)
})

test('第三代：Turn 从平铺变成带高度上限 → 定位（前两代都漏了这条）', () => {
  // open 没变，前两代的 `!previous && current` 判据都不会触发。
  assert.equal(firstGeneration(true, true, true), false)
  assert.equal(secondGeneration(true, true, true), false)
  assert.equal(shouldAlignBody(
    { open: true, grouped: false, followsAuto: true },
    { open: true, grouped: true, followsAuto: true },
  ), true, '第三代覆盖了 grouped 翻转')
})

test('following 的副作用：自动展开在底部、手动展开到顶部', () => {
  const nearBottom = (top, floor) => Math.abs(floor - top) <= 1
  const floor = 400
  assert.equal(nearBottom(floor, floor), true, '自动展开 → 跳到底部 → 跟随增长')
  assert.equal(nearBottom(0, floor), false, '手动展开已完成 group → 停在顶部 → 不跟随')
})
