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

/**
 * 构造最小 fake ctx。
 *
 * `slots.entries()` 返回空数组，模拟官方 entry 尚未注册的情形——这是
 * 插件启动时最常见的状态，必须不抛错且仍订阅 `slots/changed` 重试。
 *
 * `inject(deps, cb)` 模拟 cordis 的**可选依赖**语义：`deps` 全部存在时
 * 同步执行 `cb`，否则不执行。
 * @param services - 可选注入的客户端服务（`configForms` / `locale`）。
 * @returns fake ctx，附带内部记录数组供断言使用。
 */
function makeFakeCtx(services = {}) {
  const effects = []
  const listeners = new Map()
  const registered = []
  const ctx = {
    slots: {
      entries: () => [],
      inject: (_key, callback) => callback(),
      register: (options, component) => {
        registered.push({ options, component })
        return () => {}
      },
    },
    get: name => services[name],
    inject: (deps, callback) => {
      if (deps.every(name => services[name] !== undefined)) callback(ctx)
      return {}
    },
    effect: (callback, label) => { effects.push({ callback, label }) },
    on: (name, listener) => { listeners.set(name, listener); return () => listeners.delete(name) },
  }
  // 真实 cordis 里服务同时是 `ctx.<name>` 与 `ctx.get('<name>')` 两种读法。
  Object.assign(ctx, services)
  return { ctx, effects, listeners, registered }
}

// ── 场景 1：可选服务全部缺失 ────────────────────────────────────────────
// 核心展开必须照常工作；设置页不挂载。
const bare = makeFakeCtx()
exported.apply(bare.ctx)

if (bare.effects.length !== 1) throw new Error(`缺少可选服务时应只注册包裹 effect，实际 ${bare.effects.length}`)
const dispose = bare.effects[0].callback()
if (typeof dispose !== 'function') throw new Error('effect 未返回 disposer')
if (bare.effects[0].label === undefined) throw new Error('effect 未提供 label')
if (bare.registered.length !== 0) throw new Error('缺少 locale/configForms 时不应注册设置卡片')

// entry 不存在时包裹应静默跳过（不抛错），并仍订阅 slots/changed 重试。
if (!bare.listeners.has('slots/changed')) throw new Error('未订阅 slots/changed')
bare.listeners.get('slots/changed')('conversation.chat.flow')
dispose()

// ── 场景 2：可选服务齐备 ────────────────────────────────────────────────
// 应额外注册 locale 字典与设置卡片，并把设置表单接到本地 store。
const localeDicts = []
const locale = { register: (ns, dicts) => { localeDicts.push({ ns, dicts }); return () => {} } }
const form = {
  getSnapshot: () => ({ value: { groupAutoExpand: false, reasoningAutoExpand: true } }),
  subscribe: () => () => {},
  set: () => Promise.resolve(true),
}
const hydrated = makeFakeCtx({
  locale,
  configForms: { get: namespace => (namespace === 'auto-expand' ? form : undefined) },
})
exported.apply(hydrated.ctx)

// 包裹 + 子作用域内的「字典」「接管设置」—— 共 3 个 effect。
if (hydrated.effects.length !== 3) throw new Error(`服务齐备时应注册 3 个 effect，实际 ${hydrated.effects.length}`)
if (localeDicts.length !== 0) throw new Error('locale 字典应在 effect 内按需注册')

// 只有环境里存在设置卡片槽位时才注册；此处 slots.inject 会同步回调。
if (hydrated.registered.length !== 1) throw new Error(`应注册 1 张设置卡片，实际 ${hydrated.registered.length}`)
const card = hydrated.registered[0].options
if (card.key !== 'dsh-auto-expand') throw new Error(`设置卡片 key 必须是包名，实际 ${card.key}`)
if (card.name !== 'plugins.bundle.config') throw new Error(`设置卡片 slot 不符：${card.name}`)
if (card.locale !== 'autoExpand') throw new Error(`设置卡片 locale 命名空间不符：${card.locale}`)
if (typeof hydrated.registered[0].component !== 'function') throw new Error('设置卡片不是组件')

// 逐个执行 effect：包裹、字典注册、表单接管，都必须返回 disposer。
for (const { callback, label } of hydrated.effects) {
  const stop = callback()
  if (typeof stop !== 'function') throw new Error(`effect「${label}」未返回 disposer`)
  stop()
}
if (localeDicts.length !== 1) throw new Error('locale 字典未注册')
if (localeDicts[0].ns !== 'autoExpand') throw new Error(`字典命名空间不符：${localeDicts[0].ns}`)

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
console.log('  effect 数（无服务） =', bare.effects.length)
console.log('  effect 数（有服务） =', hydrated.effects.length)
console.log('  effect labels      =', bare.effects.map(e => e.label).join(' | '))
console.log('  设置卡片 key       =', hydrated.registered[0]?.options.key)
console.log('  平台模块外部化     =', [...requested].join(', '))
console.log('  空 slots 不抛错    = 是')
console.log('  订阅 slots/changed = 是')
