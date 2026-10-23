# 文档索引

## 设计与规划

| 文档 | 内容 | 读者 |
|---|---|---|
| [CAPABILITY-MATRIX.md](CAPABILITY-MATRIX.md) | **能力矩阵**：展开/收起/高度/动画的完整维度表、接管点矩阵、信号可得性矩阵、待决策项 | 拿到任何「展开/收起」类需求时**先读这个** |
| [P8-PLAN.md](P8-PLAN.md) | **收起时机实施计划**（✅ **已实施**，2026-10-23）：四个统一时机、两个坐标（`step` 批次 / `anchorSeq` 操作）的证据、五行设置卡片、分步与验收 | 想改收起时机或加新时机时 |
| [P7-PLAN.md](P7-PLAN.md) | **工具行自动展开实施计划**（✅ **已实施**，2026-10-23）：为什么不用克隆、autoOpen 判据、Step 0 前置验证、风险清单 | 想了解工具结果自动展开是怎么做的 |
| [DESIGN.md](DESIGN.md) | 需求规格（11 条）、现有机制分析、4 条硬约束与源码证据、状态机、文件清单、风险评估 | 想了解"为什么这样设计" |
| [PLAN.md](PLAN.md) | 6 个阶段的规划、任务分解、验收标准、工程规范、风险治理、后续演进 | 想了解"项目怎么推进" |
| [ARCHITECTURE.md](ARCHITECTURE.md) | 面向实现的架构规格：组件树、数据流、接口契约、关键算法、实现顺序 | 要动手写代码时 |
| [SETTINGS-SPEC.md](SETTINGS-SPEC.md) | 插件详情页设置卡片的规范（槽位、间距、字体、控件、注册写法），摘自 dsh-project-groups 的实测 | 改设置页时 |
| [SETTINGS-EXTENSION.md](SETTINGS-EXTENSION.md) | 「完整展示当前轮」「历史轮次最大高度」的设计（**暂缓**）＋ **第 10 节**：思考/工具行的展开与收起时机、新增设置项草案 | 重提这两类需求时先读第 1 节 |
| [MOTION-PLAN.md](MOTION-PLAN.md) | 折叠动画方案（**未实施**）：官方 flow-motion 的闸门为何默认不生效、三层滚动的真实差异、自建最小动画的接入点与坑。**第 8 节**是 2026-10-23 关于自建整套动画与外层滚动的讨论 | 处理抖动问题时 |

## 暂缓 / 已否决

以下都是**没有实施**的方案，留着是为了避免重复踩坑：

> **工具行自动展开已实施**（P7，2026-10-23），已移出本表，见 [P7-PLAN.md](P7-PLAN.md)。

| 主题 | 结论 | 原因 |
|---|---|---|
| 折叠动画（`MOTION-PLAN.md`） | group body 用官方设置打开；思考块与「窗口外折叠」待做；内容增长滚动不可行 | 官方机制只在"运行中"窗口内生效 |
| 设置扩展（`SETTINGS-EXTENSION.md`） | 设计完成，用户决定暂缓 | 需要时按第 9 节恢复 |
| 思考块高度上限 | **否决** | 官方设计就是随对话流滚动，加限高会形成三层嵌套滚动 |
| `capped` 翻转修正 | **已还原为官方写法** | 那是官方 bug，插件层长期偏离会抬高升级成本 |
| 内层滚动搬到外层 | **否决** | 与「还原官方 `capped`」冲突，且外层 `followTail` 是 instant 硬写 |
| 自建整套动画 | 设计已明确，**未实施** | 与工具行展开共用同一注入体系，需先真机验证 |
| 收起时机四选一 | ✅ **已实施**（P8） | 思考与工具共用同一套四个时机：本条完成 / 下一条操作 / 下一批操作 / 随操作组。两者都由操作组提供同样的两个坐标（`step` 批次 / `anchorSeq` 操作），四个时机的语义在两边逐字一致 |
| 工具行按工具细分 | **暂缓** | 用户已预埋为未来功能（`CAPABILITY-MATRIX.md` A4） |

## 阶段报告

| 文档 | 内容 |
|---|---|
| [P1-REPORT.md](P1-REPORT.md) | 插件骨架与原地包裹机制 |
| [P2-REPORT.md](P2-REPORT.md) | group body 自动展开与一次性折叠 |
| [P3-REPORT.md](P3-REPORT.md) | 思考块自动展开与"先发生者"折叠 |
| [P4-ROLLBACK.md](P4-ROLLBACK.md) | 工具行自动展开**为何回滚**（必须读的负面案例）。**第 9 节是 2026-10-23 的重新评估：原 §7.3 的三条约束已作废。** |
| [P5-REPORT.md](P5-REPORT.md) | 插件详情页的两个开关 |
| [P6-REPORT.md](P6-REPORT.md) | 上游漂移检测、发布产物自检、设置写入缺陷修正 |

