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
  // 新增字段时**必须**把字段名加进这个清单，否则它不受本契约保护
  // ——P7 的 tool 字段最初就漏在这里（当时只有 GROUP/REASONING 两支），
  // 字段名写错也不会报错，只在运行时被静默忽略。
  //
  // ## 为什么是「一组独立正则」而不是一条带多分支的长正则
  //
  // P10 曾用一条 `A|B|C|D` 的长正则 + 一个 `valueOf(match) = match[2] ?? match[4] ?? …`
  // 的取组函数，**这是错的**：新分支 `GROUP_HEIGHT_(CUSTOM|PERCENT|HISTORY)` 自带一个
  // 捕获组，把所有后续组号推后一位，于是
  //   - 三个高度字段取到的是 `CUSTOM`／`PERCENT`／`HISTORY` 这个**修饰名**；
  //   - `INSPECT_BUTTON_HIDE_SCOPE_FIELD` 的值在第 5 组，取组函数里没有 5，恒为 `undefined`。
  // 两边因此得到**同样错**的数组，`deepEqual` 永远相等——把 Host 侧字段名改错，
  // 22 个测试依然全绿（已用突变实验证实）。
  //
  // 现在每个分支一条独立正则、自己声明取值组号，新增分支不会影响别人；
  // 末尾再断言「没有空值、没有重复」，防止同类错误换个形式复发。
  const fieldPatterns = [
    /(?:GROUP|REASONING|TOOL)_AUTO_EXPAND_FIELD\s*=\s*'([^']+)'/g,
    /(?:REASONING|TOOL)_COLLAPSE_TIMING_FIELD\s*=\s*'([^']+)'/g,
    /INSPECT_BUTTON_HIDE_SCOPE_FIELD\s*=\s*'([^']+)'/g,
    /GROUP_HEIGHT_(?:CUSTOM|PERCENT|HISTORY)_FIELD\s*=\s*'([^']+)'/g,
  ]
  /** 按声明顺序收集一侧源码里的全部字段名。 */
  const collectFields = (source) => fieldPatterns.flatMap(pattern =>
    [...source.matchAll(pattern)].map(match => match[1]))
  const hostFields = collectFields(hostSource)
  const clientFields = collectFields(clientSettings)
  assert.equal(hostFields.length, 9, `Host 侧应声明 9 个字段，实际 ${hostFields.length}`)
  assert.equal(clientFields.length, 9, `Client 侧应声明 9 个字段，实际 ${clientFields.length}`)
  // 自检：任何一条字段名为空或重复，都说明某条正则的取值组错了。
  for (const [side, fields] of [['Host', hostFields], ['Client', clientFields]]) {
    assert.ok(fields.every(name => typeof name === 'string' && name.length > 0),
      `${side} 侧字段清单里有空值：${JSON.stringify(fields)}`)
    assert.equal(new Set(fields).size, fields.length,
      `${side} 侧字段清单里有重复：${JSON.stringify(fields)}`)
  }
  assert.deepEqual(clientFields, hostFields,
    '两边的字段名必须逐字一致：client 按字段名写 Host 设置文档，写错时写入会被静默忽略')
})

