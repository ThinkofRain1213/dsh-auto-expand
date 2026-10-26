window.__ModuleLoader__.load({
	id: "dsh-auto-expand",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let _deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
		let _deepseek_ai_dsh_client_store = require("@deepseek-ai/dsh-client-store");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region src/client/wrap.ts
		/** 已包裹过的组件身份，避免同一组件被叠加包裹多次。 */
		const wrappedComponents = /* @__PURE__ */ new WeakSet();
		/**
		* 从候选组件中筛出可包裹的（函数或 exotic component）。
		* @param value - 待检查的组件值。
		* @returns 是否是可包裹的组件。
		*/
		function isWrappable(value) {
			return typeof value === "function" || typeof value === "object" && value !== null && "$$typeof" in value;
		}
		/**
		* 在目标 entry 上原地替换 component。
		*
		* 幂等：同一 `inner` 只会被包裹一次（用 WeakSet 记录）。
		* 安全：entry 不存在、组件不可包裹、赋值被拒时都不抛错，只返回 NOOP 或记录警告。
		*
		* @param entries - 当前 slot 的全部注册项（来自 `ctx.slots.entries(slot)`）。
		* @param target - 目标 slot 与 key。
		* @param make - 包装器工厂。
		* @param tag - 日志前缀，便于定位是哪个包裹点失败。
		* @returns 还原函数；未发生包裹时返回空操作。
		*/
		function wrapEntry(entries, target, make, tag) {
			const entry = entries.find((candidate) => target.key === void 0 || candidate.options.key === target.key);
			if (entry === void 0) return NOOP$1;
			const inner = entry.component;
			if (!isWrappable(inner)) {
				console.warn(`${tag} 无法包裹 ${target.slot}${target.key === void 0 ? "" : `:${target.key}`}：组件不可包裹，插件在该位置不生效`);
				return NOOP$1;
			}
			if (wrappedComponents.has(inner)) return NOOP$1;
			let outer;
			try {
				outer = make(inner);
			} catch (error) {
				console.error(`${tag} 构造 ${target.slot} 包装器失败，插件在该位置不生效`, error);
				return NOOP$1;
			}
			if (!isWrappable(outer)) {
				console.error(`${tag} 为 ${target.slot} 构造的包装器不是组件，插件在该位置不生效`);
				return NOOP$1;
			}
			try {
				entry.component = outer;
			} catch (error) {
				console.error(`${tag} 无法写入 ${target.slot} 的 component（entry 可能被冻结），插件不生效`, error);
				return NOOP$1;
			}
			wrappedComponents.add(outer);
			return () => {
				if (entry.component === outer) entry.component = inner;
			};
		}
		/** 空操作。 */
		const NOOP$1 = () => {};
		//#endregion
		//#region src/client/contract/chat-contract.ts
		/** 位置深度表（与官方同值）。 */
		const DEPTH = {
			exchange: 0,
			input: 1,
			turn: 2,
			process: 3
		};
		/**
		* 克隆自 `contract/group-tree.ts:35-37`。
		*
		* 判断 Node 是否位于某个分组树位置或其外层。
		* @param node - Chat Node（只需 groupTree 字段）。
		* @param position - 要比较的分组树位置。
		* @returns Node 的位置是 `position` 或更外层。
		*/
		function isAtOrOutside(node, position) {
			return node.groupTree !== void 0 && DEPTH[node.groupTree] <= DEPTH[position];
		}
		/**
		* 克隆自 `contract/turn-process.ts:53-58`。
		*
		* 让进行中、已停止、已失败的 Turn 保持展开。
		* @param node - 承载所属 Turn 的 Node。
		* @returns 整轮折叠是否不可用。
		*/
		function turnProcessAlwaysOpen(node) {
			const location = node?.location;
			if (location?.kind !== "turn" && location?.kind !== "step") return false;
			const reason = location.turn.end?.data.reason.kind;
			return location.turn.status === "open" || reason === "aborted" || reason === "interrupted" || reason === "error";
		}
		/**
		* 克隆自 `stores.ts:21-26`。
		*
		* 读取某个 Turn 的手动展开选择。
		* @param state - Chat store 快照。
		* @param turn - 所属 Turn。
		* @returns 该 Turn 的存储条目（若存在）。
		*/
		function storedTurnProcessEntry(state, turn) {
			return state.turnProcesses.find((entry) => entry.turn === turn);
		}
		/**
		* 克隆自 `stores.ts:36-44`。
		*
		* 一个可折叠 Turn 的 process 是否展开：读者对当前回答代际的选择优先；
		* 否则最新已完成的 Turn 保持展开直到下一次输入，更早的 Turn 折叠。
		* @param state - Chat store 快照。
		* @param spec - 该 Turn 的 process 规格。
		* @param defaultOpen - 该 Turn 是否豁免自动折叠。
		* @returns 生效的展开状态。
		*/
		function turnProcessOpen(state, spec, defaultOpen) {
			const stored = storedTurnProcessEntry(state, spec.turn);
			if (stored === void 0 || stored.answerStep !== (spec.answerStep ?? 0)) return defaultOpen;
			return stored.collapsed !== true;
		}
		//#endregion
		//#region src/client/flow/flow-utils.ts
		/**
		* 克隆自 `chat/render-entry.ts`（16 行）。
		*
		* 为两种分组引用生成稳定的 React key。切换展示模式时 key 不变，
		* 这是滚动位置与组件身份保持稳定的前提。
		* @param entry - 与展示模式无关的渲染引用。
		* @returns 无冲突的 React key。
		*/
		function chatRenderKey(entry) {
			switch (entry.kind) {
				case "node": return JSON.stringify([
					"node",
					entry.key,
					entry.groupPart ?? null
				]);
				case "group": return JSON.stringify(["group", entry.key]);
				default: throw new Error(`未知的 RenderEntry：${JSON.stringify(entry)}`);
			}
		}
		/**
		* 克隆自 `chat/flow-motion.ts:98-100`。
		*
		* 判断一行是否已隐藏或正在折叠。`ChatNodeSeat` 用它决定何时重置内层 disclosure。
		* @param element - 受 Turn 级可见性控制的元素。
		* @returns 已有 hidden 属性或折叠过渡未完成。
		*/
		function hiddenOrCollapsing(element) {
			return element.hasAttribute("hidden") || element.dataset.chatMotion === "collapse";
		}
		/**
		* 克隆自 `chat/step-process.ts`（28 行）。
		*
		* 用已关闭 group 的前三个活动类别组合本地化标题，不显示计数。
		* @param summary - 该区间的排名活动与阶段证据。
		* @param t - Chat 命名空间翻译函数。
		* @returns 次级 disclosure 的标题。
		*/
		function processTitle(summary, t) {
			const labels = summary.counts.slice(0, 3).map(({ kind }) => t(`message.stepProcess.done.${kind}`));
			const first = labels[0];
			if (first === void 0) return t("message.stepProcess.done.thinking");
			const continuation = (label) => label.charAt(0).toLowerCase() + label.slice(1);
			const second = labels[1];
			if (second === void 0) return first;
			if (labels.length === 2) {
				const prefix = t("message.stepProcess.sharedPrefix");
				return t("message.stepProcess.joinTwo", {
					first,
					second: continuation(prefix !== "" && first.startsWith(prefix) && second.startsWith(prefix) ? second.slice(prefix.length) : second)
				});
			}
			const title = [first, ...labels.slice(1).map(continuation)].join(t("message.stepProcess.comma"));
			return summary.counts.length > 3 ? t("message.stepProcess.more", { title }) : title;
		}
		/**
		* 克隆自 `chat/message-chrome.ts:54-64`。
		*
		* 生成已运行时长的片段（数字 + 本地化单位）。
		* @param ms - 毫秒；负数归零，小数向下取整。
		* @param t - 提供单位与尾随空格的翻译函数。
		* @returns 按显示顺序排列的数字与单位，无前导零。
		*/
		function formatRunDuration(ms, t) {
			const total = Math.max(0, Math.floor(ms / 1e3));
			const hours = Math.floor(total / 3600);
			const minutes = Math.floor(total / 60) % 60;
			const seconds = total % 60;
			const parts = [];
			if (hours > 0) parts.push({
				text: String(hours),
				numeric: true
			}, {
				text: t("duration.hourUnit"),
				numeric: false
			});
			if (total >= 60) parts.push({
				text: String(minutes),
				numeric: true
			}, {
				text: t("duration.minuteUnit"),
				numeric: false
			});
			parts.push({
				text: String(seconds),
				numeric: true
			}, {
				text: t("duration.secondUnit"),
				numeric: false
			});
			return parts;
		}
		/** 克隆自 `chat/message-chrome.ts:13`：整秒实时时钟的刷新间隔。 */
		const LIVE_RUN_CLOCK_INTERVAL_MS = 1e3;
		//#endregion
		//#region \0dsh-css:src/client/flow/chat-flow.module.css.mjs
		const css$6 = "._6KZBka_flowItem{min-width:0}[data-slot=\"conversation.chat.flow\"]>:not([hidden]):not(._6KZBka_flowItem:is(:empty,:has(>[data-slot=\"conversation.chat.node\"]:empty)))~:not([hidden]):not(._6KZBka_flowItem:is(:empty,:has(>[data-slot=\"conversation.chat.node\"]:empty))){margin-top:var(--dsh-chat-flow-gap,6px)}._6KZBka_flowItem[data-chat-group-part=response]{--dsh-chat-flow-gap:12px}[data-slot=\"conversation.chat.flow\"]>[data-chat-group-part=response]:not([hidden]):not(:empty)+:not([hidden]):not(._6KZBka_flowItem:is(:empty,:has(>[data-slot=\"conversation.chat.node\"]:empty))):not(._6KZBka_running){--dsh-chat-flow-gap:12px}._6KZBka_flowItem[data-chat-flow-kind=turn-process],._6KZBka_flowItem[data-turn-process-answer],[data-slot=\"conversation.chat.flow\"]>[data-chat-flow-kind=turn-process]+:not([hidden]):not(._6KZBka_flowItem:is(:empty,:has(>[data-slot=\"conversation.chat.node\"]:empty))):not(._6KZBka_running){--dsh-chat-flow-gap:16px}._6KZBka_flowItem:is(:empty,:has(>[data-slot=\"conversation.chat.node\"]:empty)){height:0}[data-slot=\"conversation.chat.flow\"]>._6KZBka_flowItem:is(:empty,:has(>[data-slot=\"conversation.chat.node\"]:empty)){margin-top:0!important}._6KZBka_running{--dsh-chat-flow-gap:12px;--dsw-alias-label-shimmer:var(--dsw-alias-label-deep-diving-shimmer);color:var(--dsw-alias-label-deep-diving);font-size:calc(var(--dsh-content-font-size,14px) - 2px);line-height:calc(22px + var(--dsh-content-font-delta,0px));flex-direction:column;align-items:flex-start;display:flex}[data-slot=\"conversation.chat.flow\"]>:nth-last-child(2 of :not([hidden]):not(._6KZBka_flowItem:is(:empty,:has(>[data-slot=\"conversation.chat.node\"]:empty)))):is(._6KZBka_flowItem:not([data-chat-flow-kind=user]):not([data-chat-flow-kind=steering]):not([data-chat-flow-kind=turn-trigger]),[data-chat-group-key])~._6KZBka_running>._6KZBka_runningDivider{display:block}._6KZBka_runningDivider{background:color-mix(in srgb, var(--dsw-alias-border-l1) 75%, var(--dsw-alias-border-l2));pointer-events:none;width:100%;height:.5px;margin:8px 0 10px;display:none}._6KZBka_runningContent{align-items:center;gap:6px;min-width:0;display:inline-flex}._6KZBka_runningText{font-variant-numeric:tabular-nums;min-width:0}._6KZBka_runningIcon{width:calc(14px + var(--dsh-content-font-delta,0px));height:calc(14px + var(--dsh-content-font-delta,0px));contain:strict;flex:none;display:inline-flex;position:relative;overflow:hidden}._6KZBka_runningWhaleAnimated{display:none;position:absolute;inset:0}._6KZBka_runningWhaleStill{display:initial}@supports (mask-mode:alpha) and (mask-image:url('')){@media (prefers-reduced-motion:no-preference) and (forced-colors:none){._6KZBka_runningWhaleAnimated{will-change:transform;background:currentColor;display:block;mask:url(data:image/png;base64,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) 50%/100% 100% no-repeat alpha}._6KZBka_runningWhaleStill{display:none}}}";
		const tagId$6 = "dsh-auto-expand/src/client/flow/chat-flow.module.css";
		if (typeof document !== "undefined") {
			let tag = document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$6) + "]");
			if (tag === null) {
				tag = document.createElement("style");
				tag.dataset.plugin = "dsh-auto-expand";
				tag.dataset.pluginCss = tagId$6;
				document.head.appendChild(tag);
			}
			tag.textContent = css$6;
		}
		var chat_flow_module_css_default = {
			"flowItem": "_6KZBka_flowItem",
			"running": "_6KZBka_running",
			"runningContent": "_6KZBka_runningContent",
			"runningDivider": "_6KZBka_runningDivider",
			"runningIcon": "_6KZBka_runningIcon",
			"runningText": "_6KZBka_runningText",
			"runningWhaleAnimated": "_6KZBka_runningWhaleAnimated",
			"runningWhaleStill": "_6KZBka_runningWhaleStill"
		};
		//#endregion
		//#region src/client/flow/AutoNodeSeat.tsx
		/**
		* 克隆自 `chat/ChatNodeSeat.tsx`（174 行）。
		*
		* 上游：@deepseek-ai/dsh-client-ui-chat@0.2.1-rc.3，commit 1f81c047fc
		*
		* 修改点（仅一处）：
		*   - 渲染 `AutoGroupSeat` 而非官方 `ChatGroupSeat`（`AutoFlow` 中分发）。
		*
		* 其余逻辑逐字保留，包括第一层（整轮折叠）的全部判定、`disclosureReset`
		* 机制、以及 `data-*` 属性。第一层不属本插件范围，必须与官方完全一致。
		*/
		/** 取 Node 所属 Turn 的数据存储。 */
		function turnDataOf(node) {
			const location = node?.location;
			return location?.kind === "turn" || location?.kind === "step" ? location.turn.data : void 0;
		}
		/** 取 Node 所属 Turn 编号。 */
		function turnOf(node) {
			const location = node?.location;
			return location?.kind === "turn" || location?.kind === "step" ? location.turn.turn : void 0;
		}
		/**
		* 订阅、应用 Turn 级可见性，并按稳定的 Context key 分发。
		*
		* 策略读取只选择本座位自己的结论，因此模式变化只重渲染可见性真正改变的座位。
		*/
		const AutoNodeSeat = (0, react.memo)(function AutoNodeSeat({ nodeKey, groupPart, useChatNode, useChatNodeProcess, usePresentation, cwd, openFile, inspectCall, forkAt, loadImage, fileMentions, useStore, actions, renderSlot, t, useChatNodeBottom, deferCollapse, useGroupAction }) {
			const bottom = useChatNodeBottom(nodeKey);
			const node = useChatNode(nodeKey);
			const routedNode = node;
			const turn = turnOf(routedNode);
			const processPresentation = useChatNodeProcess(nodeKey);
			const processSpec = processPresentation?.spec;
			const storedOpen = useStore((state) => processSpec !== void 0 && turnProcessOpen(state, processSpec, bottom === true && deferCollapse));
			const liveProcess = processPresentation !== void 0 && !processPresentation.turnClosed;
			const interleavedInput = processPresentation?.hasInterleavedInput === true;
			const alwaysOpen = liveProcess || interleavedInput || turnProcessAlwaysOpen(routedNode);
			const processOpen = alwaysOpen || storedOpen;
			const setOpen = (0, react.useCallback)((open) => {
				if (processSpec !== void 0 && !alwaysOpen) actions.setTurnProcessOpen(processSpec.turn, processSpec.answerStep ?? 0, open);
			}, [
				actions,
				processSpec,
				alwaysOpen
			]);
			const foldCompleted = usePresentation((policy) => policy.foldCompletedTurns);
			const processWindowReady = processSpec !== void 0 && processPresentation !== void 0 && foldCompleted && processPresentation.turn === processSpec.turn && (processPresentation.turnStarted || processPresentation.turnClosed);
			const processMember = routedNode !== void 0 && processWindowReady && !isAtOrOutside(routedNode, "turn") && routedNode.anchorSeq >= processSpec.processStartSeq && (liveProcess || processSpec.answerAnchorSeq === null || routedNode.anchorSeq < processSpec.answerAnchorSeq || groupPart === "reasoning" && routedNode.kind === "assistant-step" && routedNode.data.step === processSpec.answerStep);
			const processAnswer = routedNode !== void 0 && processWindowReady && !liveProcess && groupPart !== "reasoning" && routedNode.kind === "assistant-step" && routedNode.data.step === processSpec.answerStep;
			const ownsDisclosure = routedNode?.kind === "turn-process" || processAnswer;
			const foldable = processWindowReady && (liveProcess || processMember || ownsDisclosure);
			const turnProcess = (0, react.useMemo)(() => processSpec === void 0 ? void 0 : {
				spec: processSpec,
				foldable,
				hasContent: !interleavedInput && (processPresentation?.hasExternalProcess === true || processSpec.inlineReasoning),
				open: processOpen,
				setOpen
			}, [
				foldable,
				interleavedInput,
				processOpen,
				processSpec,
				processPresentation?.hasExternalProcess,
				setOpen
			]);
			const controllerInactive = routedNode?.kind === "turn-process" && foldCompleted && !foldable;
			const compactAnswer = processAnswer && foldable && processPresentation.compactAnswer && !processOpen;
			const processHidden = controllerInactive || foldable && processMember && !processOpen;
			const wrapperRef = useGroupAction(processHidden, (0, react.useCallback)(() => {
				if (processMember) setOpen(true);
			}, [processMember, setOpen]));
			const [disclosureReset] = (0, react.useState)(() => (0, _deepseek_ai_dsh_client_store.createSnapshotStore)(0));
			const turnData = turnDataOf(routedNode);
			const hookContext = (0, react.useMemo)(() => ({
				turnData,
				disclosureReset,
				useGroupAction
			}), [
				turnData,
				disclosureReset,
				useGroupAction
			]);
			(0, react.useEffect)(() => {
				if (processMember && processHidden && wrapperRef.current !== null && hiddenOrCollapsing(wrapperRef.current)) disclosureReset.set(disclosureReset.getSnapshot() + 1);
			}, [
				processMember,
				processHidden,
				wrapperRef,
				disclosureReset
			]);
			const owner = (0, react.useMemo)(() => node === void 0 ? null : {
				...groupPart === void 0 ? {} : { groupPart },
				cwd,
				openFile,
				inspectCall,
				forkAt,
				loadImage,
				fileMentions,
				turnProcess
			}, [
				node,
				groupPart,
				cwd,
				openFile,
				inspectCall,
				forkAt,
				loadImage,
				fileMentions,
				turnProcess
			]);
			if (routedNode === void 0 || owner === null) return null;
			const routedOwner = {
				...owner,
				node: routedNode
			};
			const flowKey = groupPart === void 0 || groupPart === "response" ? routedNode.key : JSON.stringify([routedNode.key, groupPart]);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				ref: wrapperRef,
				className: chat_flow_module_css_default.flowItem,
				"data-chat-anchor-key": flowKey,
				"data-chat-flow-key": flowKey,
				"data-chat-paging-anchor": routedNode.kind !== "turn-process" || void 0,
				"data-chat-node-key": routedNode.key,
				"data-chat-group-part": groupPart,
				"data-chat-flow-kind": routedNode.kind,
				"data-chat-turn": turn,
				"data-turn-process-member": processMember || void 0,
				"data-turn-process-hidden": processHidden || void 0,
				"data-turn-process-answer": compactAnswer || void 0,
				children: renderSlot("conversation.chat.node", routedOwner, {
					entryKey: routedNode.kind,
					hookContext,
					fallback: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.JsonBlock, {
						label: t("message.unknownSurface", { type: routedNode.kind }),
						payload: routedNode.data,
						truncatedLabel: (total) => t("json.truncated", { total })
					})
				})
			});
		});
		//#endregion
		//#region src/client/auto-disclosure.ts
		/**
		* 自动状态 + 一次性手动覆盖的 disclosure。
		*
		* 为什么不用官方 `use-disclosure.ts`：官方语义是"重置版本变化时整体重置"，
		* 而本插件需要的是"自动状态变化时丢弃手动覆盖、之后由手动接管"。两者在
		* "折叠只触发一次"这一点上不同。
		*
		* 为什么用派生态而非 useEffect：`useEffect` 会在自动转换后先渲染一帧旧状态，
		* 视觉上是一次闪烁。渲染期 setState 会让 React 立即重跑本组件，不产生额外帧。
		* 这与 `ui-renderer` 的 `useMaybeIncarnation`（scoped-slots.tsx:737-765）同源。
		*/
		/**
		* 跟随自动状态的 disclosure，允许用户覆盖一次。
		*
		* `autoOpen` 一旦变化，手动覆盖立即丢弃，渲染回到新的 `autoOpen`。
		* 这条规则实现"折叠只触发一次"：group 从"未关闭"变"已关闭"时自动折叠，
		* 此后 `autoOpen` 恒为 false，用户手动展开即永久保持。
		*
		* @param autoOpen - 当前"应当处于"的自动状态。
		* @returns 当前展开状态、是否仍跟随自动，以及用户操作。
		*/
		function useAutoDisclosure(autoOpen) {
			const [seen, setSeen] = (0, react.useState)(autoOpen);
			const [override, setOverride] = (0, react.useState)(void 0);
			if (autoOpen !== seen) {
				setSeen(autoOpen);
				setOverride(void 0);
			}
			const open = override ?? autoOpen;
			const setOpen = (0, react.useCallback)((next) => {
				setOverride(next);
			}, []);
			const toggle = (0, react.useCallback)(() => {
				setOverride((prev) => !(prev ?? autoOpen));
			}, [autoOpen]);
			return {
				open,
				following: override === void 0,
				setOpen,
				toggle
			};
		}
		//#endregion
		//#region src/client/collapse-timing.ts
		/**
		* 全部时机取值，顺序 = 下拉展示顺序 = 收起由早到晚。
		*
		* 思考行与工具行**共用这一份**：两者的坐标齐全，四个时机都成立。
		* Host 侧的 schema 也用它，从而两端不可能出现取值集合不一致。
		*/
		const COLLAPSE_TIMINGS = [
			"self",
			"next-call",
			"next-node",
			"group"
		];
		/**
		* 判断某行所属节点是否属于所属操作组的**最新一批**（按 `step`）。
		*
		* 这是「下一批操作出现时」用的批次级判据：同一次模型输出里并行发起的多个
		* 操作共享同一个 `step`，因此它们会被判定为同一批、**一起**保持展开。
		*
		* 用 `>=` 而不是 `==`：组内最新 `step` 单调不减，正常流程下两者等价；但成员
		* 列表暂时不完整时 `>=` 只会多展开、不会误收，是安全的一侧。
		*
		* `latestStep === undefined`（空组、或尚未拿到成员）时**视为最新**：
		* 拿不到信息时保守地保持展开，而不是错误地收起。
		* @param step - 该行所属节点的 `step`（模型输出轮次）。
		* @param latestStep - 所属操作组最新成员的 `step`。
		* @returns 是否属于最新一批。
		*/
		function isLatestStep(step, latestStep) {
			return latestStep === void 0 || step >= latestStep;
		}
		/**
		* 判断某行所属节点是否为所属操作组的**最新一条已开始的操作**（按 `anchorSeq`）。
		*
		* 这是「下一条操作出现时」用的操作级判据：只有组内**已开始**的成员里
		* `anchorSeq` 最大的那一条展开；下一条开始执行时，前一条立刻收起。
		* 已经做完但还没有后续操作接手的，保持展开（`anchorSeq` 不变，判据仍为真）。
		*
		* `latestAnchorSeq === undefined` 时同样**视为最新**——与 {@link isLatestStep}
		* 保持一致：信号缺失时不要误收用户正在看的内容。
		* @param anchorSeq - 该行所属节点的 `anchorSeq`（节点序号）。
		* @param latestAnchorSeq - 所属操作组**最新一条已开始**成员的 `anchorSeq`（`GroupOpenContext.latestStartedAnchorSeq`）。
		* @returns 是否是最新一条已开始的操作。
		*/
		function isLatestAnchor(anchorSeq, latestAnchorSeq) {
			return latestAnchorSeq === void 0 || anchorSeq >= latestAnchorSeq;
		}
		/**
		* 从一个 Chat 节点里取出它的 `step`（模型输出轮次）。
		*
		* 两类节点的 `step` 来源不同：
		*
		* | 节点类型 | 路径 |
		* |---|---|
		* | `assistant-step` | `node.data.step`（`AssistantChatData.step`） |
		* | `tool-call` | `node.data.root.step`（`ToolCallHead.step`） |
		*
		* ⚠️ 工具的 `result` 阶段没有 `step`（`ToolResultNode` 不继承 `ToolCallHead`），
		* 因此返回 `undefined`。调用方那里用 `useRef` 固定了它（`useStableToolStep`）。
		*
		* 其它节点（`user`、`turn-trigger`、`context` 等）没有 step，返回 `undefined`。
		* @param node - 任意 Chat 节点，或 undefined。
		* @returns 该节点的 step；不适用时为 undefined。
		*/
		function stepOfNode(node) {
			if (node === null || typeof node !== "object") return void 0;
			const record = node;
			if (record.kind === "assistant-step") {
				const step = record.data?.step;
				return typeof step === "number" ? step : void 0;
			}
			if (record.kind === "tool-call") {
				const step = record.data?.root?.step;
				return typeof step === "number" ? step : void 0;
			}
		}
		/**
		* 判断「一条操作」是否**已经开始执行**（工具行侧）。
		*
		* 上游把工具调用的生命周期分成三段（`ToolCallBlock`）：
		*
		* | 阶段 | 含义 | 是否已开始 |
		* |---|---|---|
		* | `preparing` | 参数还在流式输出，尚未派发 | **否** |
		* | `start` | `tool/call` 已到达，正在执行 | 是 |
		* | `result` | `tool/result` 已到达，执行完毕 | 是 |
		*
		* 这个区分是「下一条操作出现时」能正确工作的前提：同一次模型输出里的多条
		* 工具在**流式阶段就全部建好了节点**，若把 `preparing` 也算作「已出现」，
		* 它们会从第一帧起就互相取代，最后只剩节点序号最大的那条能展开。
		* @param root - `node.data.root`（工具根调用块），可为 undefined。
		* @returns 是否已经开始执行。
		*/
		function toolStarted(root) {
			if (root === null || typeof root !== "object") return false;
			if ("kind" in root) return true;
			return root.phase !== "preparing";
		}
		/**
		* 从一个 Chat 节点里取出「它**开始执行**时的节点序号」；尚未开始时返回 `undefined`。
		*
		* 这是「下一条操作出现时」用的操作坐标。与 {@link stepOfNode} 的区别：
		*
		* | 坐标 | 表达 | 未开始时 |
		* |---|---|---|
		* | `step` | 批次（同一次模型输出） | 有值 |
		* | 本函数 | 单条操作**实际开始**的先后 | **`undefined`** |
		*
		* 为什么要过滤未开始的：工具节点在**流式阶段**（`preparing`）就被创建，
		* `anchorSeq` 此时已经定死。若直接拿它比较，同一次模型输出派发的多条工具会
		* 在执行前就分出「谁最大」，于是只有序号最大的那条能展开。只把**已开始**的
		* 成员纳入比较，最新者才会随执行推进而前移——这正是「当前跑哪条就展示哪条，
		* 下一条开始执行时上一条才收起」。
		*
		* 两类节点的判定：
		*
		* | 节点类型 | 视为已开始的条件 |
		* |---|---|
		* | `assistant-step` | 一出现即在流式产出内容，恒为已开始 |
		* | `tool-call` | `root` 非 `preparing`（见 {@link toolStarted}） |
		* @param node - 任意 Chat 节点，或 undefined。
		* @returns 已开始时返回该节点的 `anchorSeq`；未开始或不适用时返回 `undefined`。
		*/
		function startedAnchorOfNode(node) {
			if (node === null || typeof node !== "object") return void 0;
			const record = node;
			const anchorSeq = record.anchorSeq;
			if (typeof anchorSeq !== "number") return void 0;
			if (record.kind === "assistant-step") return anchorSeq;
			if (record.kind !== "tool-call") return void 0;
			return toolStarted(record.data?.root) ? anchorSeq : void 0;
		}
		/**
		* 判断某行此刻是否应处于自动展开状态。
		*
		* 思考行与工具行调用的是同一个函数、同一组字段——两者的差别只在**信号怎么
		* 取**（`done` 是 `!running` 还是 `result` 阶段、`step` 要不要 `useRef` 固定），
		* 不在判据本身。
		* @param input - 收起时机与两个判据信号。
		* @returns 是否自动展开。
		*/
		function autoOpenFor(input) {
			if (!input.enabled) return false;
			switch (input.timing) {
				case "self": return !input.done;
				case "next-call": return input.isLatestNode;
				case "next-node": return input.isLatestBatch;
				case "group": return true;
			}
		}
		//#endregion
		//#region src/client/settings-write.ts
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
		async function writeOptimistic(store, form, field, value) {
			const previous = store.getSnapshot();
			if (previous[field] === value) return true;
			if (form === void 0) return false;
			store.set({
				...previous,
				[field]: value
			});
			try {
				const accepted = await form.set(String(field), value);
				if (!accepted) store.set(previous);
				return accepted;
			} catch {
				store.set(previous);
				return false;
			}
		}
		//#endregion
		//#region src/client/inspect-button-scope.ts
		/**
		* 全部取值，顺序 = 下拉展示顺序 = **从松到紧**。
		*
		* Host 侧的 schema 也用它，从而两端不可能出现取值集合不一致。
		*/
		const INSPECT_BUTTON_HIDE_SCOPES = [
			"off",
			"current",
			"all"
		];
		/**
		* 按隐藏范围决定**透传给官方组件**的 `inspectCall`。
		*
		* 返回 `undefined` 时，官方会把 `inspect` 也算成 `undefined`，于是按钮、它
		* 预留的那一行高度、以及详情卡右侧给按钮让位的 88px 内边距**一起消失**。
		*
		* 返回原回调时，行为与未安装本插件完全一致。
		*
		* ## 三档
		*
		* | 取值 | 运行中（`autoOpen` 真） | 已收起（`autoOpen` 假） |
		* |---|---|---|
		* | `'off'` | 原回调 | 原回调 |
		* | `'current'` | **`undefined`** | 原回调（交回官方） |
		* | `'all'` | `undefined` | `undefined` |
		*
		* ## 绝不能返回空函数
		*
		* 官方判的是 `inspect !== undefined`，不是「按钮能不能用」。返回一个空函数
		* 会造出一个**渲染出来、点了没反应**的按钮——比不隐藏更糟。
		*
		* @param input - 档位、这一行是否运行中、上游回调。
		* @returns 应透传的回调；`undefined` 表示不渲染按钮。
		*/
		function inspectCallFor(input) {
			if (input.inspectCall === void 0) return void 0;
			switch (input.scope) {
				case "current": return input.autoOpen ? void 0 : input.inspectCall;
				case "all": return;
				default: return input.inspectCall;
			}
		}
		/**
		* 算出某一组 body 应有的高度。
		*
		* 规则按顺序命中，先命中先返回：
		*
		* | # | 条件 | 结果 |
		* |---|---|---|
		* | 0 | `!groupAutoExpand` | `null`（整个功能不生效） |
		* | 1 | `!capped` | `null`（官方本就不设上限） |
		* | 2 | `!isCurrent && !history` | `null`（历史组不应用） |
		* | 3 | `unlimited` | 无上限，成对给 `overflow-y` |
		* | 4 | `percent === 100` | `null`（与官方逐像素相同，不干预） |
		* | 5 | 其他 | `min(percent*4 px, percent*0.5 vh)` |
		*
		* 第 4 条是「100% = 官方默认」的实现：不写任何内联样式，让 `.body` 的
		* `min(400px, 50vh)` 原样生效。这样默认状态与未安装插件**完全一致**。
		*
		* @param input - 组状态与当前设置。
		* @returns 内联样式；`null` 表示不写 style，交给 CSS class。
		*/
		function groupHeight(input) {
			if (!input.groupAutoExpand) return null;
			if (!input.capped) return null;
			if (!input.isCurrent && !input.history) return null;
			if (input.unlimited) return {
				maxHeight: "none",
				overflowY: "visible"
			};
			if (input.percent === 100) return null;
			return { maxHeight: `min(${input.percent * 4}px, ${input.percent * .5}vh)` };
		}
		//#endregion
		//#region src/client/settings.ts
		/**
		* 浏览器侧的设置源。
		*
		* 设置通过官方 `configForms` 读写（Host 设置文档），因此跨重启保留。
		*
		* 为什么用模块级单例而不是 React Context：
		*  - `AutoGroupSeat` 与 `AutoReasoningRow` 都深埋在克隆组件树里，
		*    用 Context 要逐层透传；
		*  - 本插件每个页面只有一个实例，单例不会串状态；
		*  - 组件通过 `useAutoExpandSettings()` 订阅，快照只在两个布尔真正变化时替换。
		*
		* 生命周期：模块加载时以默认值起步（默认全开），`apply()` 拿到
		* `configForms` 后接管真实值。因此即使设置服务缺失，插件仍以默认行为工作。
		*/
		/** 本插件设置命名空间（= Host 半边在 `cordis.patch.yml` 里的 entry id）。 */
		const AUTO_EXPAND_NAMESPACE = "auto-expand";
		/** 字段名（与 Host schema 一致）。 */
		const GROUP_AUTO_EXPAND_FIELD = "groupAutoExpand";
		const REASONING_AUTO_EXPAND_FIELD = "reasoningAutoExpand";
		const TOOL_AUTO_EXPAND_FIELD = "toolAutoExpand";
		const REASONING_COLLAPSE_TIMING_FIELD = "reasoningCollapseTiming";
		const TOOL_COLLAPSE_TIMING_FIELD = "toolCollapseTiming";
		const INSPECT_BUTTON_HIDE_SCOPE_FIELD = "inspectButtonHideScope";
		const GROUP_HEIGHT_UNLIMITED_FIELD = "groupHeightUnlimited";
		const GROUP_HEIGHT_PERCENT_FIELD = "groupHeightPercent";
		const GROUP_HEIGHT_HISTORY_FIELD = "groupHeightHistory";
		/** 默认设置：三个开关默认全开；两个时机默认「下一批操作出现时」；查看按钮不隐藏。 */
		const DEFAULT_SETTINGS = {
			groupAutoExpand: true,
			reasoningAutoExpand: true,
			toolAutoExpand: true,
			reasoningCollapseTiming: "next-node",
			toolCollapseTiming: "next-node",
			inspectButtonHideScope: "off",
			groupHeightUnlimited: false,
			groupHeightPercent: 100,
			groupHeightHistory: false
		};
		/**
		* 模块级设置源。
		*
		* 默认值起步；`attachSettingsForm()` 成功后跟随 Host 的真实值。
		*/
		const settingsSource = (0, _deepseek_ai_dsh_client_store.createSnapshotStore)(DEFAULT_SETTINGS);
		/** 已接管的表单，保证重复接管不会叠加订阅。 */
		let attached;
		/**
		* 订阅一个 `configForms` 表单，并在任一设置变化时更新 `settingsSource`。
		*
		* 只在**设置值真正变化**时替换快照，因此表单的 `status`/`revision`
		* 抖动不会引起下游重渲染。
		* @param form - 官方 configForms 表单，命名空间为本插件 entry id。
		* @returns 释放订阅的函数。
		*/
		function attachSettingsForm(form) {
			attached?.dispose();
			const read = () => {
				const value = form.getSnapshot().value;
				return {
					groupAutoExpand: value?.groupAutoExpand ?? DEFAULT_SETTINGS.groupAutoExpand,
					reasoningAutoExpand: value?.reasoningAutoExpand ?? DEFAULT_SETTINGS.reasoningAutoExpand,
					toolAutoExpand: value?.toolAutoExpand ?? DEFAULT_SETTINGS.toolAutoExpand,
					reasoningCollapseTiming: value?.reasoningCollapseTiming ?? DEFAULT_SETTINGS.reasoningCollapseTiming,
					toolCollapseTiming: value?.toolCollapseTiming ?? DEFAULT_SETTINGS.toolCollapseTiming,
					inspectButtonHideScope: value?.inspectButtonHideScope ?? DEFAULT_SETTINGS.inspectButtonHideScope,
					groupHeightUnlimited: value?.groupHeightUnlimited ?? DEFAULT_SETTINGS.groupHeightUnlimited,
					groupHeightPercent: value?.groupHeightPercent ?? DEFAULT_SETTINGS.groupHeightPercent,
					groupHeightHistory: value?.groupHeightHistory ?? DEFAULT_SETTINGS.groupHeightHistory
				};
			};
			const sync = () => {
				const next = read();
				const current = settingsSource.getSnapshot();
				if (next.groupAutoExpand === current.groupAutoExpand && next.reasoningAutoExpand === current.reasoningAutoExpand && next.toolAutoExpand === current.toolAutoExpand && next.reasoningCollapseTiming === current.reasoningCollapseTiming && next.toolCollapseTiming === current.toolCollapseTiming && next.inspectButtonHideScope === current.inspectButtonHideScope && next.groupHeightUnlimited === current.groupHeightUnlimited && next.groupHeightPercent === current.groupHeightPercent && next.groupHeightHistory === current.groupHeightHistory) return;
				settingsSource.set(next);
			};
			sync();
			const unsubscribe = form.subscribe(sync);
			const dispose = () => {
				unsubscribe();
				if (attached?.form === form) attached = void 0;
			};
			attached = {
				form,
				dispose
			};
			return dispose;
		}
		/**
		* 写入一个开关。
		*
		* 乐观：先更新本地快照，再写 Host；写失败时回滚到 Host 的值。
		* 这样开关切换不会因为 RPC 往返而卡顿。具体规则与回滚时机见
		* `settings-write.ts`（那里是可单测的纯逻辑）。
		* @param field - 字段名。
		* @param value - 新值。
		* @returns 写入是否被 Host 接受。
		*/
		async function setAutoExpandSetting(field, value) {
			return writeOptimistic(settingsSource, attached?.form, field, value);
		}
		/**
		* 订阅本插件的设置。
		* @returns 当前设置快照。
		*/
		function useAutoExpandSettings() {
			return (0, react.useSyncExternalStore)(settingsSource.subscribe, settingsSource.getSnapshot, settingsSource.getSnapshot);
		}
		//#endregion
		//#region src/client/group-open-context.ts
		/**
		* 所属操作组的展开状态与两个坐标，供内层行（思考行、工具行）判断收起时机。
		*
		* ## 四个字段
		*
		* - `open` —— body 的**实际**展开状态（含用户的手动覆盖）；
		* - `auto` —— 该操作组是否处于**当前轮的自动展开窗口**
		*   （`AutoGroupSeat` 已有的 `settings.groupAutoExpand && !(closed === true)`）；
		* - `latestStep` —— 本组**最新成员**的 `step`（批次坐标），供「下一批操作出现时」；
		* - `latestStartedAnchorSeq` —— 本组**最新一条已开始的操作**的 `anchorSeq`
		*   （操作坐标），供「下一条操作出现时」。
		*
		* `open` 与 `auto` 必须分开：历史操作组被用户手动展开时 `open === true` 但
		* `auto === false`，若内层行只看 `open`，用户一展开历史大段，里面的行就会全部
		* 自动弹出，直接破坏「历史轮次完全不受影响」的承诺（`CAPABILITY-MATRIX.md` E1）。
		*
		* ## 为什么要两个坐标
		*
		* | 坐标 | 语义 | 用途 |
		* |---|---|---|
		* | `step` | **批次**：一次模型输出派发的全部操作共享同一值 | 同批多条**一起**展开 |
		* | `anchorSeq` | **单条**：每个节点唯一 | 串行时「永远只留最新的一条操作」 |
		*
		* ## 为什么操作坐标必须带「已开始」
		*
		* 工具节点在**流式阶段**（`preparing`）就已被创建，`anchorSeq` 此时已经定死。
		* 若直接取「成员里最大的 anchorSeq」，同一次模型输出派发的多条工具会在执行前
		* 就分出胜负——最后一条永远最大，其余几条永远不展开（真机已复现）。
		*
		* 只统计**已开始**（走出 `preparing`）的成员，最新者才会随执行推进而前移：
		*
		* | 时刻 | 已开始成员 | `latestStartedAnchorSeq` |
		* |---|---|---|
		* | 三条都在 preparing | 只有思考节点 | 思考的 anchorSeq |
		* | A 开始执行 | 思考、A | A |
		* | A 完成、B 未开始 | 思考、A | A（A 保持展开） |
		* | B 开始执行 | 思考、A、B | B（A 收起、B 展开） |
		*
		* ## 默认值
		*
		* `open: true` 沿用 P3 以来的取值：`groupPart === 'response'` 的渲染发生在
		* 组之外、没有 Provider，取默认值不影响——响应区没有思考块。
		* `auto: false` 保证没有 Provider 时不会有任何内层行被自动展开。
		* 两个坐标的 `undefined` 被 `isLatestStep` / `isLatestAnchor` 视为「最新」——
		* **信息缺失时保守地保持展开**，而不是错误地收起。
		*/
		/** 所属操作组的状态；无 Provider 时按「展开、但不自动展开内层行」处理。 */
		const GroupOpenContext = (0, react.createContext)({
			open: true,
			auto: false,
			latestStep: void 0,
			latestStartedAnchorSeq: void 0
		});
		//#endregion
		//#region src/client/flow/use-scroll-follow.ts
		/**
		* 克隆自 `chat/use-scroll-follow.ts`（182 行）。
		*
		* 上游：@deepseek-ai/dsh-client-ui-chat@0.2.1-rc.3，commit 1f81c047fc
		*
		* 逐字保留，仅去掉对 `useState` 之外无关内容的依赖。这是 process group
		* 内部滚动跟随的内核，任何简化都会改变手感（边缘渐变、scrollend 处理、
		* 平滑动画中断），因此不做精简。
		*
		* 独立于分页与 DOM 观察器的底部跟随意图与原生滚动。
		*/
		/**
		* 读取一个滚动容器，不测量其子元素。
		* @param element - 滚动元素。
		* @returns 当前位置与范围。
		*/
		function scrollMetrics(element) {
			const height = element.clientHeight;
			return {
				top: element.scrollTop,
				height,
				floor: Math.max(0, element.scrollHeight - height)
			};
		}
		/** 一个滚动容器的跟随意图；原生动画进度不算读者移动。 */
		var ScrollFollow = class ScrollFollow {
			following;
			threshold;
			static owners = /* @__PURE__ */ new WeakMap();
			target = null;
			sampledTop;
			/**
			* @param following - 初始跟随意图。
			* @param threshold - 距底部可接受的距离（像素）。
			*/
			constructor(following, threshold) {
				this.following = following;
				this.threshold = threshold;
			}
			/**
			* 找到已挂载的控制器，用于阅读位置补偿。
			* @param element - 可选的跟随所有者所在的滚动容器。
			* @returns 其控制器（若已绑定）。
			*/
			static forElement(element) {
				return this.owners.get(element);
			}
			/**
			* 与同一滚动容器的阅读位置补偿共享此控制器。
			* @param element - 被拥有的滚动容器。
			* @returns 卸载或关闭时解除关联。
			*/
			bind(element) {
				ScrollFollow.owners.set(element, this);
				return () => {
					if (ScrollFollow.owners.get(element) === this) ScrollFollow.owners.delete(element);
				};
			}
			/**
			* 独立于当前偏移量暴露跟随意图。
			* @returns 内容增长时是否应跟随底部。
			*/
			get active() {
				return this.following;
			}
			/**
			* 在接受读者输入前暴露未完成的原生运动。
			* @returns 原生跟随动画是否有未完成的目标。
			*/
			get animating() {
				return this.target !== null;
			}
			/**
			* 使用此滚动容器自己的容差判定到达底部。
			* @param metrics - 当前滚动几何。
			* @returns 位置是否在跟随阈值内。
			*/
			nearBottom(metrics) {
				return Math.abs(metrics.floor - metrics.top) <= this.threshold;
			}
			/**
			* 提交调用方拥有的跟随决策，不移动滚动容器。
			* @param active - 外部提交的跟随意图。
			*/
			setFollowing(active) {
				this.following = active;
				if (!active) this.target = null;
			}
			/** 将下一次可见布局采纳为新的阅读位置。 */
			reset() {
				this.setFollowing(false);
				this.sampledTop = void 0;
			}
			/**
			* 在原生动画期间保留意图的同时采纳已交付的滚动。
			* @param metrics - 当前几何。
			* @param movedByReader - 调用方归因；省略时比较上次采样位置。
			* @returns 更新后的跟随意图。
			*/
			sample(metrics, movedByReader = this.sampledTop === void 0 || Math.abs(metrics.top - this.sampledTop) > .5) {
				this.sampledTop = metrics.top;
				if (!this.animating && movedByReader) this.following = this.nearBottom(metrics);
				return this.active;
			}
			/**
			* 结算原生滚动；偏离目标的停止会释放跟随意图。
			* @param metrics - scrollend 时实际交付的几何。
			* @returns 完成或中断原生运动后的跟随意图。
			*/
			settle(metrics) {
				const target = this.target;
				this.target = null;
				return this.sample(metrics, target === null ? void 0 : Math.abs(metrics.top - Math.min(target, metrics.floor)) > this.threshold);
			}
			/**
			* 立即定位并采纳结果跟随意图。
			* @param element - 滚动元素。
			* @param metrics - 定位前的几何。
			* @param top - 请求的偏移量，被钳制到已测量范围。
			* @returns 定位后的几何。
			*/
			jump(element, metrics, top) {
				const animated = this.animating;
				this.target = null;
				const target = Math.max(0, Math.min(metrics.floor, top));
				if (animated) element.scrollTo({
					top: target,
					behavior: "instant"
				});
				else if (target !== metrics.top) element.scrollTop = target;
				const landed = {
					...metrics,
					top: element.scrollTop
				};
				this.sampledTop = landed.top;
				this.following = this.nearBottom(landed);
				return landed;
			}
			/**
			* 跟随已测量的底部，对平滑请求尊重减少动效偏好。
			* 平滑请求保留未完成目标；立即跟随更新会在内容改变底部时重定目标。
			* 容差内的定位在无未完成动画时立即执行。
			* @param element - 滚动元素。
			* @param metrics - 当前几何。
			* @param behavior - 内容增长的动画方式，或已在动画时立即定位。
			* @returns 当前几何；平滑请求在原生滚动交付前保留起始位置。
			*/
			toBottom(element, metrics, behavior) {
				this.following = true;
				if (metrics.top === metrics.floor) return this.jump(element, metrics, metrics.floor);
				if (behavior === "instant" && this.animating) {
					if (this.target !== metrics.floor) {
						this.target = metrics.floor;
						element.scrollTo({
							top: metrics.floor,
							behavior: "smooth"
						});
					}
					return metrics;
				}
				if (behavior === "instant" || !this.animating && this.nearBottom(metrics)) return this.jump(element, metrics, metrics.floor);
				if (typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches) return this.jump(element, metrics, metrics.floor);
				if (this.target === null) {
					this.target = metrics.floor;
					element.scrollTo({
						top: metrics.floor,
						behavior: "smooth"
					});
				}
				return metrics;
			}
			/**
			* 在读者手势前取消原生运动；只有后续实际移动才改变跟随意图。
			* @param element - 滚动元素。
			* @param metrics - 中断时的位置。
			*/
			interrupt(element, metrics) {
				if (!this.animating) return;
				this.target = null;
				this.sampledTop = metrics.top;
				element.scrollTo({
					top: metrics.top,
					behavior: "instant"
				});
			}
		};
		/**
		* 保留一个独立的跟随控制器，滚动采样不触发 React 更新。
		* @param initial - 初始跟随意图。
		* @param threshold - 距底部可接受的距离（像素）。
		* @returns 由调用方的滚动与尺寸处理器共享的稳定控制器。
		*/
		function useScrollFollow(initial, threshold) {
			const [follow] = (0, react.useState)(() => new ScrollFollow(initial, threshold));
			return follow;
		}
		//#endregion
		//#region src/client/flow/use-process-scroll.ts
		/**
		* 克隆自 `chat/use-process-scroll.ts`（88 行）。
		*
		* 上游：@deepseek-ai/dsh-client-ui-chat@0.2.1-rc.3，commit 1f81c047fc
		*
		* 修改点（两处，其余逐字保留）：
		*   1. `sync` 的 resize 分支不再用当次几何重判跟随意图。
		*      **根因**：body 默认开启滚动锚定（`overflow-anchor: auto`），内容在
		*      视口上方变高时浏览器会主动改 `scrollTop`。`ScrollFollow.sample()` 把
		*      「scrollTop 变了」当成「读者滚了」，于是把跟随关掉。本插件 P3 的思考
		*      自动展开正是"body 内部一次性大幅长高"的来源，因此典型触发场景是
		*      大段思考展开。跟随一旦被关掉不会自恢复（`toBottom` 是唯一恢复路径，
		*      而它的入口条件就是"已在跟随"），于是表现为滚动永久失效，直到读者
		*      手动滚到底。
		*   2. 新增 `realign()`：立即执行一次 resize 校准。
		*      `initialize()` 只是记下意图，要等**下一次** `sync('resize')` 才被消费；
		*      自动展开若在此之后没有尺寸变化，这次定位就永远丢失。`realign` 让
		*      调用方能在 DOM 更新后的同一帧里把意图兑现。
		*
		* 逐字保留其余部分：这是 group body 的内部滚动跟随与边缘渐变，与
		* `AutoGroupSeat` 的 400px 上限配合工作。简化会改变手感，因此不做精简。
		*/
		const AT_REST = {
			canScrollUp: false,
			canScrollDown: false
		};
		const SCROLL_KEYS = /* @__PURE__ */ new Set([
			"ArrowUp",
			"ArrowDown",
			"PageUp",
			"PageDown",
			"Home",
			"End",
			" "
		]);
		/**
		* 观察一个 group 的 body 与内容，不与外层转录的跟随意图耦合。
		* 滚轮、触摸开始、任意指针按下，以及未被阻止的滚动按键都会中断进行中的动画，
		* 包括来自可编辑控件的事件；随后由位置采样决定跟随意图。
		* @param bodyRef - 带上限的滚动 body。
		* @param contentRef - 无上限的内容元素，其尺寸变化报告增长。
		* @param open - 本地展开状态。
		* @param grouped - 当前展示模式是否保留 group 的高度上限。
		* @returns 边缘渐变、DOM 事件绑定、一次性定位意图的登记，以及立即兑现它的校准。
		*/
		function useProcessScroll(bodyRef, contentRef, open, grouped) {
			const follow = useScrollFollow(false, 1);
			const initialPosition = (0, react.useRef)(null);
			const [edges, setEdges] = (0, react.useState)(AT_REST);
			const initialize = (0, react.useCallback)((position) => {
				initialPosition.current = position;
			}, []);
			const sync = (0, react.useCallback)((cause) => {
				const body = bodyRef.current;
				let next = AT_REST;
				if (body !== null && body.closest("[hidden], [data-group-expanded-mode]") === null) {
					let metrics = scrollMetrics(body);
					const initial = cause === "resize" ? initialPosition.current : null;
					if (initial !== null) {
						metrics = follow.jump(body, metrics, initial === "bottom" ? metrics.floor : 0);
						if (initial === "top") follow.setFollowing(false);
						initialPosition.current = null;
					} else if (cause === "resize") {
						follow.sample(metrics, false);
						if (follow.active) metrics = follow.toBottom(body, metrics, "smooth");
					} else {
						const wasAnimating = follow.animating;
						if (cause === "scrollend") follow.settle(metrics);
						else follow.sample(metrics);
						if (follow.active && cause === "scrollend" && wasAnimating) metrics = follow.toBottom(body, metrics, "smooth");
					}
					next = {
						canScrollUp: metrics.top > 1,
						canScrollDown: metrics.top < metrics.floor - 1
					};
				} else follow.reset();
				setEdges((previous) => previous.canScrollUp === next.canScrollUp && previous.canScrollDown === next.canScrollDown ? previous : next);
			}, [bodyRef, follow]);
			const realign = (0, react.useCallback)(() => {
				sync("resize");
			}, [sync]);
			const interrupt = (0, react.useCallback)(() => {
				const body = bodyRef.current;
				if (body !== null && follow.animating) follow.interrupt(body, scrollMetrics(body));
			}, [bodyRef, follow]);
			const events = (0, react.useMemo)(() => ({
				onScroll: () => {
					sync("scroll");
				},
				onWheel: interrupt,
				onTouchStart: interrupt,
				onPointerDown: interrupt,
				onKeyDown: (event) => {
					if (!event.defaultPrevented && SCROLL_KEYS.has(event.key)) interrupt();
				}
			}), [interrupt, sync]);
			(0, react.useLayoutEffect)(() => {
				interrupt();
				follow.reset();
				if (!grouped || !open) initialPosition.current = null;
			}, [
				follow,
				grouped,
				interrupt,
				open
			]);
			(0, react.useLayoutEffect)(() => {
				const body = bodyRef.current;
				if (body === null || !open || typeof ResizeObserver === "undefined") return;
				const unbind = follow.bind(body);
				const observer = new ResizeObserver(() => {
					sync("resize");
				});
				const onScrollEnd = (event) => {
					if (event.target === body) sync("scrollend");
				};
				body.addEventListener("scrollend", onScrollEnd);
				observer.observe(body);
				if (contentRef.current !== null) observer.observe(contentRef.current);
				return () => {
					unbind();
					observer.disconnect();
					body.removeEventListener("scrollend", onScrollEnd);
				};
			}, [
				bodyRef,
				contentRef,
				follow,
				open,
				sync
			]);
			return {
				edges,
				events,
				initialize,
				realign
			};
		}
		//#endregion
		//#region src/client/flow/scroll-align.ts
		/**
		* 判断是否需要为一次自动展开补做底部定位。
		*
		* 三个条件缺一不可：
		*  - `open`：折叠态没有可滚动内容；
		*  - `grouped`：平铺模式（`.expandedBody`）没有高度上限，body 不滚动；
		*  - `followsAuto`：用户手动展开时必须交给官方 `toggle` 定位，否则已完成
		*    的 group 会被强行滚到底部，与官方（滚到顶部）不一致。
		*
		* 触发时机是 `open` / `grouped` / `followsAuto` 任一翻转，以及首次挂载。
		* `grouped` 参与判定尤其关键：Turn 从"平铺"切到"带高度上限"时，body 才
		* 第一次出现内部滚动，那才是需要定位的时刻。
		* @param previous - 上一次渲染的状态；`null` 表示首次挂载。
		* @param current - 本次渲染的状态。
		* @returns 是否需要定位到底部。
		*/
		function shouldAlignBody(previous, current) {
			if (!current.open || !current.grouped || !current.followsAuto) return false;
			if (previous === null) return true;
			return previous.open !== current.open || previous.grouped !== current.grouped || previous.followsAuto !== current.followsAuto;
		}
		//#endregion
		//#region \0dsh-css:src/client/flow/AutoGroupSeat.module.css.mjs
		const css$5 = "._8VUQlG_root{min-width:0}._8VUQlG_title{max-width:100%;color:var(--dsw-alias-label-tertiary);font:inherit;font-size:var(--dsh-content-font-size,14px);text-align:left;cursor:pointer;background:0 0;border:0;align-items:center;gap:6px;padding:0;transition:color .1s;display:flex}._8VUQlG_title:hover{color:var(--dsw-alias-label-secondary)}._8VUQlG_leading{width:calc(16px + var(--dsh-content-font-delta,0px));height:calc(16px + var(--dsh-content-font-delta,0px));color:inherit;flex:none;justify-content:center;align-items:center;display:inline-flex;position:relative}._8VUQlG_leading svg{width:calc(14px + var(--dsh-content-font-delta,0px));height:calc(14px + var(--dsh-content-font-delta,0px))}._8VUQlG_leading svg[width=\"16\"]{width:calc(16px + var(--dsh-content-font-delta,0px));height:calc(16px + var(--dsh-content-font-delta,0px))}._8VUQlG_activityIcon,._8VUQlG_chevron{justify-content:center;align-items:center;transition:opacity .1s;display:inline-flex;position:absolute;inset:0}._8VUQlG_activityIcon{opacity:1}._8VUQlG_chevron,._8VUQlG_title:is(:hover,:focus-visible) ._8VUQlG_activityIcon{opacity:0}._8VUQlG_title:is(:hover,:focus-visible) ._8VUQlG_chevron{opacity:1}._8VUQlG_title[aria-expanded=true] ._8VUQlG_activityIcon{opacity:0}._8VUQlG_title[aria-expanded=true] ._8VUQlG_chevron{opacity:1}._8VUQlG_title[aria-expanded=true]{padding-bottom:8px}._8VUQlG_body{--dsh-chat-flow-gap:6px;overscroll-behavior-y:auto;scrollbar-gutter:stable;overflow-anchor:none;max-height:min(400px,50vh);overflow-y:auto}._8VUQlG_label{text-overflow:ellipsis;white-space:nowrap;min-width:0;overflow:hidden}._8VUQlG_fadeTop{mask-image:linear-gradient(#0000 0,#000 24px 100%)}._8VUQlG_fadeBottom{mask-image:linear-gradient(#000 0 calc(100% - 24px),#0000 100%)}._8VUQlG_fadeTop._8VUQlG_fadeBottom{mask-image:linear-gradient(#0000 0,#000 24px calc(100% - 24px),#0000 100%)}@media (prefers-reduced-motion:reduce){._8VUQlG_title,._8VUQlG_activityIcon,._8VUQlG_chevron{transition:none}}._8VUQlG_content{flex-direction:column;display:flex}._8VUQlG_content>*{flex-shrink:0}._8VUQlG_content>:not([hidden]):not(:empty)~:not([hidden]):not(:empty){margin-top:var(--dsh-chat-flow-gap,6px)}._8VUQlG_expandedBody{scrollbar-gutter:auto;max-height:none;overflow:visible}[data-chat-motion] ._8VUQlG_content>:not([data-chat-motion]){transition:margin-top .16s cubic-bezier(.4,0,.2,1)}@media (prefers-reduced-motion:reduce){[data-chat-motion] ._8VUQlG_content>:not([data-chat-motion]){transition:none}}";
		const tagId$5 = "dsh-auto-expand/src/client/flow/AutoGroupSeat.module.css";
		if (typeof document !== "undefined") {
			let tag = document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$5) + "]");
			if (tag === null) {
				tag = document.createElement("style");
				tag.dataset.plugin = "dsh-auto-expand";
				tag.dataset.pluginCss = tagId$5;
				document.head.appendChild(tag);
			}
			tag.textContent = css$5;
		}
		var AutoGroupSeat_module_css_default = {
			"activityIcon": "_8VUQlG_activityIcon",
			"body": "_8VUQlG_body",
			"chevron": "_8VUQlG_chevron",
			"content": "_8VUQlG_content",
			"expandedBody": "_8VUQlG_expandedBody",
			"fadeBottom": "_8VUQlG_fadeBottom",
			"fadeTop": "_8VUQlG_fadeTop",
			"label": "_8VUQlG_label",
			"leading": "_8VUQlG_leading",
			"root": "_8VUQlG_root",
			"title": "_8VUQlG_title"
		};
		//#endregion
		//#region src/client/flow/AutoGroupSeat.tsx
		/**
		* 克隆自 `chat/ChatGroupSeat.tsx`（203 行）。
		*
		* 上游：@deepseek-ai/dsh-client-ui-chat@0.2.1-rc.3，commit 1f81c047fc
		*
		* 修改点（五处，其余逐字保留）：
		*   1. 本地 `useDisclosure()` → `useAutoDisclosure(!closed)`：body 默认展开，
		*      group 关闭时自动折叠一次（这是本插件的核心行为）。
		*   2. 新增自动展开时的滚动定位：官方 `toggle` 里有 `initialize(...)`，
		*      但自动展开不经过它，必须在同一帧显式补上（`initialize` + `realign`）。
		*   3. 新增 `GroupOpenContext.Provider`：把 body 展开状态下发给内层行（P3 思考块 / P7 工具行）。
		*   4. `useProcessScroll` 解构出新增的 `realign`。
		*   5. body 增加内联 `style`（自定义高度）：由 `groupHeight()` 算出 `max-height`
		*      （留空时另加 `overflow-y: visible`）。`capped` 判据本身不动——它仍决定
		*      class 与渐隐效果，判据函数只是消费它的结果。
		*
		* 保留不动（关键）：
		*   - `capped` 计算 → 400px 高度上限（官方逐字保留，见 spec/MOTION-PLAN.md 6.4）
		*   - `useGroupHeaderAction` → header 显隐动画
		*   - `bodyRef = useGroupAction(grouped && !open, reveal)` → 折叠动画与焦点保护
		*   - `useProcessScroll` → 内部滚动跟随与边缘渐变
		*   - 全部 `data-*` 属性 → 官方 CSS 与测试依赖
		*/
		/** 运行中标题变化的最小停留时长（官方同值）。 */
		const PROCESS_TITLE_MINIMUM_MS = 150;
		/** 每个活动类别的图标（官方同表）。 */
		const PROCESS_ICONS = {
			thinking: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconThinkOutlineRegular, {}),
			read: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconBrowseOutlineRegular, { size: 14 }),
			readImage: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconBrowseOutlineRegular, { size: 14 }),
			search: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconSearchOutlineRegular, { size: 14 }),
			edit: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconEditOutlineRegular, { size: 14 }),
			write: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconEditOutlineRegular, { size: 14 }),
			webSearch: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconGlobeOutlineRegular, {}),
			webFetch: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconBrowseOutlineRegular, { size: 14 }),
			subagents: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconAgentPresetOutlineRegular, { size: 14 }),
			plan: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconPlanOutlineRegular, {}),
			questions: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconQuestionOutlineRegular, {}),
			tools: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconSparkleRegular, { size: 14 }),
			commands: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconApiOutlineRegular, {}),
			code: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconCodeOutlineRegular, { size: 14 })
		};
		/** 两个运行中标题是否等价。 */
		function sameLiveProcessTitle(left, right) {
			return left.activity === right.activity && left.detail === right.detail && left.preparing === right.preparing;
		}
		/**
		* 克隆自 `chat/ChatGroupSeat.tsx:59-82`。
		*
		* 让运行中标题至少停留 150ms，避免高频抖动。
		* @param desired - 期望显示的标题状态。
		* @param active - 该 group 是否仍在运行。
		* @returns 当前应显示的标题状态。
		*/
		function useStableLiveProcessTitle(desired, active) {
			const [displayed, setDisplayed] = (0, react.useState)(desired);
			const displayedRef = (0, react.useRef)(displayed);
			const desiredRef = (0, react.useRef)(desired);
			const displayedAtRef = (0, react.useRef)(Date.now());
			(0, react.useEffect)(() => {
				desiredRef.current = desired;
				if (!active || sameLiveProcessTitle(displayedRef.current, desired)) return;
				const remaining = PROCESS_TITLE_MINIMUM_MS - (Date.now() - displayedAtRef.current);
				const commit = () => {
					const next = desiredRef.current;
					displayedRef.current = next;
					displayedAtRef.current = Date.now();
					setDisplayed(next);
				};
				if (remaining <= 0) {
					commit();
					return;
				}
				const timer = setTimeout(commit, remaining);
				return () => {
					clearTimeout(timer);
				};
			}, [
				active,
				desired.activity,
				desired.detail,
				desired.preparing
			]);
			return active ? displayed : desired;
		}
		/** 组内成员的渲染列表。 */
		const GroupMembers = (0, react.memo)(function GroupMembers({ members, ...props }) {
			return members.map((member) => /* @__PURE__ */ (0, react.createElement)(AutoNodeSeat, {
				...props,
				key: chatRenderKey(member),
				nodeKey: member.key,
				...member.groupPart === void 0 ? {} : { groupPart: member.groupPart }
			}));
		});
		/** process group 的标题按钮。 */
		const ProcessGroupHeader = (0, react.memo)(function ProcessGroupHeader({ groupKey, useChatGroup, usePresentation, t, open, bodyId, toggle }) {
			const data = useChatGroup(groupKey, (group) => group?.data);
			const detailed = usePresentation((policy) => data?.closed === false && policy.liveProcessDetail);
			const live = useStableLiveProcessTitle({
				activity: data?.summary.running ?? "thinking",
				detail: data?.summary.runningDetail ?? "",
				preparing: data?.summary.preparing === true
			}, data !== void 0 && !data.closed);
			if (data === void 0) return null;
			const label = data.closed ? processTitle(data.summary, t) : live.preparing ? t(`message.stepProcess.prepare.${live.activity === "thinking" ? "tools" : live.activity}`) : t(`message.stepProcess.${live.activity}`);
			const detail = detailed && !data.closed ? live.detail : "";
			const title = detail === "" ? label : `${label}${t("message.turnProcess.separator")}${detail}`;
			const activity = data.closed ? data.summary.counts[0]?.kind ?? "thinking" : live.activity;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
				type: "button",
				className: AutoGroupSeat_module_css_default.title,
				"aria-expanded": open,
				"aria-controls": bodyId,
				"data-process-activity": activity,
				onClick: (event) => {
					event.currentTarget.focus();
					toggle();
				},
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
					className: AutoGroupSeat_module_css_default.leading,
					"aria-hidden": "true",
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: AutoGroupSeat_module_css_default.activityIcon,
						"data-step-process-icon": true,
						children: PROCESS_ICONS[activity]
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: AutoGroupSeat_module_css_default.chevron,
						"data-step-process-chevron": true,
						children: open ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronUpOutlineRegular, {}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronDownOutlineRegular, {})
					})]
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.TextShimmer, {
					active: !data.closed,
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.TextShimmer, {
						className: AutoGroupSeat_module_css_default.label,
						children: title
					})
				})]
			});
		});
		/**
		* 渲染一个 process group：本地自动展开策略 + 现有的外层 Turn 可见性。
		*
		* 与官方唯一的语义差异：body 的初始展开状态由 `!closed` 决定，而非恒为折叠。
		*/
		const AutoGroupSeat = (0, react.memo)(function AutoGroupSeat({ groupKey, useChatGroup, useGroupHeaderAction, ...props }) {
			const members = useChatGroup(groupKey, (group) => group?.members);
			const turn = useChatGroup(groupKey, (group) => group?.data.turn);
			const closed = useChatGroup(groupKey, (group) => group?.data.closed);
			const foldCompleted = props.usePresentation((policy) => policy.foldCompletedTurns);
			const settings = useAutoExpandSettings();
			const autoOpen = settings.groupAutoExpand && !(closed === true);
			const { open, setOpen, toggle: toggleDisclosure, following: followsAuto } = useAutoDisclosure(autoOpen);
			const latestStep = props.useChat((snapshot) => {
				let latest;
				for (const member of members ?? []) {
					const step = stepOfNode(snapshot.nodes.get(member.key));
					if (step !== void 0 && (latest === void 0 || step > latest)) latest = step;
				}
				return latest;
			});
			const latestStartedAnchorSeq = props.useChat((snapshot) => {
				let latest;
				for (const member of members ?? []) {
					const started = startedAnchorOfNode(snapshot.nodes.get(member.key));
					if (started !== void 0 && (latest === void 0 || started > latest)) latest = started;
				}
				return latest;
			});
			const groupOpenState = (0, react.useMemo)(() => ({
				open,
				auto: autoOpen,
				latestStep,
				latestStartedAnchorSeq
			}), [
				open,
				autoOpen,
				latestStep,
				latestStartedAnchorSeq
			]);
			const firstKey = members?.[0]?.key ?? "";
			const deferCollapse = props.useChatNodeBottom(firstKey) === true && props.deferCollapse;
			const presentation = props.useChatNodeProcess(firstKey);
			const turnLocation = props.useChatNode(firstKey, (node) => {
				const location = node?.location;
				return location?.kind === "turn" || location?.kind === "step" ? location.turn : void 0;
			});
			const grouped = props.usePresentation((policy) => policy.stepGrouping === "collapsed" || policy.stepGrouping === "history" && turnLocation?.status !== "open" && !deferCollapse);
			const reason = turnLocation?.end?.data.reason.kind;
			const alwaysOpen = presentation?.turnClosed === false || presentation?.hasInterleavedInput === true || reason === "aborted" || reason === "interrupted" || reason === "error";
			const spec = presentation?.spec;
			const selectOpen = (0, react.useCallback)((state) => spec !== void 0 && turnProcessOpen(state, spec, deferCollapse), [spec, deferCollapse]);
			const storedOpen = props.useStore(selectOpen);
			const outerHidden = foldCompleted && presentation?.turnClosed === true && spec !== void 0 && !alwaysOpen && !storedOpen;
			const revealOuter = (0, react.useCallback)(() => {
				if (spec !== void 0 && !alwaysOpen) props.actions.setTurnProcessOpen(spec.turn, spec.answerStep ?? 0, true);
			}, [
				props.actions,
				spec,
				alwaysOpen
			]);
			const rootRef = props.useGroupAction(outerHidden, revealOuter);
			const headerRef = (0, react.useRef)(null);
			const deferCompletedTurns = props.usePresentation((policy) => policy.collapseTiming === "next-input");
			useGroupHeaderAction(headerRef, !grouped || deferCompletedTurns && outerHidden);
			(0, react.useEffect)(() => {
				if (outerHidden && rootRef.current !== null && hiddenOrCollapsing(rootRef.current)) setOpen(false);
			}, [
				outerHidden,
				rootRef,
				setOpen
			]);
			const reveal = (0, react.useCallback)(() => {
				setOpen(true);
			}, [setOpen]);
			const bodyRef = props.useGroupAction(grouped && !open, reveal);
			const contentRef = (0, react.useRef)(null);
			const bodyId = (0, react.useId)();
			const { edges, events, initialize, realign } = useProcessScroll(bodyRef, contentRef, open, grouped);
			const previousShape = (0, react.useRef)(null);
			(0, react.useLayoutEffect)(() => {
				const current = {
					open,
					grouped,
					followsAuto
				};
				if (shouldAlignBody(previousShape.current, current)) {
					initialize("bottom");
					realign();
				}
				previousShape.current = current;
			}, [
				open,
				grouped,
				followsAuto,
				initialize,
				realign
			]);
			const toggle = (0, react.useCallback)(() => {
				if (!open) initialize(closed === false ? "bottom" : "top");
				toggleDisclosure();
			}, [
				closed,
				initialize,
				open,
				toggleDisclosure
			]);
			if (members === void 0) return null;
			const capped = grouped && (!deferCompletedTurns || open);
			const height = groupHeight({
				groupAutoExpand: settings.groupAutoExpand,
				capped,
				isCurrent: closed === false,
				unlimited: settings.groupHeightUnlimited,
				history: settings.groupHeightHistory,
				percent: settings.groupHeightPercent
			});
			const classes = [
				AutoGroupSeat_module_css_default.body,
				!capped ? AutoGroupSeat_module_css_default.expandedBody : "",
				capped && edges.canScrollUp ? AutoGroupSeat_module_css_default.fadeTop : "",
				capped && edges.canScrollDown ? AutoGroupSeat_module_css_default.fadeBottom : ""
			];
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				ref: rootRef,
				className: AutoGroupSeat_module_css_default.root,
				"data-chat-group-key": groupKey,
				"data-chat-flow-key": groupKey,
				"data-chat-anchor-key": `group:${groupKey}`,
				"data-chat-turn": turn,
				"data-chat-paging-anchor": grouped && !open || void 0,
				"data-step-process": true,
				"data-group-expanded-mode": !grouped || void 0,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					ref: headerRef,
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ProcessGroupHeader, {
						groupKey,
						useChatGroup,
						usePresentation: props.usePresentation,
						t: props.t,
						open,
						bodyId,
						toggle
					})
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					ref: bodyRef,
					id: bodyId,
					className: classes.join(" "),
					"data-step-process-body": true,
					style: height ?? void 0,
					"data-scroll-up": edges.canScrollUp || void 0,
					"data-scroll-down": edges.canScrollDown || void 0,
					...events,
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						ref: contentRef,
						className: AutoGroupSeat_module_css_default.content,
						"data-step-process-content": true,
						"data-chat-flow": "",
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(GroupOpenContext.Provider, {
							value: groupOpenState,
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(GroupMembers, {
								...props,
								members
							})
						})
					})
				})]
			});
		});
		//#endregion
		//#region src/client/flow/message-chrome.ts
		/**
		* 克隆自 `chat/message-chrome.ts`（100 行）中的时间与时长工具。
		*
		* 上游：@deepseek-ai/dsh-client-ui-chat@0.2.1-rc.3，commit 1f81c047fc
		*
		* 只保留 pending bubble 的时钟与运行时长需要的部分。
		*/
		/** 本地日历日的零时刻（本地午夜的毫秒）。 */
		function startOfLocalDay(ms) {
			const d = new Date(ms);
			d.setHours(0, 0, 0, 0);
			return d.getTime();
		}
		/** 距 `ms` 之后下一个本地午夜的毫秒数（至少 1ms）。 */
		function msUntilNextLocalMidnight(ms) {
			const next = new Date(ms);
			next.setHours(24, 0, 0, 0);
			return Math.max(next.getTime() - ms, 1);
		}
		/**
		* 为消息 IconActions 生成紧凑的本地时间戳。
		* 同一日历日 → `HH:mm`；今年更早 → `clock.md` 模板 + 时钟；其他年份 → `clock.ymd`。
		* @param time - 源 Session 事件的 Unix 毫秒。
		* @param t - 提供 `clock.md` / `clock.ymd` 模板的翻译函数。
		* @param now - 日/年切分的参考时刻（默认当前时钟）。
		* @returns 带日期判断的时钟字符串（24 小时制，零填充）。
		*/
		function formatMessageClock(time, t, now = Date.now()) {
			const pad2 = (n) => String(n).padStart(2, "0");
			const d = new Date(time);
			const n = new Date(now);
			const clock = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
			if (d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate()) return clock;
			const params = {
				y: d.getFullYear(),
				m: d.getMonth() + 1,
				d: d.getDate()
			};
			return `${d.getFullYear() === n.getFullYear() ? t("clock.md", params) : t("clock.ymd", params)} ${clock}`;
		}
		//#endregion
		//#region src/client/flow/use-calendar-day.ts
		/**
		* 克隆自 `chat/use-calendar-day.ts`（25 行）。
		*
		* 上游：@deepseek-ai/dsh-client-ui-chat@0.2.1-rc.3，commit 1f81c047fc
		*
		* 组件本地的日历日跳动：memo 化的消息行在跨午夜时 props 保持稳定，
		* 因此 IconActions 的时钟需要一个本地日座位，在下一个本地午夜重新触发。
		*/
		/**
		* 每个本地午夜前进的本地日历日零时刻。
		* @returns 当前本地日的午夜毫秒；跨过边界后更新。
		*/
		function useCalendarDay() {
			const [day, setDay] = (0, react.useState)(() => startOfLocalDay(Date.now()));
			(0, react.useEffect)(() => {
				let timer;
				const arm = () => {
					const now = Date.now();
					setDay(startOfLocalDay(now));
					timer = setTimeout(arm, msUntilNextLocalMidnight(now));
				};
				timer = setTimeout(arm, msUntilNextLocalMidnight(Date.now()));
				return () => {
					clearTimeout(timer);
				};
			}, []);
			return day;
		}
		//#endregion
		//#region \0dsh-css:src/client/flow/pending-bubbles.module.css.mjs
		const css$4 = ".CLAA_G_userRow{flex-direction:column;align-items:flex-end;gap:6px;display:flex}.CLAA_G_actions{height:calc(28px + var(--dsh-content-font-delta,0px));align-items:center;gap:8px;display:flex}.CLAA_G_timeStart{font-size:var(--dsh-content-font-size-secondary,13px);line-height:calc(24px + var(--dsh-content-font-delta,0px));color:var(--dsw-alias-label-tertiary);white-space:nowrap;padding-right:12px}.CLAA_G_timeEnd{font-size:calc(var(--dsh-content-font-size-secondary,13px) - 1px);line-height:calc(24px + var(--dsh-content-font-delta,0px));color:inherit;white-space:nowrap}@media (hover:hover){:is([data-chat-flow-kind=user],[data-chat-flow-kind=steering]):has(~:is([data-chat-flow-kind=user],[data-chat-flow-kind=steering])) .CLAA_G_actions{opacity:0;transition:opacity 80ms}:is([data-chat-flow-kind=user],[data-chat-flow-kind=steering]):has(~:is([data-chat-flow-kind=user],[data-chat-flow-kind=steering])):hover .CLAA_G_actions,:is([data-chat-flow-kind=user],[data-chat-flow-kind=steering]):has(~:is([data-chat-flow-kind=user],[data-chat-flow-kind=steering])):focus-within .CLAA_G_actions{opacity:1}}.CLAA_G_action{width:calc(28px + var(--dsh-content-font-delta,0px));height:calc(28px + var(--dsh-content-font-delta,0px));border-radius:var(--dsw-radius-sm);color:var(--dsw-alias-label-tertiary);cursor:pointer;background:0 0;border:none;justify-content:center;align-items:center;padding:6px;display:inline-flex}.CLAA_G_action svg{width:calc(15px + var(--dsh-content-font-delta,0px));height:calc(15px + var(--dsh-content-font-delta,0px))}.CLAA_G_actions[data-clock=end] .CLAA_G_action svg{width:calc(17px + var(--dsh-content-font-delta,0px));height:calc(17px + var(--dsh-content-font-delta,0px))}.CLAA_G_action:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary)}";
		const tagId$4 = "dsh-auto-expand/src/client/flow/pending-bubbles.module.css";
		if (typeof document !== "undefined") {
			let tag = document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$4) + "]");
			if (tag === null) {
				tag = document.createElement("style");
				tag.dataset.plugin = "dsh-auto-expand";
				tag.dataset.pluginCss = tagId$4;
				document.head.appendChild(tag);
			}
			tag.textContent = css$4;
		}
		var pending_bubbles_module_css_default = {
			"action": "CLAA_G_action",
			"actions": "CLAA_G_actions",
			"timeEnd": "CLAA_G_timeEnd",
			"timeStart": "CLAA_G_timeStart",
			"userRow": "CLAA_G_userRow"
		};
		//#endregion
		//#region src/client/flow/PendingIconActions.tsx
		/**
		* 克隆自 `chat/MessageIconActions.tsx`（115 行）中 pending bubble 用到的部分。
		*
		* 上游：@deepseek-ai/dsh-client-ui-chat@0.2.1-rc.3，commit 1f81c047fc
		*
		* pending bubble 只用到"时钟 + 复制"这一条 actions 行，不带 branch / usage。
		* 因此这里只保留 `text` / `time` / `clock` / `className` 四个输入，去掉
		* `onBranch`、`branchUnavailable`、`extraActions`、`usageAction` 分支。
		*
		* 复制行为逐字保留：成功后 1 秒内显示对勾，窗口内重复点击不叠加计时器。
		*/
		/**
		* 用户与 pending bubble 共用的"复制 / 时钟"图标行。
		* @param props - 复制文本、事件时间、时钟侧与额外类名。
		* @returns actions 行元素。
		*/
		function PendingIconActions({ text, time, clock, className, t }) {
			const day = useCalendarDay();
			const [copied, setCopied] = (0, react.useState)(false);
			const copyPending = (0, react.useRef)(false);
			const copyTimer = (0, react.useRef)(null);
			const copyEpoch = (0, react.useRef)(0);
			(0, react.useEffect)(() => () => {
				copyEpoch.current += 1;
				copyPending.current = false;
				if (copyTimer.current !== null) clearTimeout(copyTimer.current);
			}, []);
			const onCopy = (0, react.useCallback)(() => {
				if (copied || copyPending.current) return;
				const epoch = copyEpoch.current;
				copyPending.current = true;
				(0, _deepseek_ai_dsh_client_ui_primitives.writeClipboard)(text).then((ok) => {
					if (epoch !== copyEpoch.current) return;
					copyPending.current = false;
					if (!ok) return;
					setCopied(true);
					copyTimer.current = setTimeout(() => {
						copyTimer.current = null;
						setCopied(false);
					}, 1e3);
				});
			}, [copied, text]);
			const clockEl = time === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				className: clock === "start" ? pending_bubbles_module_css_default.timeStart : pending_bubbles_module_css_default.timeEnd,
				children: formatMessageClock(time, t, day)
			});
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: className === void 0 ? pending_bubbles_module_css_default.actions : `${pending_bubbles_module_css_default.actions} ${className}`,
				"data-clock": clock,
				children: [
					clock === "start" ? clockEl : null,
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Tooltip, {
						label: copied ? t("copied") : t("copy"),
						side: "bottom",
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: pending_bubbles_module_css_default.action,
							"aria-label": copied ? t("copied") : t("copy"),
							onClick: onCopy,
							children: copied ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconCheckOutlineRegular, {}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconCopyOutlineRegular, {})
						})
					}),
					clock === "end" ? clockEl : null
				]
			});
		}
		//#endregion
		//#region src/client/flow/pending-bubbles.tsx
		/**
		* 克隆自 `chat/MessageItem.tsx:163-295`（`UserStyleBubble` 与两个 pending bubble）。
		*
		* 上游：@deepseek-ai/dsh-client-ui-chat@0.2.1-rc.3，commit 1f81c047fc
		*
		* `AutoFlow` 只用到 `PendingSteeringBubble` 与 `PendingSubmissionBubble`。
		* 这两个 bubble 只在"用户刚提交、durable 消息尚未到达"的短暂窗口渲染，
		* 但它们是用户能直接感知的视觉反馈，因此完整保留其外观与行为。
		*
		* 未克隆的部分（本插件用不到）：
		*   - `UserMessageNodeView` / `ContextMessageNodeView` 等 keyed renderer
		*     （它们由官方 `conversation.chat.node` 注册，我们只包裹 assistant-step）
		*   - `CompactionItem` / `ContextInjectionRow`（同上）
		*   - `RetryNodeView` / `TurnErrorNodeView` / `TurnMaxTokensNodeView`（同上）
		*/
		const EMPTY_TEXT_FACTS = {};
		/** 把原始 content 数组拆成文本、附件与其余块。 */
		function contentParts(content) {
			const texts = [];
			const attachments = [];
			const rest = [];
			for (const block of content) {
				const b = block;
				if (b.type === "text" && typeof b.text === "string") texts.push(b.text);
				else if (b.type === "image" && b.attachment !== void 0) attachments.push({
					type: "image",
					image: { attachment: b.attachment }
				});
				else if (b.type === "file" && b.attachment !== void 0) attachments.push({
					type: "file",
					file: b.attachment
				});
				else rest.push(block);
			}
			return {
				text: texts.join(""),
				attachments,
				rest
			};
		}
		/** 用户与 steering 行共用的右对齐气泡。 */
		function UserStyleBubble({ content, loadImage, renderFactorySlot, actions, pending = false, echo = false, referenceLabels, previewAttachments, facts: inputFacts = EMPTY_TEXT_FACTS, interactive = false }) {
			const parts = (0, react.useMemo)(() => contentParts(content), [content]);
			const prepared = (0, react.useMemo)(() => ({
				text: parts.text,
				attachments: previewAttachments ?? parts.attachments,
				extraBlocks: parts.rest,
				...referenceLabels === void 0 ? {} : { referenceLabels }
			}), [
				parts,
				previewAttachments,
				referenceLabels
			]);
			const facts = (0, react.useMemo)(() => ({
				...inputFacts,
				...referenceLabels === void 0 ? {} : { sessionLabels: referenceLabels }
			}), [inputFacts, referenceLabels]);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: pending_bubbles_module_css_default.userRow,
				"data-pending-steering": pending || void 0,
				"data-submission-echo": echo || void 0,
				children: [renderFactorySlot("conversation.chat.user.content", {
					content: prepared,
					loadImage,
					facts,
					interactive
				}), actions?.(prepared.text)]
			});
		}
		/**
		* 渲染一条 Host 权威的待处理 steering 项，视觉语言与其最终的 durable 转录节点一致。
		* @param props - 待处理内容、已授权的图片加载器与 Factory/locale 座位。
		* @returns pending steering 气泡。
		*/
		function PendingSteeringBubble({ content, loadImage, renderFactorySlot, t }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(UserStyleBubble, {
				content,
				renderFactorySlot,
				loadImage,
				pending: true,
				actions: (text) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(PendingIconActions, {
					text,
					clock: "start",
					className: pending_bubbles_module_css_default.actions,
					t
				})
			});
		}
		/**
		* 渲染一条本地转录或 steering 提交回声，外观与替换它的 Host 出现一致：
		* 草稿文本加对象 URL 预览，从提交点击可见直到 durable `user/message` 或
		* steering 出现渲染。
		* @param props - 待处理提交、已授权的图片加载器与渲染座位。
		* @returns 回声用户气泡。
		*/
		function PendingSubmissionBubble({ submission, loadImage, renderFactorySlot, t }) {
			const content = (0, react.useMemo)(() => submission.text === "" ? [] : [{
				type: "text",
				text: submission.text
			}], [submission.text]);
			const previewAttachments = (0, react.useMemo)(() => submission.attachments.map((attachment) => attachment.type === "image" ? {
				type: "image",
				image: { preview: {
					url: attachment.value.previewUrl,
					...attachment.value.name === void 0 ? {} : { name: attachment.value.name },
					...attachment.value.width === void 0 ? {} : { width: attachment.value.width },
					...attachment.value.height === void 0 ? {} : { height: attachment.value.height }
				} }
			} : {
				type: "file",
				file: attachment.value
			}), [submission.attachments]);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(UserStyleBubble, {
				content,
				previewAttachments,
				renderFactorySlot,
				loadImage,
				pending: submission.placement === "steering",
				echo: true,
				actions: (text) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(PendingIconActions, {
					text,
					time: submission.time,
					clock: "start",
					className: pending_bubbles_module_css_default.actions,
					t
				})
			});
		}
		//#endregion
		//#region src/client/flow/RunningWhaleTail.tsx
		/**
		* 克隆自 `chat/RunningWhaleTail.tsx`（19 行）。
		*
		* 上游：@deepseek-ai/dsh-client-ui-chat@0.2.1-rc.3，commit 1f81c047fc
		*
		* 逐字保留。APNG 资源由构建期插件转成 data URL（见 tsdown.config.ts）。
		*/
		/** 鲸鱼尾部的静止轮廓路径（官方同值）。 */
		const REST_PATH = "M8.844 13.742C8.967 12.328 8.45 10.4 8.45 9.65C8.45 8.94 8.88 8.43 9.6 8.43C11.285 8.43 12.106 8.281 12.685 8.104C13.71 7.791 14.585 6.768 15.055 5.945C15.137 5.803 14.99 5.641 14.829 5.671C13.829 5.86 12.828 5.376 11.827 4.978C10.659 4.514 9.491 4.707 8.935 4.876C8.805 4.915 8.658 4.819 8.636 4.686C8.468 3.643 7.405 2.615 5.498 2.238C4.54 2.048 3.748 1.574 3.347 1.202C3.252 1.113 3.088 1.125 3.03 1.242C2.628 2.059 2.168 3.82 5.248 6.115C5.82 6.494 6.31 6.785 6.574 7.637C6.72 8.104 6.157 9.168 6.061 9.368C5.157 11.27 5.089 12.19 4.926 13.742";
		/**
		* 渲染装饰性运行图标；动画时序由 APNG 资源自身决定。
		* @returns 按浏览器能力与无障碍偏好选择的遮罩或静态 SVG。
		*/
		function RunningWhaleTail() {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
				className: chat_flow_module_css_default.runningIcon,
				"aria-hidden": "true",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: chat_flow_module_css_default.runningWhaleAnimated }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("svg", {
					className: chat_flow_module_css_default.runningWhaleStill,
					width: "100%",
					height: "100%",
					viewBox: "0 0 16 16",
					fill: "none",
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
						d: REST_PATH,
						stroke: "currentColor",
						strokeWidth: 1
					})
				})]
			});
		}
		//#endregion
		//#region \0dsh-css:src/client/flow/accessibility.module.css.mjs
		const css$3 = ".Bxds2a_visuallyHidden{clip:rect(0 0 0 0);white-space:nowrap;width:1px;height:1px;position:absolute;overflow:hidden}";
		const tagId$3 = "dsh-auto-expand/src/client/flow/accessibility.module.css";
		if (typeof document !== "undefined") {
			let tag = document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$3) + "]");
			if (tag === null) {
				tag = document.createElement("style");
				tag.dataset.plugin = "dsh-auto-expand";
				tag.dataset.pluginCss = tagId$3;
				document.head.appendChild(tag);
			}
			tag.textContent = css$3;
		}
		var accessibility_module_css_default = { "visuallyHidden": "Bxds2a_visuallyHidden" };
		//#endregion
		//#region src/client/flow/RunningStatus.tsx
		/**
		* 克隆自 `chat/RunningStatus.tsx`（41 行）。
		*
		* 上游：@deepseek-ai/dsh-client-ui-chat@0.2.1-rc.3，commit 1f81c047fc
		*
		* 逐字保留（含 `RunningWhaleTail`），仅改 import 路径。这是 flow 尾部的
		* 运行指示器，与折叠策略无关，必须与官方完全一致。
		*/
		/**
		* 在当前 Turn 内容之后显示实时已用时长，不播报每一次跳动。
		* @param props - 当前 Turn 的开始时间与本地化文案。
		* @returns 蓝色运行指示器；仅在 Session 运行时挂载。
		*/
		const RunningStatus = (0, react.memo)(function RunningStatus({ startTime, t }) {
			const [now, setNow] = (0, react.useState)(Date.now);
			(0, react.useEffect)(() => {
				if (startTime === void 0) return;
				setNow(Date.now());
				const timer = setInterval(() => {
					setNow(Date.now());
				}, LIVE_RUN_CLOCK_INTERVAL_MS);
				return () => {
					clearInterval(timer);
				};
			}, [startTime]);
			const label = startTime === void 0 ? t("chat.deepDiving") : t("chat.deepDivingFor", { duration: formatRunDuration(Math.max(1e3, now - startTime), t).map((part) => part.text).join("") });
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: chat_flow_module_css_default.running,
				"data-chat-running": true,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: accessibility_module_css_default.visuallyHidden,
						role: "status",
						"aria-live": "polite",
						"aria-atomic": "true",
						children: t("chat.deepDiving")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: chat_flow_module_css_default.runningDivider,
						"aria-hidden": "true"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
						className: chat_flow_module_css_default.runningContent,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(RunningWhaleTail, {}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.TextShimmer, {
							active: true,
							className: chat_flow_module_css_default.runningText,
							children: label
						})]
					})
				]
			});
		});
		//#endregion
		//#region src/client/flow/AutoFlow.tsx
		/**
		* 克隆自 `chat/ChatFlow.tsx`（61 行）。
		*
		* 上游：@deepseek-ai/dsh-client-ui-chat@0.2.1-rc.3，commit 1f81c047fc
		*
		* 修改点（仅一处）：
		*   - `ChatNodeSeat` → `AutoNodeSeat`，`ChatGroupSeat` → `AutoGroupSeat`。
		*
		* 不可改动（关键）：
		*   - `entries` 的顺序与 `chatRenderKey` 的用法 → React key 稳定性与滚动锚点
		*   - `pendingRows` 的 splice 位置 → 本地回声的挂载身份
		*   - `RunningStatus` 的尾部位置
		*/
		/**
		* 渲染 flow，不添加 DOM 父节点、不改变 keyed 行的位置。
		*/
		const AutoFlow = (0, react.memo)(function AutoFlow({ entries, pendingInputs, lastInputTurn, deferCollapse, useSession, useChat, useChatNode, useChatNodeBottom, useChatNodeProcess, useChatGroup, usePresentation, useStore, actions, renderSlot, renderFactorySlot, t, useGroupAction, useGroupHeaderAction, cwd, openFile, inspectCall, forkAt, loadImage, fileMentions }) {
			const nodeStore = useChat((snapshot) => snapshot.nodes);
			const running = useSession((snapshot) => snapshot.running);
			const runningStartTime = useChatNode(useChat((snapshot) => snapshot.navigation.items().at(-1)?.anchorKey) ?? "", (node) => {
				const location = node?.location;
				return location?.kind === "turn" || location?.kind === "step" ? location.turn.status === "open" ? location.turn.start?.time : void 0 : void 0;
			});
			const seatProps = {
				nodeStore,
				useChatNode,
				useChatNodeBottom,
				useChatNodeProcess,
				usePresentation,
				useStore,
				actions,
				renderSlot,
				t,
				useGroupAction,
				deferCollapse,
				cwd,
				openFile,
				inspectCall,
				forkAt,
				loadImage,
				fileMentions
			};
			const rows = entries.map((entry) => {
				switch (entry.kind) {
					case "node": return /* @__PURE__ */ (0, react.createElement)(AutoNodeSeat, {
						...seatProps,
						key: chatRenderKey(entry),
						nodeKey: entry.key,
						...entry.groupPart === void 0 ? {} : { groupPart: entry.groupPart }
					});
					case "group": return /* @__PURE__ */ (0, react.createElement)(AutoGroupSeat, {
						...seatProps,
						key: chatRenderKey(entry),
						groupKey: entry.key,
						useChat,
						useChatGroup,
						useGroupHeaderAction
					});
					default: throw new Error(`未知的 RenderEntry：${JSON.stringify(entry)}`);
				}
			});
			const pendingRows = pendingInputs.map((item) => "requestId" in item ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(PendingSubmissionBubble, {
				submission: item,
				loadImage,
				renderFactorySlot,
				t
			}, item.requestId) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(PendingSteeringBubble, {
				content: item.content,
				loadImage,
				renderFactorySlot,
				t
			}, item.id));
			const tail = entries.at(-1);
			const node = tail?.kind === "node" ? nodeStore.get(tail.key) : void 0;
			if (node?.kind === "turn-process" && node.location.kind === "turn" && node.location.turn.status === "open" && node.location.turn.turn !== lastInputTurn) {
				const index = pendingInputs.findIndex((item) => "requestId" in item && item.placement === "transcript");
				if (index !== -1) rows.splice(rows.length - 1, 0, ...pendingRows.splice(index, 1));
			}
			return [
				...rows,
				...pendingRows,
				...running ? [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(RunningStatus, {
					startTime: runningStartTime,
					t
				}, "running")] : []
			];
		});
		//#endregion
		//#region node_modules/.pnpm/@deepseek-ai+dsh-util-works_e9bdbcafdcd1bbd289e8c7a410be3a7d/node_modules/@deepseek-ai/dsh-util-workspace-path/lib/index.js
		/**
		* Browser-safe Workspace path and display helpers.
		* @module @deepseek-ai/dsh-util-workspace-path
		*/
		/** Whether a path uses a Windows drive or UNC prefix. */
		function isWindowsStylePath(value) {
			return /^[A-Za-z]:[/\\]/.test(value) || value.startsWith("\\\\");
		}
		/**
		* Whether a path is absolute in either spelling the Host accepts: POSIX (`/a/b`) or Windows drive or UNC.
		* @param path - the path to classify.
		* @returns `true` for an absolute path; `false` for a Workspace-relative one.
		*/
		function isAbsoluteWorkspacePath(path) {
			return path.startsWith("/") || isWindowsStylePath(path);
		}
		/**
		* Address a decoded absolute file path through the authenticated file route.
		* @param base - HTTP(S) application base, including its deployment prefix, or `dsh-app://app/`.
		* @param path - Native file path; URL escapes in authored Markdown must already be decoded.
		* @returns File URL, or undefined for unsupported transports and non-absolute paths.
		*/
		function fileMediaUrl(base, path) {
			if (!/^https?:/u.test(base) && !base.startsWith("dsh-app://app/") || !isAbsoluteWorkspacePath(path) || /^[/\\]{2}/u.test(path) || /[\u0000-\u001f\u007f]/u.test(path)) return void 0;
			return new URL(`api/file?path=${encodeURIComponent(path)}`, base).href;
		}
		//#endregion
		//#region src/client/assistant/markdown-labels.ts
		/**
		* 为一次 locale 修订构建完整的 Markdown chrome 文案。
		* @param t - Chat locale 座位。
		* @returns 代码块与脚注的文案。
		*/
		function markdownLabels(t) {
			const translate = t;
			return {
				code: {
					copyLabel: translate("copy"),
					copiedLabel: translate("copied"),
					toolbarLabels: {
						codeLabel: translate("codeBlock.title"),
						wrapLabel: translate("codeBlock.wrap"),
						unwrapLabel: translate("codeBlock.unwrap")
					}
				},
				footnotes: translate("markdown.footnotes")
			};
		}
		//#endregion
		//#region \0dsh-css:src/client/assistant/AutoReasoningRow.module.css.mjs
		const css$2 = ".ix3I4W_root{flex-direction:column;display:flex}.ix3I4W_root:not([data-expanded]){contain:size layout;height:calc(24px + var(--dsh-content-font-delta,0px))}.ix3I4W_row{overflow:hidden}.ix3I4W_root[data-expanded] [data-open] [data-disclosure-header]{z-index:1;background:var(--dsw-alias-bg-base);position:sticky;top:0}.ix3I4W_leading{flex-shrink:0}.ix3I4W_title{font-weight:400}.ix3I4W_separator{background:var(--dsw-alias-label-caption);border-radius:1px;flex:none;width:2px;height:2px;margin:0 8px}.ix3I4W_summary{min-width:0;font-size:var(--dsh-content-font-size-secondary,13px);line-height:calc(20px + var(--dsh-content-font-delta-secondary,0px));white-space:nowrap;flex:auto;overflow:hidden}.ix3I4W_summaryText{text-overflow:ellipsis;display:block;overflow:hidden}.ix3I4W_summary[data-streaming]{mask-image:linear-gradient(90deg,#000 calc(100% - 48px),#0000)}.ix3I4W_summary[data-streaming] .ix3I4W_summaryText{text-overflow:clip;overflow:visible}.ix3I4W_root:not([data-preview]) .ix3I4W_separator,.ix3I4W_root:not([data-preview]) .ix3I4W_summary{display:none}.ix3I4W_thinkBody{padding:4px 0 4px calc(22px + var(--dsh-content-font-delta,0px));min-width:0}";
		const tagId$2 = "dsh-auto-expand/src/client/assistant/AutoReasoningRow.module.css";
		if (typeof document !== "undefined") {
			let tag = document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$2) + "]");
			if (tag === null) {
				tag = document.createElement("style");
				tag.dataset.plugin = "dsh-auto-expand";
				tag.dataset.pluginCss = tagId$2;
				document.head.appendChild(tag);
			}
			tag.textContent = css$2;
		}
		var AutoReasoningRow_module_css_default = {
			"leading": "ix3I4W_leading",
			"root": "ix3I4W_root",
			"row": "ix3I4W_row",
			"separator": "ix3I4W_separator",
			"summary": "ix3I4W_summary",
			"summaryText": "ix3I4W_summaryText",
			"thinkBody": "ix3I4W_thinkBody",
			"title": "ix3I4W_title"
		};
		//#endregion
		//#region src/client/assistant/AutoReasoningRow.tsx
		/**
		* 克隆自 `chat/ReasoningRow.tsx`（102 行）。
		*
		* 上游：@deepseek-ai/dsh-client-ui-chat@0.2.1-rc.3，commit 1f81c047fc
		*
		* 修改点（一处）：
		*   - `useDisclosure()` → `useAutoDisclosure(autoOpenFor(...))`（可配置的收起时机）。
		*
		* 收起时机这一层是 2026-10-23 的修订：此前思考行只有「流式中 && 组展开」这一
		* 条硬编码规则（等价于时机 1「本条完成时」），现在与工具行**共用同一套四个
		* 时机、同一段判据**（`collapse-timing.ts`）。两者的差别只在信号怎么取：
		* 思考的 `done` 是「不再是流式尾部」，坐标直接来自所属 `assistant-step` 节点。
		*
		* 保留不动：
		*   - 折叠态的首行摘要预览与 `TextShimmer`
		*   - 全部 `data-*` 属性（官方 CSS 依赖）
		*   - 展开时通过 `renderSlot('conversation.chat.reasoning.body')` 渲染正文
		*     ——这是**官方 binding**，因此正文排版与官方完全一致
		*   - `running` 的无障碍播报
		*/
		/** 思考行的图标（官方同值）。 */
		const THINK_ICON = /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconThinkOutlineRegular, { size: 14 });
		/**
		* 取文本首行。
		* @param text - 完整文本。
		* @returns 第一行（不含换行）。
		*/
		function firstLine(text) {
			const newline = text.indexOf("\n");
			return newline === -1 ? text : text.slice(0, newline);
		}
		/**
		* 克隆自 `chat/ReasoningRow.tsx:16-32`。
		*
		* 流式期间，取"最新的、已完成的段落"的首行作为摘要。
		* 未完成的单行没有摘要，因此预览不会因半行文本而跳动。
		* @param text - 完整或流式思考文本。
		* @returns 摘要文本；无可用段落时为空串。
		*/
		function latestCompletedParagraphFirstLine(text) {
			let summary = "";
			let paragraphStart = 0;
			const separator = /\r?\n(?:[\t ]*\r?\n)+/g;
			while (true) {
				const nextParagraph = separator.exec(text);
				const paragraphEnd = nextParagraph === null ? text.length : nextParagraph.index + nextParagraph[0].indexOf("\n");
				const newline = text.indexOf("\n", paragraphStart);
				if (newline !== -1 && newline <= paragraphEnd) {
					const candidate = text.slice(paragraphStart, newline).trim();
					if (candidate !== "") summary = candidate;
				}
				if (nextParagraph === null) return summary;
				paragraphStart = nextParagraph.index + nextParagraph[0].length;
			}
		}
		/**
		* 渲染一段助手思考，收起时机由设置决定（默认「下一批操作出现时」）。
		*
		* 折叠态的摘要省略双星号标记；展开态渲染完整 Markdown。
		* 模式变化只切换 CSS 显示，不卸载折叠态摘要。
		* @param props - 思考文本、两个坐标、流式状态、渲染座位与本地化。
		* @returns 思考的 disclosure。
		*/
		const AutoReasoningRow = (0, react.memo)(function AutoReasoningRow({ step, anchorSeq, text, running, usePresentation, renderSlot, t }) {
			const group = (0, react.useContext)(GroupOpenContext);
			const settings = useAutoExpandSettings();
			const { open: expanded, toggle } = useAutoDisclosure(autoOpenFor({
				timing: settings.reasoningCollapseTiming,
				done: !running,
				isLatestBatch: isLatestStep(step, group.latestStep),
				isLatestNode: isLatestAnchor(anchorSeq, group.latestStartedAnchorSeq),
				enabled: settings.reasoningAutoExpand && group.open && group.auto
			}));
			const summaryText = running ? latestCompletedParagraphFirstLine(text) : firstLine(text);
			const summary = (0, react.useMemo)(() => summaryText.replaceAll("**", ""), [summaryText]);
			const preview = usePresentation((policy) => !expanded && summary !== "" && (running || policy.settledReasoningPreview));
			const collapsedContent = (0, react.useMemo)(() => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				className: AutoReasoningRow_module_css_default.separator,
				"data-shimmer-decoration": true,
				"aria-hidden": true
			}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				className: AutoReasoningRow_module_css_default.summary,
				"data-streaming": running || void 0,
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: AutoReasoningRow_module_css_default.summaryText,
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.TextShimmer, { children: summary })
				})
			})] }), [running, summary]);
			const content = (0, react.useMemo)(() => expanded ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: AutoReasoningRow_module_css_default.thinkBody,
				children: renderSlot("conversation.chat.reasoning.body", {
					text,
					running
				})
			}) : void 0, [
				expanded,
				renderSlot,
				running,
				text
			]);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: AutoReasoningRow_module_css_default.root,
				"data-variant": "think",
				"data-state": running ? "running" : "ok",
				"data-expanded": expanded || void 0,
				"data-preview": preview || void 0,
				children: [running && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: accessibility_module_css_default.visuallyHidden,
					children: t("row.running")
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.DisclosureRow, {
					rowClassName: AutoReasoningRow_module_css_default.row,
					leadingClassName: AutoReasoningRow_module_css_default.leading,
					titleClassName: AutoReasoningRow_module_css_default.title,
					icon: THINK_ICON,
					title: t("message.think"),
					running,
					open: expanded,
					expandable: true,
					expandOnRowClick: true,
					onToggle: toggle,
					collapsedContent,
					children: content
				})]
			});
		});
		//#endregion
		//#region \0dsh-css:src/client/assistant/AutoAssistantMarkdown.module.css.mjs
		const css$1 = ".w4nOPa_root{font-size:var(--dsh-content-font-size,14px);line-height:calc(24px + var(--dsh-content-font-delta,0px));color:var(--dsw-alias-label-primary);flex-direction:column;display:flex}.w4nOPa_body{flex-direction:column;gap:16px;display:flex}.w4nOPa_body .md-table-wide{--dsh-table-spare:max(0px, calc((100cqw - var(--dsh-chat-content-width)) / 2));--dsh-table-lead:calc(var(--dsh-table-spare) + min(var(--dsh-chat-content-width), 100cqw) - 100%);box-sizing:border-box;width:calc(100% + var(--dsh-table-lead) + var(--dsh-table-spare));max-width:none;margin-left:calc(-1 * var(--dsh-table-lead));padding-left:var(--dsh-table-lead)}.w4nOPa_body .md-table-wide>table{z-index:1;position:relative}.w4nOPa_body>[data-turn-process-inline][hidden]{margin-bottom:-16px}.w4nOPa_stopped{border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-tertiary);align-self:flex-start;padding:0 6px;font-size:11px;line-height:18px}.w4nOPa_actions{margin-top:16px;margin-left:-6px}";
		const tagId$1 = "dsh-auto-expand/src/client/assistant/AutoAssistantMarkdown.module.css";
		if (typeof document !== "undefined") {
			let tag = document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$1) + "]");
			if (tag === null) {
				tag = document.createElement("style");
				tag.dataset.plugin = "dsh-auto-expand";
				tag.dataset.pluginCss = tagId$1;
				document.head.appendChild(tag);
			}
			tag.textContent = css$1;
		}
		var AutoAssistantMarkdown_module_css_default = {
			"actions": "w4nOPa_actions",
			"body": "w4nOPa_body",
			"root": "w4nOPa_root",
			"stopped": "w4nOPa_stopped"
		};
		//#endregion
		//#region src/client/assistant/AutoAssistantMarkdown.tsx
		/**
		* 克隆自 `chat/AssistantMarkdown.tsx`（167 行）。
		*
		* 上游：@deepseek-ai/dsh-client-ui-chat@0.2.1-rc.3，commit 1f81c047fc
		*
		* 修改点（一处）：
		*   - `ReasoningRow` → `AutoReasoningRow`（接自动展开策略）。
		*   - 不再接收 `useDisclosure` prop（思考行自己用 `useAutoDisclosure`）。
		*   - 额外接收节点的 `step` 与 `anchorSeq`，原样转发给每个思考行。
		*
		* 为什么必须完整重写而不是包裹：官方 `AssistantNodeView` 内部固定引用
		* 官方 `AssistantMarkdown`，无法从外部替换其中一层。而官方
		* `AssistantNodeView` 的 children 声明（`conversation.chat.reasoning.body`
		* 与 `conversation.chat.message.images`）必须保留，因此走原地包裹 +
		* 自实现 Markdown 层（见 spec/DESIGN.md 4.4）。
		*
		* 必须逐条对齐的 6 个细节（遗漏有可见后果）：
		*   1. `hasVisible` 判定 —— 否则工具组之间出现空壳行
		*   2. `groupPart` 过滤 —— 否则 reasoning/response 重复渲染
		*   3. 空白 reasoning 跳过 —— 否则出现空思考行
		*   4. 图片组以**首块索引**为 key —— 否则流式追加时 gallery remount
		*   5. `interrupted` stopped 标记 —— 否则中断态缺标记
		*   6. `reasoningHidden` —— 否则整轮折叠时思考泄漏（第一层失效）
		*/
		/**
		* 克隆自 `chat/AssistantMarkdown.tsx:23-28`。
		*
		* 图片目标（忽略 query/fragment 后缀）的独立回退解析。
		* @param base - 渲染时的规范 `document.baseURI`。
		* @param value - 作者书写的 Markdown 目标；URL 转义只解码一次。
		* @returns 绝对 Web 或 Desktop file-API URL；不支持的协议与非本地路径返回 undefined。
		*/
		function localPathMediaUrl(base, value) {
			let path;
			try {
				path = decodeURIComponent(value.split(/[?#]/u)[0] ?? "");
			} catch {
				return;
			}
			return fileMediaUrl(base, path);
		}
		/** 把非空白 reasoning 块渲染为独立 disclosure，与回复并列。 */
		const AutoAssistantMarkdown = (0, react.memo)(function AutoAssistantMarkdown({ step, anchorSeq, blocks, streaming, interrupted, loadImage, groupPart, reasoningHidden = false, usePresentation, revealProcess, mentions, renderSlot, useGroupAction, t }) {
			const labels = (0, react.useMemo)(() => markdownLabels(t), [t]);
			const pathImages = (0, react.useMemo)(() => {
				return { resolve: (value) => localPathMediaUrl(document.baseURI, value) };
			}, []);
			const last = blocks.length - 1;
			if (!(streaming || interrupted === true || blocks.some((block) => block.kind !== "tool-call"))) return null;
			const rendered = [];
			for (let i = 0; i < blocks.length; i++) {
				const block = blocks[i];
				if (block === void 0) continue;
				if (groupPart === "reasoning" && block.kind !== "reasoning") continue;
				if (groupPart === "response" && block.kind === "reasoning") continue;
				switch (block.kind) {
					case "text":
						rendered.push(/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.MarkdownText, {
							text: block.text,
							streaming,
							labels,
							fileMentions: mentions,
							pathImages
						}, i));
						break;
					case "reasoning":
						if (block.text.trim() === "") break;
						rendered.push(/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ProcessReasoning, {
							hidden: reasoningHidden,
							reveal: revealProcess,
							useGroupAction,
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(AutoReasoningRow, {
								step,
								anchorSeq,
								text: block.text,
								running: streaming && i === last,
								usePresentation,
								renderSlot,
								t
							})
						}, i));
						break;
					case "image": {
						const start = i;
						const group = [block];
						while (i + 1 < blocks.length) {
							const next = blocks[i + 1];
							if (next === void 0 || next.kind !== "image") break;
							group.push(next);
							i += 1;
						}
						rendered.push(/* @__PURE__ */ (0, react_jsx_runtime.jsx)(react.Fragment, { children: renderSlot("conversation.chat.message.images", {
							images: group.map(({ attachment }) => ({ attachment })),
							loadImage,
							align: "start"
						}) }, start));
						break;
					}
					case "tool-call": break;
					default: rendered.push(/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.JsonBlock, {
						label: t("message.unknownBlock"),
						payload: block.block,
						truncatedLabel: (total) => t("json.truncated", { total })
					}, i));
				}
			}
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: AutoAssistantMarkdown_module_css_default.root,
				"data-streaming": streaming || void 0,
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: AutoAssistantMarkdown_module_css_default.body,
					children: [rendered, interrupted && (groupPart === void 0 || groupPart === "response" || !blocks.some((block) => block.kind !== "reasoning" && block.kind !== "tool-call")) && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: AutoAssistantMarkdown_module_css_default.stopped,
						children: t("message.stopped")
					})]
				})
			});
		});
		/**
		* 克隆自 `chat/AssistantMarkdown.tsx:157-165`。
		*
		* 把一段思考包进受 Turn 级可见性控制的容器。`useGroupAction` 绑定折叠
		* 动画与浏览器查找的 reveal。
		*/
		function ProcessReasoning({ hidden, reveal, useGroupAction, children }) {
			const ref = useGroupAction(hidden, reveal ?? NOOP);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				ref,
				"data-turn-process-inline": hidden || void 0,
				children
			});
		}
		/** 空操作。 */
		const NOOP = () => {};
		//#endregion
		//#region src/client/assistant/AutoAssistantNodeView.tsx
		/**
		* 克隆自 `chat/AssistantNodeView.tsx`（51 行）。
		*
		* 上游：@deepseek-ai/dsh-client-ui-chat@0.2.1-rc.3，commit 1f81c047fc
		*
		* 修改点（一处）：
		*   - 渲染 `AutoAssistantMarkdown` 而非官方 `AssistantMarkdown`。
		*   - 不再向 Markdown 层传 `useDisclosure`（思考行自己管状态）。
		*   - 额外下传节点的 `step` 与 `anchorSeq`（思考行收起时机的两个坐标）。
		*
		* 保留不动（关键）：
		*   - `reasoningHidden` 的计算 —— 这是第一层（整轮折叠）的职责。
		*     当整轮折叠、该 step 是 answer step、且 `inlineReasoning` 时，
		*     思考必须隐藏。漏掉会让第一层失效、思考泄漏。
		*   - `turn-tail` 订阅与 `owner`/`mentions` 计算 —— 决定是否显示文件提及链接。
		*   - `revealProcess` —— 展开整轮。
		*
		* 为什么必须重写而非包裹：官方组件内部固定引用官方 `AssistantMarkdown`，
		* 无法从外部替换其中一层（见 spec/DESIGN.md 4.4）。
		*/
		/**
		* 流式、已结算与已中断的 Assistant 状态共享同一个 keyed 渲染实例。
		*/
		const AutoAssistantNodeView = (0, react.memo)(function AutoAssistantNodeView({ node, groupPart, useGroupAction, useTurnData, turnProcess, openFile, loadImage, fileMentions, usePresentation, renderSlot, t }) {
			const data = node.data;
			const turn = node.location.kind === "turn" || node.location.kind === "step" ? node.location.turn : void 0;
			const tail = useTurnData("turn-tail");
			const owner = (0, react.useMemo)(() => {
				if (turn?.status !== "closed" || data.finalNode === void 0) return void 0;
				if (tail?.closing?.finalNode.seq !== data.finalNode.seq) return void 0;
				return {
					turn,
					seq: data.finalNode.seq,
					openFile
				};
			}, [
				data.finalNode,
				openFile,
				tail,
				turn
			]);
			const mentions = (0, react.useMemo)(() => owner === void 0 ? void 0 : fileMentions(owner), [fileMentions, owner]);
			const reasoningHidden = turnProcess !== void 0 && turnProcess.foldable && turnProcess.spec.answerStep === data.step && turnProcess.spec.inlineReasoning && !turnProcess.open;
			const revealProcess = (0, react.useCallback)(() => {
				turnProcess?.setOpen(true);
			}, [turnProcess]);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(AutoAssistantMarkdown, {
				step: data.step,
				anchorSeq: node.anchorSeq,
				blocks: data.blocks,
				groupPart,
				streaming: data.status === "running",
				interrupted: data.status === "interrupted",
				loadImage,
				reasoningHidden,
				useGroupAction,
				usePresentation,
				renderSlot,
				revealProcess,
				mentions,
				t
			});
		});
		//#endregion
		//#region src/client/tool/tool-auto-open.ts
		/**
		* 工具行自动展开的判据（纯函数）。
		*
		* 单独成模块的理由与 `scroll-align.ts` / `settings-card-state.ts` 相同：
		* 这是有分支的判定逻辑，必须能被直接断言。hook 需要 React dispatcher，
		* 但「这一行该不该自动展开」是纯数据推导。
		*
		* ## 为什么是三个条件的合取
		*
		* ```
		* toolAutoOpen = 开关 && 本组 body 展开 && 本组处于当前轮的自动展开窗口
		* ```
		*
		* **第三个条件是最容易漏掉的一个。** `groupOpen` 单独用会出问题：
		* 用户手动展开一个**历史** group 时 `groupOpen` 为真，若只看它，历史大段里
		* 的工具行就会全部自动弹出，直接破坏本插件「历史轮次完全不受影响」的核心
		* 承诺（`spec/CAPABILITY-MATRIX.md` E1）。
		*
		* `groupAuto` 取 `AutoGroupSeat` 里已有的
		* `settings.groupAutoExpand && !(closed === true)`——它恰好就是「这一组是不是
		* 当前轮里正在自动展开的那一组」。
		*
		* 四种组合的语义见 `spec/P7-PLAN.md` §3.1。
		*/
		/**
		* 判断某个工具行是否应处于自动展开状态。
		* @param input - 用户开关与本组的两个状态。
		* @returns 是否自动展开。
		*/
		function toolAutoOpen(input) {
			return input.toolAutoExpand && input.groupOpen && input.groupAuto;
		}
		/**
		* 判断某个工具行**此刻是否应处于自动展开状态**。
		*
		* 这把「三合取」（{@link toolAutoOpen}）与「收起时机」（`autoOpenFor`）合成
		* 一个判据，是工具行状态的**唯一来源**：
		*
		* | 调用方 | 用途 |
		* |---|---|
		* | `use-tool-disclosure.ts` | 决定这一行是否展开 |
		* | `AutoToolCallTree.tsx` | 决定「查看」按钮是否隐藏（P9） |
		*
		* ## 为什么必须共用
		*
		* 「运行中隐藏查看按钮」的语义就是「这一行还展开着 → 藏按钮；收起了 → 交回
		* 官方」。若两处各算各的，就会出现「行已经收起了、按钮却还藏着」这种不一致。
		* 因此这里抽成一个纯函数，两处调用**同一个**。
		*
		* @param input - 三合取条件、收起时机与两个坐标。
		* @returns 是否应自动展开。
		*/
		function toolRowAutoOpen(input) {
			return autoOpenFor({
				timing: input.timing,
				done: input.done,
				isLatestBatch: isLatestStep(input.step, input.latestStep),
				isLatestNode: input.started && isLatestAnchor(input.anchorSeq, input.latestStartedAnchorSeq),
				enabled: toolAutoOpen({
					toolAutoExpand: input.toolAutoExpand,
					groupOpen: input.groupOpen,
					groupAuto: input.groupAuto
				})
			});
		}
		//#endregion
		//#region src/client/tool/tool-row-context.ts
		/**
		* 官方工具行所在节点的信号（P8 信号层）。
		*
		* 工具行需要三个信号，分别服务于不同的收起时机：
		*
		* | 信号 | 服务时机 | 说明 |
		* |---|---|---|
		* | `done` | `'self'` | 根调用是否已进入 `result` 阶段 |
		* | `anchorSeq` | `'next-call'` | 节点序号，每节点唯一 → 永远只留最新一条 |
		* | `step` | `'next-node'` | 模型输出轮次，同批共享 → 同批一起展开 |
		*
		* ## 两个坐标
		*
		* `step` 表达「**批次**」：一次模型输出里派发的多个工具共享同一个 `step`，
		* 它们是同一批，要一起展开。`anchorSeq` 表达「**单条操作**」：串行命令时
		* 「下一条操作出现」意味着新节点一出现，前一个就收起。
		*
		* 两者缺一不可——初版只有 `anchorSeq` 导致并行工具只剩最后一个展开；
		* 只用 `step` 又无法表达「永远只留单条」。
		*
		* 思考行读的是**同一组坐标**（来自 `GroupOpenContext` 与所属 `assistant-step`
		* 节点），所以两者能用同一套时机判据。
		*
		* ## 为什么单独成文件
		*
		* `AutoToolCallTree.tsx`（Provider）与 `use-tool-disclosure.ts`（消费）都要它。
		* 若定义在 `AutoToolCallTree.tsx` 里，两者会形成**循环依赖**；而
		* `createContext()` 在模块顶层求值，循环依赖下可能拿到 `undefined`。
		*/
		/**
		* 工具行节点信号的默认值。
		*
		* 工具行一定渲染在 Provider 内，此默认值只作防御：`started: false` / `done: false`
		* 表示「视为未开始、未完成」——信息缺失时不自动展开，也不误判完成。
		*/
		const ToolRowContext = (0, react.createContext)({
			step: 0,
			anchorSeq: 0,
			started: false,
			done: false
		});
		//#endregion
		//#region src/client/tool/use-tool-disclosure.ts
		/**
		* 工具行的自动展开 hook。
		*
		* 它会被交给官方 `ToolCallTree` 的 `useDisclosure` prop，因此必须满足官方契约
		* （`ui-chat/src/client/contract/slots.ts:159`）：
		*
		* ```ts
		* type UseDisclosure = () => { expanded, setExpanded, toggle }
		* ```
		*
		* 即「无参调用、每次调用拥有独立状态」。官方 `ToolRow` 正是按这个契约
		* 无条件调用它的（`ui-tool/.../components/ToolRow.tsx:153`）。
		*
		* ## 判据由两段组成
		*
		* 1. **`enabled`** —— 由 `toolAutoOpen()` 算：开关 && 组展开 && 当前轮自动展开窗口；
		* 2. **时机** —— 由 `autoOpenFor()` 算：`self`（本条完成即收）/ `next-call`
		*    （下一条操作出现即收）/ `next-node`（下一批操作出现即收）/ `group`（随组收）。
		*
		* 四个时机、同一段判据，与思考行**逐字相同**——两者的差别只在信号怎么取，
		* 不在判据本身（见 `collapse-timing.ts` 头部）。
		*
		* ## 信号来源
		*
		* | 信号 | 来源 |
		* |---|---|
		* | `done` | `ToolRowContext.done`（根调用进入 `result` 阶段） |
		* | `isLatestBatch` | `ToolRowContext.step` vs `GroupOpenContext.latestStep` |
		* | `isLatestNode` | `ToolRowContext.anchorSeq` vs `GroupOpenContext.latestStartedAnchorSeq`，且本行 `started` 为真 |
		* | `timing` | `settings.toolCollapseTiming` |
		*
		* ## 引用稳定性（关键）
		*
		* 官方 `ToolCall` 把 `useDisclosure` 列入 `useMemo` 的依赖
		* （`ui-tool/.../ToolCallTree.tsx:39`），工厂引用一旦每次渲染都变，官方的
		* `owner` 对象就会反复重建。本文件导出的是**模块级函数**，引用天然恒定，
		* 所以调用方不需要再包一层 `useMemo`。
		*/
		/**
		* 官方工具行的自动展开状态。
		*
		* 契约与官方 `UseDisclosure` 完全一致：无参、每次调用独立持有状态、
		* 返回 `{ expanded, setExpanded, toggle }`。
		* @returns 当前展开状态与用户操作。
		*/
		function useAutoToolDisclosure() {
			const settings = useAutoExpandSettings();
			const group = (0, react.useContext)(GroupOpenContext);
			const row = (0, react.useContext)(ToolRowContext);
			const { open, setOpen, toggle } = useAutoDisclosure(toolRowAutoOpen({
				timing: settings.toolCollapseTiming,
				done: row.done,
				started: row.started,
				step: row.step,
				anchorSeq: row.anchorSeq,
				latestStep: group.latestStep,
				latestStartedAnchorSeq: group.latestStartedAnchorSeq,
				toolAutoExpand: settings.toolAutoExpand,
				groupOpen: group.open,
				groupAuto: group.auto
			}));
			return {
				expanded: open,
				setExpanded: setOpen,
				toggle
			};
		}
		//#endregion
		//#region src/client/tool/AutoToolCallTree.tsx
		/**
		* 官方 `ToolCallTree` 的**包裹层**（P7）。
		*
		* ## 为什么是「包裹」而不是「替换」
		*
		* P4 曾用**替换**的方式接管 `tool-call`：写一个极简组件顶替官方渲染器，
		* 结果把官方 `GenericToolCard` 这条 fallback 主路径一起顶掉——`pwsh`
		* （没有专用 toolview，走 fallback）从终端卡片退化成一行纯文本。
		* 全过程见 `spec/P4-ROLLBACK.md`。
		*
		* 本文件的思路相反：官方 `ToolCallTree` **原样渲染在包裹层内部**，
		* 只覆盖它从 props 接收的那一个 `useDisclosure`，并额外提供一个状态 context。
		* 因此 toolview 的 keyed 分派、`GenericToolCard` fallback、`SubCalls` 递归
		* 全部仍是官方代码，**不需要克隆 `ui-tool` 的任何文件**。
		*
		* ## 为什么必须包裹而不是重新注册
		*
		* `SlotCore.register` 拒绝为已声明的子 slot 再声明一次（`tool.call.toolview`），
		* 而不声明 children 就拿不到 `renderSlot`，也就渲染不出任何工具行。
		* 详见 `wrap.ts` 与 `spec/DESIGN.md` 第 4 节。
		*
		* ## P8 信号层
		*
		* 包裹层把本节点的三个信号通过 `ToolRowContext` 送进每一行
		* `useAutoToolDisclosure`：
		*
		* | 信号 | 用途 |
		* |---|---|
		* | `step` | 批次坐标（「下一批操作出现时」） |
		* | `anchorSeq` | 操作坐标（「下一条操作出现时」） |
		* | `started` | 是否已走出 `preparing`（未开始的行不自动展开） |
		* | `done` | 是否已进入 `result`（「本条完成时」） |
		*
		* 为什么必须用 context：官方 `useDisclosure` 的契约是**无参调用**，hook 拿不到
		* 调用它的那一行的任何数据。context 是在不克隆官方组件的前提下，把这些
		* 节点级信号送到每一行 hook 里的唯一通道。
		*
		* ## P9：覆盖 `inspectCall`（第二个被覆盖的 prop）
		*
		* 官方工具行的「查看」按钮由 `inspect !== undefined` 一个信号决定，而 `inspect`
		* 由 `ToolCallTree` 从 props 的 `inspectCall` 派生。包裹层因此按用户设置决定
		* **是否把 `inspectCall` 透传下去**：置空后，三个按钮（`ToolRow` /
		* `QuestionToolRow` / `bash-sample`）、`ToolDetails` 给按钮让位的 88px 内边距、
		* 以及按钮预留的那一行高度会**一起**消失——不改 CSS，不克隆 `ToolRow`。
		*
		* 判据见 `../inspect-button-scope.ts`。
		*/
		/**
		* 读取工具节点当前的 `step`，并在 `result` 阶段沿用 `start` 阶段记下的值。
		*
		* ## 为什么需要记住
		*
		* 上游的 `ToolResultNode`（`ui-conversation/src/client/contract/records.ts:161-183`）
		* **不继承 `ToolCallHead`，因此根本没有 `step` 字段**——只有 `seq` / `time`。
		*
		* 后果是工具一进入 `result` 阶段，`root.step` 就变成 `undefined`。若把它当作 0，
		* 判据会立刻认为这一行「已被更新的节点取代」，于是：
		*
		* | 时刻 | 错误表现 |
		* |---|---|
		* | A 完成 | A 的 step 变 0 → 被判非最新 → **错误收起** |
		* | 全部完成 | 所有 step 都是 0，最新也是 0 → `0 >= 0` → **反而全部展开** |
		* | 下一段思考出现 | 全部 0 < 新 step → **全部收起** |
		*
		* 这三条正是真机上看到的「诡异跳变」。本 hook 把 `start` 阶段的 step 留在 ref 里，
		* `result` 阶段照用，于是同一节点的 step 在整个生命周期内保持稳定。
		*
		* ## 为什么 ref 安全
		*
		* 同一个 `tool-call` 节点在 `start → result` 之间**复用同一个组件实例**
		* （keyed slot 的 key 不变），所以 ref 活着。若节点被卸载重建（分页/滚动），
		* ref 归零——此时退化为 0，属于「拿不到信息」的保守一侧。
		* @param liveStep - 当前渲染读到的 `root.step`（`result` 阶段为 undefined）。
		* @returns 稳定的 step。
		*/
		function useStableToolStep(liveStep) {
			const remembered = (0, react.useRef)(0);
			if (typeof liveStep === "number") remembered.current = liveStep;
			return remembered.current;
		}
		/**
		* 构造 `tool-call` 的包装器：把官方 `ToolCallTree` 渲染在包裹层内部。
		*
		* 与 `makeAutoFlow` / `makeAutoAssistant` 的根本不同：那两者**替代** `inner`
		* （完全不使用它），本包装器**使用** `inner`——这正是「包裹而非替换」。
		* @param inner - 官方 `ToolCallTree` 组件。
		* @returns 覆盖 `useDisclosure`、其余 props 透传的包裹组件。
		*/
		function makeAutoToolCallTree(inner) {
			const Inner = inner;
			/**
			* 官方工具行的包裹层。
			* @param props - 官方 `ToolCallTree` 的全部 props。
			* @returns 官方工具行（使用插件的自动展开状态）。
			*/
			function AutoToolCallTree(props) {
				const node = props.node;
				const root = node?.data.root;
				const done = root !== void 0 && "kind" in root;
				const started = toolStarted(root);
				const step = useStableToolStep(root?.step);
				const anchorSeq = node?.anchorSeq ?? 0;
				const state = (0, react.useMemo)(() => ({
					step,
					anchorSeq,
					started,
					done
				}), [
					step,
					anchorSeq,
					started,
					done
				]);
				const settings = useAutoExpandSettings();
				const group = (0, react.useContext)(GroupOpenContext);
				const autoOpen = toolRowAutoOpen({
					timing: settings.toolCollapseTiming,
					done,
					started,
					step,
					anchorSeq,
					latestStep: group.latestStep,
					latestStartedAnchorSeq: group.latestStartedAnchorSeq,
					toolAutoExpand: settings.toolAutoExpand,
					groupOpen: group.open,
					groupAuto: group.auto
				});
				const inspectCall = inspectCallFor({
					scope: settings.inspectButtonHideScope,
					autoOpen,
					inspectCall: props.inspectCall
				});
				return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ToolRowContext.Provider, {
					value: state,
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Inner, {
						...props,
						useDisclosure: useAutoToolDisclosure,
						inspectCall
					})
				});
			}
			return AutoToolCallTree;
		}
		//#endregion
		//#region src/client/settings-card-state.ts
		/**
		* 推导九行的渲染状态。
		*
		* 四条规则：
		*
		*  1. **操作组开关永不被锁**。它是这组设置里唯一能独立决策的一层；
		*  2. **操作组关闭 → 思考/工具开关被锁**。它们确实不会生效；
		*  3. **开关关闭 → 该层的时机行被锁**，且锁定原因记为 `own`；操作组关闭时
		*     记为 `workGroup`（优先），这样描述里点名的是最近的那一层的控制者；
		*  4. **锁住时保留 `checked` 原值，不强制 `false`**。这样重新打开上层后，
		*     用户之前的选择原样回来（DPG 的 `injectDoc` 行是同样的处理）。
		*
		* @param values - 当前设置。
		* @returns 九行各自的渲染状态。
		*/
		function deriveSettingsCardState(values) {
			const innerLocked = !values.groupAutoExpand;
			/**
			* 时机行的锁定原因：先看操作组（更上层），再看本层开关。
			* @param enabled - 该层自己的自动展开开关。
			* @returns 锁定原因。
			*/
			const timingGate = (enabled) => {
				if (!values.groupAutoExpand) return "workGroup";
				if (!enabled) return "own";
				return "none";
			};
			const reasoningGate = timingGate(values.reasoningAutoExpand);
			const toolGate = timingGate(values.toolAutoExpand);
			return {
				workGroup: {
					checked: values.groupAutoExpand,
					locked: false,
					gatedText: false
				},
				reasoning: {
					checked: values.reasoningAutoExpand,
					locked: innerLocked,
					gatedText: innerLocked
				},
				reasoningTiming: {
					locked: reasoningGate !== "none",
					gate: reasoningGate
				},
				tool: {
					checked: values.toolAutoExpand,
					locked: innerLocked,
					gatedText: innerLocked
				},
				toolTiming: {
					locked: toolGate !== "none",
					gate: toolGate
				},
				inspectScope: {
					locked: false,
					gate: "none"
				},
				inspectScopeIdle: !values.groupAutoExpand ? "workGroup" : !values.toolAutoExpand ? "own" : "none",
				heightUnlimited: {
					checked: values.groupHeightUnlimited,
					locked: false,
					gatedText: false
				},
				heightPercent: values.groupHeightUnlimited ? {
					locked: true,
					gate: "unlimited"
				} : {
					locked: false,
					gate: "none"
				},
				heightHistory: {
					checked: values.groupHeightHistory,
					locked: false,
					gate: "none"
				},
				groupHeightIdle: !values.groupAutoExpand
			};
		}
		//#endregion
		//#region \0dsh-css:src/client/settings-card.module.css.mjs
		const css = ".KApx_W_stack{flex-direction:column;gap:0;display:flex}.KApx_W_row{align-items:center;gap:8px;padding:12px 0;display:flex}.KApx_W_rowText{flex-direction:column;flex:1;gap:6px;min-width:0;padding-right:48px;display:flex}.KApx_W_title{color:var(--dsw-alias-label-primary);font-size:13px;font-weight:500;line-height:19.5px}.KApx_W_desc{color:var(--dsw-alias-label-tertiary);font-size:12px;font-weight:400;line-height:18px}.KApx_W_gated{color:var(--dsw-alias-label-dimmed)}.KApx_W_selector{border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-module-platform);height:36px;font:inherit;color:var(--dsw-alias-label-primary);cursor:pointer;border:none;align-items:center;gap:12px;padding:0 14px;font-size:13px;font-weight:500;line-height:19.5px;display:inline-flex}.KApx_W_selector:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}.KApx_W_selector:disabled{cursor:default;opacity:.5}.KApx_W_chevron{flex:none}.KApx_W_section{min-width:0;padding:16px 0}.KApx_W_section>:last-child{margin-bottom:-12px}.KApx_W_rule{border-top:.5px solid var(--dsw-alias-border-l2);flex:none;margin:0}.KApx_W_heading{color:var(--dsw-alias-label-primary);margin:0;font-size:13px;font-weight:600;line-height:1.5}.KApx_W_fieldSlot{min-width:0}.KApx_W_hintRow{justify-content:space-between;align-items:center;gap:12px;min-width:0;margin:-6px 0 12px;display:flex}.KApx_W_hintText{min-width:0;color:var(--dsw-alias-label-tertiary);flex:1;font-size:12px;font-weight:400;line-height:1.5}.KApx_W_warnBadge{color:var(--dsw-alias-state-warn-primary);flex:none;align-items:center;gap:4px;font-size:12px;font-weight:400;line-height:1.5;display:inline-flex}.KApx_W_fieldGated label,.KApx_W_fieldGated p{color:var(--dsw-alias-label-dimmed)}.KApx_W_fieldGated input{opacity:.5;cursor:default}";
		const tagId = "dsh-auto-expand/src/client/settings-card.module.css";
		if (typeof document !== "undefined") {
			let tag = document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]");
			if (tag === null) {
				tag = document.createElement("style");
				tag.dataset.plugin = "dsh-auto-expand";
				tag.dataset.pluginCss = tagId;
				document.head.appendChild(tag);
			}
			tag.textContent = css;
		}
		var settings_card_module_css_default = {
			"chevron": "KApx_W_chevron",
			"desc": "KApx_W_desc",
			"fieldGated": "KApx_W_fieldGated",
			"fieldSlot": "KApx_W_fieldSlot",
			"gated": "KApx_W_gated",
			"heading": "KApx_W_heading",
			"hintRow": "KApx_W_hintRow",
			"hintText": "KApx_W_hintText",
			"row": "KApx_W_row",
			"rowText": "KApx_W_rowText",
			"rule": "KApx_W_rule",
			"section": "KApx_W_section",
			"selector": "KApx_W_selector",
			"stack": "KApx_W_stack",
			"title": "KApx_W_title",
			"warnBadge": "KApx_W_warnBadge"
		};
		//#endregion
		//#region src/client/settings-card.tsx
		/**
		* 本插件的设置卡片，渲染在「侧栏 → 插件 → dsh-auto-expand」页面。
		*
		* 槽位 `plugins.bundle.config` 是按 bundle 名分派的 keyed slot，页面把它渲染
		* 在「描述」与「包含的组件」之间。**key 必须是本包的 bundle 名**：
		* `config-ledger.ts` 把这个槽位的 key 投影成 `configured` 标志，
		* key 不匹配则整段不渲染且无任何报错。
		*
		* 样式严格遵循 DPG 的设置页规范（`spec/SETTINGS-SPEC.md`）：
		*  - `.stack` 包装器是必需的：官方 `detailSection` 容器给子元素 12px gap，
		*    若本卡片返回 Fragment，所有块会被塞进那个间隔；
		*  - **九行，没有分组标题**（页面顶部已有插件名与描述）；
		*  - 字体两级：`.title` 13/500、`.desc` 12/400；
		*  - 行内边距 16px 0，标题↔描述 6px；
		*  - 开关用官方 `Switch`，下拉用官方 `Menu` + 自定义 anchor。
		*
		* ## 九行按四组排列
		*
		* ```
		* 1 Switch  自动展开操作组
		* 2 Switch  自动展开思考过程
		* 3 下拉    思考收起时机
		* 4 Switch  自动展开工具结果
		* 5 下拉    工具收起时机
		* 6 下拉    隐藏查看按钮
		* 7 Switch  自定义展开高度
		* 8 数字    展开高度
		* 9 Switch  历史轮次也应用
		* ```
		*
		* 同一对象的开关与时机**相邻**，读起来就是「这一层开不开、什么时候收」。
		*
		* ## 门控有两层
		*
		* 1. 思考/工具都渲染在 group body **内部**，操作组折叠时不可见 →
		*    操作组开关关闭时，第 2~5 行全部变灰；
		* 2. 没有自动展开就没有「什么时候收起」→ 某层开关关闭时，它自己的时机行
		*    也变灰，并在描述里点名控制者。
		*
		* 不把依赖关系显示出来，UI 就在撒谎——用户会反复拨弄一个毫无反应的控件。
		*/
		/** 每个时机的文案键。 */
		const TIMING_LABEL_KEYS = {
			self: "timingSelf",
			"next-call": "timingNextCall",
			"next-node": "timingNextNode",
			group: "timingGroup"
		};
		/** 每个隐藏范围的文案键。 */
		const SCOPE_LABEL_KEYS = {
			off: "inspectScopeOff",
			current: "inspectScopeCurrent",
			all: "inspectScopeAll"
		};
		/**
		* 低于这个百分比时显示橙色警告。
		*
		* `10%` 对应 `min(40px, 5vh)`，已经容不下一条完整操作行（含渐隐区）。
		* 与设计文档 §6.1.2 一致。
		*/
		const WARN_BELOW_PERCENT = 10;
		/**
		* 一行开关：名称 + 描述 + 右侧 Switch。
		* @param props - 标题、描述、当前值、写入回调，以及可选的"被上层开关锁住"信息。
		* @returns 一行设置。
		*/
		function SwitchRow({ title, description, checked, onChange, locked }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: settings_card_module_css_default.row,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: settings_card_module_css_default.rowText,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: locked === void 0 ? settings_card_module_css_default.title : `${settings_card_module_css_default.title} ${settings_card_module_css_default.gated}`,
						children: title
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: locked === void 0 ? settings_card_module_css_default.desc : `${settings_card_module_css_default.desc} ${settings_card_module_css_default.gated}`,
						children: description
					})]
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Switch, {
					checked,
					onChange,
					label: title,
					disabled: locked !== void 0,
					...locked === void 0 ? {} : { title: locked.hint }
				})]
			});
		}
		/**
		* 一行下拉：名称 + 描述 + 右侧 selector 按钮。
		*
		* 结构与 DPG 的设置卡片（`dsh-project-groups/src/client/settings-card.tsx:366-397`）
		* 及官方 `PreferenceRow` 一致：左侧文字，右侧一个 pill 按钮 + `Menu` 弹出选项。
		*
		* **`portal` 必须开**：卡片在插件页的滚动 detail 列里，就地展开的列表会被
		* `overflow` 裁剪（DPG 的同款注释）。
		* @param props - 标题、描述、当前值、选项、写入回调，以及可选的锁定信息。
		* @returns 一行设置。
		*/
		function SelectRow({ title, description, value, options, onChange, locked }) {
			const [open, setOpen] = (0, react.useState)(false);
			const selectedLabel = options.find((option) => option.id === value)?.label ?? "";
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: settings_card_module_css_default.row,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: settings_card_module_css_default.rowText,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: locked === void 0 ? settings_card_module_css_default.title : `${settings_card_module_css_default.title} ${settings_card_module_css_default.gated}`,
						children: title
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: locked === void 0 ? settings_card_module_css_default.desc : `${settings_card_module_css_default.desc} ${settings_card_module_css_default.gated}`,
						children: description
					})]
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Menu, {
					open,
					onClose: () => {
						setOpen(false);
					},
					items: options.map((option) => ({
						id: option.id,
						label: option.label
					})),
					selectedId: value,
					onSelect: (id) => {
						setOpen(false);
						onChange(id);
					},
					align: "end",
					portal: true,
					anchor: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
						type: "button",
						className: settings_card_module_css_default.selector,
						"aria-haspopup": "menu",
						"aria-expanded": open,
						disabled: locked !== void 0,
						...locked === void 0 ? {} : { title: locked.hint },
						onClick: () => {
							setOpen((next) => !next);
						},
						children: [selectedLabel, /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronDownOutlineRegular, { className: settings_card_module_css_default.chevron })]
					})
				})]
			});
		}
		/**
		* 一行数字输入：标题、满宽输入框、描述行（描述 + 右侧提示）。
		*
		* ## 输入不过滤，完全照搬官方
		*
		* 官方 `SettingsValueField` 的契约写得很明确：
		*
		* > `numeric` only hints the keypad: which drafts a field accepts is decided by
		* > its spec, so **the control never silently rewrites what the user typed**.
		*
		* 因此这里**一个字符都不删**：`abc` 留在框里、`2.5` 保持 `2.5`、全角 `１５０`
		* 也原样保留（它数学上不是数字，会被判为非法——这是照搬官方的代价）。
		* 早先的实现会过滤成 `150` 并丢掉 `abc`，其中 `2.5` → `25` 是**静默篡改**。
		*
		* ## 两类提示，位置都在描述行
		*
		* | 状态 | 显示 | 颜色 |
		* |---|---|---|
		* | 非法（非数字 / 负数） | 官方 `invalid` 通道：替换描述行文字 + 红框 | 红 |
		* | 值过小（< 10） | 描述 + 右侧 ⓘ 警告 | **橙** |
		*
		* 两者互斥：有错误时「过小」没有意义。
		*
		* ## 为什么自己渲染描述行
		*
		* 官方的 `hint` 是**纯字符串**，由组件内部渲染成一个独立的 `<p>`，没有任何插槽
		* 能在它旁边加元素。要做「描述 + 右侧警告」，只能 `hint={undefined}` 并自己渲染
		* 一行 —— 代价见 CSS 里 `.hintRow` 上方的负边距说明。
		*
		* ## 为什么是受控草稿
		*
		* 开关点击即写，但数字输入有中间态：输入 `200` 是 `2` → `20` → `200`。
		* 逐字写入会让中间那个 `2%` 把操作组压到 `min(8px, 1vh)`，用户看到组闪缩三次。
		* 因此键入只改本地 `draft`，失焦才提交。
		* @param props - 标题、描述、当前值、提交回调、锁定信息与文案。
		* @returns 一行设置。
		*/
		function NumberRow({ title, description, value, onCommit, locked, warning, notNumberLabel, negativeLabel, fieldId, overriddenLabel, resetLabel }) {
			const [draft, setDraft] = (0, react.useState)(String(value));
			const [focused, setFocused] = (0, react.useState)(false);
			(0, react.useEffect)(() => {
				if (focused) return;
				setDraft(String(value));
			}, [value, focused]);
			/**
			* 解析草稿。
			*
			* 判据与官方 `settingsNumberField().parse` 一致，只多一条「非负」：
			*
			* | 官方 | 这里 |
			* |---|---|
			* | 空 → `clear` | 空 → 恢复默认 100 |
			* | `Number.isFinite` → 可写 | 同 |
			* | 否则非法 | 同上，**外加 `n < 0` 也非法** |
			*
			* 多这一条是因为官方有 `SettingsForm` 的「保存失败」反馈兜底（Host 拒绝时
			* 显示 `saveFailed`），而本卡片是**立即生效**、没有那个点 —— 若不在这里拦，
			* 负数会被 Host 的 `min(0)` 拒绝然后**静默回滚**，用户看到输入无效却无提示。
			*/
			const trimmed = draft.trim();
			const num = trimmed === "" ? null : Number(trimmed);
			const isNotNumber = trimmed !== "" && !Number.isFinite(num);
			const isNegative = Number.isFinite(num) && num < 0;
			const invalid = isNotNumber || isNegative;
			/** 非法时给出的具体原因（负数与「不是数字」要分开说）。 */
			const invalidLabel = isNegative ? negativeLabel : notNumberLabel;
			/** 合法的数值；非法的草稿不参与「过小」判定。 */
			const validNum = invalid ? null : num;
			const tooSmall = locked === void 0 && validNum !== null && validNum < WARN_BELOW_PERCENT;
			/** 偏离默认值（100%）时显示「已覆盖 / 恢复默认」。 */
			const overridden = value !== 100;
			/**
			* 提交草稿。
			*
			* **空草稿写默认值 100**（不是 0 或旧值）：100 就是官方默认，
			* 「清空」因此等价于「恢复默认」，这是数字字段里最符合直觉的语义。
			*
			* **非法草稿不提交**：官方 invalid 时会禁用保存按钮，那是它的闸门；
			* 我们立即生效，闸门只能放在这里。草稿保留在框里（不删用户输入），
			* 让用户看到自己打的内容和红字提示。
			*
			* ## 为什么由外层 `<div onBlurCapture>` 触发
			*
			* 官方 `SettingsValueField` 只暴露 `onEdit` / `onReset`，没有 `onBlur` 钩子。
			* 但 React 的 `blur` 事件**不冒泡**——所以外层要用 capture 阶段才能收到。
			*
			* ## 提交后把草稿对齐到权威值
			*
			* `writeOptimistic` 是先同步改快照、再异步写 Host、失败时回滚。
			* 若只依赖 `useEffect` 同步草稿，被 Host 拒绝的值会短暂留在框里；
			* 且 `next === value` 的相等短路会让 `"007"` 这类草稿永远不回正。
			*/
			const commit = () => {
				if (invalid) return;
				const next = trimmed === "" ? 100 : num;
				setDraft(String(next));
				if (next === value) return;
				onCommit(next);
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: locked === void 0 ? settings_card_module_css_default.fieldSlot : `${settings_card_module_css_default.fieldSlot} ${settings_card_module_css_default.fieldGated}`,
				onFocusCapture: () => {
					setFocused(true);
				},
				onBlurCapture: () => {
					setFocused(false);
					commit();
				},
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.SettingsValueField, {
					id: fieldId,
					label: title,
					text: draft,
					invalid,
					overridden,
					overriddenLabel,
					onReset: () => {
						setDraft(String(100));
						onCommit(100);
					},
					resetLabel,
					invalidLabel,
					numeric: true,
					disabled: locked !== void 0,
					...locked === void 0 ? {} : { title: locked.hint },
					onEdit: (text) => {
						setDraft(text);
					}
				}), !invalid && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: settings_card_module_css_default.hintRow,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: settings_card_module_css_default.hintText,
						children: locked === void 0 ? description : locked.hint
					}), tooSmall && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
						className: settings_card_module_css_default.warnBadge,
						role: "img",
						"aria-label": warning,
						title: warning,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconInfoOutlineRegular, { size: 14 }), warning]
					})]
				})]
			});
		}
		/**
		* 一个一级分组：`<h3>` 标题 + 组内各行。
		*
		* ## 为什么定义在模块级而不是 `SettingsCard` 内部
		*
		* 早先它写在 `SettingsCard` 函数体里。那样**每次渲染都会创建新的组件类型**，
		* React 认为整棵子树是全新的，于是**卸载重建**每个分组——表现为：
		*
		* - 开关的切换动画消失（不是更新，是重建）；
		* - 点击开关后页面跳到顶部（DOM 节点被移除又插入，滚动位置丢失）。
		*
		* 组件定义在渲染过程中产生，是 React 里最典型的性能与状态 bug 来源。
		* 挪到模块级后，组件类型稳定，React 走正常的更新路径。
		* @param props - 分组标题、`aria-labelledby` 的锚点 id、是否在顶部画分隔线、组内各行。
		* @returns 一个分节（可能带前置分隔线）。
		*/
		function Section({ id, title, divider, children }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [divider && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: settings_card_module_css_default.rule,
				role: "presentation"
			}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				className: settings_card_module_css_default.section,
				"aria-labelledby": id,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
					className: settings_card_module_css_default.heading,
					id,
					children: title
				}), children]
			})] });
		}
		/**
		* 渲染四个分组、九个设置项。
		*
		* 没有卡片级标题：插件详情页顶部已经写着插件名和描述。
		*
		* 设置状态来自模块级 `settingsSource`（见 `settings.ts`），因此本卡片与
		* 渲染层的展开策略读的是**同一个**快照，不可能不一致。
		* @param props - 槽位运行时与 locale 座位。
		* @returns 设置卡片。
		*/
		function SettingsCard({ t }) {
			const settings = useAutoExpandSettings();
			const state = deriveSettingsCardState(settings);
			/** 分组标题的 `id` 前缀，用于 `aria-labelledby` 与 `<h3>` 的配对。 */
			const sectionId = (0, react.useId)();
			const gatedByWorkGroup = t("gatedByWorkGroup");
			/**
			* 时机行被锁时的描述：点名最近的那一层控制者。
			* @param gate - 锁定原因。
			* @param ownKey - 本层开关的说明文案键。
			* @returns 描述文本。
			*/
			const timingText = (gate, ownKey) => {
				if (gate === "workGroup") return gatedByWorkGroup;
				if (gate === "own") return t(ownKey);
				return "";
			};
			/** 时机选项；顺序即 `COLLAPSE_TIMINGS`。两个下拉共用。 */
			const timingOptions = COLLAPSE_TIMINGS.map((id) => ({
				id,
				label: t(TIMING_LABEL_KEYS[id])
			}));
			/** 隐藏范围选项；顺序即 `INSPECT_BUTTON_HIDE_SCOPES`（从松到紧）。 */
			const scopeOptions = INSPECT_BUTTON_HIDE_SCOPES.map((id) => ({
				id,
				label: t(SCOPE_LABEL_KEYS[id])
			}));
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: settings_card_module_css_default.stack,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Section, {
						id: `${sectionId}-workgroup`,
						title: t("groupWorkGroup"),
						divider: false,
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SwitchRow, {
							title: t("workGroupTitle"),
							description: t("workGroupDesc"),
							checked: state.workGroup.checked,
							onChange: (next) => {
								setAutoExpandSetting(GROUP_AUTO_EXPAND_FIELD, next);
							},
							...state.workGroup.locked ? { locked: { hint: gatedByWorkGroup } } : {}
						})
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)(Section, {
						id: `${sectionId}-reasoning`,
						title: t("groupReasoning"),
						divider: true,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SwitchRow, {
							title: t("reasoningTitle"),
							description: state.reasoning.gatedText ? gatedByWorkGroup : t("reasoningDesc"),
							checked: state.reasoning.checked,
							onChange: (next) => {
								setAutoExpandSetting(REASONING_AUTO_EXPAND_FIELD, next);
							},
							...state.reasoning.locked ? { locked: { hint: gatedByWorkGroup } } : {}
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SelectRow, {
							title: t("reasoningTimingTitle"),
							description: state.reasoningTiming.gate === "none" ? t("reasoningTimingDesc") : timingText(state.reasoningTiming.gate, "gatedByReasoning"),
							value: settings.reasoningCollapseTiming,
							options: timingOptions,
							onChange: (next) => {
								setAutoExpandSetting(REASONING_COLLAPSE_TIMING_FIELD, next);
							},
							...state.reasoningTiming.locked ? { locked: { hint: timingText(state.reasoningTiming.gate, "gatedByReasoning") } } : {}
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)(Section, {
						id: `${sectionId}-tool`,
						title: t("groupTool"),
						divider: true,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SwitchRow, {
								title: t("toolTitle"),
								description: state.tool.gatedText ? gatedByWorkGroup : t("toolDesc"),
								checked: state.tool.checked,
								onChange: (next) => {
									setAutoExpandSetting(TOOL_AUTO_EXPAND_FIELD, next);
								},
								...state.tool.locked ? { locked: { hint: gatedByWorkGroup } } : {}
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SelectRow, {
								title: t("toolTimingTitle"),
								description: state.toolTiming.gate === "none" ? t("toolTimingDesc") : timingText(state.toolTiming.gate, "gatedByTool"),
								value: settings.toolCollapseTiming,
								options: timingOptions,
								onChange: (next) => {
									setAutoExpandSetting(TOOL_COLLAPSE_TIMING_FIELD, next);
								},
								...state.toolTiming.locked ? { locked: { hint: timingText(state.toolTiming.gate, "gatedByTool") } } : {}
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SelectRow, {
								title: t("inspectScopeTitle"),
								description: scopeDescription(settings.inspectButtonHideScope, state.inspectScopeIdle, t),
								value: settings.inspectButtonHideScope,
								options: scopeOptions,
								onChange: (next) => {
									setAutoExpandSetting(INSPECT_BUTTON_HIDE_SCOPE_FIELD, next);
								}
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)(Section, {
						id: `${sectionId}-height`,
						title: t("groupHeight"),
						divider: true,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SwitchRow, {
								title: t("heightUnlimitedTitle"),
								description: state.groupHeightIdle ? t("heightIdle") : t("heightUnlimitedDesc"),
								checked: state.heightUnlimited.checked,
								onChange: (next) => {
									setAutoExpandSetting(GROUP_HEIGHT_UNLIMITED_FIELD, next);
								}
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(NumberRow, {
								title: t("heightPercentTitle"),
								fieldId: `${sectionId}-height-percent`,
								description: state.heightPercent.gate === "unlimited" ? t("gatedByHeightUnlimited") : t("heightPercentDesc"),
								value: settings.groupHeightPercent,
								warning: t("heightPercentTooSmall"),
								notNumberLabel: t("heightPercentNotNumber"),
								negativeLabel: t("heightPercentNegative"),
								overriddenLabel: t("heightOverridden"),
								resetLabel: t("heightReset"),
								onCommit: (next) => {
									setAutoExpandSetting(GROUP_HEIGHT_PERCENT_FIELD, next);
								},
								...state.heightPercent.locked ? { locked: { hint: t("gatedByHeightUnlimited") } } : {}
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SwitchRow, {
								title: t("heightHistoryTitle"),
								description: t("heightHistoryDesc"),
								checked: state.heightHistory.checked,
								onChange: (next) => {
									setAutoExpandSetting(GROUP_HEIGHT_HISTORY_FIELD, next);
								}
							})
						]
					})
				]
			});
		}
		/**
		* 选一条说明文案。
		*
		* 只有「运行中隐藏」才需要额外解释：它依赖自动展开，开关一关就没有「运行中」
		* 可言，此时该档等同于「不隐藏」。其余两档与开关无关，用基础说明即可。
		* @param scope - 当前档位。
		* @param idle - 「运行中」档失效的原因。
		* @param t - 本地化函数。
		* @returns 说明文案。
		*/
		function scopeDescription(scope, idle, t) {
			if (scope !== "current") return t("inspectScopeDesc");
			if (idle === "workGroup") return t("inspectScopeDescCurrentWorkGroupOff");
			if (idle === "own") return t("inspectScopeDescCurrentToolOff");
			return t("inspectScopeDescCurrent");
		}
		//#endregion
		//#region src/client/locales.ts
		/** 设置卡片的 locale 命名空间。 */
		const SETTINGS_NS = "autoExpand";
		/** 中文文案。 */
		const zh = {
			workGroupTitle: "自动展开操作组",
			workGroupDesc: "当前运行的一轮里，操作组默认展开；该组结束后自动收起。",
			reasoningTitle: "自动展开思考过程",
			reasoningDesc: "思考内容默认展开；按下方时机自动折叠。",
			toolTitle: "自动展开工具结果",
			toolDesc: "工具调用的结果默认展开；按下方时机自动折叠。",
			reasoningTimingTitle: "思考收起时机",
			reasoningTimingDesc: "这条思考什么时候收起。",
			toolTimingTitle: "工具收起时机",
			toolTimingDesc: "这条工具结果什么时候收起。",
			timingSelf: "本条完成时",
			timingNextCall: "下一条操作出现时",
			timingNextNode: "下一批操作出现时",
			timingGroup: "随操作组收起",
			inspectScopeTitle: "隐藏查看按钮",
			inspectScopeDesc: "只影响工具行，思考行没有这个按钮。",
			inspectScopeDescCurrent: "只影响工具行。工具行收起后不再控制，交回官方默认行为。",
			inspectScopeDescCurrentWorkGroupOff: "「运行中」依赖操作组自动展开，当前已关闭；选此档等同于「不隐藏」。",
			inspectScopeDescCurrentToolOff: "「运行中」依赖工具行自动展开，当前已关闭；选此档等同于「不隐藏」。",
			inspectScopeOff: "不隐藏",
			inspectScopeCurrent: "仅运行中隐藏",
			inspectScopeAll: "全部隐藏",
			gatedByWorkGroup: "由「自动展开操作组」控制，现已关闭",
			gatedByReasoning: "由「自动展开思考过程」控制，现已关闭",
			gatedByTool: "由「自动展开工具结果」控制，现已关闭",
			heightUnlimitedTitle: "不限制高度",
			heightUnlimitedDesc: "操作组内容全部展开，随对话滚动；开启时下面的百分比不生效。",
			heightPercentTitle: "展开高度（%）",
			heightPercentDesc: "按官方高度的百分比缩放；100 等于官方默认。",
			heightPercentTooSmall: "高度过小，内容几乎不可见",
			heightPercentNotNumber: "请填数字",
			heightPercentNegative: "请填非负数",
			heightOverridden: "已覆盖",
			heightReset: "恢复默认",
			heightHistoryTitle: "历史轮次也应用",
			heightHistoryDesc: "开启后，已结束轮次的操作组也使用上面的高度设置。",
			gatedByHeightUnlimited: "「不限制高度」已开启，百分比不生效",
			heightIdle: "「自动展开操作组」已关闭，此设置暂不生效。",
			groupWorkGroup: "操作组",
			groupReasoning: "思考",
			groupTool: "工具",
			groupHeight: "高度"
		};
		/** 英文文案。 */
		const en = {
			workGroupTitle: "Auto-expand process groups",
			workGroupDesc: "Show each process group in the running turn; fold it once the group ends.",
			reasoningTitle: "Auto-expand reasoning",
			reasoningDesc: "Show reasoning by default; fold it at the timing below.",
			toolTitle: "Auto-expand tool results",
			toolDesc: "Show tool results by default; fold them at the timing below.",
			reasoningTimingTitle: "Reasoning collapse timing",
			reasoningTimingDesc: "When this reasoning row folds.",
			toolTimingTitle: "Tool collapse timing",
			toolTimingDesc: "When this tool row folds.",
			timingSelf: "When this row finishes",
			timingNextCall: "When the next operation appears",
			timingNextNode: "When the next batch appears",
			timingGroup: "With the process group",
			inspectScopeTitle: "Hide the Inspect button",
			inspectScopeDesc: "Only affects tool rows — reasoning rows have no such button.",
			inspectScopeDescCurrent: "Only affects tool rows. Once a row folds, the plugin stops controlling it and official behavior returns.",
			inspectScopeDescCurrentWorkGroupOff: "\"While running\" needs auto-expanded process groups, which are off. This option currently behaves like \"Do not hide\".",
			inspectScopeDescCurrentToolOff: "\"While running\" needs auto-expanded tool rows, which are off. This option currently behaves like \"Do not hide\".",
			inspectScopeOff: "Do not hide",
			inspectScopeCurrent: "While running",
			inspectScopeAll: "Always",
			gatedByWorkGroup: "Controlled by \"Auto-expand process groups\"; currently off",
			gatedByReasoning: "Controlled by \"Auto-expand reasoning\"; currently off",
			gatedByTool: "Controlled by \"Auto-expand tool results\"; currently off",
			heightUnlimitedTitle: "No height limit",
			heightUnlimitedDesc: "Show the whole group, scrolling with the conversation; the percentage below is ignored.",
			heightPercentTitle: "Expanded height (%)",
			heightPercentDesc: "A percentage of the official height; 100 equals the official default.",
			heightPercentTooSmall: "Too small — content is barely visible",
			heightPercentNotNumber: "Enter a number",
			heightPercentNegative: "Enter a non-negative number",
			heightOverridden: "Overridden",
			heightReset: "Reset",
			heightHistoryTitle: "Apply to past turns too",
			heightHistoryDesc: "Also apply the height above to process groups in finished turns.",
			gatedByHeightUnlimited: "\"No height limit\" is on, so the percentage has no effect",
			heightIdle: "\"Auto-expand process groups\" is off, so this setting has no effect yet.",
			groupWorkGroup: "Process group",
			groupReasoning: "Reasoning",
			groupTool: "Tools",
			groupHeight: "Height"
		};
		//#endregion
		//#region src/client/index.ts
		/** 日志前缀。 */
		const TAG = "[dsh-auto-expand]";
		/**
		* 本插件依赖的 cordis 服务。
		*
		* `slots` 是硬依赖（包裹目标 + 设置卡片槽位）。`locale` 与 `configForms`
		* 通过可选注入接入：缺失时插件以默认设置与原始 key 文案工作，而不是整体失效。
		*/
		const inject = ["slots"];
		/** 包裹目标：flow（single slot，无 key）。 */
		const FLOW_TARGET = { slot: "conversation.chat.flow" };
		/** 包裹目标：assistant-step（keyed slot）。 */
		const ASSISTANT_TARGET = {
			slot: "conversation.chat.node",
			key: "assistant-step"
		};
		/**
		* 包裹目标：tool-call（keyed slot）。
		*
		* 与 `ASSISTANT_TARGET` 同属 `conversation.chat.node` 这个 keyed slot，
		* 因此 `slots/changed` 的监听条件无需改动即可覆盖它。
		*/
		const TOOL_TARGET = {
			slot: "conversation.chat.node",
			key: "tool-call"
		};
		/**
		* 构造 flow 的包装器：返回 `AutoFlow`。
		*
		* `AutoFlow` 是官方 `ChatFlow` 的克隆，只把两个 seat 组件换成自动展开版本。
		* 它需要官方 entry 的全部 props（含 `renderSlot`、`useGroupAction`、`useStore`），
		* 这些都由包裹保留的 inject/children 声明自动提供。
		* @param _inner - 官方 `ChatFlow`（本实现完全替代它，不使用）。
		* @returns `AutoFlow` 组件。
		*/
		function makeAutoFlow(_inner) {
			return AutoFlow;
		}
		/**
		* 构造 assistant-step 的包装器：返回 `AutoAssistantNodeView`。
		*
		* 它是官方 `AssistantNodeView` 的重写：保留全部 props 与 `reasoningHidden`
		* 计算，只把内层 Markdown 层换成 `AutoAssistantMarkdown`，让思考行接入
		* 自动展开策略。
		* @param _inner - 官方 `AssistantNodeView`（本实现完全替代它）。
		* @returns `AutoAssistantNodeView` 组件。
		*/
		function makeAutoAssistant(_inner) {
			return AutoAssistantNodeView;
		}
		/**
		* 在 slot 变化后重新尝试包裹，直到三个目标都成功。
		*
		* 包裹必须等官方 entry 注册之后才能进行，而插件激活顺序与 slot 注册顺序
		* 没有硬保证，因此这里订阅 `slots/changed` 做重试。每次事件后重新读取
		* `ctx.slots.entries(...)`，因为 entry 数组会在注册变化时被替换。
		* @param ctx - 客户端 context。
		* @returns 还原全部包裹并停止监听的函数。
		*/
		function installWrappers(ctx) {
			const restores = [];
			const done = /* @__PURE__ */ new Set();
			/**
			* Step 0 诊断：`tool-call` 包裹的生效报告只打印一次。
			*
			* 为什么需要它：`wrapEntry` 在 entry 不存在、组件不可包裹、或 entry 被
			* 上游冻结时，都会**静默**降级为 NOOP（刻意设计——绝不让 DSH 崩溃）。
			* 但这意味着「插件不生效」与「官方行为」在真机上一模一样。
			*
			* Step 0 的全部意义就是证明「包裹官方工具行」零副作用，因此必须能区分
			* 这两种结果。只在 Step 0 的验证期需要，Step 2 后可保留（升级排查有用）。
			*/
			let toolReportDone = false;
			/**
			* 尝试包裹一个目标。
			* @param id - 去重标识。
			* @param target - slot 名与可选 key。
			* @param make - 包装器工厂。
			* @returns 该目标是否已包裹（本次成功，或此前已成功）。
			*/
			const attempt = (id, target, make) => {
				if (done.has(id)) return true;
				const restore = wrapEntry(ctx.slots.entries(target.slot), target, make, TAG);
				if (restore === NOOP$1) return false;
				done.add(id);
				restores.push(restore);
				return true;
			};
			const sync = () => {
				attempt("flow", FLOW_TARGET, makeAutoFlow);
				attempt("assistant", ASSISTANT_TARGET, makeAutoAssistant);
				if (!toolReportDone && attempt("tool", TOOL_TARGET, makeAutoToolCallTree)) {
					toolReportDone = true;
					console.info(`${TAG} tool-call 包裹已生效（Step 0 诊断：未出现此行即表示包裹被静默降级）`);
				}
			};
			sync();
			const off = ctx.on("slots/changed", (key) => {
				if (key === FLOW_TARGET.slot || key === ASSISTANT_TARGET.slot) sync();
			});
			return () => {
				off();
				for (const restore of restores.splice(0)) restore();
				done.clear();
			};
		}
		/**
		* 挂载浏览器半边。
		*
		* 两件事：
		*  1. 包裹三个渲染组件——**核心功能**，只依赖 `slots`，永远挂载；
		*  2. 设置卡片与两个开关——**可选功能**，`locale` 与 `configForms` 就绪时
		*     才挂载。缺任意一个就让插件以默认值（全开）工作，而不是整体失效。
		*
		* 第 2 步用 `ctx.inject(deps, cb)` 而不是 `ctx.get()` 判空：`get()` 在
		* `apply` 时刻读，服务晚到就永久错过；`inject` 没有这个竞态，且子作用域
		* 随父 fiber 一起销毁，不需要手动清理。
		* @param ctx - 客户端 context，携带 slot 注册表。
		*/
		function apply(ctx) {
			const client = ctx;
			client.effect(() => installWrappers(client), "dsh-auto-expand: 包裹 flow、assistant-step 与 tool-call");
			client.inject(["locale", "configForms"], (scope) => {
				const scoped = scope;
				scoped.effect(() => scoped.locale.register(SETTINGS_NS, {
					zh,
					en
				}), "dsh-auto-expand: 字典");
				scoped.slots.inject("plugins.bundle.config", () => scoped.slots.register({
					name: "plugins.bundle.config",
					key: "dsh-auto-expand",
					locale: SETTINGS_NS
				}, SettingsCard));
				scoped.effect(() => attachSettingsForm(scoped.configForms.get(AUTO_EXPAND_NAMESPACE)), "dsh-auto-expand: 接管设置");
			});
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map