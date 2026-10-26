/**
 * 上游克隆清单 —— 漂移检测的唯一事实源。
 *
 * 本插件用「整份克隆官方组件 + 原地替换 component」的方式接管渲染，因此
 * 上游一旦改动，克隆就会**静默**偏离。这份清单把每个克隆文件指回它的上游
 * 出处，配合 `record-upstream.mjs` / `check-drift.mjs` 使用：
 *
 *   pnpm drift           # 检查上游是否变了（DSH 升级后第一件事）
 *   pnpm drift:record    # 人工确认克隆已对齐后，刷新记录
 *
 * ## kind 的含义
 *
 * - `verbatim`：整份克隆，只改了头部注释说明的地方。上游变化 = 必须逐行重新
 *   对照（可能漏掉了新分支，这正是 P4 事故的成因）。
 * - `partial`：只摘取上游文件的一部分，或重新实现其中最少的逻辑。上游变化 =
 *   需人工复核被摘取的片段，不必然需要改代码。
 *
 * 新增克隆文件时**必须**在这里加一条，否则漂移检测看不到它。
 */

/** 上游包与其源码根（相对 checkout 根目录）。 */
export const PACKAGES = {
  '@deepseek-ai/dsh-client-ui-chat': {
    version: '0.2.1-rc.3',
    sourceRoot: 'packages/client/ui-chat/src/client',
  },
  '@deepseek-ai/dsh-client-ui-conversation': {
    version: '0.2.1-rc.3',
    sourceRoot: 'packages/client/ui-conversation/src/client',
  },
}

/** 记录的上游 commit（= 克隆时对照的 checkout HEAD）。 */
export const UPSTREAM_COMMIT = '1f81c047fc'

/**
 * 每个克隆文件的上游出处。
 *
 * `sources` 用 `<包短名>:<源码根内相对路径>` 表示；同一个本地文件可能有多个
 * 上游来源（摘取多处拼成）。
 */
