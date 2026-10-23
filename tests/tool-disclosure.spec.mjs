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
import { toolAutoOpen, toolRowAutoOpen } from '../src/client/tool/tool-auto-open.ts'

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

// ── toolRowAutoOpen：把三合取与收起时机合成的完整判据 ──────────────────

/**
 * 构造 toolRowAutoOpen 的输入。
 *
 * 默认值取「当前轮、只有一行、已开始、未完成、最新」——即最普通的运行中工具行。
 * @param {object} over - 要覆盖的字段。
 * @returns {object} 判据输入。
 */
function rowInput(over = {}) {
  return {
    timing: 'group',
    done: false,
    started: true,
    step: 5,
    anchorSeq: 10,
    latestStep: 5,
    latestStartedAnchorSeq: 10,
    toolAutoExpand: true,
    groupOpen: true,
    groupAuto: true,
    ...over,
  }
}

test('toolRowAutoOpen：enabled 三合取仍然生效', () => {
  // 任一条件为假 → 不自动展开，与 toolAutoOpen 单独测的三合取保持一致。
  assert.equal(toolRowAutoOpen(rowInput()), true, '三条件全真 → 展开（timing=group 恒真）')
  assert.equal(toolRowAutoOpen(rowInput({ toolAutoExpand: false })), false)
  assert.equal(toolRowAutoOpen(rowInput({ groupOpen: false })), false)
  assert.equal(toolRowAutoOpen(rowInput({ groupAuto: false })), false)
})

test('toolRowAutoOpen：跟随四个收起时机', () => {
  // ① self：做完就收
  assert.equal(toolRowAutoOpen(rowInput({ timing: 'self', done: false })), true, 'self 未完成 → 展开')
  assert.equal(toolRowAutoOpen(rowInput({ timing: 'self', done: true })), false, 'self 已完成 → 收起')

  // ② next-call：只留最新一条已开始的操作
  assert.equal(toolRowAutoOpen(rowInput({ timing: 'next-call' })), true, '自己是最新 → 展开')
  assert.equal(toolRowAutoOpen(rowInput({ timing: 'next-call', latestStartedAnchorSeq: 11 })), false,
    '有更新的操作 → 收起')

  // ③ next-node：整批一起留到下一批
  assert.equal(toolRowAutoOpen(rowInput({ timing: 'next-node' })), true, '自己是本批 → 展开')
  assert.equal(toolRowAutoOpen(rowInput({ timing: 'next-node', latestStep: 6 })), false,
    '下一批已出现 → 收起')

  // ④ group：留到操作组收起
  assert.equal(toolRowAutoOpen(rowInput({ timing: 'group', done: true, latestStep: 9 })), true,
    'group 恒保持展开')
})

test('toolRowAutoOpen：未开始的行在 next-call 下不展开', () => {
  // preparing 阶段的工具不该算作「最新一条已开始的操作」。
  assert.equal(toolRowAutoOpen(rowInput({ timing: 'next-call', started: false })), false)
})

test('toolRowAutoOpen：这条判据同时决定「行是否展开」与「按钮是否隐藏」', () => {
  // 两个调用点（use-tool-disclosure 与 AutoToolCallTree）必须用同一个函数，
  // 否则会出现「行还亮着、按钮却已交回官方」这种不一致。
  // 这里用一组典型取值断言结果，作为该契约的锚点。
  const running = rowInput({ timing: 'next-node' })
  assert.equal(toolRowAutoOpen(running), true, '运行中 → 行展开（因而按钮隐藏）')
  const folded = rowInput({ timing: 'next-node', latestStep: 6 })
  assert.equal(toolRowAutoOpen(folded), false, '已收起 → 行折叠（因而按钮交回官方）')
})