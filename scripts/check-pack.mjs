/**
 * 发布产物自检。
 *
 * `pnpm verify` 检查的是源码与构建；这里检查**用户实际拿到的东西**。
 * 不调用 `npm pack`：那需要一个跨平台的子进程调用（Windows 上只能走
 * `shell: true`），而本仓库的 `files` 规则足够简单，直接按规则收集更快、
 * 更可控，也不受 `.gitignore` 之外的隐式行为影响。
 *
 * 四项检查：
 *  1. `files` 声明的路径全部真实存在（写错目录名时本地看不出来）。
 *  2. `exports` 的每个非通配条目都落在 `files` 的覆盖范围内 —— 这是最容易
 *     漏的一类发布事故：本地一切正常，用户 import 时 404。
 *  3. Host 产物没有把 `@deepseek-ai/schemastery` 打包进去（会把 1.7 kB
 *     涨成 35 kB，并制造第二个 schema 实例）。
 *  4. 客户端产物把平台模块全部 external（否则两份 React / 两份 slot 注册表）。
 *
 * 用法：`pnpm pack:check`（会先 build）
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { PROJECT_ROOT } from './upstream-io.mjs'

/** 打包后必须存在的文件。 */
const REQUIRED = [
  'package.json',
  'cordis.patch.yml',
  'icon.svg',
  'README.md',
  'lib/index.js',
  'lib/client.js',
  'src/index.ts',
  'src/client/index.ts',
  // `exports` 里的 `"./src/*"` 与各克隆组件的类型引用都落在 src 下。
  'src/client/contract/client-services.d.ts',
  'src/client/contract/slot-declarations.ts',
  'locale/zh.json',
  'locale/en.json',
]

/** Host 产物的体积上限（超过说明有依赖被打包）。 */
const HOST_BUNDLE_LIMIT = 8 * 1024

/** 客户端产物里**不允许**出现的模块标识（平台模块必须 external）。 */
const CLIENT_FORBIDDEN_MARKERS = ['react.development', 'react.production', 'scheduler.development']

const failures = []
const notes = []

const manifest = JSON.parse(readFileSync(join(PROJECT_ROOT, 'package.json'), 'utf8'))

/**
 * 把一个 `files` 条目展开成实际文件列表。
 * @param pattern - `files` 里的一个条目（目录、单文件或 `dir/*.ext`）。
 * @param out - 收集结果的集合（相对项目根、用 `/` 分隔）。
 */
function collect(pattern, out) {
  const absolute = join(PROJECT_ROOT, pattern)
  if (pattern.includes('*')) {
    // 只支持 `dir/*.ext` 这一种形式，本仓库的 locale 条目正好是它。
    const directory = join(PROJECT_ROOT, pattern.slice(0, pattern.lastIndexOf('/')))
    const suffix = pattern.slice(pattern.lastIndexOf('*') + 1)
    if (!existsSync(directory)) {
      failures.push(`files 条目指向不存在的目录：${pattern}`)
      return
    }
    for (const entry of readdirSync(directory)) {
      if (entry.startsWith('.')) continue
      if (suffix !== '' && !entry.endsWith(suffix)) continue
      out.add(toPosix(relative(PROJECT_ROOT, join(directory, entry))))
    }
    return
  }
  if (!existsSync(absolute)) {
    failures.push(`files 条目不存在：${pattern}`)
    return
  }
  if (statSync(absolute).isDirectory()) {
    walk(absolute, out)
    return
  }
  out.add(toPosix(relative(PROJECT_ROOT, absolute)))
}

/**
 * 递归收集目录下的文件，跳过 node_modules 与以 `.` 开头的条目。
 * @param directory - 起始目录。
 * @param out - 收集结果的集合。
 */
function walk(directory, out) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue
    const absolute = join(directory, entry.name)
    if (entry.isDirectory()) walk(absolute, out)
    else out.add(toPosix(relative(PROJECT_ROOT, absolute)))
  }
}

