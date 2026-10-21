/**
 * 包裹逻辑单元测试。
 *
 * 直接测试 `wrap.ts` 的纯逻辑（不依赖 React），覆盖 P1 的关键分支：
 *  - 正常包裹：component 被替换，且返回的 disposer 能还原
 *  - 幂等：同一 inner 不会被包裹两次
 *  - entry 不存在：返回 NOOP，不抛错
 *  - 组件不可包裹：返回 NOOP，不抛错
 *  - 赋值被拒（entry 冻结）：降级为 NOOP，不抛错
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { NOOP, isWrappable, wrapEntry } from '../src/client/wrap.ts'

/** 一个可包裹的假组件。 */
function component(name) {
  const fn = function fakeComponent() {}
  Object.defineProperty(fn, 'name', { value: name })
  return fn
}

/** 构造一条假 entry。 */
function entry(key, inner) {
  return { component: inner, options: key === undefined ? {} : { key } }
}

test('正常包裹：替换 component 并支持还原', () => {
  const inner = component('Inner')
  const target = entry('assistant-step', inner)
  const outer = component('Outer')
  let received
  const restore = wrapEntry([target], { slot: 'conversation.chat.node', key: 'assistant-step' },
    (value) => { received = value; return outer }, '[test]')
  assert.equal(received, inner, '包装器工厂应收到原组件')
  assert.equal(target.component, outer, 'entry.component 应被替换')
  restore()
  assert.equal(target.component, inner, '还原后应恢复原组件')
})

test('幂等：同一组件不会被包裹两次', () => {
  const inner = component('Inner')
  const target = entry(undefined, inner)
  const first = wrapEntry([target], { slot: 'conversation.chat.flow' },
    () => component('Outer1'), '[test]')
  const wrappedOnce = target.component
  // 第二次：target.component 已是 Outer1，且它被记录过，应返回 NOOP。
  const second = wrapEntry([target], { slot: 'conversation.chat.flow' },
    () => component('Outer2'), '[test]')
  assert.equal(second, NOOP, '第二次包裹应被跳过')
  assert.equal(target.component, wrappedOnce, 'component 不应被二次替换')
  first()
})

test('entry 不存在：返回 NOOP 且不抛错', () => {
  const restore = wrapEntry([], { slot: 'conversation.chat.node', key: 'assistant-step' },
    () => component('Outer'), '[test]')
  assert.equal(restore, NOOP)
})

test('key 不匹配：返回 NOOP', () => {
  const target = entry('user', component('User'))
  const restore = wrapEntry([target], { slot: 'conversation.chat.node', key: 'assistant-step' },
    () => component('Outer'), '[test]')
  assert.equal(restore, NOOP)
})

test('组件不可包裹：返回 NOOP 且不抛错', () => {
  const target = entry(undefined, 42)
  const restore = wrapEntry([target], { slot: 'conversation.chat.flow' },
    () => component('Outer'), '[test]')
  assert.equal(restore, NOOP)
  assert.equal(target.component, 42, 'component 不应被改动')
})

test('包装器抛错：降级为 NOOP，不抛出', () => {
  const inner = component('Inner')
  const target = entry(undefined, inner)
  const restore = wrapEntry([target], { slot: 'conversation.chat.flow' },
    () => { throw new Error('boom') }, '[test]')
  assert.equal(restore, NOOP)
  assert.equal(target.component, inner, 'component 不应被改动')
})

test('包装器返回非组件：降级为 NOOP', () => {
  const inner = component('Inner')
  const target = entry(undefined, inner)
  const restore = wrapEntry([target], { slot: 'conversation.chat.flow' },
    () => 123, '[test]')
  assert.equal(restore, NOOP)
  assert.equal(target.component, inner)
})

test('entry 冻结：降级为 NOOP，不抛出', () => {
  const inner = component('Inner')
  const target = Object.freeze({ component: inner, options: {} })
  const restore = wrapEntry([target], { slot: 'conversation.chat.flow' },
    () => component('Outer'), '[test]')
  assert.equal(restore, NOOP, '冻结 entry 应降级')
})

test('isWrappable：函数与 exotic component 为真，其余为假', () => {
  assert.equal(isWrappable(component('A')), true)
  assert.equal(isWrappable({ $$typeof: Symbol.for('react.memo') }), true, 'exotic component 应可包裹')
  assert.equal(isWrappable(42), false)
  assert.equal(isWrappable(null), false)
  assert.equal(isWrappable({}), false)
  assert.equal(isWrappable('str'), false)
})

test('还原后 component 已变化时不覆盖他人修改', () => {
  const inner = component('Inner')
  const target = entry(undefined, inner)
  const restore = wrapEntry([target], { slot: 'conversation.chat.flow' },
    () => component('Outer'), '[test]')
  const thirdParty = component('ThirdParty')
  target.component = thirdParty
  restore()
  assert.equal(target.component, thirdParty, '不应覆盖第三方写入')
})
