# 当前任务：折叠稳定性 + 搜索跳转综合验证

> 最后更新：2026-05-12 | 状态：🟡 虚拟展开折叠已实现，折叠稳定性4轮已修复，待实测

## 本次已完成

### 微速滚动晃动（P0）— 第9轮终极修复 ✅
根因：浏览器 `overflow-anchor:auto` 反馈环路。
修复：`.tree-scroll { overflow-anchor: none }` + `.tree-content-inner { contain: layout style }`

### 虚拟展开折叠 — 从零实现 ✅
- 清理 196 行僵尸代码（6个死函数 + 3个空 Worker case）
- BlockCacheManager 新增 5 个数据结构 + 9 个方法
- 搜索跳转 prepareJumpToVisible + handleSearchJump

### 折叠稳定性（4 轮） ✅
- 3.1 折叠后回到首行 → watch 守卫
- 3.2 折叠后上方空白 → flatVisibleRange
- 3.3 锚点纠错 → 改为被点击 nodeId
- 3.4 移除多余 scrollTop 调整
- 3.5 坐标空间统一 → visibleItems 用 flatId 范围

## 待验证

| 优先级 | 验证项 | 说明 |
|:---|:---|:---|
| P0 | 折叠稳定性综合场景 | 多节点折叠/展开 + 快速滚动 + 搜索跳转 |
| P1 | 搜索跳转居中 | prepareJumpToVisible + flatVisibleRange 端到端 |
| P1 | setScrollTopToLine 清理评估 | 函数已不用于折叠，评估是否移除 |
| P2 | expandAll/collapseAll 实测 | 边界场景 |
