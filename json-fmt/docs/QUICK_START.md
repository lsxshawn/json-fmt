# JSON Pro 快速上手指南

> 生成时间：2026-05-12 14:06
> 用途：新环境快速理解项目上下文
> 必读顺序：本文档 → 06-PROJECT_STATUS.md → 07-CURRENT_TASK.md

---

## 项目一句话

JSON Pro = 大文件 JSON 安全可视化工具，核心卖点 100MB+ 文件秒开、纯本地处理、零上传。

---

## 当前进度（2026-05-12）

### 已完成 ✅
| 功能 | 状态 |
|------|------|
| 大文件秒开（50MB/233万行） | ✅ |
| 流式索引 O(n) 扫描 | ✅ |
| 虚拟滚动 + 骨架屏 | ✅ |
| 行号同步 | ✅ |

### 进行中 🔄
| 功能 | 问题 | 状态 |
|------|------|------|
| 微速滚动稳定性 | 缓速滚动界面晃动，8轮修复未解决 | 🔄 |
| 搜索功能 | 已实现，跳转居中待修复 | 🔄 |

### 待办 📋
| 优先级 | 功能 |
|--------|------|
| P1 | 微速滚动晃动修复 |
| P2 | 搜索跳转居中 |
| P3 | 浅色风格统一 |
| P4 | 100MB 文件验证 |

---

## 技术栈

- Vue3 + 纯前端零上传
- StreamingValidator：单次 O(n) 扫描，不 JSON.parse
- MemoryIndex：TypedArray 内存映射
- VirtualScroller：固定总高度，只渲染可见行
- 骨架屏：RAF 状态机驱动，零 setTimeout

---

## 核心约束（不可违背）

1. **零 setTimeout**：所有定时逻辑用 RAF + 时间戳差
2. **不 JSON.parse 大文件**：用流式扫描 + TypedArray 索引
3. **内存 < 130MB**：50MB 文件内存红线
4. **纯前端零上传**：可选 IndexedDB，需授权

---

## 文档导航

| 文档 | 内容 | 读取时机 |
|------|------|---------|
| 00-ARCHITECTURE.md | 核心架构约束 | 架构变更时 |
| 01-PERFORMANCE_BUDGET.md | 内存/时间红线 | 目标变更时 |
| 02-STYLE_GUIDE.md | 浅色扁平 Web 风格 | 风格变更时 |
| 03-IMPLEMENTATION.md | 算法伪代码 | 算法变更时 |
| 04-DECISION_LOG.md | 历史决策 | 每次决策后 |
| 05-GUIDELINE.md | Trae 行为约束 | 规范变更时 |
| 06-PROJECT_STATUS.md | 进度看板 | **每次任务前必读** |
| 07-CURRENT_TASK.md | 当前任务 | **每次任务前必读** |
| archive/ | 历史归档 | 了解历史时 |
| prompts/ | 可复用模板 | 需要时 |

---

## 当前任务详情

见 docs/07-CURRENT_TASK.md

---

## 关键决策记录

- 砍掉 minimap（非核心卖点，消耗大量调试时间）
- 不 JSON.parse 大文件（内存爆炸）
- 浅色风格参考 Notion/Figma/Linear
- 骨架屏用 RAF 替代 setTimeout
- 滚轮滚动无论如何不显示骨架屏
- 搜索功能底部抽屉设计

---

## 归档规范

每天工作结束时，用户会说"把今天的内容同步到文档并归档"
→ 读取 07-CURRENT_TASK.md → 创建 archive/YYYY-MM-DD.md → 更新 06-PROJECT_STATUS.md → 清空 07-CURRENT_TASK.md → 删除 temp/ 临时文件

---

*本文档为快速入口，详细内容见各分文档。*
