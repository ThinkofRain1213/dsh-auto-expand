/**
 * Host 半边的服务说明。
 *
 * `settings` 服务由 `@deepseek-ai/dsh-settings` 提供。本插件只用到
 * `configure({ auto: false })`：声明本插件的设置**不使用**自动生成的设置页
 * ——因为它有自己的卡片（浏览器的 `plugins.bundle.config` 槽位，见
 * `spec/SETTINGS-SPEC.md`）。
 *
 * 注意：cordis 的 `Context` 是动态代理，`ctx.inject`/`ctx.effect`/`ctx.fiber`
 * 都不在静态类型上（见 `cordis/lib/types/context.d.ts` 的反射层注释）。因此
 * `src/index.ts` 用局部接口 `AutoExpandHostContext` 做结构断言，而不是在这里
 * 做 declaration merging —— 后者会与 `Context` 的既有成员合并失败。
 *
 * 权威定义位置：
 *  - `packages/settings/settings/src/index.ts` 的 `configure(presentation, owner)`
 *  - `packages/settings/settings/src/schema.ts` 的 `isVolatilePath`（`.volatile()` 的必要性）
 *
 * **维护要点**：上游若改变 `configure` 的签名，`src/index.ts` 的
 * `AutoExpandHostContext` 需同步；漂移检测（P6）应把它列为对照项。
 */
export {}