## 缺陷记录

| 文档 | 内容 |
|---|---|
| [FIX-SCROLL.md](FIX-SCROLL.md) | 滚动问题的两次修复：① 已完成 group 手动展开被强行滚到底部；② body 自动滚动偶发失效。**第 9 节是三层根因分析，第 13 节是教训。** |

## 机器可读

| 文件 | 内容 |
|---|---|
| [upstream.json](upstream.json) | 每个克隆文件的上游出处与内容哈希，由 `pnpm drift:record` 生成 |
| `scripts/upstream-manifest.mjs` | 克隆清单的唯一事实源（新增克隆必须在这里登记） |

## 阅读顺序

### 想了解它做什么

1. 仓库根的 `README.md` → 行为表格
2. [DESIGN.md](DESIGN.md) 第 1-2 节 → 需求与现状

### 想理解为什么不能走捷径

1. [DESIGN.md](DESIGN.md) 第 4 节 → 4 条硬约束与源码证据
2. [P4-ROLLBACK.md](P4-ROLLBACK.md) → 一次代价明确的失败

### 要动手改代码

1. [ARCHITECTURE.md](ARCHITECTURE.md) → 组件树与数据流
2. `scripts/upstream-manifest.mjs` → 哪些文件是克隆的
3. 改完跑 `pnpm verify && pnpm pack:check`；动过克隆就再跑 `pnpm drift`

### 处理滚动 / 抖动问题

1. [FIX-SCROLL.md](FIX-SCROLL.md) 第 13 节 → **先读三条教训**（"scrollTop 变了"不等于"读者滚了"、一次性补丁要验证真的执行了、异步消费的意图必须有兑现路径）
2. [MOTION-PLAN.md](MOTION-PLAN.md) → 动画的闸门在哪里、为什么默认不生效
3. 这两处最容易重蹈 P4 的覆辙：接管一条有完整状态机的路径却没枚举它的分支

### 要加新的「展开 / 收起 / 高度 / 动画」能力

1. [CAPABILITY-MATRIX.md](CAPABILITY-MATRIX.md) → **先定位是哪一格**（A/B/C/D/E 组），再决定动手；不在表内先补行
2. 工具行相关 → [P4-ROLLBACK.md](P4-ROLLBACK.md) **第 9 节**（包裹而非替换）+ `CAPABILITY-MATRIX.md` §5
3. 动画 / 滚动相关 → [MOTION-PLAN.md](MOTION-PLAN.md) **第 8 节**（自建动画的三个必需件、外层滚动再次被否决）
4. 思考 / 工具行的时机与设置 → [SETTINGS-EXTENSION.md](SETTINGS-EXTENSION.md) 第 10 节
5. 动手前读 [CAPABILITY-MATRIX.md](CAPABILITY-MATRIX.md) §3 的**信号可得性矩阵**——标 🔍 的都还没真机验证

### 要加新的设置项

1. [SETTINGS-EXTENSION.md](SETTINGS-EXTENSION.md) **第 1 节** → `closed` / `deferCompletedTurns` / `grouped` 各管什么（这三个在讨论中被搞混过三次）
2. [SETTINGS-SPEC.md](SETTINGS-SPEC.md) → 卡片结构、间距、字体、门控写法
3. [ARCHITECTURE.md](ARCHITECTURE.md) 4.6 / 4.7 → 两个开关当前的耦合关系

### 升级 DSH 之后

1. 更新 checkout 到目标版本
2. `pnpm drift` → 看哪些克隆已偏离
3. 逐个重新对照 → 更新文档里的版本号与 commit
4. `pnpm drift:record` → 刷新哈希

## 维护规则

- 实现过程中发现设计与实际不符，**先改文档再改代码**
- 新增「展开 / 收起」类需求，**先在 `CAPABILITY-MATRIX.md` 定位并补行**，再谈实现
- 推翻旧文档的结论时，**不要删除旧结论**——在原处留指引，并说明为何推翻（见 `P4-ROLLBACK.md` 第 9 节的做法）
- 每个阶段结束更新 PLAN.md 的阶段状态表
- 上游升级后更新本索引、各克隆文件头部的版本/commit，以及 `spec/upstream.json`
