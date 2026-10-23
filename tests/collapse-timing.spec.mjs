/**
 * 收起时机判据的单元测试。
 *
 * 判据是 `src/client/collapse-timing.ts` 的纯函数，走**真实 import**。
 *
 * 四个时机，思考与工具**共用同一套**（两者都由操作组提供同样的两个坐标）：
 *
 * | 取值 | 文案 | 判据 | 坐标 | 收起范围 |
 * |---|---|---|---|---|
 * | `self` | 本条完成时 | `!done` | — | 本条 |
 * | `next-call` | 下一条操作出现时 | `isLatestNode`（anchorSeq） | 操作级 | **永远单条** |
 * | `next-node` | 下一批操作出现时 | `isLatestBatch`（step） | 批次级 | 同批多条 |
 * | `group` | 随操作组收起 | 恒真 | — | 全部 |
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { PROJECT_ROOT } from '../scripts/upstream-io.mjs'
import {
  COLLAPSE_TIMINGS, autoOpenFor, isLatestAnchor, isLatestStep, startedAnchorOfNode, stepOfNode, toolStarted,
} from '../src/client/collapse-timing.ts'

/**
 * 构造判据输入。
 * @param {string} timing - 收起时机。
 * @param {boolean} done - 自身工作是否做完。
 * @param {boolean} isLatestBatch - 是否属于最新一批（按 step）。
 * @param {boolean} enabled - 上游是否允许自动展开。
 * @param {boolean} isLatestNode - 是否是最新节点（按 anchorSeq）。
 * @returns {object} 判据输入。
 */
function input(timing, done, isLatestBatch, enabled, isLatestNode) {
  return { timing, done, isLatestBatch, enabled, isLatestNode }
}

// ── isLatestStep（批次坐标）────────────────────────────────────────────

test('isLatestStep：拿不到最新值（undefined）时视为最新', () => {
  // 保守选择：信息缺失时保持展开，而不是错误地收起。
  assert.equal(isLatestStep(42, undefined), true)
})

test('isLatestStep：等于 / 大于为真，小于为假', () => {
  assert.equal(isLatestStep(42, 42), true)
  assert.equal(isLatestStep(43, 42), true)
  assert.equal(isLatestStep(41, 42), false)
})

test('同批并行的多个操作共享同一 step → 全部判定为最新一批', () => {
  // 一次模型输出里并行发起 3 个工具，组内最新 step 也是 5。
  // 单条判据（anchorSeq）下只有最后一个能通过；批次判据（step）下三个都通过。
  const latestStep = 5
  for (const toolStep of [5, 5, 5]) {
    assert.equal(isLatestStep(toolStep, latestStep), true,
      '同批并行的工具必须一起展开')
  }
})

test('一批做完、下一批出现 → 上一批不再是最新一批', () => {
  assert.equal(isLatestStep(5, 6), false, 'step 5 的操作应让位给 step 6 的下一批')
  assert.equal(isLatestStep(6, 6), true, '最新一批保持展开')
})

// ── isLatestAnchor（操作坐标）──────────────────────────────────────────

test('isLatestAnchor：拿不到最新值（undefined）时视为最新', () => {
  assert.equal(isLatestAnchor(42, undefined), true)
})

test('isLatestAnchor：等于 / 大于为真，小于为假', () => {
  assert.equal(isLatestAnchor(42, 42), true)
  assert.equal(isLatestAnchor(43, 42), true)
  assert.equal(isLatestAnchor(41, 42), false)
})

test('操作级语义：串行三条命令，只有最后一条是最新节点', () => {
  // A(10) B(11) C(12)，组内最新是 12。
  assert.equal(isLatestAnchor(10, 12), false, 'A 应已收起')
  assert.equal(isLatestAnchor(11, 12), false, 'B 应已收起')
  assert.equal(isLatestAnchor(12, 12), true, 'C 展开')
})

test('操作级语义：A 完成但 B 还没出现时，A 仍是最新 → 保持展开', () => {
  // 这正是「下一条操作出现时」的特点：做完不立刻收，等下一条。
  assert.equal(isLatestAnchor(10, 10), true)
})

