/**
 * `ScrollFollow` 的真实行为测试。
 *
 * 直接 import 源码（Node 的类型剥离不支持 parameter properties，因此测试
 * 脚本带 `--experimental-transform-types`）。这与其它 spec 里"复制一段逻辑"
 * 的写法不同：本 bug 的核心就在这个状态机里，复制逻辑测不出回归。
 *
 * 修复的 bug：body 的自动滚动偶发失效，通常由大段思考触发。
 * 根因：`.body` 默认开启滚动锚定，内容在视口上方变高时浏览器会主动改
 * `scrollTop`；`sample()` 把"scrollTop 变了"当成"读者滚了"，关掉跟随。
 * 而 `following` 一旦为 false 只有手动滚到底才恢复（`toBottom` 是唯一
 * 恢复入口，它的准入条件就是"已在跟随"），所以表现为永久失效。
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ScrollFollow, scrollMetrics } from '../src/client/flow/use-scroll-follow.ts'

/** 构造一个可读写的假滚动容器。 */
function fakeBody({ top = 0, height = 400, scrollHeight = 400 } = {}) {
  return {
    clientHeight: height,
    scrollHeight,
    scrollTop: top,
    scrollTo({ top: next }) { this.scrollTop = next },
  }
}

test('在底部时 following 为真', () => {
  const body = fakeBody({ top: 0, height: 400, scrollHeight: 400 })
  const follow = new ScrollFollow(false, 1)
  follow.jump(body, scrollMetrics(body), 0)
  assert.equal(follow.active, true)
})

test('复现 bug：内容增长 + 锚定位移，默认采样会关掉跟随', () => {
  const body = fakeBody({ top: 0, height: 400, scrollHeight: 400 })
  const follow = new ScrollFollow(false, 1)
  follow.jump(body, scrollMetrics(body), 0)
  assert.equal(follow.active, true, '起点在底部')

  // 内容长高（大段思考展开），浏览器滚动锚定把 scrollTop 从 0 挪到 320。
  body.scrollHeight = 1200
  body.scrollTop = 320

  // 修复前的调用：`follow.sample(metrics)`（默认判据 = "scrollTop 变了"）
  follow.sample(scrollMetrics(body))
  assert.equal(follow.active, false, '这正是 bug：锚定位移被当成读者上滚')
})

test('修复：resize 采样传 movedByReader=false，跟随意图不受锚定位移影响', () => {
  const body = fakeBody({ top: 0, height: 400, scrollHeight: 400 })
  const follow = new ScrollFollow(false, 1)
  follow.jump(body, scrollMetrics(body), 0)

  body.scrollHeight = 1200
  body.scrollTop = 320

  // 修复后的调用：内容增长不是读者行为，只用当次几何刷新采样基线。
  follow.sample(scrollMetrics(body), false)
  assert.equal(follow.active, true, 'following 必须保持')

  // 基线也确实被刷新了：随后一次默认采样不应把"没动"当成读者移动。
  body.scrollTop = 321
  follow.sample(scrollMetrics(body), false)
  assert.equal(follow.active, true)

  // 若基线没刷新（仍是 0），下面这次默认采样会 |321-0| > 0.5 → 关掉跟随。
  follow.sample(scrollMetrics(body))
  assert.equal(follow.active, true, '采样基线已被 resize 分支对齐')
})

test('读者真的向上滚仍然会关掉跟随', () => {
  const body = fakeBody({ top: 800, height: 400, scrollHeight: 1200 })
  const follow = new ScrollFollow(false, 1)
  follow.jump(body, scrollMetrics(body), 800)
  assert.equal(follow.active, true)

  body.scrollTop = 120
  follow.sample(scrollMetrics(body))
  assert.equal(follow.active, false, 'scroll 事件走默认判据，必须尊重读者')
})

test('读者滚回底部后跟随恢复（这是唯一的自恢复路径）', () => {
  const body = fakeBody({ top: 120, height: 400, scrollHeight: 1200 })
  const follow = new ScrollFollow(false, 1)
  follow.jump(body, scrollMetrics(body), 120)
  assert.equal(follow.active, false)

  body.scrollTop = 800
  follow.sample(scrollMetrics(body))
  assert.equal(follow.active, true)
})

