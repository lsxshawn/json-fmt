# JSON Pro 文档导航

> **AI 必读第一文件** — 了解项目全貌、文档结构、归档规范

## 文档地图（按优先级排序）

| 优先级 | 文件 | 职责 | 读取时机 |
|:---|:---|:---|:---|
| P0 | [00-ARCHITECTURE.md](./00-ARCHITECTURE.md) | 架构约束（极少变更） | 任何架构相关修改前 |
| P1 | [01-PERFORMANCE_BUDGET.md](./01-PERFORMANCE_BUDGET.md) | 性能红线 | 性能相关修改前 |
| P2 | [02-STYLE_GUIDE.md](./02-STYLE_GUIDE.md) | 视觉风格 | UI/样式修改前 |
| P3 | [03-IMPLEMENTATION.md](./03-IMPLEMENTATION.md) | 算法实现 | 算法变更时 |
| P4 | [04-DECISION_LOG.md](./04-DECISION_LOG.md) | 历史决策 | 需要了解为什么这么做时 |
| P5 | [05-GUIDELINE.md](./05-GUIDELINE.md) | Trae 行为约束 | 每次任务前 |
| — | [06-PROJECT_STATUS.md](./06-PROJECT_STATUS.md) | 项目进度看板 | 每次任务前 |
| — | [07-CURRENT_TASK.md](./07-CURRENT_TASK.md) | 当前进行中的任务 | 每次任务前 |

## 子目录

| 目录 | 用途 |
|:---|:---|
| [prompts/](./prompts/) | 可复用 Prompt 模板（长期保留） |
| [archive/](./archive/) | 每日工作归档（按日期分文件） |
| [temp/](./temp/) | 临时执行文件（Kimi 生成，Trae 执行后删除/归档） |

---

## 归档规范（AI 必须遵守）

### 何时归档

每天工作结束时，用户说："把今天的内容同步到文档并归档"
→ AI 执行以下操作：

### 归档操作流程

```
1. 读取 07-CURRENT_TASK.md
2. 提取今天的所有修改记录、验证结果、未解决问题
3. 创建 archive/YYYY-MM-DD.md（如 archive/2026-05-10.md）
4. 按格式写入归档文件
5. 更新 06-PROJECT_STATUS.md（标记已完成/新增待办）
6. 清空 07-CURRENT_TASK.md（保留模板，填入新任务或留空）
7. 删除 temp/ 下本次执行的临时文件（或移入 archive）
```

### 归档文件格式

```markdown
# 2026-05-10 工作记录

## 今日目标
[从 07-CURRENT_TASK.md 提取]

## 完成事项
| 任务 | 状态 | 关键修改 | 验证结果 |
|------|------|---------|---------|
| ... | ✅/❌/🔄 | ... | ... |

## 未解决问题
- [ ] 问题1（带入明天）

## 新增待办
- [ ] 新发现的任务

## 决策记录
- 决策1（如有）
```

### 历史归档阅读

AI 需要了解项目历史时，按日期倒序阅读 archive/ 文件：
- 最近3天：详细阅读
- 3-7天：快速浏览标题和决策
- 7天前：只读 04-DECISION_LOG.md 即可

---

## temp/ 临时文件目录规范

### 用途

- Kimi 生成 Prompt/执行文档，用户复制到 temp/ 目录
- Trae Builder 读取 temp/ 下的文件执行具体任务
- 任务完成后，AI 可选择删除或移入 archive/

### 命名规范

```
temp/
├── exec-{任务名}-{日期}.md       ← 执行文档
├── prompt-{任务名}-{版本}.md    ← Prompt 模板
└── analysis-{任务名}-{日期}.md  ← 根因分析报告
```

### 生命周期

1. **生成**：Kimi 生成 → 用户放入 temp/
2. **执行**：Trae 读取 temp/ 下文件 → 执行任务
3. **完成**：
   - 有价值的分析/方案 → 移入 prompts/ 或 archive/
   - 一次性执行文件 → 删除
   - 用户决定保留与否
