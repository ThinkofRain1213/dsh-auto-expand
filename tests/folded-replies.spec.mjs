/**
 * `hasAssistantReplyContent` 的行为。
 *
 * 上游 `contract/assistant-content.ts`（0.2.2-rc.1 新增）。本插件内联到
 * `chat-contract.ts`，因为它决定 `foldedReplies = 'all'` 时哪些助理行
 * 留在折叠之外 —— 判错的后果是官方设置被我们吞掉。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { hasAssistantReplyContent } from '../src/client/contract/chat-contract.ts'

test('空 blocks 不算回复', () => {
  assert.equal(hasAssistantReplyContent([]), false)
})

test('只有思考块不算回复', () => {
  assert.equal(hasAssistantReplyContent([{ kind: 'reasoning', text: '想一下' }]), false)
})

test('只有工具调用不算回复', () => {
  assert.equal(hasAssistantReplyContent([{ kind: 'tool-call', id: 't1' }]), false)
})

test('空白文本不算回复', () => {
  assert.equal(hasAssistantReplyContent([{ kind: 'text', text: '   ' }]), false)
})

test('有实际文本算回复', () => {
  assert.equal(hasAssistantReplyContent([{ kind: 'text', text: '答案' }]), true)
})

test('思考加文本：文本存在即算回复', () => {
  assert.equal(hasAssistantReplyContent([
    { kind: 'reasoning', text: '想一下' },
    { kind: 'text', text: '答案' },
  ]), true)
})

test('未知块类型算回复（上游 return true）', () => {
  assert.equal(hasAssistantReplyContent([{ kind: 'image' }]), true)
})