test('same-step 内多段思考共享节点坐标 → 操作级判据下同进同退', () => {
  // 一个 assistant-step 节点里可能出现 reasoning → text → reasoning 两段思考
  // （assistant.ts 的 blocks 数组按 chunk.index 存放，类型上不禁止）。
  // 两段的 anchorSeq 都是**节点级**的（assistant.ts:266），所以：
  const nodeAnchor = 8
  const latestAnchor = 8
  assert.equal(isLatestAnchor(nodeAnchor, latestAnchor), true, '两者同时展开')
  const laterAnchor = 9
  assert.equal(isLatestAnchor(nodeAnchor, laterAnchor), false, '下一节点出现后两者同时收起')
  // 这不是缺陷：它们本来就在同一个节点里，节点级判据区分不了它们。
})

// ── stepOfNode ──────────────────────────────────────────────────────────

test('stepOfNode：assistant-step 取 data.step', () => {
  assert.equal(stepOfNode({ kind: 'assistant-step', data: { step: 7 } }), 7)
})

test('stepOfNode：tool-call 取 data.root.step', () => {
  assert.equal(stepOfNode({ kind: 'tool-call', data: { root: { step: 8 } } }), 8)
})

test('stepOfNode：不适用或缺失时返回 undefined', () => {
  assert.equal(stepOfNode(undefined), undefined)
  assert.equal(stepOfNode(null), undefined)
  assert.equal(stepOfNode({ kind: 'user', data: {} }), undefined)
  assert.equal(stepOfNode({ kind: 'assistant-step', data: {} }), undefined)
  assert.equal(stepOfNode({ kind: 'tool-call', data: { root: {} } }), undefined)
  // 非数字的 step 也视为缺失。
  assert.equal(stepOfNode({ kind: 'assistant-step', data: { step: '5' } }), undefined)
})

// ── toolStarted / startedAnchorOfNode（操作坐标的「已开始」过滤）──────────

test('toolStarted：preparing 未开始，start / result 已开始', () => {
  assert.equal(toolStarted({ phase: 'preparing' }), false)
  assert.equal(toolStarted({ phase: 'start' }), true)
  assert.equal(toolStarted({ kind: 'tool-result' }), true)
  assert.equal(toolStarted(undefined), false)
  assert.equal(toolStarted(null), false)
})

test('startedAnchorOfNode：preparing 阶段返回 undefined（关键）', () => {
  // 这一条是「只有 C 展开」那个 bug 的守门员：工具节点在流式阶段就被创建，
  // 若把 preparing 也算作已开始，三条工具会在执行前就分出胜负。
  assert.equal(startedAnchorOfNode({
    kind: 'tool-call', anchorSeq: 10773, data: { root: { phase: 'preparing' } },
  }), undefined)
})

test('startedAnchorOfNode：start / result 阶段返回自己的 anchorSeq', () => {
  assert.equal(startedAnchorOfNode({
    kind: 'tool-call', anchorSeq: 10773, data: { root: { phase: 'start' } },
  }), 10773)
  assert.equal(startedAnchorOfNode({
    kind: 'tool-call', anchorSeq: 10773, data: { root: { kind: 'tool-result' } },
  }), 10773)
})

test('startedAnchorOfNode：思考节点恒视为已开始', () => {
  assert.equal(startedAnchorOfNode({ kind: 'assistant-step', anchorSeq: 20, data: { step: 1 } }), 20)
})

test('startedAnchorOfNode：其它节点与缺值时返回 undefined', () => {
  assert.equal(startedAnchorOfNode(undefined), undefined)
  assert.equal(startedAnchorOfNode({ kind: 'user', anchorSeq: 3, data: {} }), undefined)
  assert.equal(startedAnchorOfNode({ kind: 'tool-call', data: { root: { phase: 'start' } } }), undefined)
})

