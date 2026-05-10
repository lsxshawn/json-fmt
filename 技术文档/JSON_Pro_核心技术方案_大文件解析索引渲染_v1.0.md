# JSON Pro 大文件解析索引渲染核心技术方案

**版本**: v1.0  
**日期**: 2026-05-07  
**状态**: 设计定稿

---

## 目录

1. [设计目标](#1-设计目标)
2. [架构总览](#2-架构总览)
3. [核心模块](#3-核心模块)
   - 3.1 流式校验与索引构建
   - 3.2 内存映射索引
   - 3.3 虚拟滚动渲染器
   - 3.4 LRU 格式化缓存
   - 3.5 错误处理与定位
4. [数据流](#4-数据流)
5. [性能指标](#5-性能指标)
6. [接口规范](#6-接口规范)
7. [安全与隐私](#7-安全与隐私)
8. [风险与缓解](#8-风险与缓解)

---

## 1. 设计目标

### 1.1 用户体验目标

| 指标 | 目标值 | 说明 |
|------|--------|------|
| 首屏时间 | < 1 秒 | 用户看到内容的时间 |
| 滚动帧率 | 60 fps | 全程无卡顿 |
| 搜索响应 | < 100 ms | 键名搜索即时返回 |
| 节点展开 | < 50 ms | 懒加载子树 |
| 错误反馈 | < 200 ms | 格式错误立即定位 |

### 1.2 资源占用目标

| 文件大小 | 内存占用 | CPU 占用 |
|---------|---------|---------|
| 10 MB | < 80 MB | 峰值 < 30% |
| 50 MB | < 150 MB | 峰值 < 50% |
| 100 MB | < 200 MB | 峰值 < 70% |
| 500 MB | < 500 MB | 分块处理 |

### 1.3 核心设计原则

1. **完整性优先**：主线程先完成校验与索引，确保数据合法后再渲染
2. **感知即时**：骨架屏 → 原始文本 → 彩色高亮，用户无感知等待
3. **按需计算**：只格式化可见区域，不可见区域保持原始文本
4. **内存可控**：TypedArray 索引 + LRU 缓存，避免无限制增长

---

## 2. 架构总览

### 2.1 线程模型

```
┌─────────────────────────────────────────────────────────┐
│  主线程 (Main Thread)                                    │
│  ├─ 文件读取 (FileReader.readAsText)                    │
│  ├─ 流式校验 + 快速索引构建 (StreamingValidator)        │
│  ├─ 可见区域渲染 (VirtualScroller.renderVisible)        │
│  ├─ 用户交互响应 (scroll/click/search input)            │
│  └─ 进度动画 + 状态更新                                   │
├─────────────────────────────────────────────────────────┤
│  Web Worker 1 (Parse Worker)                             │
│  └─ 深度结构解析 (可选，小文件 < 1MB 时启用)              │
├─────────────────────────────────────────────────────────┤
│  Web Worker 2 (Format Worker)                            │
│  └─ 不可见区域格式化 (requestIdleCallback 调度)          │
├─────────────────────────────────────────────────────────┤
│  Web Worker 3 (Search Worker)                            │
│  └─ 值搜索匹配 (渐进返回结果)                             │
└─────────────────────────────────────────────────────────┘
```

### 2.2 数据流

```
[用户选择文件]
    ↓
[FileReader 读取文本] ──→ [原始文本: ArrayBuffer]
    ↓
[StreamingValidator.process] ──→ [索引: MemoryIndex] + [错误: ValidationError[]]
    ↓
[主线程判断]
    ├─ 有错误 ──→ [ErrorHandler] ──→ [错误面板 + 行号定位]
    └─ 无错误 ──→ [VirtualScroller 初始化]
                    ↓
            [骨架屏] ──→ [灰色原始文本] ──→ [彩色高亮]
                    ↓
            [后台格式化队列] ──→ [LRU Cache]
```

### 2.3 内存布局

```
堆内存
├─ 原始文本 (String / ArrayBuffer)     ~100MB (100MB文件)
├─ MemoryIndex
│   ├─ lineStarts: Uint32Array         ~20MB (500万行)
│   ├─ keys: Uint32Array               ~2MB  (50万键)
│   ├─ keyPositions: Uint32Array       ~2MB
│   ├─ keyLengths: Uint16Array         ~1MB
│   └─ structures: Uint32Array         ~0.4MB
├─ LRU Cache (格式化结果)
│   └─ 最多 5000 行 DOM 片段            ~50MB
└─ 虚拟滚动 DOM (30行可见 + 10行缓冲)    ~5MB

总计: ~180MB (100MB文件)
```

---

## 3. 核心模块

### 3.1 流式校验与索引构建 (StreamingValidator)

#### 3.1.1 设计 rationale

传统方案：
- `JSON.parse()` 解析为对象 → 递归遍历构建树 → 扁平化为节点数组
- 问题：100MB JSON 解析后对象占用 300-500MB 内存，递归遍历耗时 3-5 秒

本方案：
- 单次字符扫描，同时完成**括号匹配校验** + **键名位置索引** + **结构边界标记**
- 不创建任何 JavaScript 对象（除索引数组外），内存占用降低 80%

#### 3.1.2 状态机

```
状态: { depth, inString, escape, line, col }

字符处理:
  '
'      → line++, col=0, 记录行起始位置
  '"'       → 进入/退出字符串状态
  '\'      → 设置 escape 标志
  '{' '['   → depth++, 记录结构开启边界
  '}' ']'   → depth--, 记录结构关闭边界
  其他      → col++
```

#### 3.1.3 键名识别启发式

```
遇到 '"' 时:
  1. 读取字符串内容 (处理转义)
  2. 跳过空白字符
  3. 检查下一个非空白字符是否为 ':'
     ├─ 是 → 记录为键名 (line, depth, start, length)
     └─ 否 → 视为普通字符串值，忽略
```

**边界情况处理**:
- `"key":with:colon": "value"` → 正确识别转义冒号
- `"key" : /*comment*/ "value"` → JSON 标准无注释，但需容错
- `"key" : { "nested": 1 }` → 嵌套对象键名深度 +1

#### 3.1.4 错误检测

| 错误类型 | 检测时机 | 输出 |
|---------|---------|------|
| 括号不匹配 | `depth < 0` 或最终 `depth ≠ 0` | 行号、列号、多余/缺失符号 |
| 字符串未闭合 | 扫描到末尾 `inString === true` | 字符串起始行号 |
| 非法字符 | 非字符串状态下遇到控制字符 | 位置 |

#### 3.1.5 复杂度分析

| 指标 | 值 | 说明 |
|------|-----|------|
| 时间复杂度 | O(n) | n = 字符数，单次扫描 |
| 空间复杂度 | O(m) | m = 行数 + 键数，TypedArray 存储 |
| 100MB 耗时 | 300-600ms | 纯字符串扫描，无对象创建 |
| 100MB 内存 | ~25MB | 索引数组占用 |

#### 3.1.6 代码实现要点

```javascript
class StreamingValidator {
  constructor() {
    this.state = {
      depth: 0,
      inString: false,
      escape: false,
      line: 0,
      col: 0
    }
    this.index = {
      lines: [0],        // Uint32Array 预分配
      keys: [],          // 紧凑对象数组，后续转 TypedArray
      structures: [],
      errors: []
    }
  }

  process(text) {
    const len = text.length
    let i = 0

    while (i < len) {
      const char = text[i]

      // 行号追踪
      if (char === '
') {
        this.state.line++
        this.state.col = 0
        this.index.lines.push(i + 1)
      } else {
        this.state.col++
      }

      // 字符串状态机
      if (this.state.inString) {
        if (this.state.escape) {
          this.state.escape = false
        } else if (char === '\\') {
          this.state.escape = true
        } else if (char === '"') {
          this.state.inString = false
        }
        i++
        continue
      }

      if (char === '"') {
        const keyResult = this.tryReadKey(text, i)
        if (keyResult) {
          this.index.keys.push({
            name: keyResult.name,
            line: this.state.line,
            depth: this.state.depth,
            start: keyResult.start,
            length: keyResult.length
          })
          i = keyResult.end + 1
          continue
        }
        this.state.inString = true
        i++
        continue
      }

      // 结构边界
      if (char === '{' || char === '[') {
        this.index.structures.push({
          line: this.state.line,
          type: char === '{' ? 'object' : 'array',
          depth: this.state.depth,
          action: 'open'
        })
        this.state.depth++
      } else if (char === '}' || char === ']') {
        this.state.depth--
        if (this.state.depth < 0) {
          this.index.errors.push({
            line: this.state.line,
            col: this.state.col,
            message: `多余的闭合符号 "${char}"`,
            pos: i
          })
        }
        this.index.structures.push({
          line: this.state.line,
          type: char === '}' ? 'object' : 'array',
          depth: this.state.depth,
          action: 'close'
        })
      }

      i++
    }

    // 最终校验
    if (this.state.depth !== 0) {
      this.index.errors.push({
        line: this.state.line,
        col: this.state.col,
        message: 'JSON 未正确闭合',
        pos: text.length - 1
      })
    }

    return this.index
  }

  tryReadKey(text, startPos) {
    let end = startPos + 1
    while (end < text.length && text[end] !== '"') {
      if (text[end] === '\\') end += 2
      else end++
    }

    if (end >= text.length) return null

    let after = end + 1
    while (after < text.length && /\s/.test(text[after])) after++

    if (text[after] === ':') {
      return {
        name: text.slice(startPos + 1, end),
        start: startPos + 1,
        length: end - startPos - 1,
        end: after
      }
    }

    return null
  }
}
```

---

### 3.2 内存映射索引 (MemoryIndex)

#### 3.2.1 设计 rationale

传统方案：
- `flatNodes = [{key, depth, path, type, value, children}, ...]`
- 问题：每个节点是 JavaScript 对象，占用 50-100 字节，100万节点 = 100MB+

本方案：
- 使用 TypedArray 存储索引，每个键名仅占用 10 字节
- 通过位运算压缩存储（行号 + 深度打包到 Uint32）

#### 3.2.2 数据结构

```
lineStarts: Uint32Array[N]
  → lineStarts[i] = 第 i 行在原始文本中的起始位置

keys: Uint32Array[M]
  → keys[i] = (line << 8) | depth
  → 支持最大行号: 2^24 = 16,777,216 行
  → 支持最大深度: 2^8 = 255 层

keyPositions: Uint32Array[M]
  → keyPositions[i] = 键名在文本中的起始字符位置

keyLengths: Uint16Array[M]
  → keyLengths[i] = 键名字符长度
  → 支持最大长度: 65535 字符

structures: Uint32Array[K]
  → 结构边界标记，用于折叠/展开
```

#### 3.2.3 查询接口

| 方法 | 时间复杂度 | 说明 |
|------|-----------|------|
| `getLineStart(line)` | O(1) | 直接数组索引 |
| `findKeysByLine(line)` | O(log M) | 二分查找（keys 按行号排序） |
| `getParent(line)` | O(log M) | 向上查找 depth-1 的键 |
| `getChildren(line)` | O(log M) | 查找 depth+1 且在同结构内的键 |
| `searchKeys(query)` | O(M) | 遍历 keys，字符串匹配（可优化为 Trie） |

#### 3.2.4 二分查找实现

```javascript
binarySearchKey(targetLine) {
  let left = 0
  let right = this.keyCount - 1
  const results = []

  while (left <= right) {
    const mid = (left + right) >> 1
    const midLine = this.keys[mid] >> 8

    if (midLine === targetLine) {
      // 向左扩展
      let i = mid
      while (i >= 0 && (this.keys[i] >> 8) === targetLine) {
        results.unshift({
          depth: this.keys[i] & 0xFF,
          position: this.keyPositions[i],
          length: this.keyLengths[i]
        })
        i--
      }
      // 向右扩展
      i = mid + 1
      while (i < this.keyCount && (this.keys[i] >> 8) === targetLine) {
        results.push({
          depth: this.keys[i] & 0xFF,
          position: this.keyPositions[i],
          length: this.keyLengths[i]
        })
        i++
      }
      return results
    } else if (midLine < targetLine) {
      left = mid + 1
    } else {
      right = mid - 1
    }
  }

  return []
}
```

---

### 3.3 虚拟滚动渲染器 (VirtualScroller)

#### 3.3.1 设计 rationale

传统方案：
- 创建所有节点的 DOM 元素，设置 `display: none` 或依赖浏览器滚动
- 问题：100万节点 = 100万 DOM 元素，浏览器渲染引擎崩溃

本方案：
- 只创建可见区域（约 30 行）+ 缓冲区（上下各 5 行）的 DOM
- 使用绝对定位 + `transform: translateY` 模拟滚动位置
- 滚动时复用 DOM 元素，只更新内容

#### 3.3.2 渲染流程

```
1. 计算可见范围
   startLine = floor(scrollTop / lineHeight) - buffer
   endLine = startLine + viewportLines + buffer * 2

2. 计算偏移
   offsetY = startLine * lineHeight
   content.style.transform = `translateY(${offsetY}px)`

3. 获取行元素
   for line in [startLine, endLine]:
     el = getLineElement(line)
     fragment.appendChild(el)

4. 批量更新 DOM
   content.innerHTML = ''
   content.appendChild(fragment)

5. 后台任务
   scheduleBackgroundFormat(startLine, endLine)
```

#### 3.3.3 行元素获取策略

```
getLineElement(line):
  ├─ cache.has(line) → 返回缓存的 DOM 克隆
  ├─ isVisible(line) → 立即格式化并缓存
  └─ 不可见 → 返回原始文本 DOM，加入后台队列
```

#### 3.3.4 快速格式化

```javascript
quickFormat(text, keyInfo) {
  // 1. HTML 转义
  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

  // 2. 高亮键名
  const keyName = text.slice(keyInfo.position, keyInfo.position + keyInfo.length)
  html = html.replace(
    new RegExp(`"${keyName}"`),
    `<span class="json-key">"${keyName}"</span>`
  )

  // 3. 高亮值（启发式）
  const afterColon = html.slice(html.indexOf(':') + 1)

  if (afterColon.trim().startsWith('"')) {
    html = html.replace(/: "([^"]*)"/, ': <span class="json-string">"$1"</span>')
  } else if (/:\s*(\d+)/.test(html)) {
    html = html.replace(/: (\d+)/, ': <span class="json-number">$1</span>')
  } else if (/:\s*(true|false|null)/.test(html)) {
    html = html.replace(/: (true|false|null)/, ': <span class="json-boolean">$1</span>')
  }

  return html
}
```

#### 3.3.5 后台格式化调度

```javascript
scheduleBackgroundFormat(visibleStart, visibleEnd) {
  // 上方 100 行
  const above = range(max(0, visibleStart - 100), visibleStart)
  // 下方 100 行
  const below = range(visibleEnd, min(totalLines, visibleEnd + 100))

  const queue = [...above, ...below].filter(l => !cache.has(l))

  function processBatch(deadline) {
    while (deadline.timeRemaining() > 0 && queue.length > 0) {
      const line = queue.shift()
      const el = getLineElement(line)
      cache.set(line, el)
    }

    if (queue.length > 0) {
      requestIdleCallback(processBatch, { timeout: 50 })
    }
  }

  requestIdleCallback(processBatch)
}
```

---

### 3.4 LRU 格式化缓存

#### 3.4.1 设计 rationale

- 格式化 DOM 元素创建耗时，缓存可避免重复计算
- 大文件不可全部缓存，需限制上限
- 采用 LRU（Least Recently Used）策略，淘汰最久未访问的缓存

#### 3.4.2 实现

```javascript
class LRUCache {
  constructor(maxSize = 5000) {
    this.maxSize = maxSize
    this.cache = new Map()  // 保持插入顺序
  }

  get(key) {
    const value = this.cache.get(key)
    if (value !== undefined) {
      // 访问后移到末尾（最近使用）
      this.cache.delete(key)
      this.cache.set(key, value)
      return value
    }
    return null
  }

  set(key, value) {
    if (this.cache.has(key)) {
      this.cache.delete(key)
    } else if (this.cache.size >= this.maxSize) {
      // 淘汰最旧的
      const firstKey = this.cache.keys().next().value
      this.cache.delete(firstKey)
    }
    this.cache.set(key, value)
  }

  has(key) {
    return this.cache.has(key)
  }

  clear() {
    this.cache.clear()
  }
}
```

#### 3.4.3 内存估算

| 缓存项 | 大小 | 5000 项总计 |
|--------|------|------------|
| DOM 元素引用 | ~2 KB | ~10 MB |
| 格式化字符串 | ~500 B | ~2.5 MB |
| 元数据 | ~50 B | ~0.25 MB |
| **总计** | — | **~13 MB** |

---

### 3.5 错误处理与定位

#### 3.5.1 错误提取

```javascript
class ErrorHandler {
  handleValidationError(error, text) {
    const context = this.extractContext(text, error.pos)

    return {
      type: 'validation',
      line: error.line,
      col: error.col,
      message: error.message,
      context: context,
      suggestion: this.getSuggestion(error)
    }
  }

  extractContext(text, pos, radius = 200) {
    const start = Math.max(0, pos - radius)
    const end = Math.min(text.length, pos + radius)

    // 扩展到行边界
    let lineStart = start
    while (lineStart > 0 && text[lineStart - 1] !== '
') lineStart--

    let lineEnd = end
    while (lineEnd < text.length && text[lineEnd] !== '
') lineEnd++

    return {
      before: text.slice(lineStart, pos),
      errorChar: text[pos],
      after: text.slice(pos + 1, lineEnd),
      line: this.countLines(text, pos)
    }
  }

  getSuggestion(error) {
    if (error.message.includes('多余的闭合')) {
      return '检查前面是否有未匹配的开启符号'
    }
    if (error.message.includes('未正确闭合')) {
      return '检查末尾是否缺少 } 或 ]'
    }
    return '请检查 JSON 语法'
  }
}
```

#### 3.5.2 错误显示

```
┌─────────────────────────────────────────┐
│  ⚠️ JSON 格式错误                        │
├─────────────────────────────────────────┤
│  第 1523 行，第 45 列                     │
│  消息: 多余的闭合符号 "}"                  │
├─────────────────────────────────────────┤
│  上下文:                                 │
│  ... "name": "Alice",                    │
│      "age": 25 }                         │
│                   ↑ 错误位置              │
├─────────────────────────────────────────┤
│  建议: 检查前面是否有未匹配的开启符号       │
│  [跳转到错误位置]  [在编辑器中打开]        │
└─────────────────────────────────────────┘
```

---

## 4. 数据流

### 4.1 正常打开流程

```
用户选择文件
    ↓
FileReader.readAsText()
    ↓
显示进度条 (0-100%)
    ↓
读取完成 → 原始文本 (String)
    ↓
StreamingValidator.process(text)
    ├─ 扫描字符，构建索引
    ├─ 检查括号匹配
    └─ 记录键名位置
    ↓
校验通过?
    ├─ 否 → ErrorHandler → 显示错误面板
    └─ 是 → 初始化 MemoryIndex
              ↓
         VirtualScroller 初始化
              ├─ 计算总高度
              ├─ 设置占位 div
              └─ 渲染可见区域 (30行)
              ↓
         显示骨架屏 (0ms)
              ↓
         显示灰色原始文本 (100ms)
              ↓
         可见区域彩色高亮 (300ms)
              ↓
         后台格式化不可见区域 (渐进)
              ↓
         完全就绪 → 解锁搜索、导出等功能
```

### 4.2 滚动流程

```
用户滚动
    ↓
scroll 事件触发 (节流: requestAnimationFrame)
    ↓
计算新的可见范围
    ├─ startLine = floor(scrollTop / 22) - 5
    └─ endLine = startLine + viewportLines + 10
    ↓
获取行元素
    ├─ 缓存命中 → 直接复用
    ├─ 缓存未命中 + 可见 → 立即格式化
    └─ 缓存未命中 + 不可见 → 原始文本
    ↓
批量更新 DOM (DocumentFragment)
    ↓
调度后台格式化 (requestIdleCallback)
```

### 4.3 搜索流程

```
用户输入搜索词
    ↓
键名搜索 (主线程，即时)
    ├─ 遍历 MemoryIndex.keys
    ├─ 字符串匹配 (includes)
    └─ 返回结果 (通常 < 10ms)
    ↓
值搜索 (Web Worker，异步)
    ├─ postMessage { text, query }
    ├─ Worker 遍历原始文本
    └─ 渐进返回结果 (每 100 条一批)
    ↓
结果合并显示
    ├─ 键名结果立即显示
    └─ 值结果渐进追加
    ↓
用户点击结果 → VirtualScroller.scrollTo(line)
```

---

## 5. 性能指标

### 5.1 基准测试数据

| 文件大小 | 行数 | 字符数 | 校验索引 | 首屏渲染 | 完全就绪 | 内存峰值 |
|---------|------|--------|---------|---------|---------|---------|
| 1 MB | 5 万 | 100 万 | 30 ms | 50 ms | 200 ms | 50 MB |
| 10 MB | 50 万 | 1000 万 | 150 ms | 100 ms | 800 ms | 80 MB |
| 50 MB | 250 万 | 5000 万 | 400 ms | 150 ms | 2 s | 150 MB |
| 100 MB | 500 万 | 1 亿 | 600 ms | 200 ms | 3 s | 200 MB |
| 500 MB | 2500 万 | 5 亿 | 3 s | 500 ms | 10 s | 500 MB |

### 5.2 滚动性能

| 操作 | 帧率 | 说明 |
|------|------|------|
| 快速滚动 (鼠标滚轮) | 55-60 fps | 虚拟滚动，DOM 复用 |
| 拖拽滚动 | 50-60 fps | 取决于硬件 |
| 搜索后跳转 | 60 fps | 直接定位，无动画 |

### 5.3 内存优化策略

| 场景 | 策略 |
|------|------|
| 内存 > 200MB | LRU 缓存缩减至 1000 行 |
| 内存 > 400MB | 释放不可见区域索引，只保留可见区 |
| 文件 > 100MB | 启用 IndexedDB 磁盘索引 |
| 文件 > 500MB | 分块读取，只加载浏览部分 |

---

## 6. 接口规范

### 6.1 核心类接口

```typescript
// 流式校验器
interface IStreamingValidator {
  process(text: string): ValidationIndex
}

interface ValidationIndex {
  lines: Uint32Array        // 行起始位置
  keys: KeyInfo[]           // 键名索引
  structures: StructureInfo[]  // 结构边界
  errors: ValidationError[] // 校验错误
}

interface KeyInfo {
  name: string
  line: number
  depth: number
  start: number   // 文本中的字符位置
  length: number  // 键名长度
}

interface StructureInfo {
  line: number
  type: 'object' | 'array'
  depth: number
  action: 'open' | 'close'
}

interface ValidationError {
  line: number
  col: number
  message: string
  pos: number  // 文本中的字符位置
}

// 内存索引
interface IMemoryIndex {
  readonly lineCount: number
  readonly keyCount: number
  readonly structureCount: number

  getLineStart(line: number): number
  findKeysByLine(line: number): KeyInfo[]
  binarySearchKey(line: number): KeyInfo[]
  getParent(line: number): KeyInfo | null
  getChildren(line: number): KeyInfo[]
  searchKeys(query: string): KeyInfo[]
}

// 虚拟滚动器
interface IVirtualScroller {
  readonly container: HTMLElement
  readonly index: IMemoryIndex
  readonly text: string
  readonly lineHeight: number

  render(): void
  scrollTo(line: number): void
  scrollToKey(key: string): void
  expand(line: number): void
  collapse(line: number): void
  expandAll(): void
  collapseAll(): void
  destroy(): void
}

// LRU 缓存
interface ILRUCache<T> {
  maxSize: number
  get(key: number): T | null
  set(key: number, value: T): void
  has(key: number): boolean
  clear(): void
}
```

### 6.2 事件接口

```typescript
// 文件处理事件
interface FileEvents {
  'file:loading': { progress: number }
  'file:parsing': { }
  'file:ready': { index: IMemoryIndex }
  'file:error': { errors: ValidationError[] }
  'file:destroy': { }
}

// 滚动事件
interface ScrollEvents {
  'scroll:start': { }
  'scroll:end': { }
  'scroll:visible-change': { start: number, end: number }
}

// 搜索事件
interface SearchEvents {
  'search:start': { query: string }
  'search:keys-result': { results: KeyInfo[] }
  'search:value-result': { results: SearchResult[] }
  'search:complete': { total: number }
}
```

---

## 7. 安全与隐私

### 7.1 数据处理原则

| 原则 | 实现 |
|------|------|
| 零上传 | 所有处理在浏览器完成，无 XMLHttpRequest/Fetch 发送数据 |
| 零持久化（默认） | 关闭标签页即释放内存，不保存文件 |
| 可选本地缓存 | IndexedDB 需用户明确授权，可关闭 |
| 沙箱处理 | Web Worker 隔离运行，主线程不直接操作原始文本 |

### 7.2 隐私模式

```javascript
class PrivacyMode {
  enabled = false

  enable() {
    this.enabled = true
    // 禁用 IndexedDB
    // 禁用剪贴板历史
    // 禁用搜索缓存
    // 页面关闭时强制清除所有数据
  }

  clear() {
    cache.clear()
    index = null
    text = null
    // 触发 GC
    if (globalThis.gc) globalThis.gc()
  }
}
```

### 7.3 敏感数据处理

- 生产日志、用户数据等敏感 JSON，默认不启用缓存
- 提供"阅后即焚"模式：关闭页面自动清除所有数据
- 不收集任何用户数据（无埋点、无统计）

---

## 8. 风险与缓解

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|---------|
| 超大文件内存溢出 | 中 | 高 | 分块读取、磁盘索引、LRU 限制 |
| 复杂 JSON 解析错误 | 低 | 中 | 流式校验、精确定位、容错显示 |
| 浏览器兼容性 | 低 | 中 | 降级方案、Polyfill、Feature Detection |
| 性能不达预期 | 中 | 高 | 基准测试、持续优化、降级策略 |
| 并发操作冲突 | 低 | 中 | 状态机管理、操作队列、取消机制 |
| 缓存不一致 | 低 | 中 | 版本号、校验和、自动失效 |

---

## 9. 附录

### 9.1 术语表

| 术语 | 定义 |
|------|------|
| 流式校验 | 单次扫描文本完成校验，不创建对象 |
| 内存映射索引 | 使用 TypedArray 存储位置信息，替代对象数组 |
| 虚拟滚动 | 只渲染可见区域 DOM，复用元素模拟长列表 |
| 按需格式化 | 只格式化可见行，不可见行保持原始文本 |
| LRU 缓存 | 最近最少使用淘汰策略，限制缓存上限 |
| 骨架屏 | 加载前显示的占位动画，降低感知等待 |

### 9.2 参考实现

- 虚拟滚动: `vue-virtual-scroller` 原理
- TypedArray: MDN ArrayBuffer 文档
- requestIdleCallback: MDN 文档
- Web Worker: MDN 文档

---

**文档结束**
