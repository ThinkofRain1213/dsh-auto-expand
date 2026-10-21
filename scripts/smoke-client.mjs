/**
 * 产物冒烟测试：模拟 DSH 的 __ModuleLoader__，验证 client bundle 能被加载、
 * 注册正确的 id、导出 apply/inject，且 apply 在最小化的 fake ctx 上不抛错。
 *
 * 这不是完整的行为验证（真机实测由用户负责），而是构建产物的结构校验：
 *  - bundle 是 closure-factory 格式，调用 load 后能取到 id 与 factory
 *  - factory 执行后导出 { apply, inject }
 *  - apply 调用 ctx.effect 注册包裹逻辑，且在 slots 为空时不抛错
 */
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'

const source = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')

let loaded
const sandbox = {
  window: {
    __ModuleLoader__: {
      load(definition) { loaded = definition },
    },
  },
  console,
}
runInNewContext(source, sandbox)

if (loaded === undefined) throw new Error('client bundle 未调用 __ModuleLoader__.load')
if (loaded.id !== 'dsh-auto-expand') throw new Error(`loader id 不符：${loaded.id}`)

const requireShim = (id) => {
  if (id === 'react') {
    return {
      createElement: (type, props) => ({ type, props }),
      memo: (component) => component,
      useState: () => [undefined, () => {}],
      useEffect: () => {},
      useCallback: (fn) => fn,
      useMemo: (fn) => fn(),
      useRef: (value) => ({ current: value }),
      useContext: () => undefined,
      createContext: (value) => ({ _currentValue: value }),
      useSyncExternalStore: (_subscribe, getSnapshot) => getSnapshot(),
    }
  }
  throw new Error(`未预期的 require：${id}`)
}

const exported = loaded.factory(requireShim)
if (typeof exported.apply !== 'function') throw new Error('缺少 apply 导出')
if (!Array.isArray(exported.inject) || exported.inject[0] !== 'slots') {
  throw new Error(`inject 不符：${JSON.stringify(exported.inject)}`)
}

// 最小 fake ctx：记录 effect 回调，slots 返回空数组（模拟官方 entry 尚未注册）。
const effects = []
const listeners = new Map()
const fakeCtx = {
  slots: { entries: () => [] },
  effect: (callback, label) => { effects.push({ callback, label }) },
  on: (name, listener) => { listeners.set(name, listener); return () => listeners.delete(name) },
}
exported.apply(fakeCtx)

if (effects.length !== 1) throw new Error(`应注册 1 个 effect，实际 ${effects.length}`)
const dispose = effects[0].callback()
if (typeof dispose !== 'function') throw new Error('effect 未返回 disposer')

// entry 不存在时包裹应静默跳过（不抛错），并仍订阅 slots/changed 重试。
if (!listeners.has('slots/changed')) throw new Error('未订阅 slots/changed')
listeners.get('slots/changed')('conversation.chat.flow')

dispose()
console.log('OK: client bundle 结构校验通过')
console.log('  loader id      =', loaded.id)
console.log('  exports        =', Object.keys(exported).join(', '))
console.log('  inject         =', JSON.stringify(exported.inject))
console.log('  effect label   =', effects[0].label)
console.log('  空 slots 不抛错 = 是')
console.log('  订阅 slots/changed = 是')
