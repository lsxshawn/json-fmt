# JSON Pro docs 目录分层策略

## 目录结构

```
docs/
├── README.md                    ← 入口导航 + 归档规范（AI必读第一文件）
├── 00-ARCHITECTURE.md           ← P0 架构约束（极少变更）
├── 01-PERFORMANCE_BUDGET.md   ← P1 性能红线（目标变更时更新）
├── 02-STYLE_GUIDE.md          ← P2 视觉风格（风格变更时更新）
├── 03-IMPLEMENTATION.md       ← P3 算法实现（算法变更时更新）
├── 04-DECISION_LOG.md         ← P4 历史决策（每次决策后追加）
├── 05-GUIDELINE.md            ← P5 Trae行为约束（规范变更时更新）
├── 06-PROJECT_STATUS.md       ← 项目进度看板（每次任务后更新）
├── 07-CURRENT_TASK.md         ← 当前进行中的任务（实时更新）
├── archive/                     ← 任务归档目录（按日期分文件）
│   ├── 2026-05-09.md
│   ├── 2026-05-10.md
│   └── ...
├── prompts/                     ← 可复用Prompt模板（长期保留）
│   ├── skeleton-screen-v1.md
│   ├── skeleton-screen-v2.md
│   └── ...
└── temp/                        ← 临时执行文件（给Kimi生成，Trae执行后删除或归档）
    ├── exec-skeleton-fix.md     ← 本次执行：骨架屏修复
    └── ...
```

## 各文档职责

| 文件 | 性质 | 谁更新 | 更新时机 | AI读取顺序 |
|------|------|--------|---------|------------|
| README.md | 导航地图+归档规范 | AI/用户 | 架构变更时 | **第1** |
| 00-ARCHITECTURE.md | P0架构约束 | 用户 | 架构变更时 | 第2 |
| 01-PERFORMANCE_BUDGET.md | P1性能红线 | 用户 | 目标变更时 | 第3 |
| 02-STYLE_GUIDE.md | P2视觉风格 | 用户 | 风格变更时 | 第4 |
| 03-IMPLEMENTATION.md | P3算法实现 | AI/用户 | 算法变更时 | 第5 |
| 04-DECISION_LOG.md | P4历史决策 | AI | 每次决策后追加 | 第6 |
| 05-GUIDELINE.md | P5行为约束 | 用户 | 规范变更时 | 第7 |
| 06-PROJECT_STATUS.md | 进度看板 | **AI** | **每次任务后** | 第8 |
| 07-CURRENT_TASK.md | 当前任务 | **AI** | **实时** | 第9 |
| archive/ | 历史归档 | **AI** | **每天结束时** | 按需 |
| prompts/ | Prompt模板 | 用户/AI | 新增时 | 按需 |
| temp/ | 临时执行文件 | **Kimi生成** | **每次任务前** | 执行后删除 |

## 归档规范（AI必须遵守）

### 何时归档
每天工作结束时，用户说："把今天的内容同步到文档并归档"
→ AI执行以下操作：

### 归档操作流程
```
1. 读取 07-CURRENT_TASK.md
2. 提取今天的所有修改记录、验证结果、未解决问题
3. 创建 archive/YYYY-MM-DD.md（如 archive/2026-05-10.md）
4. 按格式写入归档文件
5. 更新 06-PROJECT_STATUS.md（标记已完成/新增待办）
6. 清空 07-CURRENT_TASK.md（保留模板，填入新任务或留空）
7. 删除 temp/ 下本次执行的临时文件（或移入archive）
```

### 归档文件格式
```markdown
# 2026-05-10 工作记录

## 今日目标
[从 07-CURRENT_TASK.md 提取]

## 完成事项
| 任务 | 状态 | 关键修改 | 验证结果 |
|------|------|---------|---------|
| 骨架屏第2轮修复 | ✅/❌/🔄 | 修改了 Xxx.vue | 通过/未通过 |

## 未解决问题
- [ ] 问题1（带入明天）

## 新增待办
- [ ] 新发现的任务

## 决策记录
- 决策1（如有）
```

### 历史归档阅读
AI需要了解项目历史时，按日期倒序阅读archive/文件：
- 最近3天：详细阅读
- 3-7天：快速浏览标题和决策
- 7天前：只读 04-DECISION_LOG.md 即可

## temp/ 临时文件目录规范

### 用途
- Kimi生成Prompt/执行文档，用户复制到temp/目录
- Trae Builder读取temp/下的文件执行具体任务
- 任务完成后，AI可选择删除或移入archive/

### 命名规范
```
temp/
├── exec-{任务名}-{日期}.md       ← 执行文档（如 exec-skeleton-fix-0510.md）
├── prompt-{任务名}-{版本}.md    ← Prompt模板（如 prompt-search-v1.md）
└── analysis-{任务名}-{日期}.md  ← 根因分析报告（如 analysis-skeleton-0510.md）
```

### 生命周期
1. **生成**：Kimi生成 → 用户放入temp/
2. **执行**：Trae读取temp/下文件 → 执行任务
3. **完成**：
   - 有价值的分析/方案 → 移入 prompts/ 或 archive/
   - 一次性执行文件 → 删除
   - 用户决定保留与否

### temp/ 文件内容模板
```markdown
# 执行任务：骨架屏机制深度修复

> 生成时间：2026-05-10 19:10
> 生成者：Kimi
> 执行者：Trae Builder (DeepSeek-V4-Pro)
> 关联文档：docs/07-CURRENT_TASK.md, docs/prompts/skeleton-screen-v2.md

## 执行目标
[具体任务描述]

## 约束条件
1. 零setTimeout
2. 强制DEBUG日志
3. ...

## 执行步骤
1. [步骤1]
2. [步骤2]
3. ...

## 验证标准
- [ ] 标准1
- [ ] 标准2

## 输出要求
[修复报告/变更摘要/回归风险清单]
```

## 给Trae的Prompt（执行docs重构）

```
请重构项目docs/目录，按以下要求执行：

【目录结构】
docs/
├── README.md
├── 00-ARCHITECTURE.md           ← 现有ARCHITECTURE.md重命名
├── 01-PERFORMANCE_BUDGET.md   ← 现有PERFORMANCE_BUDGET.md重命名
├── 02-STYLE_GUIDE.md          ← 现有STYLE_GUIDE.md重命名
├── 03-IMPLEMENTATION.md       ← 现有IMPLEMENTATION.md重命名
├── 04-DECISION_LOG.md         ← 现有DECISION_LOG.md重命名
├── 05-GUIDELINE.md            ← 现有GUIDELINE.md重命名
├── 06-PROJECT_STATUS.md       ← 新建，从当前上下文提取进度
├── 07-CURRENT_TASK.md         ← 新建，填入当前骨架屏修复任务
├── archive/                     ← 新建目录
│   └── .gitkeep
├── prompts/                     ← 新建目录，移入现有临时Prompt
│   └── skeleton-screen-v2.md
└── temp/                        ← 新建目录（空，给Kimi生成临时执行文件）
    └── .gitkeep

【内容要求】
1. README.md必须包含"归档规范"和"temp/目录规范"章节
2. 06-PROJECT_STATUS.md必须包含：已完成、进行中、待办、已知问题
3. 07-CURRENT_TASK.md必须包含：任务目标、根因分析（待填）、修改计划（待填）、修改记录（实时）、验证清单
4. 所有现有文档内容保留，只调整文件名和格式

【约束】
- 不修改任何业务代码
- 保留现有文档的核心内容
- 输出变更摘要（每个文件的新旧路径）
```
