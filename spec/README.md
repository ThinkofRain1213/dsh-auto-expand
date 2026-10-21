# 文档索引

## 设计与规划

| 文档 | 内容 | 读者 |
|---|---|---|
| [DESIGN.md](DESIGN.md) | 需求规格（11 条）、现有机制分析、4 条硬约束与源码证据、状态机、文件清单、风险评估 | 想了解"为什么这样设计" |
| [PLAN.md](PLAN.md) | 6 个阶段的规划、任务分解、验收标准、工程规范、风险治理、后续演进 | 想了解"项目怎么推进" |
| [ARCHITECTURE.md](ARCHITECTURE.md) | 面向实现的架构规格：组件树、数据流、接口契约、关键算法、实现顺序 | 要动手写代码时 |
| [SETTINGS-SPEC.md](SETTINGS-SPEC.md) | 插件详情页设置卡片的规范（槽位、间距、字体、控件、注册写法），摘自 dsh-project-groups 的实测 | 改设置页时 |

## 阶段报告

| 文档 | 内容 |
|---|---|
| [P1-REPORT.md](P1-REPORT.md) | 插件骨架与原地包裹机制 |
| [P2-REPORT.md](P2-REPORT.md) | group body 自动展开与一次性折叠 |
| [P3-REPORT.md](P3-REPORT.md) | 思考块自动展开与"先发生者"折叠 |
| [P4-ROLLBACK.md](P4-ROLLBACK.md) | 工具行自动展开**为何回滚**（必须读的负面案例） |
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

### 升级 DSH 之后

1. 更新 checkout 到目标版本
2. `pnpm drift` → 看哪些克隆已偏离
3. 逐个重新对照 → 更新文档里的版本号与 commit
4. `pnpm drift:record` → 刷新哈希

## 维护规则

- 实现过程中发现设计与实际不符，**先改文档再改代码**
- 每个阶段结束更新 PLAN.md 的阶段状态表
- 上游升级后更新本索引、各克隆文件头部的版本/commit，以及 `spec/upstream.json`
