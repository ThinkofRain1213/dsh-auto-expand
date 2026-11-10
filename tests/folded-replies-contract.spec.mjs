/**
 * `foldedReplies` 主链路的结构契约。
 *
 * 为什么是结构断言而不是行为断言：这五条判据都长在 `AutoNodeSeat` /
 * `AutoAssistantNodeView` 这两个 React 组件内部，本仓库没有 DOM 渲染测试
 * 设施，而把判据抽成纯函数属于「改现有实现」——超出重同步范围。
 *
 * 但它们恰恰是本次最容易静默退化的地方：用户把「收起后显示回复」设为
 * 「全部」时，官方会把每条回复留在折叠区外；判据一旦被谁改回去，行为就
 * 悄悄变回旧版，而类型检查和现有测试都发现不了。
 *
 * 因此这里钉住上游 0.2.2-rc.1 的关键结构，作为回归护栏。它与
 * `contract-consistency.spec.mjs` 同类：断言的是跨文件字符串契约。
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'

import { PROJECT_ROOT } from '../scripts/upstream-io.mjs'

/**
 * 读一个项目内文件。
 * @param relativePath - 相对项目根的路径。
 * @returns 文件文本。
 */
function read(relativePath) {
  return readFileSync(join(PROJECT_ROOT, relativePath), 'utf8')
}

const NODE_SEAT = read('src/client/flow/AutoNodeSeat.tsx')
const ASSISTANT_NODE = read('src/client/assistant/AutoAssistantNodeView.tsx')

/** 断言源码包含某段结构；失败时给出可定位的说明。 */
function assertContains(source, needle, label) {
  assert.ok(source.includes(needle), `缺少 ${label}：\n  期望包含：${needle}`)
}

test('AutoNodeSeat 读取 foldedReplies === all', () => {
  assertContains(NODE_SEAT, "policy.foldedReplies === 'all'", 'keepReplies 取值')
})

test('AutoNodeSeat 的 replyRow 只在保留全部回复时成立', () => {
  assertContains(NODE_SEAT, 'const replyRow = keepReplies', 'replyRow 以 keepReplies 为前提')
  assertContains(NODE_SEAT, "routedNode?.kind === 'assistant-step'", 'replyRow 的节点判别')
  assertContains(NODE_SEAT, "groupPart !== 'reasoning'", 'replyRow 排除 reasoning 分区')
  assertContains(NODE_SEAT, 'hasAssistantReplyContent(routedNode.data.blocks)', 'replyRow 的内容判据')
})

test('AutoNodeSeat 把回复行排除在过程成员之外', () => {
  // processMember 的条件里必须有 `&& !replyRow`；否则回复行会被折进过程区。
  const start = NODE_SEAT.indexOf('const processMember')
  assert.ok(start !== -1, '找不到 processMember 定义')
  const block = NODE_SEAT.slice(start, start + 400)
  assert.match(block, /&& !replyRow/, 'processMember 未排除 replyRow')
})

test('AutoNodeSeat 让回复行拥有自己的 disclosure', () => {
  const start = NODE_SEAT.indexOf('const ownsDisclosure')
  assert.ok(start !== -1, '找不到 ownsDisclosure 定义')
  const line = NODE_SEAT.slice(start, start + 120)
  assert.match(line, /replyRow/, 'ownsDisclosure 未包含 replyRow')
})

test('AutoNodeSeat 的 hasContent 按 keepReplies 选择过程判据', () => {
  assertContains(NODE_SEAT, 'processPresentation?.hasNonReplyProcess === true', '保留回复时的过程内容判据')
  assertContains(NODE_SEAT, 'processPresentation?.hasExternalProcess === true', '最终答案模式下的旧判据')
})

test('AutoAssistantNodeView 的 reasoningHidden 走两分支', () => {
  assertContains(ASSISTANT_NODE, 'const keepReplies = usePresentation', 'keepReplies 读取')
  assertContains(ASSISTANT_NODE, '? groupPart !== \'reasoning\'', '保留全部回复分支')
  assertContains(ASSISTANT_NODE, 'turnProcess.spec.answerStep === data.step && turnProcess.spec.inlineReasoning', '最终答案分支')
})

test('旧的 compactAnswer 判据已移除（rc.1 删除了该字段）', () => {
  assert.equal(NODE_SEAT.includes('compactAnswer'), false, 'AutoNodeSeat 仍在引用已删除的 compactAnswer')
  assert.equal(NODE_SEAT.includes('data-turn-process-answer'), false, 'AutoNodeSeat 仍在输出已移除的 data-turn-process-answer')
})
