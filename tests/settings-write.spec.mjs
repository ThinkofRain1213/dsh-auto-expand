/**
 * 设置写入的乐观更新与回滚测试。
 *
 * 修复的三个缺陷（都在同一个函数里）：
 *  1. 没有写入通道时**先**改了本地快照再返回 false —— 开关视觉上切换了、
 *     Host 从未收到写入，重启后变回去。
 *  2. `form.set` 抛错时既没回滚、也没有 catch —— 未捕获的 promise rejection。
 *  3. 回滚只覆盖"Host 返回 false"这一条路径。
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { writeOptimistic } from '../src/client/settings-write.ts'

/** 构造一个可观察的假 store。 */
function fakeStore(initial) {
  let value = initial
  const sets = []
  return {
    getSnapshot: () => value,
    set: (next) => { value = next; sets.push(next) },
    /** 记录到的所有写入（用于断言"没有写"）。 */
    sets,
  }
}

/** 构造一个可控的假表单。 */
function fakeForm(behavior) {
  const calls = []
  return {
    calls,
    set: async (field, value) => {
      calls.push({ field, value })
      if (behavior === 'reject') throw new Error('rpc failed')
      return behavior !== 'refuse'
    },
  }
}

test('正常写入：先乐观更新，Host 接受后保持', async () => {
  const store = fakeStore({ a: true, b: false })
  const form = fakeForm('accept')
  const accepted = await writeOptimistic(store, form, 'a', false)
  assert.equal(accepted, true)
  assert.deepEqual(store.getSnapshot(), { a: false, b: false })
  assert.deepEqual(form.calls, [{ field: 'a', value: false }])
})

test('值未变化：不写 Host、不动本地状态', async () => {
  const store = fakeStore({ a: true, b: false })
  const form = fakeForm('accept')
  const accepted = await writeOptimistic(store, form, 'a', true)
  assert.equal(accepted, true)
  assert.equal(store.sets.length, 0, '本地快照不应被替换')
  assert.equal(form.calls.length, 0, '不应发起写入')
})

test('没有写入通道：不改本地状态（缺陷 1）', async () => {
  const store = fakeStore({ a: true, b: false })
  const accepted = await writeOptimistic(store, undefined, 'a', false)
  assert.equal(accepted, false)
  assert.deepEqual(store.getSnapshot(), { a: true, b: false }, '快照必须原样不动')
  assert.equal(store.sets.length, 0, '一次 set 都不该发生')
})

test('Host 拒绝：回滚到写入前的快照', async () => {
  const store = fakeStore({ a: true, b: false })
  const form = fakeForm('refuse')
  const accepted = await writeOptimistic(store, form, 'a', false)
  assert.equal(accepted, false)
  assert.deepEqual(store.getSnapshot(), { a: true, b: false }, '必须回滚')
  assert.equal(store.sets.length, 2, '先乐观写入、再回滚')
})

test('写入抛错：回滚且不抛出（缺陷 2）', async () => {
  const store = fakeStore({ a: true, b: false })
  const form = fakeForm('reject')
  // 不应抛出：调用方是 `void setAutoExpandSetting(...)`，抛出会变成未捕获 rejection。
  const accepted = await writeOptimistic(store, form, 'a', false)
  assert.equal(accepted, false)
  assert.deepEqual(store.getSnapshot(), { a: true, b: false }, '必须回滚')
  assert.equal(store.sets.length, 2)
})

test('多字段快照：只改目标字段，其余原样保留', async () => {
  const store = fakeStore({ groupAutoExpand: true, reasoningAutoExpand: true })
  await writeOptimistic(store, fakeForm('accept'), 'reasoningAutoExpand', false)
  assert.deepEqual(store.getSnapshot(), { groupAutoExpand: true, reasoningAutoExpand: false })
})

test('回滚恢复的是写入前整体快照，不是逐个字段拼回去', async () => {
  // 写入期间另一个字段被外部改了也不该丢——回滚是整体替换，语义明确。
  const store = fakeStore({ a: true, b: true })
  await writeOptimistic(store, fakeForm('refuse'), 'a', false)
  assert.deepEqual(store.getSnapshot(), { a: true, b: true })
})
