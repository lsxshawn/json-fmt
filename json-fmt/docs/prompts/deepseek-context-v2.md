# JSON Pro 开发上下文（DeepSeek-V4-Pro 专用）

## 项目定位
JSON Pro - 大文件 JSON 安全可视化工具
- 核心卖点：100MB+ 文件秒开、纯本地处理、零上传
- 当前阶段：MVP 开发，砍掉 minimap，聚焦虚拟滚动 + 骨架屏 + 大文件渲染

## 技术架构

| 模块 | 文件 | 职责 | 状态 |
|:---|:---|:---|:---|
| StreamingValidator | core/validator.js | 流式校验+索引，单次扫描 O(n)，不 JSON.parse | ✅ 稳定 |
| MemoryIndex | core/index.js | TypedArray 内存映射（Uint32Array/Uint16Array），二分查找 | ✅ 稳定 |
| VirtualScroller | components/VirtualScroller.vue | 虚拟滚动 + 骨架屏 + 可见范围渲染 | 🟡 调试中 |
| SearchController | components/Search.vue | 键名索引搜索 + Web Worker 值搜索 | ✅ 稳定 |

## 当前问题（核心任务）

### 现象
- 233万行文件，滚动到中段（如 20万行/119万行）时骨架屏显示
- **停止滚动后，骨架屏不消失，真实内容不渲染**
- 状态栏显示位置正确（"第 119.8w 行 / 共 233.0w 行"）

### 涉及范围（可能跨模块）
1. **VirtualScroller.vue**：骨架屏状态切换、可见范围计算、滚动事件处理
2. **MemoryIndex.js**：根据行号快速取数据、索引查询性能
3. **格式化逻辑**：从原始文本 + 索引生成可渲染内容
4. **Vue 响应式**：状态变更后 DOM 更新是否触发

## 排查方向（按优先级）

### 方向1：骨架屏状态机
```
快速滚动 → isSkeleton = true → 显示骨架屏
停止滚动 → 200ms 后 isSkeleton = false → 触发渲染
```
**检查点**：
- setTimeout/clearTimeout 是否正确配对
- isSkeleton 变更后是否触发 Vue 响应式更新
- 骨架屏隐藏后，真实内容渲染函数是否执行

### 方向2：可见范围计算
```javascript
// 正确逻辑
const start = Math.max(0, Math.floor(scrollTop / LINE_HEIGHT) - BUFFER);
const end = Math.min(totalLines, start + VIEWPORT_LINES + BUFFER * 2);
```
**检查点**：
- 滚动到 119万行时，start/end 是否在合理范围
- 是否只渲染 40 行，不是从 0 到 119万行
- offsetY 计算是否正确（start * LINE_HEIGHT）

### 方向3：MemoryIndex 数据获取
```javascript
// 根据行号从索引取数据
const keyIdx = findKeyAtLine(index, lineNum);
const keyName = getKeyName(text, index, keyIdx);
const valueType = detectType(text, index, keyIdx);
```
**检查点**：
- 119万行的索引查询是否返回正确数据
- 二分查找是否越界或返回 -1
- 原始文本 text 是否仍保留（大文件时是否被释放）

### 方向4：格式化性能
```javascript
// 格式化单行
function formatLine(lineNum) {
  // 从索引取数据 → 判断类型 → 生成 HTML
}
```
**检查点**：
- 单条格式化耗时（是否 > 10ms）
- 40 条累积耗时（是否 > 100ms，阻塞渲染）
- 是否用了正则或复杂字符串操作

### 方向5：Vue 渲染机制
**检查点**：
- visibleItems computed 是否依赖 isSkeleton
- 骨架屏隐藏后，visibleItems 是否重新计算
- DOM 更新是否异步（nextTick）

## 排查方法（加日志）

```javascript
// 在关键位置加日志，定位瓶颈

// 1. 滚动事件
console.log('scroll', scrollTop, 'speed', velocity, 'isSkeleton', isSkeleton);

// 2. 状态切换
console.log('state change', oldState, '->', newState);

// 3. 可见范围
console.log('range', start, '-', end, 'offsetY', offsetY);

// 4. 数据获取
console.log('line', lineNum, 'keyIdx', keyIdx, 'duration', duration);

// 5. 格式化
console.time('format-' + lineNum);
const html = formatLine(lineNum);
console.timeEnd('format-' + lineNum);

// 6. 渲染
console.log('render', visibleItems.length, 'items');
```

## 修改原则

1. **先定位根因，再修改**
   - 加日志 → 看控制台 → 确定哪一步卡住
   - 不要猜测，用数据说话

2. **最小修改，逐步验证**
   - 改一处，测一处
   - 不要一次性改多个模块

3. **保留现有架构**
   - 不改 StreamingValidator 的流式逻辑
   - 不改 MemoryIndex 的索引结构
   - 可改 VirtualScroller 的渲染策略

4. **性能红线**
   - 单条格式化 < 5ms
   - 40 条累积 < 100ms
   - 内存 < 200MB

## 可能的修复方案（根据排查结果选择）

### 方案A：状态机修复（如果 isSkeleton 未切换）
- 修复 setTimeout/clearTimeout 配对
- 确保 Vue 响应式触发

### 方案B：可见范围修复（如果计算错误）
- 修正 start/end 计算
- 确保 offsetY 正确

### 方案C：索引查询优化（如果 MemoryIndex 慢）
- 预计算行号索引
- 缓存频繁查询结果

### 方案D：格式化降级（如果格式化阻塞）
- 骨架屏期间不格式化
- 停止后分批格式化（requestIdleCallback）
- 或：先显示原始文本，后台格式化

### 方案E：渲染策略调整（如果 Vue 响应式问题）
- 强制 key 变化触发重新渲染
- 或用 v-show 替代 v-if 切换

## 输出要求

1. **第一步：加日志排查**
   - 在 VirtualScroller.vue 关键位置加 6 处日志
   - 运行，截图控制台输出
   - 确定卡在哪一步

2. **第二步：根据日志定位根因**
   - 是状态机？可见范围？索引查询？格式化？Vue 渲染？

3. **第三步：最小修改修复**
   - 只修改根因所在的模块
   - 改一处，验证一处

4. **第四步：验证**
   - 快速滚动：骨架屏显示
   - 停止滚动：200ms 内显示真实内容
   - 内存正常，不卡顿

## 参考文档

- docs/ARCHITECTURE.md（架构不可改）
- docs/PERFORMANCE_BUDGET.md（性能红线）
- docs/GUIDELINE.md（Trae 行为约束）
