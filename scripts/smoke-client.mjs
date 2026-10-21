/**
 * 产物冒烟测试：模拟 DSH 的 __ModuleLoader__，验证 client bundle 能被加载、
 * 注册正确的 id、导出 apply/inject，且 apply 在最小化的 fake ctx 上不抛错。
 *
 * 这不是完整的行为验证（真机实测由用户负责），而是构建产物的结构校验：
 *  - bundle 是 closure-factory 格式，调用 load 后能取到 id 与 factory
 *  - factory 执行后导出 { apply, inject }
 *  - 平台模块全部通过 require 外部化，没有被重复打包
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
  document: undefined,
}
runInNewContext(source, sandbox)

if (loaded === undefined) throw new Error('client bundle 未调用 __ModuleLoader__.load')
if (loaded.id !== 'dsh-auto-expand') throw new Error(`loader id 不符：${loaded.id}`)

/** 记录 bundle 实际 require 了哪些平台模块。 */
const requested = new Set()

/**
 * 极简 React 桩：只提供 bundle 顶层执行需要的符号。
 * 组件函数体不会被调用（没有渲染），因此这里只需保证 import 成功。
 */
function reactStub() {
  const identity = value => value
  return {
    createElement: (type, props, ...children) => ({ type, props, children }),
    memo: identity,
    useState: initial => [typeof initial === 'function' ? initial() : initial, () => {}],
    useEffect: () => {},
    useLayoutEffect: () => {},
    useCallback: identity,
    useMemo: factory => factory(),
    useRef: value => ({ current: value }),
    useContext: () => undefined,
    useId: () => 'test-id',
    createContext: value => ({ _currentValue: value, Provider: identity }),
    useSyncExternalStore: (_subscribe, getSnapshot) => getSnapshot(),
  }
}

const requireShim = (id) => {
  requested.add(id)
  if (id === 'react') return reactStub()
  if (id === 'react/jsx-runtime') {
    // 构建产物用自动 JSX runtime：需要 jsx / jsxs / Fragment。
    const create = (type, props) => ({ type, props })
    return { jsx: create, jsxs: create, Fragment: 'Fragment' }
  }
  if (id === '@deepseek-ai/dsh-client-ui-primitives') {
    // 图标与 Markdown 等原语：全部返回一个惰性桩组件。
    const Stub = () => null
    return new Proxy({}, {
      get: (_target, prop) => {
        if (prop === '__esModule') return true
        if (prop === 'writeClipboard') return () => Promise.resolve(true)
        return Stub
      },
    })
  }
  if (id === '@deepseek-ai/dsh-client-store') {
    return {
      createSnapshotStore: (initial) => {
        let value = initial
        const listeners = new Set()
        return {
          getSnapshot: () => value,
          set: (next) => { value = next; for (const l of listeners) l() },
          subscribe: (listener) => { listeners.add(listener); return () => listeners.delete(listener) },
        }
      },
      defineStore: () => ({}),
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

// 平台模块必须外部化：这些包若被打进 bundle，会出现第二份运行时实例。
const PLATFORM = [
  'react',
  'react/jsx-runtime',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-store',
]
for (const id of PLATFORM) {
  if (!requested.has(id)) throw new Error(`平台模块未外部化（应 require 但未出现）：${id}`)
}
const unexpected = [...requested].filter(id => !PLATFORM.includes(id))
if (unexpected.length > 0) throw new Error(`出现未预期的 require：${unexpected.join(', ')}`)

console.log('OK: client bundle 结构校验通过')
console.log('  loader id          =', loaded.id)
console.log('  exports            =', Object.keys(exported).join(', '))
console.log('  inject             =', JSON.stringify(exported.inject))
console.log('  effect label       =', effects[0].label)
console.log('  平台模块外部化     =', [...requested].join(', '))
console.log('  空 slots 不抛错    = 是')
console.log('  订阅 slots/changed = 是')
