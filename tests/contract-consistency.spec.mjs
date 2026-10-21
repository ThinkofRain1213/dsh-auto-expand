/**
 * 跨文件字符串契约的一致性检查。
 *
 * 这些值没有任何类型系统能串起来，写错时**不报错、只是不生效**——P5 排查
 * 期间在"设置卡片 key 必须是包名"上花的时间最长（写成 entry id 时整段不渲染，
 * 控制台干净得像一切正常）。
 *
 * 把每一处字符串契约固化在这里：改名字时测试会立刻指出还有哪些地方没跟上。
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

/**
 * 用正则从源码里取出第一个捕获组。
 * @param source - 文件文本。
 * @param pattern - 必须含捕获组的正则。
 * @param label - 失败时的描述。
 * @returns 捕获到的字符串。
 */
function capture(source, pattern, label) {
  assert.ok(pattern.source.includes('('), `正则缺少捕获组：${label}`)
  const match = pattern.exec(source)
  assert.ok(match !== null, `无法从源码里取出 ${label}（正则 ${pattern}）`)
  assert.ok(match[1] !== undefined, `正则没有产出捕获组：${label}（${pattern}）`)
  return match[1]
}

const manifest = JSON.parse(read('package.json'))
const hostSource = read('src/index.ts')
const clientIndex = read('src/client/index.ts')
const clientSettings = read('src/client/settings.ts')
const clientLocales = read('src/client/locales.ts')
const patch = read('cordis.patch.yml')

test('bundle patch 文件存在且只挂载本包', () => {
  assert.equal(manifest.dsh?.bundle?.patch, './cordis.patch.yml')
  const name = capture(patch, /^\s*name:\s*(\S+)\s*$/m, 'patch 里的 name')
  assert.equal(name, manifest.name, 'patch 的 name 必须是包名，否则 Loader 找不到模块')
})

test('Loader entry id === Host 与 Client 共用的设置命名空间', () => {
  // configForms.get(ns) 的 ns 就是这个 entry id。
  const entryId = capture(patch, /^\s*(?:-\s*)?id:\s*(\S+)\s*$/m, 'patch 里的 id')
  const hostNamespace = capture(hostSource, /AUTO_EXPAND_NAMESPACE\s*=\s*'([^']+)'/, 'Host 命名空间')
  const clientNamespace = capture(clientSettings, /AUTO_EXPAND_NAMESPACE\s*=\s*'([^']+)'/, 'Client 命名空间')
  assert.equal(hostNamespace, entryId, 'Host 半边的命名空间必须等于 Loader entry id')
  assert.equal(clientNamespace, entryId, 'Client 半边读 configForms 时用的命名空间必须等于 entry id')
})

test('设置卡片的槽位 key 必须是包名（不是 entry id）', () => {
  // config-ledger.ts 用这个 key 投影 configured 标志；写错则整段不渲染且无报错。
  // 注意不能用「文件里第一个 key:」——clone 目标的 keyed slot 也会出现 key。
  const key = capture(clientIndex,
    /name:\s*'plugins\.bundle\.config',\s*key:\s*'([^']+)'/,
    '设置卡片 key')
  assert.equal(key, manifest.name,
    `设置卡片 key 必须是 "${manifest.name}"（包名），实际 "${key}"。`
    + '写成 entry id 时插件详情页不会渲染卡片，控制台也没有任何错误。')
})

test('设置卡片的槽位名与 locale 座位一致', () => {
  const slot = capture(clientIndex, /name:\s*'(plugins\.bundle\.config)'/, '设置卡片槽位')
  assert.equal(slot, 'plugins.bundle.config')
  // 注册块里必须声明 locale 座位，否则组件收不到 `t`。
  assert.match(clientIndex, /locale:\s*SETTINGS_NS/,
    '设置卡片注册时必须带 locale: SETTINGS_NS，否则组件拿不到 `t` 函数')
})