test('设置卡片的每个写入口都用字段常量，不用裸字面量', () => {
  // 真正决定「写到 Host 哪个键」的是 setAutoExpandSetting 的实参，
  // 而不是常量声明处。只守住声明处时，写入口写错一个字仍然静默失败：
  // 设置页能拨、Host 收到一个不认识的键、值不生效、控制台无报错。
  const card = read('src/client/settings-card.tsx')
  const calls = [...card.matchAll(/setAutoExpandSetting\(\s*([A-Z_]+|'[^']*')/g)]
    .map(match => match[1])
  assert.ok(calls.length > 0, '没有找到任何 setAutoExpandSetting 调用，检查提取正则')
  const literals = calls.filter(arg => arg.startsWith('\''))
  assert.deepEqual(literals, [],
    `写入口必须用字段常量而不是裸字面量，发现：${literals.join(', ')}`)
  // 且每个参数都必须是形如 `XXX_FIELD` 的常量引用。
  for (const arg of calls) {
    assert.match(arg, /^[A-Z][A-Z_]*_FIELD$/, `写入口参数不像字段常量：${arg}`)
  }
})

test('两端都默认开启（默认值必须一致）', () => {
  const hostGroup = capture(hostSource, /DEFAULT_GROUP_AUTO_EXPAND\s*=\s*(true|false)/, 'Host group 默认值')
  const hostReasoning = capture(hostSource, /DEFAULT_REASONING_AUTO_EXPAND\s*=\s*(true|false)/, 'Host 思考默认值')
  const hostTool = capture(hostSource, /DEFAULT_TOOL_AUTO_EXPAND\s*=\s*(true|false)/, 'Host 工具默认值')
  const clientGroup = capture(clientSettings, /groupAutoExpand:\s*(true|false)/, 'Client group 默认值')
  const clientReasoning = capture(clientSettings, /reasoningAutoExpand:\s*(true|false)/, 'Client 思考默认值')
  const clientTool = capture(clientSettings, /toolAutoExpand:\s*(true|false)/, 'Client 工具默认值')
  assert.equal(clientGroup, hostGroup, 'group 开关的默认值不一致')
  assert.equal(clientReasoning, hostReasoning, '思考开关的默认值不一致')
  assert.equal(clientTool, hostTool, '工具开关的默认值不一致')
})

// ── P8：收起时机枚举 ────────────────────────────────────────────────────

test('收起时机的取值列表两端一致', () => {
  // Host 写 `COLLAPSE_TIMINGS = [...] as const`；Client 写
  // `COLLAPSE_TIMINGS: readonly CollapseTiming[] = [...]`——中间有类型注解，
  // 所以不能用 `\s*=`，要允许标注段（其中含 `[]`，故排除的是 `=` 与换行）。
  /**
   * 从源码里取出某个时机的数组字面量成员。
   *
   * 用 `\b` 加左边界：否则 `COLLAPSE_TIMINGS` 会先命中带同名后缀的常量。
   * @param {string} source - 源码文本。
   * @param {string} name - 常量名（如 `COLLAPSE_TIMINGS`）。
   * @returns {string[]} 成员列表。
   */
  const membersOf = (source, name) => {
    const block = new RegExp(`\\b${name}[^=\\n]*=\\s*\\[([^\\]]*)\\]`).exec(source)
    assert.ok(block !== null, `找不到 ${name} 的定义`)
    return [...block[1].matchAll(/'([^']+)'/g)].map(match => match[1])
  }
  const clientSource = read('src/client/collapse-timing.ts')
  // 思考与工具**共用同一份列表**，两端各只有这一个常量（2026-10-23 统一）。
  assert.deepEqual(membersOf(clientSource, 'COLLAPSE_TIMINGS'), membersOf(hostSource, 'COLLAPSE_TIMINGS'),
    'COLLAPSE_TIMINGS 两端必须逐字一致，否则 Host 会拒写 Client 发来的枚举值')
  assert.deepEqual(membersOf(hostSource, 'COLLAPSE_TIMINGS'),
    ['self', 'next-call', 'next-node', 'group'], '顺序 = 收起由早到晚')
})

test('不再存在思考/工具专用时机列表（统一为一份）', () => {
  // 此前 `REASONING_COLLAPSE_TIMINGS`（3 个）与 `TOOL_COLLAPSE_TIMINGS`（4 个）
  // 分叉，理由是「一个 step 只有一段思考」。该理由不成立为裁剪依据：思考同样
  // 有 anchorSeq，next-call 在它身上真实成立。这里守住「不要再分叉」。
  for (const name of ['REASONING_COLLAPSE_TIMINGS', 'TOOL_COLLAPSE_TIMINGS']) {
    assert.equal(new RegExp(`\\b${name}\\b`).test(hostSource), false, `Host 侧不应再有 ${name}`)
    assert.equal(new RegExp(`\\b${name}\\b`).test(read('src/client/collapse-timing.ts')), false,
      `Client 侧不应再有 ${name}`)
    assert.equal(new RegExp(`\\b${name}\\b`).test(read('src/client/settings-card.tsx')), false,
      `设置卡片不应再有 ${name}`)
  }
})

test('两个时机字段的取值集合相同（思考与工具对称）', () => {
  // schema 里两个字段都必须是 `z.union([...COLLAPSE_TIMINGS])`：
  // 若某一方偷偷写回自己的窄集合，这里会抓到。
  const unions = [...hostSource.matchAll(/(REASONING|TOOL)_COLLAPSE_TIMING_FIELD\]:\s*z\.union\(\[\.\.\.(\w+)\]\)/g)]
  assert.equal(unions.length, 2, `应有 2 个时机字段，实际 ${unions.length}`)
  for (const match of unions) {
    assert.equal(match[2], 'COLLAPSE_TIMINGS', `${match[1]} 字段必须用 COLLAPSE_TIMINGS`)
  }
})

test('收起时机的默认值两端一致', () => {
  const hostReasoning = capture(hostSource,
    /DEFAULT_REASONING_COLLAPSE_TIMING:\s*\w+\s*=\s*'([^']+)'/, 'Host 思考时机默认值')
  const hostTool = capture(hostSource,
    /DEFAULT_TOOL_COLLAPSE_TIMING:\s*\w+\s*=\s*'([^']+)'/, 'Host 工具时机默认值')
  const clientReasoning = capture(clientSettings,
    /reasoningCollapseTiming:\s*'([^']+)'/, 'Client 思考时机默认值')
  const clientTool = capture(clientSettings, /toolCollapseTiming:\s*'([^']+)'/, 'Client 工具时机默认值')
  assert.equal(clientReasoning, hostReasoning, '思考时机默认值不一致')
  assert.equal(clientTool, hostTool, '工具时机默认值不一致')
  // 默认值由用户指定为「下一批操作出现时」（2026-10-23）。
  // 注意：这**不等于**更早的旧行为，改默认值会改变已安装用户的行为，
  // 所以这条断言同时是"默认值被改动"的警报。
  assert.equal(hostReasoning, 'next-node', '思考默认应为「下一批操作出现时」')
  assert.equal(hostTool, 'next-node', '工具默认应为「下一批操作出现时」')
})

