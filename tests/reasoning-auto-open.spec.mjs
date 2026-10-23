/**
 * 第三层（思考自动展开）的行为测试。
 *
 * 走**真实 import**：判据是纯函数，不需要 React dispatcher。此前本文件内联了
 * 「`autoOpen = running && groupOpen`」的副本，与源码脱节后不会报错——统一时机
 * 后思考行改走 `autoOpenFor`，这里同步改为直接断言真实函数。
 *
 * 覆盖三件事：
 *   1. 思考行的四个时机（与工具共用同一套判据）；
 *   2. `enabled` 三合取（开关 && 组展开 && 当前轮自动展开窗口）；
 *   3. T-3：同一时刻只有最后一段思考是 running（由 `i === last` 保证）。
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { COLLAPSE_TIMINGS, autoOpenFor, isLatestAnchor, isLatestStep } from '../src/client/collapse-timing.ts'

/**
 * 计算思考行的自动展开状态（与 `AutoReasoningRow` 中的表达式一致）。
 *
 * 思考行的信号取法：
 * - `done` = `!running`（不再是流式尾部）
 * - 两个坐标来自所属 `assistant-step` 节点
 * @param {object} options - 时机、信号与开关。
 * @returns {boolean} 是否自动展开。
 */
function reasoningAutoOpen({ timing, running, step, anchorSeq, latestStep, latestAnchorSeq, enabled = true }) {
  return autoOpenFor({
    timing,
    done: !running,
    isLatestBatch: isLatestStep(step, latestStep),
    isLatestNode: isLatestAnchor(anchorSeq, latestAnchorSeq),
    enabled,
  })
}

test('思考流式中且组展开 → 四个时机都展开', () => {
  // 本条还没做完，所有时机都应展开（group 恒真、两个最新判据也成立）。
  for (const timing of COLLAPSE_TIMINGS) {
    assert.equal(reasoningAutoOpen({
      timing, running: true, step: 5, anchorSeq: 8, latestStep: 5, latestAnchorSeq: 8,
    }), true, `timing=${timing} 流式中应展开`)
  }
})

test("'self'：思考一结束就收（不等组、不等下一条）", () => {
  assert.equal(reasoningAutoOpen({
    timing: 'self', running: false, step: 5, anchorSeq: 8, latestStep: 5, latestAnchorSeq: 8,
  }), false)
})

test("'next-call'：思考结束但仍是本组最新操作 → 保持展开", () => {
  // 这是「操作级」与「本条完成时」的真实差别：做完不立刻收，等下一条操作。
  assert.equal(reasoningAutoOpen({
    timing: 'next-call', running: false, step: 5, anchorSeq: 8, latestStep: 5, latestAnchorSeq: 8,
  }), true)
})

test("'next-call'：下一批的工具一出现（anchorSeq 更大）→ 收起", () => {
  assert.equal(reasoningAutoOpen({
    timing: 'next-call', running: false, step: 5, anchorSeq: 8, latestStep: 6, latestAnchorSeq: 12,
  }), false)
})

test("'next-node'：思考结束但仍是本组最新一批 → 保持展开", () => {
  assert.equal(reasoningAutoOpen({
    timing: 'next-node', running: false, step: 5, anchorSeq: 8, latestStep: 5, latestAnchorSeq: 8,
  }), true)
})

test("'next-node'：下一批出现（step 更大）→ 收起", () => {
  assert.equal(reasoningAutoOpen({
    timing: 'next-node', running: false, step: 5, anchorSeq: 8, latestStep: 6, latestAnchorSeq: 8,
  }), false)
})

test("'group'：思考结束也保持展开，等操作组收起", () => {
  // 注意：组本身收起时 `enabled` 会变假，那是另一条通路（见下一个测试）。
  assert.equal(reasoningAutoOpen({
    timing: 'group', running: false, step: 5, anchorSeq: 8, latestStep: 6, latestAnchorSeq: 12,
  }), true)
})

