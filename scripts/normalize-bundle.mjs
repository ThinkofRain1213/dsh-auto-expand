/**
 * 构建后把产物里的 pnpm 虚拟 store 路径规范化。
 *
 * ## 为什么需要这一步
 *
 * tsdown/rolldown 会在产物里写源码来源标记：
 *
 * ```
 * //#region node_modules/.pnpm/@deepseek-ai+dsh-util-works_e9bdbcaf…/node_modules/@deepseek-ai/dsh-util-workspace-path/lib/index.js
 * ```
 *
 * 那个 `.pnpm/<虚拟目录>` 的名字由 **pnpm 的 `virtual-store-dir-max-length`** 决定，
 * 而它的默认值按平台分叉：
 *
 * | 平台 | 默认值 | 目录名 |
 * |---|---|---|
 * | Windows | 60 | `@deepseek-ai+dsh-util-works_<hash>` |
 * | Linux / macOS | 120 | `@deepseek-ai+dsh-util-workspace-path@0.2.1-rc.3_<hash>` |
 *
 * 于是**同一份源码在两个平台上产出不同的 `lib/client.js`**，而 `lib/` 是入库的、
 * CI 又要求重建结果与入库内容逐字节一致（`Assert committed bundles match src`），
 * 所以那条断言从仓库第一个提交起就一直在失败——11 次运行、0 次通过。
 *
 * ## 为什么不在源头修
 *
 * 在 `.npmrc` 里固定 `virtual-store-dir-max-length=60` 是更「上游」的做法，但实测
 * CI 侧不生效（目录名仍是完整形式）。而这个脚本作用于**构建产物本身**，与 pnpm
 * 版本、平台、安装方式全都无关，是确定性的。
 *
 * ## 安全性
 *
 * 被替换的只是**注释里的来源路径**和 sourcemap 的 `sources` 字符串，不涉及任何
 * 可执行代码。替换后的形式 `node_modules/@deepseek-ai/...` 仍然是可读的来源说明。
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs'

/** 匹配 `node_modules/.pnpm/<任意虚拟目录>/node_modules/`，只保留后半段。 */
const PNPM_STORE = /node_modules\/\.pnpm\/[^/]+\/node_modules\//g

/** 需要规范化的产物；不存在的直接跳过（Host 半边不含这类路径）。 */
const TARGETS = ['lib/client.js', 'lib/client.js.map']

let changed = 0
for (const file of TARGETS) {
  if (!existsSync(file)) continue
  const before = readFileSync(file, 'utf8')
  const after = before.replace(PNPM_STORE, 'node_modules/')
  if (after === before) continue
  writeFileSync(file, after)
  changed += 1
  console.log(`✔ 规范化 pnpm 虚拟 store 路径：${file}`)
}

if (changed === 0) {
  console.log('✔ 产物里没有 pnpm 虚拟 store 路径，无需规范化')
}
