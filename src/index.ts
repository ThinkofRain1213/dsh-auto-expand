/**
 * Host 半边：本插件不注册任何 Host 服务、工具、事件或配置项。
 *
 * 全部行为发生在浏览器渲染层（`src/client/`），它通过原地包裹已注册的
 * slot 组件实现，不需要 Host 参与，也不写入 Session 日志或持久状态。
 *
 * 保留这个入口是因为 bundle 的 patch 需要挂载一个可加载的包；一个空的
 * `apply` 让挂载成为无副作用的操作，也让卸载保持干净。
 */
import type { Context } from '@deepseek-ai/cordis'

/**
 * 挂载本插件。
 *
 * 本插件没有 Host 侧资源，因此这里是刻意的空实现：它声明"已激活"而不改变
 * 任何 Host 状态。真正的行为由同名的 client bundle 提供。
 * @param _ctx - 插件 context（当前未使用）。
 */
export function apply(_ctx: Context): void {
  // 有意为空：Host 侧无贡献。
}