test('串行三条工具：只有最新一条「已开始」的操作展开（真机 bug 回归）', () => {
  // 复刻真机现象：三条工具在同一处被创建（anchorSeq 10773/10777/10781 已定死），
  // 但执行是串行的。判据必须随「已开始」推进，而不是随「谁被创建得晚」。
  const tools = [
    { kind: 'tool-call', anchorSeq: 10773 },
    { kind: 'tool-call', anchorSeq: 10777 },
    { kind: 'tool-call', anchorSeq: 10781 },
  ]
  /** 按当前各工具的阶段算出「本组最新已开始的 anchorSeq」。 */
  const latestStarted = phases => tools
    .map((tool, i) => startedAnchorOfNode({ ...tool, data: { root: { phase: phases[i] } } }))
    .filter(value => value !== undefined)
    .reduce((max, value) => max === undefined ? value : Math.max(max, value), undefined)

  // 1）三条都在流式：只有思考节点（这里是 10770）算已开始
  const streaming = latestStarted(['preparing', 'preparing', 'preparing'])
  assert.equal(streaming, undefined, '工具都还没开始，组里只有思考')

  // 2）A 执行中：最新已开始 = A
  const runningA = latestStarted(['start', 'preparing', 'preparing'])
  assert.equal(runningA, 10773)
  assert.equal(isLatestAnchor(10773, runningA), true, 'A 展开')
  assert.equal(isLatestAnchor(10777, runningA), true, 'B 尚未开始，但也不能因序号大就抢先')

  // 3）A 完成、B 未开始：最新已开始仍是 A → A 保持展开
  const aDone = latestStarted([{ kind: 'tool-result' }, 'preparing', 'preparing'])
  assert.equal(aDone, 10773, 'A 仍是最新已开始的操作')
  assert.equal(isLatestAnchor(10773, aDone), true, 'A 完成但保持展开')

  // 4）B 开始：最新已开始 = B → A 收起、B 展开
  const runningB = latestStarted([{ kind: 'tool-result' }, 'start', 'preparing'])
  assert.equal(runningB, 10777)
  assert.equal(isLatestAnchor(10773, runningB), false, 'A 收起')
  assert.equal(isLatestAnchor(10777, runningB), true, 'B 展开')

  // 5）C 开始：最新已开始 = C → B 收起、C 展开
  const runningC = latestStarted([{ kind: 'tool-result' }, { kind: 'tool-result' }, 'start'])
  assert.equal(runningC, 10781)
  assert.equal(isLatestAnchor(10777, runningC), false, 'B 收起')
  assert.equal(isLatestAnchor(10781, runningC), true, 'C 展开')

  // 6）全部完成：C 仍是最新 → 只有 C 展开（不再「全部展开」）
  const allDone = latestStarted([{ kind: 'tool-result' }, { kind: 'tool-result' }, { kind: 'tool-result' }])
  assert.equal(allDone, 10781)
  assert.deepEqual(
    tools.map(tool => isLatestAnchor(tool.anchorSeq, allDone)),
    [false, false, true],
    '全部完成后只留最后一条，不整批展开',
  )
})

// ── autoOpenFor：四个时机的语义 ─────────────────────────────────────────

test('enabled=false 时任何时机都不展开', () => {
  for (const timing of COLLAPSE_TIMINGS) {
    for (const done of [false, true]) {
      for (const isLatestBatch of [false, true]) {
        for (const isLatestNode of [false, true]) {
          assert.equal(autoOpenFor(input(timing, done, isLatestBatch, false, isLatestNode)), false,
            `timing=${timing} 不应展开`)
        }
      }
    }
  }
})

test("'self'：本条做完即收（不看任何最新信号）", () => {
  assert.equal(autoOpenFor(input('self', false, false, true, false)), true, '没做完就展开')
  assert.equal(autoOpenFor(input('self', true, true, true, true)), false, '做完了就收')
})

test("'group'：无论做完与否都保持展开（等操作组收）", () => {
  for (const done of [false, true]) {
    for (const isLatestBatch of [false, true]) {
      for (const isLatestNode of [false, true]) {
        assert.equal(autoOpenFor(input('group', done, isLatestBatch, true, isLatestNode)), true,
          `done=${done} 应保持展开`)
      }
    }
  }
})

test("'next-node'：只看批次坐标 isLatestBatch（不看 done，也不看操作坐标）", () => {
  for (const done of [false, true]) {
    assert.equal(autoOpenFor(input('next-node', done, true, true, false)), true,
      `done=${done} 时最新一批应展开（即使不是最新节点）`)
    assert.equal(autoOpenFor(input('next-node', done, false, true, true)), false,
      `done=${done} 时非最新一批应收起（即使是最新节点）`)
  }
})

