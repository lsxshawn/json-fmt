# 项目进度看板

> 每次任务后更新 | 最后更新：2026-05-10

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
| 微速滚动晃动修复 | 0510 | displayScrollTopRef + BlockCacheManager needsUpdate守卫 |
| 滚轮骨架屏误触发修复 | 0510 | lastWheelTime时间戳 + double guard (!isDrag) |
| 搜索功能重构 | 0510 | 删除旧代码 → Web Worker + 底部抽屉面板 |
| 搜索 UI 修复（4轮） | 0510 | 跳转居中/高亮/面板跟随/导航/位置修正 |
| docs 目录重构 | 0510 | 数字前缀分层 + README + archive/prompts/temp |

## 进行中

| 任务 | 状态 | 阻塞点 |
|:---|:---|:---|
| 缓速滚动稳定性验证 | 🟡 待实测 | 需用户验证 BlockCacheManager needsUpdate 修复后效果 |
| 搜索跳转居中验证 | 🟡 待实测 | 需用户验证 updateContainerHeight + ITEM_HEIGHT/2 修复后效果 |

## 待办

| 优先级 | 任务 | 说明 |
|:---|:---|:---|
| P0 | 缓速滚动实测验证 | BlockCacheManager `onBlocksChanged` 仅在 needsUpdate 时触发 |
| P0 | 滚轮零骨架屏验证 | 双重保险 `wheelRecent < 200ms || !isDrag` |
| P1 | 骨架屏行号覆盖 4K 大屏 | 动态 `SKELETON_POOL_SIZE` 验证 |
| P1 | 搜索 Worker 大文件性能 | 50MB flatNodesCache 序列化到 Worker 耗时 |
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