export const ENTRIES = [
  // ── assistant 层（P3：思考块）────────────────────────────────────────
  {
    local: 'src/client/assistant/AutoAssistantMarkdown.tsx',
    sources: ['ui-chat:chat/AssistantMarkdown.tsx'],
    kind: 'verbatim',
  },
  {
    local: 'src/client/assistant/AutoAssistantMarkdown.module.css',
    sources: ['ui-chat:chat/AssistantMarkdown.module.css'],
    kind: 'verbatim',
  },
  {
    local: 'src/client/assistant/AutoAssistantNodeView.tsx',
    sources: ['ui-chat:chat/AssistantNodeView.tsx'],
    kind: 'verbatim',
  },
  {
    local: 'src/client/assistant/AutoReasoningRow.tsx',
    sources: ['ui-chat:chat/ReasoningRow.tsx'],
    kind: 'verbatim',
  },
  {
    local: 'src/client/assistant/AutoReasoningRow.module.css',
    sources: ['ui-chat:chat/ReasoningRow.module.css'],
    kind: 'verbatim',
  },
  {
    local: 'src/client/assistant/markdown-labels.ts',
    sources: ['ui-chat:markdown-labels.ts'],
    kind: 'verbatim',
  },

  // ── flow 层（P2：group body）────────────────────────────────────────
  {
    local: 'src/client/flow/AutoFlow.tsx',
    sources: ['ui-chat:chat/ChatFlow.tsx'],
    kind: 'verbatim',
  },
  {
    local: 'src/client/flow/AutoGroupSeat.tsx',
    sources: ['ui-chat:chat/ChatGroupSeat.tsx'],
    kind: 'verbatim',
  },
  {
    local: 'src/client/flow/AutoGroupSeat.module.css',
    sources: ['ui-chat:chat/ChatGroupSeat.module.css'],
    kind: 'verbatim',
  },
  {
    local: 'src/client/flow/AutoNodeSeat.tsx',
    sources: ['ui-chat:chat/ChatNodeSeat.tsx'],
    kind: 'verbatim',
  },
  {
    local: 'src/client/flow/accessibility.module.css',
    sources: ['ui-chat:chat/accessibility.module.css'],
    kind: 'verbatim',
  },
  {
    local: 'src/client/flow/use-process-scroll.ts',
    sources: ['ui-chat:chat/use-process-scroll.ts'],
    kind: 'verbatim',
  },
  {
    local: 'src/client/flow/use-scroll-follow.ts',
    sources: ['ui-chat:chat/use-scroll-follow.ts'],
    kind: 'verbatim',
  },
  {
    local: 'src/client/flow/use-calendar-day.ts',
    sources: ['ui-chat:chat/use-calendar-day.ts'],
    kind: 'verbatim',
  },

  // ── 消息外壳 ────────────────────────────────────────────────────────
  {
    local: 'src/client/flow/message-chrome.ts',
    sources: ['ui-chat:chat/message-chrome.ts'],
    // 未克隆 `formatTokensPerSecond`（全仓无引用）；`formatRunDuration` 与
    // `LIVE_RUN_CLOCK_INTERVAL_MS` 挪到了 flow-utils。
    kind: 'partial',
  },
  {
    local: 'src/client/flow/RunningStatus.tsx',
    sources: ['ui-chat:chat/RunningStatus.tsx'],
    kind: 'verbatim',
  },
  {
    local: 'src/client/flow/RunningWhaleTail.tsx',
    sources: ['ui-chat:chat/RunningWhaleTail.tsx'],
    kind: 'verbatim',
  },
  {
    local: 'src/client/flow/PendingIconActions.tsx',
    sources: ['ui-chat:chat/MessageIconActions.tsx'],
    // 裁掉了 branch / `[data-unavailable]` / extraActions / usageAction。
    // pending 气泡只传 `clock="start"`（MessageItem.tsx:234/287），
    // 因此这些分支在本插件这条路径上不可达——但上游新增分支时要复核。
    kind: 'partial',
  },

  // ── 部分摘取 / 重实现 ───────────────────────────────────────────────
  {
    local: 'src/client/flow/pending-bubbles.tsx',
    sources: ['ui-chat:chat/MessageItem.tsx'],
    kind: 'partial',
  },
  {
    local: 'src/client/flow/pending-bubbles.module.css',
    sources: ['ui-chat:chat/MessageItem.module.css', 'ui-chat:chat/MessageIconActions.module.css'],
    kind: 'partial',
  },
  {
    local: 'src/client/flow/chat-flow.module.css',
    sources: ['ui-chat:chat/ChatView.module.css'],
    kind: 'partial',
  },
  {
    local: 'src/client/flow/flow-utils.ts',
    sources: [
      'ui-chat:chat/render-entry.ts',
      'ui-chat:chat/flow-motion.ts',
      'ui-chat:chat/step-process.ts',
      'ui-chat:chat/message-chrome.ts',
    ],
    kind: 'partial',
  },
  {
    local: 'src/client/contract/chat-contract.ts',
    sources: [
      'ui-chat:contract/group-tree.ts',
      'ui-chat:contract/turn-process.ts',
      'ui-chat:stores.ts',
    ],
    kind: 'partial',
  },
]

/** 包名 → 短名（清单里用短名书写）。 */
export const PACKAGE_ALIASES = {
  'ui-chat': '@deepseek-ai/dsh-client-ui-chat',
  'ui-conversation': '@deepseek-ai/dsh-client-ui-conversation',
}

/**
 * 把清单里的 `sources` 条目解析成绝对路径。
 * @param source - `<短名>:<相对路径>`。
 * @param checkoutRoot - 上游 checkout 根目录。
 * @returns 上游文件的绝对路径与包名。
 */
export function resolveSource(source, checkoutRoot) {
  const separator = source.indexOf(':')
  if (separator === -1) throw new Error(`来源格式错误（应为 <包短名>:<路径>）：${source}`)
  const alias = source.slice(0, separator)
  const relative = source.slice(separator + 1)
  const pkg = PACKAGE_ALIASES[alias]
  if (pkg === undefined) throw new Error(`未知的包短名：${alias}`)
  const root = PACKAGES[pkg].sourceRoot
  return { pkg, path: `${checkoutRoot}/${root}/${relative}` }
}