test('两个时机下拉共用同一份选项（思考与工具对称）', () => {
  // 设置卡片里两个**时机** SelectRow 的 options 必须是同一个 timingOptions。
  // 若某一方偷偷用自己的窄列表，用户就会看到两个不一样的下拉。
  const source = read('src/client/settings-card.tsx')
  assert.equal(/reasoningTimingOptions/.test(source), false, '不应再有思考专用选项列表')
  assert.equal(/toolTimingOptions/.test(source), false, '不应再有工具专用选项列表')
  // 卡片现在有三个下拉：两个时机 + 一个隐藏范围。时机那两个必须共用。
  const usages = [...source.matchAll(/options=\{(\w+)\}/g)].map(match => match[1])
  assert.deepEqual(usages, ['timingOptions', 'timingOptions', 'scopeOptions'],
    '两个时机下拉共用 timingOptions；隐藏范围用自己那一份 scopeOptions')
})

// ── P9：查看按钮的隐藏范围 ──────────────────────────────────────────────

test('隐藏范围取值列表两端一致', () => {
  /**
   * 从源码里取出某个数组字面量的成员。
   *
   * 用 `\b` 加左边界：否则短名会命中长名的后缀（与 COLLAPSE_TIMINGS 同款问题）。
   * @param {string} source - 源码文本。
   * @param {string} name - 常量名。
   * @returns {string[]} 成员列表。
   */
  const membersOf = (source, name) => {
    const block = new RegExp(`\\b${name}[^=\\n]*=\\s*\\[([^\\]]*)\\]`).exec(source)
    assert.ok(block !== null, `找不到 ${name} 的定义`)
    return [...block[1].matchAll(/'([^']+)'/g)].map(match => match[1])
  }
  assert.deepEqual(
    membersOf(read('src/client/inspect-button-scope.ts'), 'INSPECT_BUTTON_HIDE_SCOPES'),
    membersOf(hostSource, 'INSPECT_BUTTON_HIDE_SCOPES'),
    '两端必须逐字一致，否则 Host 会拒写 Client 发来的枚举值',
  )
  assert.deepEqual(membersOf(hostSource, 'INSPECT_BUTTON_HIDE_SCOPES'), ['off', 'current', 'all'],
    '顺序 = 下拉展示顺序 = 从松到紧')
})

