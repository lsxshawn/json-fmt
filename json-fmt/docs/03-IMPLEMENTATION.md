# 具体实现方法（P3 - 算法细节）

## StreamingValidator 实现

```javascript
// 伪代码，不可改逻辑
class StreamingValidator {
  process(text) {
    // 单次 for 循环扫描字符
    for (let i = 0; i < text.length; i++) {
      // 1. 追踪行号（遇到 
）
      // 2. 字符串状态机（inString, escape）
      // 3. 键名检测（引号后紧跟冒号）
      // 4. 结构边界（{ [ } ]，depth 计数）
      // 5. 错误检测（depth < 0 或最终 !== 0）
    }

    // 返回：{ index: TypedArrays, errors: [], meta: {} }
  }
}
```

关键约束：
- 只能有 1 个 for 循环
- 不能调用任何解析函数
- 不能创建临时对象（用基本类型计数）

---

## VirtualScroller 实现

```javascript
// 伪代码，不可改逻辑
const LINE_HEIGHT = 22;
const BUFFER_SIZE = 5;

// 总高度：固定，基于索引
const totalHeight = index.lineCount * LINE_HEIGHT;

// 可见范围：视口 + 上下缓冲
const start = Math.max(0, Math.floor(scrollTop / LINE_HEIGHT) - BUFFER_SIZE);
const end = Math.min(totalLines, Math.ceil((scrollTop + viewportHeight) / LINE_HEIGHT) + BUFFER_SIZE);

// 偏移量：必须基于 start
const offsetY = start * LINE_HEIGHT;

// 渲染：复用 30 个 div，只更新内容
```

常见错误（禁止）：
- ❌ totalHeight 基于 flatNodes.length（会变）
- ❌ offsetY = 0（内容固定在顶部）
- ❌ 没有 requestAnimationFrame 节流
- ❌ key 不唯一（导致 Vue 复用错误）

---

## Minimap 实现

```javascript
// 伪代码，不可改逻辑
function drawMinimap(text, index, canvas) {
  const ctx = canvas.getContext('2d');
  const rowHeight = canvas.height / index.lineCount; // 可能 < 1px

  // 遍历索引中的键名（不是遍历所有文本！）
  for (let k = 0; k < index.keyCount; k++) {
    const line = index.keys[k] >> 8;
    const depth = index.keys[k] & 0xFF;
    const keyPos = index.keyPos[k];
    const keyLen = index.keyLen[k];

    // 找到冒号后的值起始位置
    let valPos = keyPos + keyLen + 1;
    while (valPos < text.length && /[:\s]/.test(text[valPos])) valPos++;

    // 只看第一个字符判断类型
    const firstChar = text[valPos];
    const color = typeColor[firstChar]; // {:'blue', [:'green', ...}

    // 绘制色块
    ctx.fillRect(depth * 2, line * rowHeight, width - depth * 2, Math.max(rowHeight, 1));
  }
}
```

禁止：
- ❌ JSON.parse 后遍历对象树
- ❌ 创建节点对象再绘制
- ❌ 只绘制可见区域（失去导航意义）
