/**
 * 生成/刷新 `spec/upstream.json`。
 *
 * 只在**人工确认克隆与上游已对齐**之后运行。它记录每个克隆文件在上游 checkout
 * 里的内容哈希；`check-drift.mjs` 之后靠这些哈希判断上游是否变了。
 *
 * 用法：
 *   pnpm drift:record                       # 自动定位 ../deepseek-harness
 *   pnpm drift:record -- --upstream <path>  # 指定 checkout
 */
import { PACKAGES, UPSTREAM_COMMIT, ENTRIES, resolveSource } from './upstream-manifest.mjs'
import {
  hashFile, readHeadCommit, readPackageVersion, resolveCheckout, writeRecord,
} from './upstream-io.mjs'
import { existsSync } from 'node:fs'

const checkout = resolveCheckout(process.argv.slice(2))
if (checkout === null) {
  console.error('找不到上游 deepseek-harness checkout。')
  console.error('用 `--upstream <path>` 或环境变量 `DSH_SOURCE_CHECKOUT` 指定，')
  console.error('或把 checkout 放在与本项目同级的 `../deepseek-harness`。')
  process.exit(2)
}

const head = readHeadCommit(checkout)
const packages = {}
for (const name of Object.keys(PACKAGES)) {
  packages[name] = {
    version: readPackageVersion(checkout, name),
    recorded: PACKAGES[name].version,
    sourceRoot: PACKAGES[name].sourceRoot,
  }
}

const files = []
const missing = []
for (const entry of ENTRIES) {
  const sources = []
  for (const source of entry.sources) {
    const { pkg, path } = resolveSource(source, checkout)
    if (!existsSync(path)) {
      missing.push(`${source}  ← ${entry.local}`)
      continue
    }
    sources.push({ source, package: pkg, sha256: hashFile(path) })
  }
  if (sources.length === 0) continue
  files.push({ local: entry.local, kind: entry.kind, sources })
}

if (missing.length > 0) {
  console.error('以下上游来源不存在，清单可能已过期：')
  for (const item of missing) console.error(`  ✗ ${item}`)
  process.exit(1)
}

writeRecord({
  $comment: '由 `pnpm drift:record` 生成。记录每个克隆文件在上游 checkout 里的内容哈希。',
  commit: head ?? UPSTREAM_COMMIT,
  generatedAt: new Date().toISOString(),
  packages,
  files,
})

console.log(`已写入 spec/upstream.json`)
console.log(`  上游 checkout : ${checkout}`)
console.log(`  HEAD          : ${head ?? '(未知)'}`)
console.log(`  记录文件数    : ${files.length}`)
for (const [name, info] of Object.entries(packages)) {
  const mark = info.version === info.recorded ? '✓' : '✗'
  console.log(`  ${mark} ${name} ${info.version ?? '(未知)'}（清单记录 ${info.recorded}）`)
}
