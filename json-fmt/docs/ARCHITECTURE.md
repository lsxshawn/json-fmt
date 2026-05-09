# JSON Pro 技术架构（P0 - 不可违背）

## 核心原则

1. **不 JSON.parse 大文件**（>1MB）
2. **主线程只做轻量校验+索引**，渲染全异步
3. **内存预算**：50MB文件 < 130MB，100MB文件 < 200MB

---

## 模块划分

### StreamingValidator（core/validator.js）

- **职责**：单次扫描文本，完成校验 + 索引构建
- **输入**：原始 JSON 文本（string）
- **输出**：MemoryIndex（TypedArray）+ 错误数组
- **约束**：O(n) 复杂度，100MB 文件 < 600ms
- **禁止**：创建 JS 对象、调用 JSON.parse、递归

### MemoryIndex（core/index.js）

- **职责**：内存映射索引，支持快速查询
- **结构**：Uint32Array/Uint16Array，零对象
- **查询**：二分查找键名、行号定位、父子级遍历
- **内存**：100MB 文件索引 < 30MB

### VirtualScroller（components/TreeView.vue）

- **职责**：只渲染可见区域，虚拟滚动
- **输入**：MemoryIndex + 原始文本
- **输出**：30 个 DOM 节点（复用）
- **约束**：总高度固定 = index.lineCount * 22px
- **禁止**：一次性创建所有节点、存储完整 path 字符串

### MinimapCanvas（components/Minimap.vue）

- **职责**：全局结构缩略图
- **输入**：完整索引
- **输出**：Canvas 像素图（80px 宽）
- **约束**：不解析对象树，只看首字符判断类型

---

## 数据流

```
用户打开文件
  → FileReader 读取文本
  → StreamingValidator.process() → 校验+索引
  → 错误？→ 显示错误面板
  → 无错？→ 释放原始文本（可选）
  → VirtualScroller 渲染可见区
  → 后台格式化不可见区（LRU 缓存）
  → MinimapCanvas 绘制全局缩略图
```

---

## 线程模型

| 任务 | 线程 | 说明 |
|------|------|------|
| 校验+索引 | 主线程 | 必须同步，保证完整性后才渲染 |
| 格式化可见区 | 主线程 | 30行，< 100ms |
| 格式化不可见区 | requestIdleCallback | 低优先级，不阻塞 |
| 值搜索 | Web Worker | 异步渐进返回 |
| Minimap 绘制 | 主线程/Worker | 大文件时分批 |

---

## 禁止事项

- ❌ 主线程解析大文件（>1MB）为 JS 对象
- ❌ 扁平化所有节点到数组（内存爆炸）
- ❌ 存储完整 path 字符串到每个节点
- ❌ 一次性格式化整个文件
- ❌ Minimap 只绘制可见区域（失去导航意义）
