/**
 * dsh-auto-expand 构建配置。
 *
 * 产出两份：
 *  - `lib/index.js`   Host 半边（ESM / node）
 *  - `lib/client.js`  浏览器 bundle（CJS，包裹在 __ModuleLoader__.load 里）
 *
 * 两条构建期规则（与上游客户端预设一致）：
 *  - shell 提供的平台模块保持 external，React 与 slot 注册表被共享而非重复打包；
 *  - CSS Modules 在 bundle 内用 lightningcss 编译，注入一个带 data-plugin-css 标记的
 *    <style>，因此类名哈希确定、产物只有 lib/*.js。
 *
 * 虚拟 id 使用仓库相对路径，避免构建机路径进入产物（破坏跨机器可重复构建）。
 */
import { readFile } from 'node:fs/promises'
import { dirname, relative, resolve, sep } from 'node:path'
import { transform } from 'lightningcss'

/** 本包名；loader 用它作为 bundle 的 key，client bundle 必须注册同一个名字。 */
const PACKAGE_NAME = 'dsh-auto-expand'

/**
 * shell 模块表能回答的 specifier；保持 require()，避免打包出第二份 React
 * 或第二个 slot 注册表实例（Symbol 身份与 instanceof 都按实例判断）。
 */
const PLATFORM_MODULES = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-store',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-runtime/client',
]

/**
 * 只允许类型导入的包：控制器客户端、视图层、以及 peer 插件的 subpath client 面。
 * 源码里全部用 `import type`，在 purity 门之前已被擦除；列出来是为了让将来
 * 一个 value 导入被拒绝，而不是被静默 inline 成第二份运行时实例。
 */
const TYPE_ONLY = /^@deepseek-ai\/(?:dsh-api-|dsh-client-ui-(?:renderer|layout|session|sidebar|conversation|chat)|dsh-client-locale|dsh-client-connection)(?:\/|$)/

/**
 * 可安全 inline 的 wire/pure-fold 层：无 Symbol 身份、无单例状态、
 * 无与其他 bundle 共享的 instanceof 契约。
 */
const INLINE_SAFE = /^(?:@deepseek-ai\/dsh-(?:util-values|util-workspace-path|brand|llm)(?:\/|$))/

/** 把 specifier 分类给 bundler。 */
function classifySpecifier(specifier) {
  if (TYPE_ONLY.test(specifier)) return 'typeOnly'
  if (INLINE_SAFE.test(specifier)) return 'inline'
  return 'unresolved'
}

/**
 * 同时用于 define 替换与 resolver conditionNames 的模式。
 * 两者若独立计算，NODE_ENV=test 会解析 React 的 production 入口，
 * 而注入的常量仍说 'test' —— 无报错、无可见症状的错配。
 */
const MODE = process.env.NODE_ENV === 'development' ? 'development' : 'production'

/** 虚拟 id 包装，避免 CSS 落进 tsdown 自己的 css 管线。 */
const CSS_VIRTUAL_PREFIX = '\0dsh-css:'
const CSS_VIRTUAL_SUFFIX = '.mjs'

/** 样式表可内联的图片类型（与官方 ui-chat 预设一致）。 */
const IMAGE_MEDIA_TYPES = {
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
}

/** 仓库相对、正斜杠的样式表身份。 */
const cssIdentity = absolutePath => relative(process.cwd(), absolutePath).split(sep).join('/')

/**
 * 把样式表里的 `url('./x.png')` 换成 data URL。
 *
 * 必须在原始 CSS 上做（早于 `JSON.stringify` 包装），否则 base64 里的
 * `+` `/` `=` 会破坏生成的 JS 字符串字面量。
 * @param css - 原始样式表文本。
 * @param identity - 样式表的仓库相对身份，用于解析相对资源路径。
 * @param ctx - 构建上下文，用于登记被引用的资源为 watch 依赖。
 * @returns 替换后的样式表文本。
 */