test('隐藏范围默认值三处一致且为 off', () => {
  // 默认值必须是 off：改成别的会让已安装用户升级后凭空少一个入口。
  const hostDefault = capture(hostSource,
    /DEFAULT_INSPECT_BUTTON_HIDE_SCOPE:\s*\w+\s*=\s*'([^']+)'/, 'Host 隐藏范围默认值')
  const clientDefault = capture(read('src/client/inspect-button-scope.ts'),
    /DEFAULT_INSPECT_BUTTON_HIDE_SCOPE:\s*\w+\s*=\s*'([^']+)'/, 'Client 隐藏范围默认值')
  assert.equal(hostDefault, 'off', '默认必须是 off，保证已安装用户行为不变')
  assert.equal(clientDefault, hostDefault, '判据模块与 Host 的默认值不一致')
  // 客户端快照引用上面那个常量（单一数据源），因此这里断言的是"引用关系"
  // 而不是重复写一遍字面量——两处各写一个 'off' 反而会漂移。
  assert.match(clientSettings,
    /inspectButtonHideScope:\s*DEFAULT_INSPECT_BUTTON_HIDE_SCOPE/,
    '客户端快照的默认值必须引用 DEFAULT_INSPECT_BUTTON_HIDE_SCOPE，避免与判据模块漂移')
})

test('schema 里隐藏范围字段用取值列表做 union', () => {
  // 用 z.string() 而非 union 时 Host 会接受任意值，写入端先坏在这里。
  assert.match(hostSource,
    /INSPECT_BUTTON_HIDE_SCOPE_FIELD\]:\s*z\.union\(\[\.\.\.INSPECT_BUTTON_HIDE_SCOPES\]\)/,
    '字段必须用 z.union([...INSPECT_BUTTON_HIDE_SCOPES])，否则 Host 会接受非法值')
})

test('客户端快照接管时把隐藏范围读进设置', () => {
  // attachSettingsForm 的 read() 逐字段取值，漏一个字段会让该设置永远停在默认值：
  // UI 上能改、写进 Host 也成功，但渲染层读到的还是旧值——不报错、只是不生效。
  const source = read('src/client/settings.ts')
  assert.match(source,
    /inspectButtonHideScope:\s*\n?\s*value\?\.inspectButtonHideScope\s*\?\?\s*DEFAULT_SETTINGS\.inspectButtonHideScope/,
    'attachSettingsForm 的 read() 必须读取 inspectButtonHideScope')
  assert.match(source,
    /&&\s*next\.inspectButtonHideScope\s*===\s*current\.inspectButtonHideScope/,
    'sync() 的比较必须包含 inspectButtonHideScope，否则该字段变化不会通知订阅者')
})