test("'next-call'：只看操作坐标 isLatestNode（不看 done，也不看批次坐标）", () => {
  for (const done of [false, true]) {
    assert.equal(autoOpenFor(input('next-call', done, false, true, true)), true,
      `done=${done} 时最新节点应展开（即使不是最新一批）`)
    assert.equal(autoOpenFor(input('next-call', done, true, true, false)), false,
      `done=${done} 时非最新节点应收起（即使在同一批）`)
  }
})

// ── 两个坐标在同一批并行操作上的差别 ───────────────────────────────────

test('同一批并行工具：next-node 全展开，next-call 只留最后一个', () => {
  // 3 个并行工具 step 都是 5，anchorSeq 分别是 10/11/12，组内最新 12。
  const latestStep = 5
  const latestAnchor = 12
  const tools = [{ step: 5, anchorSeq: 10 }, { step: 5, anchorSeq: 11 }, { step: 5, anchorSeq: 12 }]
  const batch = tools.map(t => autoOpenFor(input(
    'next-node', true, isLatestStep(t.step, latestStep), true, isLatestAnchor(t.anchorSeq, latestAnchor),
  )))
  const single = tools.map(t => autoOpenFor(input(
    'next-call', true, isLatestStep(t.step, latestStep), true, isLatestAnchor(t.anchorSeq, latestAnchor),
  )))
  assert.deepEqual(batch, [true, true, true], '批次语义：三个都展开')
  assert.deepEqual(single, [false, false, true], '操作语义：只留最后一个')
})

test('同一段思考：两个坐标都能独立决定展开与否', () => {
  // 思考所属节点 anchorSeq = 8、step = 5；组内最新是 anchorSeq 12 / step 6
  // （下一批已经派发了工具）。此时两个时机给出不同结论——这正是「两个坐标
  // 真实存在、各有语义」，不是思考或工具的专属。
  const own = { step: 5, anchorSeq: 8 }
  const latest = { step: 6, anchorSeq: 12 }
  assert.equal(autoOpenFor(input('next-node', true, isLatestStep(own.step, latest.step), true, true)), false,
    '批次级：下一批已出现 → 收起')
  assert.equal(autoOpenFor(input('next-call', true, true, true, isLatestAnchor(own.anchorSeq, latest.anchorSeq))), false,
    '操作级：下一条操作已出现 → 收起')
})

// ── 全矩阵公式等价性 ────────────────────────────────────────────────────

test('全部组合等价于显式公式', () => {
  for (const timing of COLLAPSE_TIMINGS) {
    for (const done of [false, true]) {
      for (const isLatestBatch of [false, true]) {
        for (const isLatestNode of [false, true]) {
          for (const enabled of [false, true]) {
            const expected = !enabled
              ? false
              : timing === 'self'
                ? !done
                : timing === 'next-call'
                  ? isLatestNode
                  : timing === 'next-node' ? isLatestBatch : true
            assert.equal(
              autoOpenFor(input(timing, done, isLatestBatch, enabled, isLatestNode)),
              expected,
              `timing=${timing} done=${done} batch=${isLatestBatch} node=${isLatestNode} enabled=${enabled} 不符`,
            )
          }
        }
      }
    }
  }
})

// ── 取值列表 ────────────────────────────────────────────────────────────

test('时机列表：四个，按收起由早到晚', () => {
  assert.deepEqual([...COLLAPSE_TIMINGS], ['self', 'next-call', 'next-node', 'group'])
})

test('时机列表无重复', () => {
  assert.equal(new Set(COLLAPSE_TIMINGS).size, COLLAPSE_TIMINGS.length)
})

test('思考与工具共用同一份列表（不再是两份）', () => {
  // 此前有 REASONING_COLLAPSE_TIMINGS / TOOL_COLLAPSE_TIMINGS 两份常量，
  // 思考那份裁掉了 next-call。统一后只剩一份，这里守住「不要再分叉」。
  const source = readFileSync(join(PROJECT_ROOT, 'src/client/collapse-timing.ts'), 'utf8')
  assert.equal(/REASONING_COLLAPSE_TIMINGS/.test(source), false,
    '不得再出现思考专用的时机列表')
  assert.equal(/TOOL_COLLAPSE_TIMINGS/.test(source), false,
    '不得再出现工具专用的时机列表')
})
