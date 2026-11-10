/**
 * Node 26+ 的 TypeScript 转换钩子（仅测试用）。
 *
 * 背景：Node 26 移除了 `--experimental-transform-types`，内置的 TypeScript
 * 支持退化为**仅剥离**（strip-only）。它会拒绝参数属性这类必须「转换」才能
 * 保留语义的语法 —— 本仓库 `use-scroll-follow.ts` 的
 * `constructor(private following: boolean, …)` 正是这种写法，而它是逐字克隆
 * 的上游代码，不允许为测试而改写。
 *
 * 因此这里用**已经是 devDependency 的 `typescript`** 在加载期做一次纯语法
 * 转换（`transpileModule`，不做类型检查 —— 类型检查由 `pnpm typecheck` 独立
 * 负责）。不引入任何新依赖。
 *
 * 只在 Node 26+ 由 `scripts/run-tests.mjs` 通过 `--import` 加载；Node 22–25
 * 继续使用原生的 `--experimental-transform-types`，行为不变。
 */
import { readFileSync } from 'node:fs'
import { registerHooks } from 'node:module'
import ts from 'typescript'

/** 需要由 TypeScript 接管的扩展名。 */
const HANDLED = ['.ts', '.tsx', '.mts', '.cts']

/**
 * 判断一个模块 URL 是否需要转换。
 * @param url - 模块的 file: URL。
 * @returns 需要转换时为真。
 */
function shouldTransform(url) {
  return url.startsWith('file:') && HANDLED.some(extension => url.endsWith(extension))
}

// 注意：`registerHooks` 是**同步**钩子 API，load 不能是 async 函数。
registerHooks({
  load(url, context, nextLoad) {
    if (!shouldTransform(url)) return nextLoad(url, context)
    const source = readFileSync(new URL(url), 'utf8')
    const { outputText } = ts.transpileModule(source, {
      fileName: url,
      compilerOptions: {
        // 与 tsconfig 的目标保持一致；输出保持 ESM，交由 Node 解析。
        target: ts.ScriptTarget.ES2024,
        module: ts.ModuleKind.ESNext,
        jsx: ts.JsxEmit.ReactJSX,
        // 只转换语法，不做类型检查。
        isolatedModules: true,
        verbatimModuleSyntax: false,
        esModuleInterop: true,
      },
    })
    return { format: 'module', source: outputText, shortCircuit: true }
  },
})
