/**
 * 上游漂移检测。
 *
 * 本插件克隆了 23 个官方源文件（`scripts/upstream-manifest.mjs` 是清单）。
 * 上游一旦改动，克隆会**静默**偏离——P4 的事故就是这样发生的：接管了一个
 * 渲染路径，却没发现它还有别的分支。
 *
 * `spec/upstream.json` 记录了每个克隆文件在克隆时刻的上游内容哈希。本脚本
 * 重新计算并比对，给升级后的第一件事提供一个明确的入口。
 *
 * 用法：
 *   pnpm drift                               # 自动定位 ../deepseek-harness
 *   pnpm drift -- --upstream <path>          # 指定 checkout
 *
 * 退出码：0 = 无漂移；1 = 有漂移；2 = 找不到上游 checkout（跳过）
 */
import { PACKAGES, ENTRIES } from './upstream-manifest.mjs'
import {
  hashFile, readHeadCommit, readPackageVersion, readRecord, resolveCheckout,
} from './upstream-io.mjs'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const record = readRecord()
if (record === null) {
  console.error('还没有 spec/upstream.json。先运行 `pnpm drift:record`。')
  process.exit(2)
}

const checkout = resolveCheckout(process.argv.slice(2))
if (checkout === null) {
  console.log('跳过漂移检测：找不到上游 deepseek-harness checkout。')
  console.log('用 `--upstream <path>` 或环境变量 `DSH_SOURCE_CHECKOUT` 指定，')
  console.log('或把 checkout 放在与本项目同级的 `../deepseek-harness`。')
  process.exit(2)
}

/** 漂移条目。 */
const drifted = []
/** 上游已删除的文件。 */
const deleted = []
/** 记录里的来源路径找不到（清单/记录过期）。 */
const unreadable = []

const head = readHeadCommit(checkout)
console.log(`上游 checkout : ${checkout}`)
console.log(`HEAD          : ${head ?? '(未知)'}`)
console.log(`记录时 HEAD   : ${record.commit ?? '(未知)'}`)
if (head !== null && record.commit !== null && record.commit !== undefined && head !== record.commit) {
  console.log('注意：checkout HEAD 与记录时不同，下面逐文件比对才是准确结论。')
}

// ── 清单与记录的一致性 ──────────────────────────────────────────────────
// `record.files` 是检查的输入；如果清单里新增了克隆文件而记录没更新，新文件
// 会被静默漏检——这比没有漂移检测更危险（虚假安全感）。因此先对齐两者。
const recordedLocals = new Set((record.files ?? []).map(file => file.local))
const notRecorded = ENTRIES.filter(entry => !recordedLocals.has(entry.local)).map(entry => entry.local)
const manifestLocals = new Set(ENTRIES.map(entry => entry.local))
const orphaned = (record.files ?? [])
  .filter(file => !manifestLocals.has(file.local))
  .map(file => file.local)

// ── 包版本 ──────────────────────────────────────────────────────────────
const versionIssues = []
for (const [name, info] of Object.entries(record.packages ?? {})) {
  const live = readPackageVersion(checkout, name)
  if (live !== null && live !== info.version) {
    versionIssues.push({ name, recorded: info.version, live })
  }
}

// ── 逐文件哈希 ──────────────────────────────────────────────────────────
for (const file of record.files ?? []) {
  for (const source of file.sources ?? []) {
    const sourceRoot = PACKAGES[source.package]?.sourceRoot
    if (sourceRoot === undefined) {
      unreadable.push({ local: file.local, source: source.source, reason: '未知包' })
      continue
    }
    // `source` 形如 `ui-chat:chat/ChatFlow.tsx`，取冒号后的路径。
    const relative = source.source.slice(source.source.indexOf(':') + 1)
    const path = join(checkout, sourceRoot, relative)
    if (!existsSync(path)) {
      deleted.push({ local: file.local, source: source.source })
      continue
    }
    const live = hashFile(path)
    if (live !== source.sha256) drifted.push({ local: file.local, kind: file.kind, source: source.source })
  }
}

// ── 报告 ────────────────────────────────────────────────────────────────
const total = (record.files ?? []).reduce((sum, file) => sum + (file.sources?.length ?? 0), 0)
const staleRecord = notRecorded.length > 0 || orphaned.length > 0

if (versionIssues.length === 0 && drifted.length === 0 && deleted.length === 0
  && unreadable.length === 0 && !staleRecord) {
  console.log(`\n✅ 无漂移：${total} 个上游来源全部与记录一致。`)
  process.exit(0)
}