test('「运行中隐藏」的判据必须与工具行的展开判据同源', () => {
  // 两处调用同一个 toolRowAutoOpen：use-tool-disclosure 决定行是否展开，
  // AutoToolCallTree 决定「查看」按钮是否隐藏。各算各的会出现
  // 「行已经收起了、按钮却还藏着」这种不一致——那正是 P9 第一版的错误。
  const disclosure = read('src/client/tool/use-tool-disclosure.ts')
  const wrapper = read('src/client/tool/AutoToolCallTree.tsx')
  for (const [name, source] of [['use-tool-disclosure', disclosure], ['AutoToolCallTree', wrapper]]) {
    assert.match(source, /toolRowAutoOpen\(/, `${name} 必须调用 toolRowAutoOpen`)
    // 不允许再各自拼 autoOpenFor。只匹配「代码调用」——即缩进后的语句位置，
    // 不匹配注释与行内代码引用（如 `autoOpenFor()`）。
    assert.equal(/^\s+(?:const|return)[^\n]*autoOpenFor\(/m.test(source), false,
      `${name} 不应在代码里直接调用 autoOpenFor；一律经 toolRowAutoOpen`)
  }
  // 包裹层必须把 autoOpen（行级）传给判据，而不是 group.auto（组级）。
  assert.match(wrapper, /inspectCallFor\(\{[\s\S]*?autoOpen,/,
    'AutoToolCallTree 必须用 autoOpen（行级）而不是 group.auto（组级）作为档位判据')
})

test('四个时机的文案键在思考与工具两侧都齐备', () => {
  // 文案是唯一一处"写错不报错、只是显示空白下拉项"的地方。
  const zhSource = read('src/client/locales.ts')
  for (const key of ['timingSelf', 'timingNextCall', 'timingNextNode', 'timingGroup']) {
    const zhHits = [...zhSource.matchAll(new RegExp(`\\b${key}:`, 'g'))]
    // 中文与英文各一处。
    assert.equal(zhHits.length, 2, `${key} 应在 zh 与 en 中各出现一次，实际 ${zhHits.length}`)
  }
  // TIMING_LABEL_KEYS 必须覆盖全部四个取值。
  // 注意键可能是裸标识符（`self:`）或带引号（`'next-call':`），两种都要认。
  const cardSource = read('src/client/settings-card.tsx')
  for (const [timing, key] of [
    ['self', 'timingSelf'], ['next-call', 'timingNextCall'],
    ['next-node', 'timingNextNode'], ['group', 'timingGroup'],
  ]) {
    const quoted = timing.includes('-') ? `'${timing}'` : timing
    assert.match(cardSource, new RegExp(`${quoted}:\\s*'${key}'`),
      `TIMING_LABEL_KEYS 缺少 ${timing} → ${key}`)
  }
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

// ── 滚动跟随：CSS 契约 ──────────────────────────────────────────────────

test('group body 必须关闭浏览器滚动锚定（否则自动滚动会偶发失效）', () => {
  // 这一条是"写错不报错、只在真机上偶发失效"的典型：`.body` 若保留
  // `overflow-anchor: auto`（默认），内容在上方变高时浏览器会主动改
  // scrollTop，产生原生 scroll 事件 → `ScrollFollow.sample()` 的默认判据
  // 「scrollTop 变了 = 读者滚了」→ 把 following 关掉。而 following 为 false
  // 后只有 toBottom 能恢复，它的准入条件正是 "已在跟随"，于是死锁。
  //
  // 上游对**外层**滚动容器做了同样的事（`ChatView.module.css:36-39` 的
  // `overflow-anchor: none`），这里对齐它。详见 `spec/FIX-SCROLL.md`。
  const css = read('src/client/flow/AutoGroupSeat.module.css')
  const bodyBlock = /\.body\s*\{([^}]*)\}/.exec(css)
  assert.ok(bodyBlock !== null, '找不到 .body 规则')
  assert.match(bodyBlock[1], /overflow-anchor:\s*none/,
    '.body 必须声明 overflow-anchor: none。删掉它会让自动滚动在大段思考'
    + '展开时偶发失效，且只在真机上偶发、单测与类型检查都不会报错。')
})
