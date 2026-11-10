/**
 * 包裹的生命周期韧性。
 *
 * 背景（真实故障）：`dsh-project-groups` 启停会改变 profile patch 列表，
 * 触发插件图重新组合。此时本插件可能被**先重新应用、后销毁旧实例**（销毁
 * 是异步的），或槽位条目被**重建**成新对象。
 *
 * 旧实现有两处会让包裹永久丢失：
 *  1. `wrapEntry` 见到「已经是自己包裹的组件」就返回 NOOP —— 新实例因此
 *     不接管，随后旧实例的还原把 component 改回官方版本，再也没人重新包裹；
 *  2. `installWrappers` 用 `done` 集合一次性锁定 —— 条目被重建后，
 *     `slots/changed` 再来也不会重新包裹。
 *
 * 这两条都会表现为「自动展开突然失效，直到重启」。本文件钉住修复后的契约。
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { NOOP, wrapEntry } from '../src/client/wrap.ts'
import { installWrappers } from '../src/client/install-wrappers.ts'

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

test('新实例接管既有包裹：旧实例的还原不得撤掉它', () => {
  const official = component('Official')
  const target = entry(undefined, official)

  // 实例 A 先包裹。
  const restoreA = wrapEntry([target], { slot: 'conversation.chat.flow' },
    () => component('OuterA'), '[test]')
  assert.notEqual(restoreA, NOOP)
  const wrapped = target.component

  // 实例 B 在 A 尚未销毁时应用：应接管而非放弃。
  const restoreB = wrapEntry([target], { slot: 'conversation.chat.flow' },
    () => component('OuterB'), '[test]')
  assert.notEqual(restoreB, NOOP, '新实例应接管既有包裹')

  // A 的异步销毁晚到：不得把 B 接管后的组件撤掉。
  restoreA()
  assert.notEqual(target.component, official, '旧实例的还原把包裹撤掉了（自动展开会失效）')

  // B 正常销毁时才恢复官方组件。
  restoreB()
  assert.equal(target.component, official, 'B 销毁后应恢复官方组件')
})

test('条目被重建后，slots/changed 能重新包裹', () => {
  const officialFlow = component('OfficialFlow')
  const officialAssistant = component('OfficialAssistant')
  const officialTool = component('OfficialTool')

  const records = new Map([
    ['conversation.chat.flow', [entry(undefined, officialFlow)]],
    ['conversation.chat.node', [entry('assistant-step', officialAssistant), entry('tool-call', officialTool)]],
  ])
  const listeners = new Map()
  const ctx = {
    slots: {
      entries: key => records.get(key) ?? [],
      inject: () => NOOP,
      register: () => NOOP,
    },
    on: (event, callback) => {
      const list = listeners.get(event) ?? []
      list.push(callback)
      listeners.set(event, list)
      return NOOP
    },
    emit: (event, key) => {
      for (const callback of listeners.get(event) ?? []) callback(key)
    },
  }

  const dispose = installWrappers(ctx, {
    flow: component('AutoFlow'),
    assistant: component('AutoAssistant'),
    tool: () => component('AutoTool'),
  })
  const firstFlow = records.get('conversation.chat.flow')[0]
  assert.notEqual(firstFlow.component, officialFlow, '首次应完成包裹')

  // 模拟插件图重组：槽位条目被重建成全新对象，组件回到官方实现。
  const rebuilt = entry(undefined, officialFlow)
  records.set('conversation.chat.flow', [rebuilt])
  ctx.emit('slots/changed', 'conversation.chat.flow')

  assert.notEqual(rebuilt.component, officialFlow,
    '条目重建后未重新包裹（自动展开会失效）')

  dispose()
  assert.equal(rebuilt.component, officialFlow, '销毁后应恢复官方组件')
})
