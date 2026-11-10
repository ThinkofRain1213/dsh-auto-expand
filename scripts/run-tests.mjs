/**
 * 跨 Node 版本运行测试。
 *
 * 为什么需要这一层：测试直接 `import` 源码里的 `.ts` / `.tsx` 文件，而其中
 * `use-scroll-follow.ts` 用了**参数属性**（`constructor(private following: …)`），
 * 属于需要「转换」而非仅「剥离」的 TypeScript 语法。
 *
 * - Node 22.7 – 25：必须显式传 `--experimental-transform-types`，否则遇到
 *   参数属性会报 `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX`。
 * - Node 26+：该标志**已被移除**（转换默认内置），再传会直接 `bad option`
 *   导致测试一条都跑不起来。
 *
 * 把版本差异收在这一个文件里，`package.json` 的 `test` 脚本就不必关心它。
 *
 * 测试文件按目录自动发现并按名称排序，避免新增测试时漏登记到脚本里
 * （历史上已经发生过两次）。
 */
import { spawnSync } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** 项目根目录（本文件在 scripts/ 下）。 */
const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** 测试文件所在的目录。 */
const TEST_DIR = join(PROJECT_ROOT, 'tests')

/** 当前 Node 的主版本号。 */
const MAJOR = Number(process.versions.node.split('.')[0])

/**
 * 该 Node 版本运行本仓库测试所需的命令行标志。
 *
 * Node 22.7–25：需要 `--experimental-transform-types` 解析参数属性等语法。
 * Node 26+：该标志已被移除，且内置支持退化为 strip-only；改用本地
 * `scripts/ts-transform.mjs` 的加载期转换钩子。详见该文件头部说明。
 */
const FLAGS = MAJOR >= 26
  ? ['--import', './scripts/ts-transform.mjs']
  : ['--experimental-transform-types']

/** 自动发现的测试文件，按名称排序保证顺序稳定。 */
const FILES = readdirSync(TEST_DIR)
  .filter(name => name.endsWith('.spec.mjs'))
  .sort()
  .map(name => join('tests', name))

const result = spawnSync(process.execPath, [...FLAGS, '--test', ...FILES], {
  cwd: PROJECT_ROOT,
  stdio: 'inherit',
})

// 子进程被信号终止时 status 为 null，按失败处理。
if (result.error !== undefined) {
  console.error(result.error)
  process.exit(1)
}
process.exit(result.status ?? 1)