test('jump 到顶部后 following 为假（已完成的 group 手动展开）', () => {
  const body = fakeBody({ top: 800, height: 400, scrollHeight: 1200 })
  const follow = new ScrollFollow(false, 1)
  follow.jump(body, scrollMetrics(body), 0)
  assert.equal(follow.active, false)
})

test('toBottom 平滑跟随会记录目标，内容继续增长时保留意图', () => {
  const body = fakeBody({ top: 800, height: 400, scrollHeight: 1200 })
  const follow = new ScrollFollow(false, 1)
  follow.jump(body, scrollMetrics(body), 0)
  assert.equal(follow.active, false)

  follow.toBottom(body, scrollMetrics(body), 'smooth')
  assert.equal(follow.active, true)
  assert.equal(follow.animating, true, '平滑请求留下未完成目标')

  // 动画期间内容增长：采样不得关掉跟随（animating 时不采纳新的移动判定）。
  body.scrollHeight = 1600
  follow.sample(scrollMetrics(body))
  assert.equal(follow.active, true)
})

test('结算到目标即到达时保持跟随', () => {
  const body = fakeBody({ top: 800, height: 400, scrollHeight: 1200 })
  const follow = new ScrollFollow(false, 1)
  follow.toBottom(body, scrollMetrics(body), 'smooth')
  // 平滑滚动交付：scrollTop 到达目标。
  body.scrollTop = 800
  follow.settle(scrollMetrics(body))
  assert.equal(follow.active, true)
  assert.equal(follow.animating, false)
})

test('reset 清空跟随意图', () => {
  const body = fakeBody({ top: 0, height: 400, scrollHeight: 1200 })
  const follow = new ScrollFollow(false, 1)
  follow.jump(body, scrollMetrics(body), 800)
  assert.equal(follow.active, true)
  follow.reset()
  assert.equal(follow.active, false)
})

// ── 第三次修复：锚定位移经 scroll 事件推翻跟随 ──────────────────────────

test('第三次修复的根因：锚定位移若走 scroll 分支，跟随会被推翻', () => {
  // 第二轮修复把 resize 分支改成 `sample(metrics, false)`，
  // 但 `.body` 的滚动锚定位移同样会产生**原生 scroll 事件**，那条路径走的是
  // `sync('scroll')` → `sample(metrics)`（默认判据「scrollTop 变了 = 读者滚了」）。
  //
  // 本用例固化这条路径确实会关掉跟随，说明为什么必须从 CSS 层关掉
  // `overflow-anchor`，而不是继续在 JS 里逐个分支打补丁。
  const body = fakeBody({ top: 800, height: 400, scrollHeight: 1200 })
  const follow = new ScrollFollow(false, 1)
  follow.jump(body, scrollMetrics(body), 800)
  assert.equal(follow.active, true, '起初在底部，正在跟随')

  // 大段思考展开：内容在视口上方长高，浏览器锚定把 scrollTop 推走。
  body.scrollHeight = 2400
  body.scrollTop = 1600

  // 锚定位移触发的原生 scroll 事件 —— 走默认判据。
  follow.sample(scrollMetrics(body))
  assert.equal(follow.active, false,
    '这正是第三次修复前的失效路径：锚定位移被 scroll 分支当成读者行为')

  // 死锁：following 为 false 时 `toBottom` 的准入条件（`follow.active`）
  // 为假，没有人会再调用它，于是直到读者手动滚回底部才恢复。
  const floor = body.scrollHeight - body.clientHeight
  body.scrollTop = floor
  follow.sample(scrollMetrics(body))
  assert.equal(follow.active, true, '只有读者手动滚回底部才恢复')
})

test('读者真实的向上滚动仍然关掉跟随（修复没有吞掉读者意图）', () => {
  // CSS 层的 overflow-anchor: none 只消除**虚假**位移；
  // 读者的真实滚动依旧走默认判据，必须被尊重。
  // 先让 controller 处于「跟随中」，再模拟读者往上滚。
  const body = fakeBody({ top: 0, height: 400, scrollHeight: 400 })
  const follow = new ScrollFollow(false, 1)
  follow.jump(body, scrollMetrics(body), 0)
  assert.equal(follow.active, true, '起点在底部，正在跟随')

  // 内容增长后读者把位置拽到上面（不是底部）。
  body.scrollHeight = 2400
  body.scrollTop = 300
  follow.sample(scrollMetrics(body))
  assert.equal(follow.active, false, '读者真的往上滚，跟随必须关掉')
})

