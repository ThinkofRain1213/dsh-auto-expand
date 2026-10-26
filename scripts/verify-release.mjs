/**
 * 发布就绪性检查。
 *
 * 发版会触及一些别的检查覆盖不到的事实，每一条都真出过错。这个脚本把它们钉死：
 *
 *   1. **版本一致** —— package.json、CHANGELOG 与该版本对应的章节必须同名；
 *   2. **locale 文案** —— 插件列表里显示的就是它，改功能却忘了改这里，
 *      用户看到的是旧描述；
 *   3. **打包清单** —— `files` 必须覆盖发布新增的文件，且不能误带 `scripts/`；
 *   4. **构建产物已入库** —— `files` 里有 `lib`，而 CI 用仓库里的 `lib` 发布；
 *      `lib/` 没提交或与 `src/` 不同步，发出去的包就是错的；
 *   5. **没有误提交的产物** —— 散落的 `.tgz`、临时脚本。
 *
 * 所有输入都从 package.json 推导，因此改了版本号却没写 CHANGELOG 章节时，
 * 这里会失败——这正是想要的约束。
 *
 * 用法：
 *   pnpm verify:release
 *
 * 退出码：0 = 可以发布；1 = 有未通过项。
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

const failures = []
/**
 * 记录一条断言。
 * @param label - 断言名。
 * @param ok - 是否通过。
 * @param detail - 可选的补充说明。
 */
const check = (label, ok, detail) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail === undefined ? '' : ` — ${detail}`}`)
  if (!ok) failures.push(label)
}

// ── 读取输入 ────────────────────────────────────────────────────────────
// 这些读取曾经直接裸跑，于是「CHANGELOG 缺失」这种本该被本脚本报出来的情况，
// 反而变成一条 ENOENT 堆栈、一条 PASS/FAIL 都没有。读取失败要作为一条失败项报出。
let manifest
try {
  manifest = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
} catch (error) {
  console.error(`无法读取 package.json：${error.message}`)
  process.exit(1)
}

const { name, version, files, engines } = manifest
const changelogPath = join(ROOT, 'CHANGELOG.md')
let changelog = null
try {
  changelog = readFileSync(changelogPath, 'utf8')
} catch {
  changelog = null
}

console.log(`包名    : ${name}`)
console.log(`版本    : ${version}`)
console.log('')

// ── 1. 版本一致 ─────────────────────────────────────────────────────────
check('package.json 有 name 与 version', Boolean(name) && Boolean(version))

if (changelog === null) {
  check('CHANGELOG.md 存在', false)
} else {
  check('CHANGELOG.md 存在', true)
  // 本版本对应的章节标题，例如 `## [0.1.0] — 2026-10-26`
  const escaped = version.replace(/\./g, '\\.')
  const heading = new RegExp(`^## \\[${escaped}\\][^\\n]*$`, 'm')
  const section = changelog.match(heading)
  check(`CHANGELOG 有 [${version}] 章节`, section !== null)

  // 该章节不能再挂着「未发布」——那是给还没发的版本用的占位。
  if (section !== null) {
    const rest = changelog.slice(section.index + section[0].length)
    const nextHeading = rest.search(/^## /m)
    const body = nextHeading === -1 ? rest : rest.slice(0, nextHeading)
    const titleLine = section[0]
    const stillUnreleased = /未发布|unreleased/i.test(titleLine) || /未发布|unreleased/i.test(body.slice(0, 200))
    check(`[${version}] 章节已标注发布日期（不带「未发布」）`, !stillUnreleased,
      stillUnreleased ? '标题或开头仍写着「未发布」' : undefined)
    // 发布日期要是个真实日期，别写占位符。
    check(`[${version}] 章节标题含日期`, /\d{4}-\d{2}-\d{2}/.test(titleLine), titleLine.trim())
  }
}

// ── 2. locale 文案 ──────────────────────────────────────────────────────
// 插件列表里显示什么，取决于这两个文件；它们与 README 是两处独立的文案。
for (const lang of ['zh', 'en']) {
  const path = join(ROOT, 'locale', `${lang}.json`)
  if (!existsSync(path)) {
    check(`locale/${lang}.json 存在`, false)
    continue
  }
  let parsed
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    check(`locale/${lang}.json 是合法 JSON`, false, error.message)
    continue
  }
  check(`locale/${lang}.json 是合法 JSON`, true)
  const meta = parsed.meta ?? {}
  check(`locale/${lang}.json 有 meta.title`, typeof meta.title === 'string' && meta.title.length > 0)
  check(`locale/${lang}.json 有 meta.description`, typeof meta.description === 'string' && meta.description.length > 0)
}

// ── 3. 打包清单 ─────────────────────────────────────────────────────────
check('package.json 有 files 数组', Array.isArray(files) && files.length > 0)

if (Array.isArray(files)) {
  // 发布必须带上的东西。
  for (const required of ['lib', 'cordis.patch.yml', 'README.md', 'LICENSE', 'CHANGELOG.md']) {
    check(`files 覆盖 ${required}`, files.includes(required))
  }
  // 不该发出去的：脚本与测试只用于开发。
  for (const forbidden of ['scripts', 'tests']) {
    check(`files 不包含 ${forbidden}/`, !files.includes(forbidden))
  }
  // locale 用通配符列出时要确认真的能匹配到文件。
  if (files.includes('locale/*.json')) {
    const localeFiles = readdirSync(join(ROOT, 'locale')).filter(f => f.endsWith('.json'))
    check('files 的 locale/*.json 能匹配到文件', localeFiles.length > 0, `${localeFiles.length} 个`)
  }
}

// ── 4. 构建产物已入库且与源码同步 ───────────────────────────────────────
// 这条是本项目特有的：`files` 发的是仓库里的 `lib/`，而不是发布时现构建的产物。
// 若 `lib/` 被 gitignore 或忘了提交，发出去的包会缺主入口。
if (Array.isArray(files) && files.includes('lib')) {
  for (const artifact of ['lib/index.js', 'lib/client.js']) {
    check(`${artifact} 存在`, existsSync(join(ROOT, artifact)))
  }
  let tracked = []
  try {
    tracked = execFileSync('git', ['ls-files', 'lib/'], { cwd: ROOT, encoding: 'utf8' })
      .split('\n').filter(Boolean)
  } catch {
    tracked = []
  }
  check('lib/ 已被 git 跟踪（CI 用它发布）', tracked.length > 0,
    tracked.length === 0 ? 'lib/ 未入库，检查 .gitignore 或忘了 git add' : `${tracked.length} 个文件`)
  check('.gitignore 不再忽略 lib/', !readFileSync(join(ROOT, '.gitignore'), 'utf8')
    .split('\n').some(line => line.trim() === 'lib/'))
}

// ── 5. 没有误提交的产物 ─────────────────────────────────────────────────
const stray = readdirSync(ROOT).filter(entry => entry.endsWith('.tgz'))
check('仓库根目录没有 .tgz 产物', stray.length === 0, stray.length > 0 ? stray.join(', ') : undefined)

// ── 汇总 ────────────────────────────────────────────────────────────────
console.log('')
if (failures.length === 0) {
  console.log(`✅ 发布就绪：${name}@${version}`)
  process.exit(0)
}
console.log(`❌ ${failures.length} 项未通过：`)
for (const item of failures) console.log(`   - ${item}`)
process.exit(1)
