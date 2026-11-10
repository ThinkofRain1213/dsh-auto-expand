/**
 * 包裹所有权的随机状态机回归测试。
 *
 * 单元测试只覆盖两条已知时序；这里用固定种子的随机序列压更大的空间：
 * 反复「应用 / 销毁 / 槽位条目重建 / slots/changed」，检查
 *   1. 不崩溃；
 *   2. 所有实例销毁后，每条 entry 的 component 必须回到官方实现（无泄漏）。
 *
 * 固定种子保证可复现；失败时打印轮次与操作序列前缀，便于定位。
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { installWrappers } from '../src/client/install-wrappers.ts'

/** 可包裹的假组件。 */
function component(name) {
  const fn = function fakeComponent() {}
  Object.defineProperty(fn, 'name', { value: name })
  return fn
}

const OFFICIAL = {
  flow: component('OfficialFlow'),
  assistant: component('OfficialAssistant'),
  tool: component('OfficialTool'),
}
const COMPONENTS = {
  flow: component('AutoFlow'),
  assistant: component('AutoAssistant'),
  tool: () => component('AutoTool'),
}
const FLOW = 'conversation.chat.flow'
const NODE = 'conversation.chat.node'
const OFFICIALS = new Set([OFFICIAL.flow, OFFICIAL.assistant, OFFICIAL.tool])

/** 确定性伪随机（LCG），避免测试抖动。 */
function createRandom(seed) {
  let state = seed
  return () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff
    return state / 0x7fffffff
  }
}

/**
 * 跑一轮随机操作，返回是否泄漏。
 * @param random - 伪随机源。
 * @param rounds - 轮数。
 * @param steps - 每轮操作步数。
 * @returns 泄漏次数。
 */
function stress(random, rounds, steps) {
  let leaks = 0
  for (let round = 0; round < rounds; round += 1) {
    const records = new Map([
      [FLOW, [{ component: OFFICIAL.flow, options: {} }]],
      [NODE, [
        { component: OFFICIAL.assistant, options: { key: 'assistant-step' } },
        { component: OFFICIAL.tool, options: { key: 'tool-call' } },
      ]],
    ])
    const listeners = []
    const ctx = {
      slots: {
        entries: key => records.get(key) ?? [],
        inject: () => () => {},
        register: () => () => {},
      },
      on: (event, callback) => {
        listeners.push(callback)
        return () => {
          const index = listeners.indexOf(callback)
          if (index >= 0) listeners.splice(index, 1)
        }
      },
    }
    const emit = key => { for (const callback of listeners.slice()) callback(key) }

    const live = []
    const history = []
    for (let step = 0; step < steps; step += 1) {
      const roll = random()
      if (roll < 0.25 || live.length === 0) {
        live.push(installWrappers(ctx, COMPONENTS, '[stress]'))
        history.push('apply')
      } else if (roll < 0.45) {
        live.splice(Math.floor(random() * live.length), 1)[0]()
        history.push('dispose')
      } else if (roll < 0.65) {
        // 条目重建：全新对象，组件回到官方实现。
        if (random() < 0.5) records.set(FLOW, [{ component: OFFICIAL.flow, options: {} }])
        else {
          records.set(NODE, [
            { component: OFFICIAL.assistant, options: { key: 'assistant-step' } },
            { component: OFFICIAL.tool, options: { key: 'tool-call' } },
          ])
        }
        emit(FLOW)
        emit(NODE)
        history.push('rebuild+emit')
      } else {
        emit(random() < 0.5 ? FLOW : NODE)
        history.push('emit')
      }
    }

    while (live.length > 0) live.pop()()

    for (const item of [...records.get(FLOW), ...records.get(NODE)]) {
      if (!OFFICIALS.has(item.component)) {
        leaks += 1
        console.error(`round=${round} 泄漏，操作序列: ${history.join(' → ')}`)
        break
      }
    }
  }
  return leaks
}

test('随机状态机：不泄漏包裹（固定种子）', () => {
  // 压测期间 installWrappers 会打印一次 tool-call 诊断，这里静默掉以免刷屏。
  const original = console.info
  console.info = () => {}
  try {
    const leaks = stress(createRandom(20261110), 500, 40)
    assert.equal(leaks, 0, `出现 ${leaks} 轮泄漏`)
  } finally {
    console.info = original
  }
})
