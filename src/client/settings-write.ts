/**
 * 设置写入的乐观更新与回滚。
 *
 * 单独成模块的理由和 `scroll-align.ts` 一样：它是有分支的纯逻辑，必须能被
 * `tests/settings-write.spec.mjs` 直接断言。真机上的表现差异很微妙——
 * 开关看起来切换了但重启又变回去，是最难发现的一类缺陷。
 */

/** 可观察、可写入的快照存储（`SnapshotStore` 的最小形状）。 */
export interface OptimisticStore<Snapshot extends object> {
  /** @returns 当前快照。 */
  getSnapshot(): Snapshot
  /** @param next - 新快照。 */
  set(next: Snapshot): void
}

/** 可写入的配置表单（`ConfigForm.set` 的最小形状）。 */
export interface OptimisticForm {
  /**
   * @param field - 字段名。
   * @param value - 新值。
   * @returns Host 是否接受。
   */
  set(field: string, value: unknown): Promise<boolean>
}

/**
 * 乐观写入一个开关，失败时回滚。
 *
 * 三条规则，缺一条都会留下"显示与实际不一致"的窗口：
 *
 *  1. **没有写入通道就不改本地状态**。以前是先改快照再判 `form === undefined`
 *     返回 false，结果是开关视觉上切换了、Host 从未收到写入，重启后变回去。
 *  2. **Host 拒绝时回滚**。
 *  3. **写入抛错也回滚**。RPC 失败与"Host 拒绝"对用户是同一件事；以前抛错会
 *     变成未捕获的 promise rejection，且本地状态停在错误的乐观值上。
 *
 * @param store - 本地快照存储。
 * @param form - 官方配置表单；`undefined` 表示没有写入通道。
 * @param field - 字段名。
 * @param value - 目标值。
 * @returns 写入是否被接受（无变化时也算接受）。
 */
export async function writeOptimistic<Snapshot extends object, Field extends keyof Snapshot>(
  store: OptimisticStore<Snapshot>,
  form: OptimisticForm | undefined,
  field: Field,
  value: Snapshot[Field],
): Promise<boolean> {
  const previous = store.getSnapshot()
  if (previous[field] === value) return true
  if (form === undefined) return false

  store.set({ ...previous, [field]: value })
  try {
    const accepted = await form.set(String(field), value)
    if (!accepted) store.set(previous)
    return accepted
  } catch {
    store.set(previous)
    return false
  }
}