test('enabled=false（开关关 / 组收起 / 历史组）→ 任何时机都不展开', () => {
  for (const timing of COLLAPSE_TIMINGS) {
    assert.equal(reasoningAutoOpen({
      timing, running: true, step: 5, anchorSeq: 8, latestStep: 5, latestAnchorSeq: 8, enabled: false,
    }), false, `timing=${timing} enabled=false 不应展开`)
  }
})

test('E1：历史组被手动展开 → 思考行保持折叠', () => {
  // 历史组的 `auto === false`，因此 enabled 为假。若漏掉这一点，用户一展开
  // 历史大段，里面的思考行就会全部自动弹出。
  assert.equal(reasoningAutoOpen({
    timing: 'group', running: false, step: 3, anchorSeq: 4, latestStep: 3, latestAnchorSeq: 4, enabled: false,
  }), false)
})

test('先发生者：思考先结束（self 时机）', () => {
  let running = true
  assert.equal(reasoningAutoOpen({
    timing: 'self', running, step: 5, anchorSeq: 8, latestStep: 5, latestAnchorSeq: 8,
  }), true)
  running = false
  assert.equal(reasoningAutoOpen({
    timing: 'self', running, step: 5, anchorSeq: 8, latestStep: 5, latestAnchorSeq: 8,
  }), false, '思考结束时即折叠，不等组')
})

test('先发生者：组先收起（enabled 变假）', () => {
  assert.equal(reasoningAutoOpen({
    timing: 'group', running: true, step: 5, anchorSeq: 8, latestStep: 5, latestAnchorSeq: 8,
  }), true)
  assert.equal(reasoningAutoOpen({
    timing: 'group', running: true, step: 5, anchorSeq: 8, latestStep: 5, latestAnchorSeq: 8, enabled: false,
  }), false, '组收起时即折叠，不等思考结束')
})

// ── T-3：只展开最后一段思考 ─────────────────────────────────────────────
//
// 这一段是 `AutoAssistantMarkdown` 的职责（`running={streaming && i === last}`），
// 与收起时机无关，用内联模拟断言它仍然成立。

/** 计算某个 block 是否为 running（与 AutoAssistantMarkdown 中的表达式一致）。 */
function isRunningBlock(streaming, index, lastIndex) {
  return streaming && index === lastIndex
}

test('T-3：多段思考中只有最后一段是 running', () => {
  // 模拟：blocks = [reasoning, tool-call, reasoning, text]
  // 最后一个 block 索引是 3（text），因此没有 reasoning 是 running
  const blocks = ['reasoning', 'tool-call', 'reasoning', 'text']
  const lastIndex = blocks.length - 1
  const streaming = true
  const runningFlags = blocks.map((kind, i) => kind === 'reasoning' && isRunningBlock(streaming, i, lastIndex))
  assert.deepEqual(runningFlags, [false, false, false, false],
    '最后一个是 text，所以没有 reasoning 是 running')
})

test('T-3：最后一个 block 是 reasoning 时它是唯一的 running', () => {
  const blocks = ['reasoning', 'tool-call', 'reasoning']
  const lastIndex = blocks.length - 1
  const streaming = true
  const runningFlags = blocks.map((kind, i) => kind === 'reasoning' && isRunningBlock(streaming, i, lastIndex))
  assert.deepEqual(runningFlags, [false, false, true],
    '只有最后一段思考是 running，前面的已结束')
})

test('T-3：同一时刻不会有两段思考同时 running', () => {
  const blocks = ['reasoning', 'reasoning', 'reasoning']
  const lastIndex = blocks.length - 1
  const streaming = true
  const runningCount = blocks.filter((kind, i) => kind === 'reasoning' && isRunningBlock(streaming, i, lastIndex)).length
  assert.equal(runningCount, 1, '严格只有一段是 running')
})

test('streaming=false 时没有任何块是 running', () => {
  const blocks = ['reasoning', 'text']
  const lastIndex = blocks.length - 1
  const runningFlags = blocks.map((kind, i) => kind === 'reasoning' && isRunningBlock(false, i, lastIndex))
  assert.deepEqual(runningFlags, [false, false], '流式结束后所有思考都不再 running')
})
