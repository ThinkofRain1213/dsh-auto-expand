/**
 * body 自动定位判定的回归测试。
 *
 * 修复的 bug（真机反馈）：body 的自动滚动偶发失效，通常由大段思考触发。
 * 排查结论见 `spec/FIX-SCROLL.md` 与 `use-process-scroll.ts` 头部：
 *  - 跟随意图被浏览器滚动锚定造成的 `scrollTop` 位移误判关掉，且不自恢复；
 *  - 自动展开的定位补丁（`initialize`）判据用了 `autoOpen` 的 ref 比较，
 *    首次渲染 `autoOpen` 已为真，于是**从未执行过**。
 *
 * 本文件固化第二个问题的正确判据。
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { shouldAlignBody } from '../src/client/flow/scroll-align.ts'

/** 构造一次渲染状态。 */
function state(open, grouped, followsAuto) {
  return { open, grouped, followsAuto }
}

test('首次挂载：自动展开且有高度上限 → 需要定位', () => {
  assert.equal(shouldAlignBody(null, state(true, true, true)), true)
})

test('首次挂载：平铺模式（无 400px 上限）→ 不需要定位', () => {
  // `.expandedBody` 没有 max-height，body 不产生内部滚动。
  assert.equal(shouldAlignBody(null, state(true, false, true)), false)
})

test('首次挂载：折叠态 → 不需要定位', () => {
  assert.equal(shouldAlignBody(null, state(false, true, true)), false)
})

test('用户手动展开（未被覆盖判定为 false）→ 交给官方 toggle，不抢', () => {
  // 已完成的 group：用户点开 → open 变真，但 followsAuto 为假。
  // 官方对 closed 的 group 手动展开滚到**顶部**，这里若插手就会回归 P4 的 bug。
  assert.equal(shouldAlignBody(null, state(true, true, false)), false)
  assert.equal(shouldAlignBody(state(false, true, true), state(true, true, false)), false)
})

test('grouped 从假变真 → 需要定位（Turn 从平铺变成带高度上限）', () => {
  // 这是最容易漏的一条：open 没变，但 body 在这一刻才第一次出现内部滚动。
  assert.equal(shouldAlignBody(state(true, false, true), state(true, true, true)), true)
})

test('open 从假变真 → 需要定位', () => {
  assert.equal(shouldAlignBody(state(false, true, true), state(true, true, true)), true)
})

test('状态未变 → 不重复定位（否则会一直把读者拽回底部）', () => {
  assert.equal(shouldAlignBody(state(true, true, true), state(true, true, true)), false)
})

test('自动折叠（open 变假）→ 不定位', () => {
  assert.equal(shouldAlignBody(state(true, true, true), state(false, true, true)), false)
})

test('从平铺自动折叠 → 不定位', () => {
  assert.equal(shouldAlignBody(state(true, false, true), state(false, false, true)), false)
})
