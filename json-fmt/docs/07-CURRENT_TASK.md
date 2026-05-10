# 当前任务：缓速滚动 + 搜索跳转实测验证

> 开始：2026-05-10 | 状态：🟡 修复完成，等待实测验证 | 详情：`archive/2026-05-10.md`

## 已明确的结论（下次不再重复验证）

1. **ResizeObserver 在虚拟滚动场景下有害**——强制回流，已删除，改用显式调用 `updateContainerHeight()`
2. **布尔标志 `isWheelSource` 有单次消费缺陷**——改用 `lastWheelTime` 时间戳 + 150ms 窗口
3. **`lastRenderedLine` 解耦时状态机/timing/RAF 永远执行**——只抑制渲染 emit
4. **`displayScrollLine` 用 DOM scrollTop 直接计算**——禁用 `localScrollTop/scaleFactor` 链
5. **BlockCacheManager `onBlocksChanged` 仅在 `needsUpdate=true` 时触发**——防止每帧重建数组
6. **Vue scoped CSS 不支持 v-html 注入元素**——需全局 `<style>` 块
7. **`watch(jumpToLine)` 值不变时不触发**——需 `jumpTrigger` 计数器

## 待验证

| 优先级 | 验证项 | 说明 |
|:---|:---|:---|
| P0 | 缓速滚动 UI 稳定性 | BlockCacheManager `onBlocksChanged` 仅在 needsUpdate 时触发 → 晃动应消失 |
| P0 | 滚轮 → 0 骨架屏 | 双重保险 `wheelRecent < 200ms \|\| !isDrag` |
| P1 | 搜索跳转到行居中 | `updateContainerHeight()` + `+ITEM_HEIGHT/2` |
| P1 | 搜索关键词高亮 | `highlightKeyword()` + 全局 `<style>` 块 `.search-panel .match-highlight` |

## 最近修改文件

| 文件 | 关键变更 |
|:---|:---|
| `src/components/JsonTreeView.vue` | L189 displayScrollTopRef / L218 emit('scroll',newScrollLine) / L353 defineExpose(updateContainerHeight) |
| `src/components/SearchPanel.vue` | 新建 + 全局 style 块 match-highlight + scrollActiveIntoView + highlightKeyword |
| `src/App.vue` | L105 jsonTreeRef / L2937 lastReqBlock守卫 / L2903 handleSearchPanelResize / 删除旧搜索 |
| `src/core/BlockCacheManager.js` | L88 `if (needsUpdate) onBlocksChanged` |