console.log('')
if (notRecorded.length > 0) {
  console.log('❌ 清单里有克隆文件未被记录（漂移检测会漏掉它们）：')
  for (const local of notRecorded) console.log(`   ${local}`)
}
if (orphaned.length > 0) {
  console.log('⚠️  记录里有清单已移除的条目：')
  for (const local of orphaned) console.log(`   ${local}`)
}
if (versionIssues.length > 0) {
  console.log('❌ 上游包版本已变（克隆必须重新对照）：')
  for (const issue of versionIssues) {
    console.log(`   ${issue.name}: ${issue.recorded} → ${issue.live}`)
  }
}
if (deleted.length > 0) {
  console.log('❌ 上游文件已不存在（可能被重命名或删除）：')
  for (const item of deleted) console.log(`   ${item.source}  ← ${item.local}`)
}
if (unreadable.length > 0) {
  console.log('❌ 记录里的来源无法解析：')
  for (const item of unreadable) console.log(`   ${item.source}（${item.reason}）← ${item.local}`)
}
if (drifted.length > 0) {
  console.log('❌ 上游内容已变：')
  for (const item of drifted) {
    const hint = item.kind === 'verbatim' ? '整份克隆，必须逐行重新对照' : '部分摘取，复核被摘片段即可'
    console.log(`   ${item.local}`)
    console.log(`      ← ${item.source}`)
    console.log(`      ${hint}`)
  }
}

console.log('')
console.log(`共 ${drifted.length + deleted.length + unreadable.length} 处内容漂移 / ${total} 个来源。`)
if (staleRecord) console.log(`另有 ${notRecorded.length + orphaned.length} 处清单与记录不一致。`)
console.log('处理完并确认克隆已对齐后，运行 `pnpm drift:record` 刷新记录。')

// ── 顺带检查 package.json 的 peer 范围是否仍覆盖记录版本 ────────────────
checkPeerRanges()

// 退出码与"有漂移"对齐，这样 `pnpm drift && ...` 能在 CI 里起到门禁作用。
process.exit(1)

/**
 * 检查 `package.json` 的 peerDependencies 是否仍覆盖记录的上游版本。
 *
 * 这条容易漏：克隆已对齐、但 peer 范围还卡在旧 minor 上时，装到新 DSH 会
 * 报 peer 冲突或静默装错版本。
 */
function checkPeerRanges() {
  const packageJsonPath = join(process.cwd(), 'package.json')
  if (!existsSync(packageJsonPath)) return
  let manifest
  try {
    manifest = JSON.parse(readFileSync(packageJsonPath, 'utf8'))
  } catch {
    return
  }
  const peers = manifest.peerDependencies ?? {}
  for (const [name, info] of Object.entries(record.packages ?? {})) {
    const range = peers[name]
    if (range === undefined || info.version === null) continue
    if (!satisfiesSimple(range, info.version)) {
      console.log(`⚠️  ${name} 的 peer 范围 ${range} 可能不覆盖记录版本 ${info.version}。`)
    }
  }
}

/**
 * 极简 semver 范围判断，只支持本仓库实际用到的三种写法：
 * `>=x.y.z-rc.n <x.y+1.0`、`~x.y.z`、精确版本。
 * @param range - 范围字符串。
 * @param version - 待判断版本。
 * @returns 是否可能覆盖（判断不了时返回 true，避免误报）。
 */
function satisfiesSimple(range, version) {
  const [base] = version.split('-')
  const baseParts = base.split('.').map(Number)
  const comparators = range.trim().split(/\s+/)
  for (const comparator of comparators) {
    if (comparator.startsWith('>=')) {
      const bound = comparator.slice(2).split('-')[0].split('.').map(Number)
      if (compare(baseParts, bound) < 0) return false
    } else if (comparator.startsWith('<')) {
      const bound = comparator.slice(1).split('-')[0].split('.').map(Number)
      if (compare(baseParts, bound) >= 0) return false
    } else if (comparator.startsWith('~')) {
      const bound = comparator.slice(1).split('-')[0].split('.').map(Number)
      if (baseParts[0] !== bound[0] || baseParts[1] !== bound[1]) return false
    } else if (/^\d/.test(comparator)) {
      if (comparator !== base) return false
    }
  }
  return true
}

/**
 * 按段比较两个版本号。
 * @param left - 版本段。
 * @param right - 版本段。
 * @returns 负数 / 0 / 正数。
 */
function compare(left, right) {
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const a = left[index] ?? 0
    const b = right[index] ?? 0
    if (a !== b) return a - b
  }
  return 0
}
