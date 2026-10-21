/**
 * 克隆清单的自检。
 *
 * 漂移检测的价值完全取决于清单是否完整：**新增克隆文件却忘了登记**时，
 * `pnpm drift` 会静默漏掉它，比没有漂移检测更危险（给人虚假的安全感）。
 *
 * 两条断言：
 *  1. 清单里的每个 `local` 都真实存在（改名/删除后清单必须同步）。
 *  2. 源码里每个声明了「克隆自」的文件都在清单里。
 */
import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { test } from 'node:test'
import { ENTRIES, PACKAGES } from '../scripts/upstream-manifest.mjs'
import { PROJECT_ROOT } from '../scripts/upstream-io.mjs'

/**
 * 把平台路径转成正斜杠。
 * @param path - 平台路径。
 * @returns 正斜杠路径。
 */
function toPosix(path) {
  return sep === '/' ? path : path.split(sep).join('/')
}

/**
 * 递归收集目录下的源码与样式文件。
 * @param directory - 起始目录。
 * @param out - 收集结果的数组。
 */
function collectSources(directory, out) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue
    const absolute = join(directory, entry.name)
    if (entry.isDirectory()) {
      collectSources(absolute, out)
      continue
    }
    if (!/\.(?:ts|tsx|css)$/.test(entry.name)) continue
    out.push(toPosix(relative(PROJECT_ROOT, absolute)))
  }
}

test('清单里的每个本地文件都存在', () => {
  const missing = ENTRIES
    .filter(entry => !existsSync(join(PROJECT_ROOT, entry.local)))
    .map(entry => entry.local)
  assert.deepEqual(missing, [], `以下清单条目指向不存在的文件：\n${missing.join('\n')}`)
})

test('每个克隆文件都已在清单里登记', () => {
  const files = []
  collectSources(join(PROJECT_ROOT, 'src', 'client'), files)
  const registered = new Set(ENTRIES.map(entry => entry.local))

  // 头部注释里声明了克隆出处的文件，必须能在清单里找到。
  // 只读前 16 行：出处固定写在文件头部。
  const unregistered = []
  let declaredCount = 0
  for (const file of files) {
    const head = readFileSync(join(PROJECT_ROOT, file), 'utf8').split('\n').slice(0, 16).join('\n')
    const declared = head.includes('克隆自') || /上游：@deepseek-ai\//.test(head)
    if (!declared) continue
    declaredCount += 1
    if (!registered.has(file)) unregistered.push(file)
  }
  assert.deepEqual(unregistered, [],
    `以下文件声明了克隆出处但未在 scripts/upstream-manifest.mjs 登记，\n`
    + `漂移检测会漏掉它们：\n${unregistered.join('\n')}`)
  // 防止检测本身失效（注释写法变了、扫描路径写错）导致这条测试空转。
  assert.ok(declaredCount >= 15,
    `只识别到 ${declaredCount} 个声明了克隆出处的文件，检测逻辑可能已失效`)
})

test('清单里每个条目都有至少一个上游来源', () => {
  for (const entry of ENTRIES) {
    assert.ok(Array.isArray(entry.sources) && entry.sources.length > 0,
      `${entry.local} 没有上游来源`)
    for (const source of entry.sources) {
      assert.match(source, /^[a-z-]+:/, `${entry.local} 的来源格式错误：${source}`)
    }
    assert.ok(entry.kind === 'verbatim' || entry.kind === 'partial',
      `${entry.local} 的 kind 必须是 verbatim 或 partial，实际 ${entry.kind}`)
  }
})

test('清单引用的包都在 PACKAGES 里声明了版本', () => {
  for (const entry of ENTRIES) {
    for (const source of entry.sources) {
      const alias = source.slice(0, source.indexOf(':'))
      const known = alias === 'ui-chat' || alias === 'ui-conversation'
      assert.ok(known, `${entry.local} 引用了未知的包短名：${alias}`)
    }
  }
  for (const [name, info] of Object.entries(PACKAGES)) {
    assert.match(name, /^@deepseek-ai\//, `包名不合法：${name}`)
    assert.match(info.version, /^\d+\.\d+\.\d+/, `${name} 的版本号不合法：${info.version}`)
    assert.ok(info.sourceRoot.startsWith('packages/'), `${name} 的 sourceRoot 不合法：${info.sourceRoot}`)
  }
})
