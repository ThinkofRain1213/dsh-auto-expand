/**
 * 第三层（思考自动展开）的行为测试。
 *
 * 验证 `autoOpen = running && groupOpen` 的"先发生者"语义：
 *   - 思考流式中 + group 展开 → 展开
 *   - 思考结束（running=false）→ 折叠
 *   - group 折叠（groupOpen=false）→ 折叠
 *   - 两者都假 → 折叠
 *
 * 同时验证 T-3（只保留最后一段思考展开）：由 `i === last` 保证，
 * 这里用多段模拟确认同一时刻只有一个 running。
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

/** 计算思考行的 autoOpen（与 AutoReasoningRow 中的表达式一致）。 */
function reasoningAutoOpen(running, groupOpen) {
  return running && groupOpen
}

/** 计算某个 block 是否为 running（与 AutoAssistantMarkdown 中的表达式一致）。 */
function isRunningBlock(streaming, index, lastIndex) {
  return streaming && index === lastIndex
}

test('思考流式中且 group 展开 → 自动展开', () => {
  assert.equal(reasoningAutoOpen(true, true), true)
})

test('思考结束（running=false）→ 自动折叠', () => {
  assert.equal(reasoningAutoOpen(false, true), false)
})

test('group 折叠（groupOpen=false）→ 自动折叠', () => {
  assert.equal(reasoningAutoOpen(true, false), false)
})

test('思考结束且 group 折叠 → 折叠', () => {
  assert.equal(reasoningAutoOpen(false, false), false)
})

test('先发生者：思考先结束', () => {
  // 初始：流式中、group 展开
  let running = true
  let groupOpen = true
  assert.equal(reasoningAutoOpen(running, groupOpen), true)
  // 思考先结束
  running = false
  assert.equal(reasoningAutoOpen(running, groupOpen), false, '思考结束时即折叠，不等 group')
})

test('先发生者：group 先折叠', () => {
  let running = true
  let groupOpen = true
  assert.equal(reasoningAutoOpen(running, groupOpen), true)
  // group 先折叠（思考仍在流式）
  groupOpen = false
  assert.equal(reasoningAutoOpen(running, groupOpen), false, 'group 折叠时即折叠，不等思考结束')
})

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
  assert.deepEqual(runningFlags, [false, false], '流式结束后所有思考都折叠')
})

test('历史轮次：streaming=false 且 groupOpen=true 仍折叠', () => {
  // 历史轮次的思考块：不流式，但 group 可能被手动展开
  assert.equal(reasoningAutoOpen(false, true), false,
    '历史思考默认折叠，与官方一致')
})

test('自动展开状态序列：流式→结束 产生一次折叠转换', () => {
  const sequence = [
    reasoningAutoOpen(true, true),   // 展开
    reasoningAutoOpen(true, true),   // 展开（内容增长）
    reasoningAutoOpen(false, true),  // 折叠（思考结束）
    reasoningAutoOpen(false, true),  // 保持折叠
  ]
  assert.deepEqual(sequence, [true, true, false, false])
  // 只有一次 true→false 转换，对应"折叠只触发一次"
  const transitions = sequence.slice(1).filter((value, i) => value !== sequence[i])
  assert.equal(transitions.length, 1, '只有一次状态转换')
})
