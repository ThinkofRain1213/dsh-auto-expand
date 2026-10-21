/**
 * 本插件用到、但未作为依赖引入的官方服务声明。
 *
 * ## 为什么需要一份显式的运行时上下文契约
 *
 * cordis 的 `Context` 是**动态代理**：`ctx.get(name)`、`ctx.effect(...)`、
 * `ctx.slots` 等成员由反射层在运行时提供，**不在 `Context` 静态类型上**
 * （见 `cordis/lib/types/context.d.ts` 的注释："The reflection layer backing
 * the context proxy"）。因此直接 `ctx.get(...)` 会让 TypeScript 报
 * "Property 'get' does not exist"。
 *
 * 官方各插件是在自己的 `apply.ts` 里用 `ClientContext` 这类**交叉类型**
 * 补全成员形状的。本文件照同样思路，声明本插件实际用到的成员。
 *
 * ## 为什么手写而不安装对应包
 *
 * `@deepseek-ai/dsh-client-ui-settings`（`configForms`）与
 * `@deepseek-ai/dsh-client-ui-plugin-manager`（`plugins.bundle.config` 槽位）
 * 的依赖树很大，而本插件只用到一个 `get()` 和一个槽位类型。
 *
 * **维护要点**：权威定义位置
 *  - `ui-settings/src/client/config-form.ts`（`ConfigForms.get`）
 *  - `ui-plugin-manager/src/client/slot-contract.ts`（`plugins.bundle.config`）
 */
import type {} from '@deepseek-ai/dsh-client-ui-slots'

/** 表单快照里本插件关心的部分（只取 `value`，其余字段不使用）。 */
export interface ConfigFormSnapshot<T> {
  readonly value?: T | undefined
}

/**
 * 一个命名空间的配置表单。
 *
 * 上游 `ConfigForm<T>` 还有 `status`/`base`/`user`/`revision`/`writable`
 * 与 `mutate`/`unset`；本插件只用 `getSnapshot`/`subscribe`/`set`。
 */
export interface ConfigForm<T> {
  /** @returns 当前同步快照。 */
  getSnapshot(): ConfigFormSnapshot<T>
  /** @param listener - 快照变化的监听器。 @returns 取消订阅函数。 */
  subscribe(listener: () => void): () => void
  /**
   * 写入一个字段。
   * @param field - 字段名。
   * @param value - 新值。
   * @returns 写入是否被 Host 接受。
   */
  set(field: string, value: unknown): Promise<boolean>
}

/** 官方配置表单服务。 */
export interface ConfigFormsService {
  /**
   * 取得某个 Host 插件 entry 的表单。
   * @param entryId - Host 插件 entry id（= 本插件 patch 里的 `id`）。
   * @returns 该 entry 的表单。
   */
  get<T>(entryId: string): ConfigForm<T>
}

/** 官方 locale 服务（只用注册）。 */
export interface LocaleService {
  /**
   * 注册一个命名空间的双语文案。
   * @param ns - 命名空间。
   * @param dictionaries - 各语言的文案。
   * @returns 注销函数。
   */
  register(ns: string, dictionaries: { zh: object; en: object }): () => void
}

/**
 * 本插件实际使用的客户端 context 形状。
 *
 * 把动态代理提供的成员显式列出来，供 `apply(ctx as AutoExpandClientContext)`
 * 使用。这是官方插件在各自 `apply.ts` 里的同款做法。
 */
export interface AutoExpandClientContext {
  /** 取一个可选服务；不存在时返回 undefined。 */
  get(name: string): unknown
  /**
   * 以**可选依赖**方式启动一个子作用域：`deps` 全部就绪时才执行回调，
   * 缺失则永不执行；父 fiber 销毁时子作用域一并销毁。
   *
   * 这是 `ctx.plugin({ inject, apply })` 的简写。相比 `ctx.get()` 判空，
   * 它没有启动顺序竞态：服务晚到也会补上。
   * @param deps - 必须就绪的服务名。
   * @param callback - 就绪后执行的插件体。
   */
  inject(deps: readonly string[], callback: (scope: AutoExpandClientContext) => void): unknown
  /** 注册一个由本插件 fiber 拥有的副作用，返回其 disposer。 */
  effect(callback: () => () => void, label?: string): () => void
  /** 订阅 context 事件（如 `slots/changed`）。 */
  on(name: string, listener: (...args: never[]) => void): () => void
  /** slot 注册表。 */
  slots: {
    entries(key: string): readonly never[]
    inject(key: string, callback: () => () => void): () => void
    register(options: Record<string, unknown>, component: unknown): () => void
  }
}

/**
 * 设置页作用域：`ctx.inject(['locale', 'configForms'], ...)` 的回调参数。
 *
 * 两个服务在回调里必然存在（否则回调不会执行），因此这里声明为非可选。
 */
export interface AutoExpandSettingsContext extends AutoExpandClientContext {
  readonly locale: LocaleService
  readonly configForms: ConfigFormsService
}
