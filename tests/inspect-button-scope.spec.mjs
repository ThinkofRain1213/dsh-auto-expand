/**
 * 「查看」按钮隐藏范围的判据测试。
 *
 * 判据是纯函数，走**真实 import**，不需要 React dispatcher。
 *
 * ## 为什么值得单独测
 *
 * 「查看」按钮由官方 `ToolRow` 在 `inspect !== undefined` 时渲染。本插件不改
 * 官方组件，只在包裹层决定**是否把 `inspectCall` 透传下去**。这条判据因此
 * 控制着五个渲染点的存亡（三个按钮 + 详情卡的 88px 让位 + 按钮预留的行高），
 * 而写错的后果都很隐蔽：
 *
 * - 把 `undefined` 换成空函数 → 凭空多出一个点了没反应的按钮；
 * - 把「当前轮」判据写反 → 历史轮次的按钮被误伤；
 * - 未知取值不回落 → 旧存档读出的字段让按钮凭空消失。
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  DEFAULT_INSPECT_BUTTON_HIDE_SCOPE, INSPECT_BUTTON_HIDE_SCOPES, inspectCallFor,
} from '../src/client/inspect-button-scope.ts'

/** 一个可辨认的假回调，用来断言「是否原样透传」。 */
const CALL = () => {}

test("'off'：原样透传，无论当前轮还是历史轮", () => {
  assert.equal(inspectCallFor({ scope: 'off', auto: true, inspectCall: CALL }), CALL)
  assert.equal(inspectCallFor({ scope: 'off', auto: false, inspectCall: CALL }), CALL)
})

test("'current'：当前轮置空，历史轮原样透传", () => {
  assert.equal(inspectCallFor({ scope: 'current', auto: true, inspectCall: CALL }), undefined)
  assert.equal(inspectCallFor({ scope: 'current', auto: false, inspectCall: CALL }), CALL)
})

test("'all'：一律置空", () => {
  assert.equal(inspectCallFor({ scope: 'all', auto: true, inspectCall: CALL }), undefined)
  assert.equal(inspectCallFor({ scope: 'all', auto: false, inspectCall: CALL }), undefined)
})

test('原始值本就是 undefined 时，三档都不得凭空造出回调', () => {
  // 官方「显示代码工作视图」关闭时 inspectCall 就是 undefined。此时任何档位
  // 都必须保持 undefined——绝不能返回一个空函数，否则官方会判
  // `inspect !== undefined` 而渲染出一个点了没反应的按钮。
  for (const scope of INSPECT_BUTTON_HIDE_SCOPES) {
    for (const auto of [true, false]) {
      assert.equal(inspectCallFor({ scope, auto, inspectCall: undefined }), undefined,
        `scope=${scope} auto=${auto} 必须保持 undefined`)
    }
  }
})

test('未知取值回落到 off（旧存档 / 字段缺失）', () => {
  // 字段缺失时读出来是 undefined，必须等同于 off，否则已安装用户会
  // 在升级后莫名其妙地丢掉按钮。
  for (const bad of [undefined, null, '', 'nonsense']) {
    assert.equal(inspectCallFor({ scope: bad, auto: true, inspectCall: CALL }), CALL,
      `未知取值 ${String(bad)} 应回落到 off`)
    assert.equal(inspectCallFor({ scope: bad, auto: false, inspectCall: CALL }), CALL,
      `未知取值 ${String(bad)} 应回落到 off（历史轮）`)
  }
})

test('取值列表：三个、顺序固定、默认 off', () => {
  assert.deepEqual([...INSPECT_BUTTON_HIDE_SCOPES], ['off', 'current', 'all'])
  assert.equal(new Set(INSPECT_BUTTON_HIDE_SCOPES).size, 3)
  assert.equal(DEFAULT_INSPECT_BUTTON_HIDE_SCOPE, 'off')
})
