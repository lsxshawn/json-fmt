# 项目进度看板

> 每次任务后更新 | 最后更新：2026-05-12

## 已完成

| 任务 | 完成日期 | 关键产出 |
|:---|:---|:---|
| 大文件虚拟滚动（单滚动条方案） | 0510 | `JsonTreeView.vue` 虚拟滚动 |
| 滚动到底百分比修复 | 0510 | `emit('scrollData')` + `StatusBar.vue` 百分比公式 |
| 行号与状态栏同步修复 | 0510 | scrollTop / ITEM_HEIGHT 单一真相源 |
| BlockCacheManager setTimeout 清理 | 0510 | 全部改为同步 `_loadBlockSync` |
| 浏览器 DOM 高度上限修复（scaleFactor 缩放） | 0510 | 233万行文件可滚动到100% |
| 骨架屏 P0 状态机实现 | 0510 | RAF 驱动 + 5态状态机 + shimmer 动画 |
| visibleItems 全局→局部索引转换 | 0510 | `startIndex - visibleNodes[0].id` 偏移 |
| 骨架屏 V2 深度修复（快速滚动+空白+兜底） | 0510 | 4处修改 |
| 骨架屏 V3 性能优化（lastRenderedLine解耦） | 0510 | 同帧跳过渲染，状态机始终运行 |
| 微速滚动晃动修复（JS层） | 0510 | displayScrollTopRef + BlockCacheManager needsUpdate守卫 |
| 滚轮骨架屏误触发修复 | 0510 | lastWheelTime时间戳 + double guard (!isDrag) |
| 搜索功能重构 | 0510 | 删除旧代码 → Web Worker + 底部抽屉面板 |
| 搜索 UI 修复（4轮） | 0510 | 跳转居中/高亮/面板跟随/导航/位置修正 |
| docs 目录重构 | 0510 | 数字前缀分层 + README + archive/prompts/temp |
| 微速滚动晃动终极修复（CSS层根因） | 0512 | `overflow-anchor:none` + `contain:layout style` |
| 滚动残留波动修复（offsetY同源） | 0512 | offsetY/skeletonTopLine统一用localScrollTop |
| handleNeedNodes 多层守卫优化 | 0512 | watcher单值监听 + isRangeLoaded早退 + visibleToFlatRange |
| 虚拟展开折叠 — 僵尸代码清理 | 0512 | 删除 196 行死代码（6个函数+3个空case+parsedTree） |
| 虚拟展开折叠 — BlockCacheManager核心 | 0512 | collapsedNodes/parentMap/childrenMap + 9个新方法 |
| 虚拟展开折叠 — UI事件流连接 | 0512 | toggleNode/expandAll/collapseAll从Worker改调BlockCacheManager |
| 搜索跳转 — block预加载 + visibleIndex转换 | 0512 | prepareJumpToVisible + handleSearchJump |
| 折叠稳定性（4轮）— 回到首行/空白/锚点/坐标 | 0512 | watch守卫 + flatVisibleRange + 坐标空间统一 |

## 进行中

| 任务 | 状态 | 阻塞点 |
|:---|:---|:---|
| 折叠稳定性综合验证 | 🟡 待实测 | 需用户验证多节点折叠/展开 + 快速滚动组合场景 |
| 搜索跳转居中验证 | 🟡 待实测 | 需用户验证 prepareJumpToVisible + flatVisibleRange 端到端 |

## 待办

| 优先级 | 任务 | 说明 |
|:---|:---|:---|
| P1 | setScrollTopToLine 清理评估 | 函数保留但折叠不再使用，评估是否移除 defineExpose |
| P1 | 骨架屏行号覆盖 4K 大屏 | 动态 `SKELETON_POOL_SIZE` 验证 |
| P1 | 搜索 Worker 大文件性能 | 50MB flatNodesCache 序列化到 Worker 耗时 |
| P2 | expandAll/collapseAll 实测 | 边界场景（超大文件全展开、全折叠） |
| P2 | CommandPalette 命令面板 | 快捷键操作入口 |

## 已知问题

| 问题 | 严重性 | 状态 |
|:---|:---|:---|
| 快速滚动首次事件速度检测不准（`lastScrollTime=0`） | P0 | ✅ 已修复 |
| RENDERING/SCROLLING_SLOW 数据未就绪时空白 | P0 | ✅ 已修复 |
| 骨架屏无超时兜底可能死循环 | P1 | ✅ 已修复（2000ms） |
| BlockCacheManager 每帧触发 onBlocksChanged | P0 | ✅ 已修复（needsUpdate 守卫） |
| ResizeObserver 滚动中强制回流 | P0 | ✅ 已删除 |
| 搜索后滚轮骨架屏误触发 | P0 | ✅ 已修复 |
| 搜索关键词高亮 v-html 样式不生效 | P1 | ✅ 已修复（全局style） |
| 搜索跳转同一结果不重复触发 | P1 | ✅ 已修复（jumpTrigger） |
| 微速滚动 startIndex 震荡（`overflow-anchor` 反馈环路） | P0 | ✅ 已修复（CSS `overflow-anchor:none`） |
| 折叠后回到首行（watch totalNodes 无条件重置） | P0 | ✅ 已修复（prevTotalNodes<=0 守卫） |
| 折叠后上方大片空白（flatId/visibleIdx 坐标空间分裂） | P0 | ✅ 已修复（flatVisibleRange + 坐标统一） |
| 展开折叠三重断裂（Worker/BlockCache/parsedTree） | P0 | ✅ 已修复（实现虚拟展开折叠） |

## 归档

见 [archive/2026-05-12.md](archive/2026-05-12.md) — 全天工作完整记录（滚动修复 + 虚拟展开折叠 + 折叠稳定性4轮）