/**
 * 把路径分隔符统一成 `/`。
 * @param path - 平台路径。
 * @returns 正斜杠路径。
 */
function toPosix(path) {
  return sep === '/' ? path : path.split(sep).join('/')
}

// ── 1. files 覆盖集合 ───────────────────────────────────────────────────
const packed = new Set()
for (const pattern of manifest.files ?? []) collect(pattern, packed)
// npm 总会带上这几个，无论 files 怎么写。
for (const implicit of ['package.json', 'README.md', 'LICENSE']) {
  if (existsSync(join(PROJECT_ROOT, implicit))) packed.add(implicit)
}

for (const required of REQUIRED) {
  if (!packed.has(required)) failures.push(`缺少必需文件：${required}（不在 files 覆盖范围内）`)
}

// ── 2. exports 的可解析性 ───────────────────────────────────────────────
for (const [subpath, target] of Object.entries(manifest.exports ?? {})) {
  if (subpath === './package.json') continue
  if (subpath.includes('*')) {
    // 通配条目只看它的静态前缀有没有被 files 覆盖。
    const prefix = subpath.slice(0, subpath.indexOf('*'))
      .replace(/^\.\//, '')
      .replace(/\/$/, '')
    if (prefix === '') continue
    const covered = [...packed].some(path => path === prefix || path.startsWith(`${prefix}/`))
    if (!covered) failures.push(`exports["${subpath}"] 的前缀 "${prefix}" 没有被 files 覆盖`)
    continue
  }
  const targets = typeof target === 'string' ? { default: target } : target
  for (const [condition, path] of Object.entries(targets)) {
    if (path.includes('*')) continue
    const bare = path.replace(/^\.\//, '')
    if (!packed.has(bare)) {
      failures.push(`exports["${subpath}"].${condition} 指向 ${path}，但它不在发布包里`)
    }
  }
}

// ── 3. Host 产物 ────────────────────────────────────────────────────────
const hostPath = join(PROJECT_ROOT, 'lib', 'index.js')
const hostSize = statSync(hostPath).size
if (hostSize > HOST_BUNDLE_LIMIT) {
  failures.push(`lib/index.js 体积 ${hostSize} B 超过上限 ${HOST_BUNDLE_LIMIT} B，`
    + '可能把 @deepseek-ai/schemastery 或 @deepseek-ai/cordis 打包进来了')
} else {
  notes.push(`lib/index.js ${hostSize} B`)
}
const hostSource = readFileSync(hostPath, 'utf8')
// `@deepseek-ai/cordis` 在 Host 半边只是类型导入（`import type`），会被擦除，
// 所以只要求 schemastery 保持 external。
if (!hostSource.includes('"@deepseek-ai/schemastery"') && !hostSource.includes("'@deepseek-ai/schemastery'")) {
  failures.push('lib/index.js 里没有对 @deepseek-ai/schemastery 的 import —— 它可能被打包了')
}

// ── 4. 客户端产物 ───────────────────────────────────────────────────────
const clientPath = join(PROJECT_ROOT, 'lib', 'client.js')
const clientSource = readFileSync(clientPath, 'utf8')
for (const marker of CLIENT_FORBIDDEN_MARKERS) {
  if (clientSource.includes(marker)) failures.push(`lib/client.js 里出现了 ${marker} —— React 被重复打包`)
}
if (!clientSource.includes('__ModuleLoader__')) {
  failures.push('lib/client.js 不是 ModuleLoader 闭包格式')
}
notes.push(`lib/client.js ${(statSync(clientPath).size / 1024).toFixed(1)} kB`)

// ── 报告 ────────────────────────────────────────────────────────────────
console.log(`files 覆盖：${packed.size} 个文件`)
for (const note of notes) console.log(`  ${note}`)

if (failures.length > 0) {
  console.error('\n❌ 发布产物自检失败：')
  for (const failure of failures) console.error(`   ${failure}`)
  process.exit(1)
}

console.log('\n✅ 发布产物自检通过')
