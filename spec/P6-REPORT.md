# P6 实施报告

> 阶段：P6 漂移检测与发布治理
> DSH 目标版本：`0.2.1-rc.2`
> 真机部署：**由用户执行**

---

## 1. 阶段目标

前五个阶段把行为做对了，但留下两个工程性风险：

1. **上游漂移不可见**。本插件克隆了 23 个官方源文件。DSH 升级后克隆会**静默**
   偏离——P4 的事故正是"接管了一个渲染路径却没发现它还有别的分支"。需要一条
   明确的开场动作，而不是靠人记得去 diff。
2. **发布产物没有门禁**。`files` 漏一个路径、`exports` 指向不存在的文件、
   依赖被误打包，这些在本地全都看不出来，只有用户安装后才炸。

本阶段补上这两块，顺带修掉审计过程中发现的设置写入缺陷。

---

## 2. 上游漂移检测

### 2.1 清单是唯一事实源

`scripts/upstream-manifest.mjs` 记录每个克隆文件的上游出处：

```js
{
  local: 'src/client/flow/AutoGroupSeat.tsx',
  sources: ['ui-chat:chat/ChatGroupSeat.tsx'],
  kind: 'verbatim',
}
```

`kind` 区分两种关系：

| kind | 含义 | 上游变化时该做什么 |
|---|---|---|
| `verbatim` | 整份克隆，只改了头部注释说明的地方 | 必须逐行重新对照，可能漏掉了新分支 |
| `partial` | 只摘取上游文件的一部分或重新实现 | 复核被摘取的片段，不一定需要改代码 |

多来源的情况也支持：`flow-utils.ts` 摘了 4 个上游文件，
`pending-bubbles.module.css` 摘了 2 个 CSS。

**新增克隆文件时必须在这里加一条**，否则漂移检测看不到它。

### 2.2 记录与检查

```bash
pnpm drift:record   # 生成/刷新 spec/upstream.json（人工确认对齐后执行）
pnpm drift          # 检查上游是否变了
```

`spec/upstream.json` 记录每个上游来源的内容哈希、包版本与当时的 HEAD commit。

检查脚本做四件事：

1. 逐文件比对哈希；
2. 上游文件消失（重命名/删除）单独报一类；
3. 上游包版本变化单独报一类（版本变了通常意味着必须重新克隆）；
4. 顺带检查 `package.json` 的 `peerDependencies` 范围是否仍覆盖记录的版本。

退出码：`0` 无漂移 / `1` 有漂移 / `2` 找不到上游 checkout。

### 2.3 三个实现细节

**换行必须规范化**。Windows 上 `core.autocrlf` 会把 checkout 的 LF 变成 CRLF，
直接哈希会让同一份代码在不同机器上得出不同结果：

```js
const text = readFileSync(path, 'utf8').replace(/\r\n/g, '\n')
```

**显式指定时不做回退**。`--upstream` 指向无效目录时直接以退出码 2 结束，
而不是悄悄退回默认的 `../deepseek-harness` ——否则用户会以为检测的是自己给的
checkout。

**没有 checkout 不算错误**。普通用户只装了 DSH 应用，没有源码。这时跳过
（退出码 2）而不是失败，`pnpm verify` 因此不包含 drift。

自测：把 `spec/upstream.json` 里的哈希全部改一位，`pnpm drift` 报出 29 处漂移
并以退出码 1 结束；恢复后回到 0。

---

## 3. 发布产物自检

```bash
pnpm pack:check    # 会先 build
```

`scripts/check-pack.mjs` 不调用 `npm pack`：那需要跨平台子进程（Windows 上只能
走 `shell: true`，且 Node 会对此告警），而本仓库的 `files` 规则足够简单，按规则
自己展开更快也更可控。

四项检查：

| 检查 | 防的是什么 |
|---|---|
| `files` 声明的路径全部存在 | 目录名写错，本地看不出来 |
| `exports` 每个非通配条目都落在 `files` 覆盖范围内 | **最常见的发布事故**：本地正常，用户 import 时 404 |
| `lib/index.js` 体积 < 8 kB 且含 `@deepseek-ai/schemastery` 的 import | schemastery 被文档打包（1.7 kB → 35 kB，且制造第二个 schema 实例） |
| `lib/client.js` 含 `__ModuleLoader__`、不含 React 内部标识 | 平台模块被重复打包 → 两份 React / 两份 slot 注册表 |

第二条最值得说：`files` 与 `exports` 是两套独立的声明，本地开发全部走工作区文件，
只有真正的 `npm pack` 才会暴露不一致。

首次运行就抓到一个真实问题：`exports` 里的 `lib/client.js` 与
`src/client/contract/*.d.ts` 之前没有被显式验证过，`CHANGELOG.md` 也不在 `files`
里（写进 `files` 后自检通过）。

---

## 4. 修正：客户端 bundle 的加载前置声明

`package.json` 的 `dsh.client.inject` 之前只列了 5 个包，漏了本插件实际依赖的
三个：

| 缺的包 | 为什么需要 |
|---|---|
| `@deepseek-ai/dsh-client-ui-slots` | `inject = ['slots']` 是硬依赖 |
| `@deepseek-ai/dsh-client-ui-settings` | 提供 `configForms`（两个开关的读写通道） |
| `@deepseek-ai/dsh-client-ui-plugin-manager` | 拥有 `plugins.bundle.config` 槽位（设置卡片的落脚点） |

查过消费方 `packages/client/modules/src/client/system.ts:273`：

```ts
for (const packageName of row.inject) {
  const dependency = this.graphRows.get(packageName)
  if (dependency !== undefined) await this.arriveDependency(row.id, dependency, [], visited)
}
```

