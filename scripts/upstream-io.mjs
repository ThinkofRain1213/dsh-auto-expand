/**
 * 上游 checkout 的定位、哈希与记录读写。
 *
 * 被 `record-upstream.mjs` 与 `check-drift.mjs` 共用。刻意保持零依赖
 * （只用 node: 内置模块），这样 `pnpm drift` 在没装依赖的环境也能跑。
 */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PACKAGES } from './upstream-manifest.mjs'

/** 项目根目录（本文件在 scripts/ 下）。 */
export const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** 记录文件的位置。 */
export const RECORD_PATH = join(PROJECT_ROOT, 'spec', 'upstream.json')

/**
 * 定位上游 deepseek-harness checkout。
 *
 * 顺序：`--upstream <path>` → `DSH_SOURCE_CHECKOUT` 环境变量 → 项目同级的
 * `deepseek-harness`。找不到返回 `null`（不是错误：普通用户只装了 DSH 应用，
 * 没有源码 checkout，这时漂移检测应当跳过而不是失败）。
 *
 * **显式指定时不做回退**：`--upstream` 指向一个无效目录时直接返回 null，
 * 而不是悄悄退回默认路径——那样用户会以为检测的是自己指定的 checkout。
 * @param argv - 命令行参数（不含 node 与脚本名）。
 * @returns checkout 根目录，或 null。
 */
export function resolveCheckout(argv) {
  const explicit = []
  const flagIndex = argv.indexOf('--upstream')
  if (flagIndex !== -1 && argv[flagIndex + 1] !== undefined) {
    explicit.push(resolve(argv[flagIndex + 1]))
  }
  if (process.env.DSH_SOURCE_CHECKOUT !== undefined && process.env.DSH_SOURCE_CHECKOUT !== '') {
    explicit.push(resolve(process.env.DSH_SOURCE_CHECKOUT))
  }
  if (explicit.length > 0) return explicit.find(isHarnessCheckout) ?? null

  const fallback = resolve(PROJECT_ROOT, '..', 'deepseek-harness')
  return isHarnessCheckout(fallback) ? fallback : null
}

/**
 * 判断一个目录是不是可用的 harness checkout。
 * @param candidate - 待检查的目录。
 * @returns 是否含有本插件依赖的全部上游源码根。
 */
function isHarnessCheckout(candidate) {
  if (!existsSync(candidate)) return false
  return Object.values(PACKAGES).every(pkg => existsSync(join(candidate, pkg.sourceRoot)))
}

/**
 * 计算文件内容的规范化哈希。
 *
 * **换行必须规范化**：Windows 上 `core.autocrlf` 会把 checkout 的 LF 变成
 * CRLF，直接哈希会让同一份代码在不同机器上得出不同结果，漂移检测就成了
 * 噪声源。
 * @param path - 文件绝对路径。
 * @returns `sha256-<hex>`。
 */
export function hashFile(path) {
  const text = readFileSync(path, 'utf8').replace(/\r\n/g, '\n')
  return `sha256-${createHash('sha256').update(text, 'utf8').digest('hex')}`
}

/**
 * 读取上游某个包的版本号。
 * @param checkout - 上游根目录。
 * @param packageName - 包名。
 * @returns 版本字符串，读不到时返回 null。
 */
export function readPackageVersion(checkout, packageName) {
  const sourceRoot = PACKAGES[packageName]?.sourceRoot
  if (sourceRoot === undefined) return null
  // 从 sourceRoot 向上找第一个带 package.json 的目录，避免写死层级。
  let directory = resolve(checkout, sourceRoot)
  for (let depth = 0; depth < 4; depth += 1) {
    const packageJson = join(directory, 'package.json')
    if (existsSync(packageJson)) {
      try {
        return JSON.parse(readFileSync(packageJson, 'utf8')).version ?? null
      } catch {
        return null
      }
    }
    directory = resolve(directory, '..')
  }
  return null
}

/**
 * 读取已有的记录文件。
 * @returns 记录对象；文件不存在时返回 null。
 */
export function readRecord() {
  if (!existsSync(RECORD_PATH)) return null
  try {
    return JSON.parse(readFileSync(RECORD_PATH, 'utf8'))
  } catch {
    return null
  }
}

/**
 * 写入记录文件。
 * @param record - 完整记录对象。
 */
export function writeRecord(record) {
  writeFileSync(RECORD_PATH, `${JSON.stringify(record, null, 2)}\n`, 'utf8')
}

/**
 * 读取上游 checkout 的 HEAD commit。
 * @param checkout - 上游根目录。
 * @returns 短 commit，读不到时返回 null。
 */
export function readHeadCommit(checkout) {
  const headPath = join(checkout, '.git', 'HEAD')
  if (!existsSync(headPath)) return null
  try {
    const head = readFileSync(headPath, 'utf8').trim()
    if (head.startsWith('ref: ')) {
      const refPath = join(checkout, '.git', head.slice(5).trim())
      if (existsSync(refPath)) return readFileSync(refPath, 'utf8').trim().slice(0, 10)
      // 打包过的 ref 在 packed-refs 里。
      const packedPath = join(checkout, '.git', 'packed-refs')
      if (!existsSync(packedPath)) return null
      const line = readFileSync(packedPath, 'utf8').split('\n').find(entry => entry.endsWith(` ${head.slice(5).trim()}`))
      return line === undefined ? null : line.slice(0, 10)
    }
    return head.slice(0, 10)
  } catch {
    return null
  }
}

/** 供脚本使用的路径拼接（避免各处重复 import node:path）。 */
export { isAbsolute, join, resolve }