test('locale 座位与 LocaleNamespaceMap 的声明一致', () => {
  const namespace = capture(clientLocales, /SETTINGS_NS\s*=\s*'([^']+)'/, 'locale 命名空间')
  assert.equal(namespace, 'autoExpand')
  assert.match(clientLocales,
    new RegExp(`interface LocaleNamespaceMap[\\s\\S]*?${namespace}:\\s*SettingsKey`),
    `LocaleNamespaceMap 里必须声明 ${namespace}: SettingsKey，否则 t 座位不会注入`)
})

test('Host schema 字段名 === Client 字段名', () => {
  const hostFields = [...hostSource.matchAll(/GROUP_AUTO_EXPAND_FIELD\s*=\s*'([^']+)'|REASONING_AUTO_EXPAND_FIELD\s*=\s*'([^']+)'/g)]
    .map(match => match[1] ?? match[2])
  const clientFields = [...clientSettings.matchAll(/GROUP_AUTO_EXPAND_FIELD\s*=\s*'([^']+)'|REASONING_AUTO_EXPAND_FIELD\s*=\s*'([^']+)'/g)]
    .map(match => match[1] ?? match[2])
  assert.equal(hostFields.length, 2, `Host 侧应声明 2 个字段，实际 ${hostFields.length}`)
  assert.deepEqual(clientFields, hostFields,
    '两边的字段名必须逐字一致：client 按字段名写 Host 设置文档，写错时写入会被静默忽略')
})

test('两端都默认开启（默认值必须一致）', () => {
  const hostGroup = capture(hostSource, /DEFAULT_GROUP_AUTO_EXPAND\s*=\s*(true|false)/, 'Host group 默认值')
  const hostReasoning = capture(hostSource, /DEFAULT_REASONING_AUTO_EXPAND\s*=\s*(true|false)/, 'Host 思考默认值')
  const clientGroup = capture(clientSettings, /groupAutoExpand:\s*(true|false)/, 'Client group 默认值')
  const clientReasoning = capture(clientSettings, /reasoningAutoExpand:\s*(true|false)/, 'Client 思考默认值')
  assert.equal(clientGroup, hostGroup, 'group 开关的默认值不一致')
  assert.equal(clientReasoning, hostReasoning, '思考开关的默认值不一致')
})

test('客户端 bundle 的 inject 声明覆盖实际依赖的服务包', () => {
  const inject = manifest.dsh?.client?.inject ?? []
  // 这些包的 client bundle 必须在它之前加载，否则服务尚未就绪。
  for (const required of [
    '@deepseek-ai/dsh-client-ui-slots',
    '@deepseek-ai/dsh-client-ui-settings',
    '@deepseek-ai/dsh-client-ui-plugin-manager',
  ]) {
    assert.ok(inject.includes(required), `dsh.client.inject 缺少 ${required}`)
  }
})

test('schemastery 在 dependencies 而不是 devDependencies', () => {
  // Host 半边是运行时 import：放 devDependencies 时本地能用、用户装完就
  // ERR_MODULE_NOT_FOUND，整个插件（含核心展开）加载失败。
  assert.ok(manifest.dependencies?.['@deepseek-ai/schemastery'] !== undefined,
    'schemastery 必须声明在 dependencies')
  assert.equal(manifest.devDependencies?.['@deepseek-ai/schemastery'], undefined,
    'schemastery 不应同时出现在 devDependencies')
})

test('engines 与克隆记录的上游版本一致', () => {
  const engines = manifest.engines?.dsh ?? ''
  const record = JSON.parse(read('spec/upstream.json'))
  const chatVersion = Object.values(record.packages ?? {})
    .map(info => info.version)
    .find(version => typeof version === 'string')
  assert.ok(chatVersion !== undefined, '上游记录里没有包版本')
  const minor = chatVersion.split('.').slice(0, 2).join('.')
  assert.ok(engines.includes(minor),
    `engines.dsh = "${engines}" 没有覆盖克隆时的上游版本 ${chatVersion}`)
})