**图上没有这个包时直接跳过**，所以多列不会失败；而列上了就会保证它先于本插件
加载。属于纯收益的声明。

之前能正常工作是因为这些包被别的插件或基础 bundle 顺带先加载了——依赖外部顺序
而不是自己的声明。

---

## 5. 顺手修的缺陷：设置写入的乐观更新

审计 `settings.ts` 时发现 `setAutoExpandSetting` 有三个分支缺陷：

```ts
// 修复前
const previous = settingsSource.getSnapshot()
if (previous[field] === value) return true
settingsSource.set({ ...previous, [field]: value })   // ① 先改了
const form = attached?.form
if (form === undefined) return false                  // ② 才发现没有通道
const ok = await form.set(field, value)                // ③ 抛错无人接
if (!ok) settingsSource.set(previous)
return ok
```

| # | 后果 |
|---|---|
| ① ② | 没有写入通道时，开关**视觉上切换了**、Host 从未收到写入，重启后变回去。用户无法从界面区分"生效了"和"没生效"。 |
| ③ | RPC 抛错时既没回滚也没 catch。调用方写的是 `void setAutoExpandSetting(...)`，于是变成未捕获的 promise rejection；同时本地状态停在错误的乐观值上。 |

逻辑抽到 `src/client/settings-write.ts` 的纯函数 `writeOptimistic`（与
`flow/scroll-align.ts` 同样的理由：有分支的逻辑必须可单测）：

1. 值未变 → 直接返回，不动快照、不发请求；
2. **没有写入通道 → 不改本地状态**；
3. 有通道 → 先乐观更新；
4. Host 拒绝 → 回滚；
5. **Host 抛错 → 回滚且不抛出**。

`settings.ts` 的 `setAutoExpandSetting` 变成一行委托。

`tests/settings-write.spec.mjs`（7 项）把三条规则和回滚语义固化下来。

---

## 6. 测试写法的全面修正

前五个阶段的测试都是「把逻辑复制到测试文件里再断言」。这个做法在本阶段的排查中
暴露了根本问题：

> **`AutoGroupSeat` 里滚动定位的判据写错了（`useRef` 初值导致永不触发），而测试
> 里复制的却是"正确"版本——两者都通过，bug 全程没被发现。**

改为直接 import 源码。障碍是 Node 的类型剥离不支持 TypeScript 的 parameter
properties（`constructor(private x: number)`），`use-scroll-follow.ts` 正好用了：

```
SyntaxError [ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX]: TypeScript parameter property is not supported in strip-only mode
```

解法是 `--experimental-transform-types`（Node 22.7+），已写进 `pnpm test`。

| 测试文件 | 方式 |
|---|---|
| `scroll-align.spec.mjs` | **真实 import** `flow/scroll-align.ts` |
| `process-scroll.spec.mjs` | **真实 import** `flow/use-scroll-follow.ts`（`ScrollFollow` 状态机） |
| `settings-write.spec.mjs` | **真实 import** `settings-write.ts` |
| `scroll-init.spec.mjs` | 真实 import + 固化三代判据的演进 |
| `auto-disclosure.spec.mjs` | 仍为内联实现（hook 需要 React dispatcher），已在文件头注明 |

---

## 7. 验证

```
pnpm typecheck   ✅ 0 error
pnpm build       ✅ index.js 1.72 kB / client.js 132.4 kB
pnpm test        ✅ 68 pass / 0 fail
pnpm smoke       ✅ 结构校验通过
pnpm pack:check  ✅ 发布产物自检通过（54 个文件）
pnpm drift       ✅ 无漂移：29 个上游来源全部与记录一致
```

测试分布：

| 文件 | 项数 | 覆盖 |
|---|---|---|
| `auto-disclosure` | 14 | 自动状态机 + `following` 语义 |
| `wrap` | 10 | 原地包裹的幂等与全部降级路径 |
| `reasoning-auto-open` | 12 | 思考块的"先发生者"折叠 |
| `scroll-init` | 7 | 三代判据演进 + 两代 bug 复现 |
| `scroll-align` | 9 | 当前定位判据 |
| `process-scroll` | 9 | `ScrollFollow` 状态机（真实代码） |
| `settings-write` | 7 | 乐观写入与三条回滚路径 |

---

## 8. 新增/修改的文件

| 文件 | 作用 |
|---|---|
| `scripts/upstream-manifest.mjs` | 克隆文件 ← 上游出处的清单（唯一事实源） |
| `scripts/upstream-io.mjs` | checkout 定位、规范化哈希、记录读写 |
| `scripts/record-upstream.mjs` | 生成 `spec/upstream.json` |
| `scripts/check-drift.mjs` | 漂移检查（退出码 0/1/2） |
| `scripts/check-pack.mjs` | 发布产物自检 |
| `spec/upstream.json` | 由脚本生成，记录 23 个文件 / 29 个来源 |
| `src/client/settings-write.ts` | 乐观写入与回滚（纯函数） |
| `tests/settings-write.spec.mjs` | 7 项 |
| `CHANGELOG.md` | 首个功能完整版本的变更记录 |

---

## 9. 已知限制与后续

- **漂移检测依赖源码 checkout**。只有 npm 包时只能比对包版本，比对不了文件内容。
  如果以后 DSH 发布包含 `src/`，可以把 `.d.ts`/源码哈希也纳入。
- **`partial` 类条目的变化只报"需人工复核"**，无法自动判断摘取的那几行是否受影响。
- **没有 CI**。`pnpm verify:full`（含 drift）适合本地跑，但 drift 在没有 checkout
  的机器上退出码是 2，接入 CI 时要按 2 = 跳过处理。
- **折叠时机仍不可配置**，工具行自动展开仍未实现（见 `spec/P4-ROLLBACK.md`）。