async function inlineCssImages(css, identity, ctx) {
  if (!css.includes('url(')) return css
  let next = css
  for (const match of css.matchAll(/url\((['"]?)\.\/([^'")]+)\1\)/g)) {
    const [whole, , file] = match
    const assetPath = resolve(process.cwd(), dirname(identity), file)
    ctx.addWatchFile(assetPath)
    const bytes = await readFile(assetPath)
    const ext = file.slice(file.lastIndexOf('.')).toLowerCase()
    const media = IMAGE_MEDIA_TYPES[ext]
    if (media === undefined) {
      throw new Error(`样式引用了不支持的图片类型：${file}（支持 ${Object.keys(IMAGE_MEDIA_TYPES).join(', ')}）`)
    }
    next = next.replace(whole, `url("data:${media};base64,${bytes.toString('base64')}")`)
  }
  return next
}

const client = {
  name: `${PACKAGE_NAME}/client`,
  entry: { client: 'src/client/index.ts' },
  outDir: 'lib',
  format: 'cjs',
  platform: 'browser',
  target: 'es2024',
  dts: false,
  sourcemap: true,
  clean: false,
  define: {
    'process.env.NODE_ENV': JSON.stringify(MODE),
    'import.meta.env.MODE': JSON.stringify(MODE),
    'import.meta.env': JSON.stringify({ MODE }),
  },
  inputOptions: {
    resolve: {
      conditionNames: [MODE, 'browser', 'import', 'module', 'default'],
    },
  },
  plugins: [{
    // 模块边规则的构建期镜像：平台模块保持 external，wire/pure 层 inline，
    // 其余 @deepseek-ai value 导入是构建错误而非静默的重复运行时实例。
    name: 'dsh-client-bundle-purity',
    resolveId(source, importer) {
      if (importer === undefined) return null // 入口：永远内部
      if (PLATFORM_MODULES.includes(source)) return { id: source, external: true }
      if (!source.startsWith('@deepseek-ai/')) return null
      switch (classifySpecifier(source)) {
        case 'inline':
          return null
        case 'typeOnly':
          throw new Error(
            `client bundle purity: "${source}" 是类型专用目标（TYPE_ONLY）却被当作 value 导入。`
            + ' 请改用 `import type`，或——若确实需要 value 导入——把它声明为平台模块，'
            + ' 由 shell 提供而不是打包出重复实例。',
          )
        default:
          throw new Error(
            `client bundle purity: "${source}" 既不是 shell 平台模块（PLATFORM_MODULES）、`
            + ' 也不是可安全 inline 的 wire/pure 层，更不是类型专用目标。'
            + ' 请把它声明为平台模块、在 INLINE_SAFE 里附理由加入，或通过 cordis 服务协作。',
          )
      }
    },
  }, {
    name: 'dsh-css-modules-inline',
    resolveId(source, importer) {
      if (!source.endsWith('.module.css')) return null
      const abs = importer !== undefined ? resolve(dirname(importer), source) : source
      return CSS_VIRTUAL_PREFIX + cssIdentity(abs) + CSS_VIRTUAL_SUFFIX
    },
    async load(virtualId) {
      if (!virtualId.startsWith(CSS_VIRTUAL_PREFIX)) return null
      const identity = virtualId.slice(CSS_VIRTUAL_PREFIX.length, -CSS_VIRTUAL_SUFFIX.length)
      const fileId = resolve(process.cwd(), identity)
      this.addWatchFile(fileId)
      const raw = await readFile(fileId)
      // 先把 `url('./x.png')` 换成 data URL，再交给 lightningcss。
      //
      // 为什么必须在这一步：CSS Modules 编译后的样式是内联注入的 <style>，
      // 它没有文件位置，浏览器无法解析相对 url。官方 ui-chat 用同样的做法
      // （`packages/client/ui-chat/tsdown.config.ts` 的 `chat-whale-image`）。
      //
      // 为什么不在 transform 钩子里做：那时模块源码已是
      // `const css = "<JSON 转义后的整段样式>"`，直接字符串替换会破坏
      // JSON 字面量（base64 含 `+` `/` `=`）。在原始 CSS 上替换则安全，
      // 之后的 JSON.stringify 会正确转义。
      const source = await inlineCssImages(raw.toString('utf8'), identity, this)
      const { code, exports: cssExports } = transform({
        filename: identity,
        code: Buffer.from(source, 'utf8'),
        cssModules: { pattern: '[hash]_[local]' },
        minify: true,
      })
      const classMap = {}
      // 排序输出，保证重建字节稳定（lightningcss 不保证 key 顺序）。
      for (const local of Object.keys(cssExports ?? {}).sort()) classMap[local] = cssExports[local].name
      return [
        `const css = ${JSON.stringify(code.toString())};`,
        `const tagId = ${JSON.stringify(`${PACKAGE_NAME}/${identity}`)};`,
        'if (typeof document !== \'undefined\') {',
        '  let tag = document.querySelector(\'style[data-plugin-css=\' + JSON.stringify(tagId) + \']\');',
        '  if (tag === null) {',
        '    tag = document.createElement(\'style\');',
        `    tag.dataset.plugin = ${JSON.stringify(PACKAGE_NAME)};`,
        '    tag.dataset.pluginCss = tagId;',
        '    document.head.appendChild(tag);',
        '  }',
        '  tag.textContent = css;',
        '}',
        `export default ${JSON.stringify(classMap)};`,
      ].join('\n')
    },
  }],
  outputOptions: {
    entryFileNames: 'client.js',
    banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(PACKAGE_NAME)}, factory: (require) => {`,
    footer: 'return module.exports; } });',
    intro: 'var module = { exports: {} }; var exports = module.exports;',
  },
}

/**
 * Host 半边。所有 harness 包保持 external：运行中的 Host 从自己的安装提供它们，
 * 打包副本会是第二个 cordis 实例（服务注册表与 instanceof 都按身份判断）。
 */
const node = {
  name: PACKAGE_NAME,
  entry: { index: 'src/index.ts' },
  outDir: 'lib',
  format: 'esm',
  platform: 'node',
  target: 'es2024',
  dts: false,
  clean: false,
  fixedExtension: false,
  external: [
    '@deepseek-ai/cordis',
  ],
}

export default [node, client]
