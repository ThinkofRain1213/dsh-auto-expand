/**
 * 工具行自动展开判据的单元测试。
 *
 * 判据是三个条件的合取（`src/client/tool/tool-auto-open.ts`）。其中
 * `groupAuto` 是最容易漏掉的一个——它保证「用户手动展开历史大段」时
 * 里面的工具行**不会被自动弹出**，即 `CAPABILITY_MATRIX.md` 的 E1。
 *
 * 与 `tests/auto-disclosure.spec.mjs` 不同，本文件走**真实 import**：
 * 判据是纯函数、不需要 React dispatcher，因此没有内联副本，不会与源码脱节。
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { toolAutoOpen } from '../src/client/tool/tool-auto-open.ts'

/**
 * 构造一次判据输入。
 * @param {boolean} toolAutoExpand - 用户开关。
 * @param {boolean} groupOpen - 本组 body 是否展开。
 * @param {boolean} groupAuto - 本组是否处于当前轮的自动展开窗口。
 * @returns {object} 判据输入。
 */
function input(toolAutoExpand, groupOpen, groupAuto) {
  return { toolAutoExpand, groupOpen, groupAuto }
}

test('当前轮：开关开启且本组展开 → 自动展开', () => {
  assert.equal(toolAutoOpen(input(true, true, true)), true)
})

test('开关关闭 → 不展开（回到官方恒折叠）', () => {
  assert.equal(toolAutoOpen(input(false, true, true)), false)
})

test('本组已收起 → 不展开（跟着 group 走）', () => {
  assert.equal(toolAutoOpen(input(true, false, true)), false)
})

test('E1：用户手动展开历史大段 → 工具行保持折叠', () => {
  // 历史 group 被手动展开时 open 为真，但它不在当前轮的自动展开窗口内。
  // 若判据漏掉 `groupAuto`，这里会错误地返回 true，历史轮次就被污染了。
  assert.equal(toolAutoOpen(input(true, true, false)), false)
})

test('当前轮手动收起大段 → 工具行一并收起', () => {
  assert.equal(toolAutoOpen(input(true, false, true)), false)
})

test('历史大段未展开 → 不展开', () => {
  assert.equal(toolAutoOpen(input(true, false, false)), false)
})

test('关闭大段开关后再关工具开关：两者都关时不展开', () => {
  assert.equal(toolAutoOpen(input(false, false, false)), false)
})

test('全部 8 种组合都等同三条件合取', () => {
  for (const toolAutoExpand of [false, true]) {
    for (const groupOpen of [false, true]) {
      for (const groupAuto of [false, true]) {
        assert.equal(
          toolAutoOpen(input(toolAutoExpand, groupOpen, groupAuto)),
          toolAutoExpand && groupOpen && groupAuto,
          `组合 ${toolAutoExpand}/${groupOpen}/${groupAuto} 不符`,
        )
      }
    }
  }
})

test('只有一个组合会展开：三条件全真', () => {
  const opens = []
  for (const toolAutoExpand of [false, true]) {
    for (const groupOpen of [false, true]) {
      for (const groupAuto of [false, true]) {
        if (toolAutoOpen(input(toolAutoExpand, groupOpen, groupAuto))) {
          opens.push([toolAutoExpand, groupOpen, groupAuto])
        }
      }
    }
  }
  assert.deepEqual(opens, [[true, true, true]])
})