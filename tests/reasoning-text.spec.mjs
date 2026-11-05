/**
 * `reasoningText` 的显示文本准备。
 *
 * 上游 `reasoning-text.ts`（0.2.2-rc.1 新增）。它剥离模型输出里的
 * `<signature>` 协议块；剥离后为空时必须整行不渲染，不能留下空白行。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { reasoningText } from '../src/client/assistant/reasoning-text.ts'

test('普通文本原样返回', () => {
  assert.equal(reasoningText('正常思考内容'), '正常思考内容')
})

test('不以尖括号开头时不处理', () => {
  assert.equal(reasoningText('a <signature>x</signature>'), 'a <signature>x</signature>')
})

test('完整 signature 块被剥离，返回其后的正文', () => {
  assert.equal(reasoningText('<signature>abc</signature>\n正文'), '正文')
})

test('signature 后多余空行被吃掉', () => {
  assert.equal(reasoningText('<signature>abc</signature>\n\n\n正文'), '正文')
})

test('signature 未闭合时返回空串', () => {
  assert.equal(reasoningText('<signature>abc'), '')
})

test('只有开标签前缀时返回空串（流式初期）', () => {
  assert.equal(reasoningText('<sig'), '')
  assert.equal(reasoningText('<'), '')
})

test('signature 后没有正文时返回空串', () => {
  assert.equal(reasoningText('<signature>abc</signature>'), '')
})
