# VirtualScroller 骨架屏与滚动渲染方案

## 目标
- 快速滚动时：骨架屏即时响应（<16ms）
- 停止滚动后：200ms 内渲染真实内容
- 233万行大文件滚动流畅 60fps

## 状态机

```
IDLE → 静止，显示真实内容
SCROLLING → 快速滚动，显示骨架屏  
DEBOUNCING → 减速中，保持骨架屏
IDLE → 停止，渲染真实内容
```

## 核心逻辑

### 1. 滚动检测

```javascript
// 计算滚动速度
const deltaY = scrollTop - lastScrollTop;
const deltaTime = now - lastScrollTime;
const velocity = Math.abs(deltaY / deltaTime);

// 速度 > 300px/ms 视为快速滚动
if (velocity > 300) {
  showSkeleton();
} else {
  // 200ms 后停止，渲染真实内容
  clearTimeout(timer);
  timer = setTimeout(() => renderContent(), 200);
}
```

### 2. 骨架屏渲染

```javascript
// 预生成 30 行骨架 DOM，滚动时直接复用
function generateSkeleton() {
  const fragment = document.createDocumentFragment();
  for (let i = 0; i < 30; i++) {
    const line = document.createElement('div');
    line.className = 'skeleton-line';
    line.style.height = '28px';
    line.style.paddingLeft = (Math.random() * 8 * 20 + 16) + 'px';

    const content = document.createElement('div');
    content.className = 'skeleton-content';
    content.style.width = (30 + Math.random() * 60) + '%';

    line.appendChild(content);
    fragment.appendChild(line);
  }
  return fragment;
}
```

### 3. 真实内容渲染

```javascript
function renderContent(scrollTop) {
  const start = Math.floor(scrollTop / 28) - 5;
  const end = start + 40;

  // 从 MemoryIndex 获取数据
  // 只格式化可见的 30 行
  // 缓存已格式化的行
}
```

## CSS

```css
.skeleton-line {
  height: 28px;
  display: flex;
  align-items: center;
  margin: 2px 0;
}

.skeleton-content {
  height: 60%;
  border-radius: 2px;
  background: linear-gradient(90deg, #f0f0f0, #e8e8e8, #f0f0f0);
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
}

@keyframes shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
```

## 修改文件

### VirtualScroller.vue

1. 添加 `isSkeleton` 状态
2. 修改 `onScroll`：速度检测 + 防抖
3. 添加骨架屏模板（v-if 切换）
4. 添加 CSS

## 验证

- [ ] 快速滚动显示灰色动画条
- [ ] 停止 200ms 后显示真实 JSON
- [ ] 不卡顿，60fps
- [ ] 内存 < 50MB

## 禁止修改

- MemoryIndex.js
- StreamingValidator.js
- 搜索功能
