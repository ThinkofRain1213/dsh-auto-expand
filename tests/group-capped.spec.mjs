/**
 * group body 高度上限判定的回归测试。
 *
 * 修复的 bug（真机反馈，`collapseTiming: 'next-input'` 时）：折叠动画播放时
 * 出现三个症状 —— 上面跳变、下面被拉上去、最下面多出空白。三者是**同一个
 * 数字算错**的三种表现。
 *
 * 完整推演见 `src/client/flow/group-capped.ts` 的文件头。这里固化的是判定
 * 本身与官方公式的差异。
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { isBodyCapped } from '../src/client/flow/group-capped.ts'

/**
 * 官方公式（有 bug 的那份，保留用于对比）。
 * @param grouped - 是否保留高度上限的展示模式。
 * @param deferCompletedTurns - 折叠时机是否为 next-input。
 * @param open - body 当前是否展开。
 * @returns `capped` 的取值。
 */
function officialCapped(grouped, deferCompletedTurns, open) {
  return grouped && (!deferCompletedTurns || open)
}

test('复现 bug：next-input 模式下折叠瞬间上限消失', () => {
  // 展开时（open=true）有上限，折叠时（open=false）上限消失。
  assert.equal(officialCapped(true, true, true), true, '展开时有 400px 上限')
  assert.equal(officialCapped(true, true, false), false,
    '折叠瞬间上限消失 —— body 变成 .expandedBody，动画会测到完整内容高度')
})

test('completion 模式下官方公式没有这个问题（所以一直没被发现）', () => {
  // DEFAULT_COLLAPSE_TIMING = 'completion'：capped 与 open 无关。
  assert.equal(officialCapped(true, false, true), true)
  assert.equal(officialCapped(true, false, false), true, '折叠前后一致')
})

test('修复后：next-input 模式下折叠前后都有上限', () => {
  // `isBodyCapped` 只接收 grouped —— 展开状态与折叠时机在类型上就传不进来。
  assert.equal(isBodyCapped(true), true)
  assert.equal(isBodyCapped(true), true)
})

test('修复后：平铺模式下仍无上限', () => {
  // detailed 模式下运行中的 Turn、verbose 模式：body 本就完全平铺。
  // 这条不能因为修复而改变。
  assert.equal(isBodyCapped(false), false)
})

test('修复后：capped 只由 grouped 决定，没有隐藏依赖', () => {
  for (const grouped of [true, false]) {
    // 重复调用结果恒定；签名里没有第二个参数可传。
    for (let attempt = 0; attempt < 3; attempt += 1) {
      assert.equal(isBodyCapped(grouped), grouped)
    }
  }
})

test('与官方公式的差异只在 next-input 且折叠时', () => {
  // 逐格对比两种公式，确认只有一处不同 —— 修复范围精确可控。
  const differences = []
  for (const grouped of [true, false]) {
    for (const deferCompletedTurns of [true, false]) {
      for (const open of [true, false]) {
        if (officialCapped(grouped, deferCompletedTurns, open) !== isBodyCapped(grouped)) {
          differences.push({ grouped, deferCompletedTurns, open })
        }
      }
    }
  }
  assert.deepEqual(differences, [{ grouped: true, deferCompletedTurns: true, open: false }],
    '只应有一格不同：grouped=true、next-input、折叠态')
})
