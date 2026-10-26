import z from "@deepseek-ai/schemastery";
//#region src/index.ts
/** 浏览器读取本插件设置时使用的命名空间（= 本 Loader entry id）。 */
const AUTO_EXPAND_NAMESPACE = "auto-expand";
/** 设置字段名。 */
const GROUP_AUTO_EXPAND_FIELD = "groupAutoExpand";
const REASONING_AUTO_EXPAND_FIELD = "reasoningAutoExpand";
const TOOL_AUTO_EXPAND_FIELD = "toolAutoExpand";
const REASONING_COLLAPSE_TIMING_FIELD = "reasoningCollapseTiming";
const TOOL_COLLAPSE_TIMING_FIELD = "toolCollapseTiming";
const INSPECT_BUTTON_HIDE_SCOPE_FIELD = "inspectButtonHideScope";
/** 三个开关的默认值：默认全开（插件的核心价值）。 */
const DEFAULT_GROUP_AUTO_EXPAND = true;
const DEFAULT_REASONING_AUTO_EXPAND = true;
const DEFAULT_TOOL_AUTO_EXPAND = true;
/**
* 收起时机的全部取值，**顺序 = 收起由早到晚**（与下拉展示顺序一致）。
*
* 思考与工具**共用这一份**：两者都由操作组提供同样的两个坐标（`step` 批次 /
* `anchorSeq` 操作），四个时机对两方都真实成立。此前曾给思考裁掉
* `'next-call'`，那是人为制造的不对称，已废弃（2026-10-23）。
*
* 与浏览器半边的 `src/client/collapse-timing.ts` 必须逐字一致——两份常量分属
* 两个 bundle，没有类型系统能把它们串起来（`contract-consistency` 测试会守住）。
*/
const COLLAPSE_TIMINGS = [
	"self",
	"next-call",
	"next-node",
	"group"
];
/**
* 默认时机：思考与工具**都默认「下一批操作出现时」**（`'next-node'`，
* 2026-10-23 用户指定）。
*
* 语义：该行的内容保持可见，直到组内出现更新的一批（下一次模型输出派发的
* 操作）才收起——这样「当前正在做的那件事」始终可见，而做完的部分自动让位。
*
* ⚠️ 这两个默认值**不等于 P8 之前的旧行为**（旧行为是思考 `'self'`、工具
* `'group'`）。改默认值会让已安装用户的行为发生变化，因此必须是用户的明确决定。
*/
const DEFAULT_REASONING_COLLAPSE_TIMING = "next-node";
const DEFAULT_TOOL_COLLAPSE_TIMING = "next-node";
/**
* 「查看」按钮的隐藏范围取值，**顺序 = 下拉展示顺序 = 从松到紧**。
*
* - `'off'`：不隐藏（**默认**），逐字等价于未安装本插件；
* - `'current'`：仅当前轮隐藏，历史操作组保持官方行为；
* - `'all'`：全部轮次隐藏。
*
* 与浏览器半边的 `src/client/inspect-button-scope.ts` 必须逐字一致
* （`contract-consistency` 测试会守住）。
*/
const INSPECT_BUTTON_HIDE_SCOPES = [
	"off",
	"current",
	"all"
];
/**
* 隐藏范围的默认值：`'off'`（不隐藏）。
*
* ⚠️ 必须是 `off`：改成别的会让已安装用户升级后**凭空少一个入口**。
*/
const DEFAULT_INSPECT_BUTTON_HIDE_SCOPE = "off";
/** 操作组自定义高度的字段名（与浏览器半边 `group-height.ts` 同源）。 */
const GROUP_HEIGHT_UNLIMITED_FIELD = "groupHeightUnlimited";
const GROUP_HEIGHT_PERCENT_FIELD = "groupHeightPercent";
const GROUP_HEIGHT_HISTORY_FIELD = "groupHeightHistory";
/** 高度百分比的默认值：100 = 官方原公式，逐像素相同。 */
const DEFAULT_GROUP_HEIGHT_PERCENT = 100;
/**
* 设置 schema。
*
* `.default(...)` 在 parse 时生效，因此旧存档（缺字段）会读出默认值，
* 无需迁移逻辑。
*/
const Config = z.object({
	[GROUP_AUTO_EXPAND_FIELD]: z.boolean().default(true).volatile(),
	[REASONING_AUTO_EXPAND_FIELD]: z.boolean().default(true).volatile(),
	[TOOL_AUTO_EXPAND_FIELD]: z.boolean().default(true).volatile(),
	[REASONING_COLLAPSE_TIMING_FIELD]: z.union([...COLLAPSE_TIMINGS]).default(DEFAULT_REASONING_COLLAPSE_TIMING).volatile(),
	[TOOL_COLLAPSE_TIMING_FIELD]: z.union([...COLLAPSE_TIMINGS]).default(DEFAULT_TOOL_COLLAPSE_TIMING).volatile(),
	[INSPECT_BUTTON_HIDE_SCOPE_FIELD]: z.union([...INSPECT_BUTTON_HIDE_SCOPES]).default("off").volatile(),
	[GROUP_HEIGHT_UNLIMITED_FIELD]: z.boolean().default(false).volatile(),
	[GROUP_HEIGHT_PERCENT_FIELD]: z.number().min(0).default(100).volatile(),
	[GROUP_HEIGHT_HISTORY_FIELD]: z.boolean().default(false).volatile()
});
/**
* 挂载 Host 半边。
*
* 只做一件事：注册一条页面策略，声明本插件的设置**不使用**自动生成的设置页
* ——因为它有自己的卡片（浏览器的 `plugins.bundle.config` 槽位）。
*
* 用 `ctx.inject(['settings'], ...)` 而不是 `ctx.get('settings')` 判空：
* 后者在 `apply` 那一刻读取，`settings` 晚到就永久错过，结果是插件详情页
* 同时出现官方自动设置页和本插件的卡片。`inject` 没有这个竞态。
* @param ctx - 插件 context。
*/
function apply(ctx) {
	const host = ctx;
	host.inject(["settings"], (scope) => {
		scope.effect(() => scope.settings.configure({ auto: false }, host.fiber), "dsh-auto-expand: 设置页策略");
	});
}
//#endregion
export { AUTO_EXPAND_NAMESPACE, COLLAPSE_TIMINGS, Config, DEFAULT_GROUP_AUTO_EXPAND, DEFAULT_GROUP_HEIGHT_PERCENT, DEFAULT_INSPECT_BUTTON_HIDE_SCOPE, DEFAULT_REASONING_AUTO_EXPAND, DEFAULT_REASONING_COLLAPSE_TIMING, DEFAULT_TOOL_AUTO_EXPAND, DEFAULT_TOOL_COLLAPSE_TIMING, GROUP_AUTO_EXPAND_FIELD, GROUP_HEIGHT_HISTORY_FIELD, GROUP_HEIGHT_PERCENT_FIELD, GROUP_HEIGHT_UNLIMITED_FIELD, INSPECT_BUTTON_HIDE_SCOPES, INSPECT_BUTTON_HIDE_SCOPE_FIELD, REASONING_AUTO_EXPAND_FIELD, REASONING_COLLAPSE_TIMING_FIELD, TOOL_AUTO_EXPAND_FIELD, TOOL_COLLAPSE_TIMING_FIELD, apply };
