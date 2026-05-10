# JSON Pro 骨架屏机制技术规范（P0 级）

> **文档性质**：架构约束文档，不可违背  
> **目标读者**：DeepSeek-V4-Pro（Trae Builder）  
> **核心原则**：零 setTimeout、RAF 状态机驱动、内存预分配、数据零丢失  
> **关联文档**：P0 ARCHITECTURE.md、P1 PERFORMANCE_BUDGET.md、P2 STYLE_GUIDE.md  
> **文件位置**：`docs/SKELETON_SCREEN.md`

---

## 一、问题现状与目标

### 1.1 当前问题
- **现象**：滚动到文件中段（如 100 万行），内容区空白
- **已知修复状态**：
  - ✅ 滚动到底（233 万行）正常显示
  - ✅ 行号同步一致
- **怀疑根因**：骨架屏机制在之前的修复中被移除或破坏，或现有机制不成熟

### 1.2 目标
实现一个**成熟的骨架屏机制**，满足：
1. **拖动时渲染骨架屏**（灰色 shimmer 占位）
2. **拖动结束后释放骨架屏，渲染真实内容**
3. **拖动过程中若停留一段时间，自动渲染真实内容**（防误触/短滚动）
4. **慢速滚动直接渲染真实内容，不显示骨架屏**（优化体验）
5. **不引入新的 BUG**，已有修复（滚动到底、行号同步）**零回归**
6. **零非必要 setTimeout**，全部用 RAF + 状态机
7. **内存机制稳定**，预生成 DOM，缓存复用
8. **数据完整**，不丢行、不跳行、不错位
9. **高分辨率适配**，骨架屏行数覆盖 4K/Retina 大屏

---

## 二、核心设计原则（不可违背）

| 原则 | 说明 | 违反后果 |
|------|------|----------|
| **零 setTimeout** | 所有定时逻辑用 `requestAnimationFrame` + 时间戳差实现 | setTimeout 是赌博，不稳定，内存泄漏风险 |
| **状态机驱动** | 任何 UI 状态变化必须通过显式状态机转换，禁止隐式逻辑 | 状态混乱导致空白/闪烁/内容错位 |
| **预生成 DOM** | 骨架屏 DOM 在初始化时预生成，运行时只 `cloneNode` 或 `display` 切换 | 运行时创建 DOM 导致 GC 压力、滚动卡顿 |
| **DocumentFragment 批量插入** | 真实内容渲染一次性插入，禁止逐行 `appendChild` | 逐行插入导致布局抖动、掉帧 |
| **scrollTop 单一真相源** | 所有位置计算以 `scrollTop` 为唯一基准，禁止多源计算 | 行号错位、内容偏移 |
| **内存上限红线** | 骨架屏缓存 DOM 不超过 80 行，总内存不因此机制增加 > 8MB | 大文件场景内存爆炸 |
| **慢速滚动免骨架** | 滚动速度低于阈值时直接渲染真实内容，不经过骨架屏状态 | 避免短距离滚动不必要的闪烁 |

---

## 三、状态机设计（核心）

### 3.1 状态定义

```typescript
enum ScrollState {
  IDLE = 'IDLE',           // 静止，显示真实内容
  SCROLLING_FAST = 'SCROLLING_FAST', // 快速滚动中，显示骨架屏
  SCROLLING_SLOW = 'SCROLLING_SLOW', // 慢速滚动中，直接渲染真实内容
  RENDERING = 'RENDERING', // 滚动停止，正在渲染真实内容
  READY = 'READY'          // 真实内容渲染完成，可转入 IDLE
}
```

### 3.2 状态转换图

```
                              滚动开始 + 速度 > 阈值
        ┌──────────────────────────────────────────────────┐
        │                                                  ▼
   ┌────────┐    滚动停止 100ms      ┌──────────┐   渲染完成   ┌──────┐
   │  IDLE  │ ──────────────────────► │ RENDERING │ ──────────► │ READY │
   └────────┘                         └──────────┘             └──┬───┘
        ▲                          ▲    ▲                          │
        │                          │    │                          │
        │    滚动开始 + 速度 ≤ 阈值  │    │    停留 300ms 无滚动      │
        └──────────────────────────┘    └──────────────────────────┘
        │                               │
        │    滚动开始 + 速度 > 阈值     │
        └───────────────────────────────┘
        │                               ▼
        │                         ┌───────────────┐
        │                         │ SCROLLING_FAST│ ◄────────────────┐
        │                         │  (骨架屏)      │                  │
        │                         └───────────────┘                  │
        │                               ▲                          │
        │                               └──────────────────────────┘
        │                                    快速滚动中（持续触发 scroll）
        │
        └──────────────────────────────────────────────────────────────┐
                                                                     ▼
                                                              ┌───────────────┐
                                                              │ SCROLLING_SLOW│
                                                              │ (直接渲染真实) │
                                                              └───────────────┘
```

### 3.3 状态转换条件（精确到代码逻辑）

| 转换 | 触发条件 | 动作 |
|------|----------|------|
| `IDLE → SCROLLING_FAST` | `scroll` 事件触发，且滚动速度 > `FAST_SCROLL_THRESHOLD` | 记录 `scrollStartTime`，显示骨架屏 |
| `IDLE → SCROLLING_SLOW` | `scroll` 事件触发，且滚动速度 ≤ `FAST_SCROLL_THRESHOLD` | 直接计算可见范围，渲染真实内容（不经过骨架屏） |
| `SCROLLING_FAST → RENDERING` | RAF 连续检测：`now - lastScrollTime > 100ms` | 隐藏骨架屏，开始渲染真实内容 |
| `SCROLLING_FAST → RENDERING`（停留自动渲染） | 滚动中但 `scrollTop` 连续 300ms 无变化 | 同上，防短滚动误触 |
| `SCROLLING_SLOW → RENDERING` | 滚动停止 100ms | 真实内容已显示，只需确认状态 |
| `RENDERING → READY` | `DocumentFragment` 插入完成 + RAF 一帧后 | 更新状态，清理临时引用 |
| `READY → IDLE` | RAF 下一帧 | 正式完成，可接受新滚动事件 |
| 任何状态 → `SCROLLING_FAST` | 新的 `scroll` 事件到来，速度 > 阈值 | 如果正在 `RENDERING`，**取消当前渲染任务**，回到骨架屏 |
| 任何状态 → `SCROLLING_SLOW` | 新的 `scroll` 事件到来，速度 ≤ 阈值 | 如果正在 `RENDERING`，取消并直接渲染真实内容 |

### 3.4 滚动速度计算

```typescript
// 速度阈值：每毫秒滚动的像素数
const FAST_SCROLL_THRESHOLD = 2; // 2px/ms = 120px/帧@60Hz，约 5 行/帧

function getScrollSpeed(
  currentScrollTop: number,
  lastScrollTop: number,
  currentTime: number,
  lastTime: number
): number {
  const deltaY = Math.abs(currentScrollTop - lastScrollTop);
  const deltaT = currentTime - lastTime;
  return deltaT > 0 ? deltaY / deltaT : 0;
}
```

### 3.5 关键：取消机制

**滚动过程中用户再次滚动，必须能取消正在进行的真实内容渲染**：
- 如果 `RENDERING` 状态接收到新的 `scroll` 事件：
  - 若 `DocumentFragment` 已构建但未插入 → 丢弃 fragment，回到对应滚动状态
  - 若已插入 → 标记为脏，下一帧重新计算可见范围，回到对应滚动状态
- **禁止**：在已插入真实 DOM 后强行移除再插入骨架屏（会导致闪烁）

---

## 四、骨架屏实现细节

### 4.1 高分辨率适配（关键）

```typescript
// 根据视口高度动态计算骨架屏行数，确保覆盖 4K/Retina 大屏
function getSkeletonPoolSize(): number {
  const viewportHeight = window.innerHeight;
  const lineHeight = 24; // LINE_HEIGHT
  const visibleLines = Math.ceil(viewportHeight / lineHeight);
  // 覆盖可见区域 + 缓冲，最小 60 行，最大 120 行
  return Math.min(120, Math.max(60, visibleLines + 20));
}

const SKELETON_POOL_SIZE = getSkeletonPoolSize();
```

### 4.2 DOM 结构

```html
<!-- 预生成，初始化时创建，运行时只切换 display -->
<div id="skeleton-pool" style="display: none;">
  <div class="skeleton-row" data-skeleton>
    <div class="skeleton-indent"></div>
    <div class="skeleton-line skeleton-shimmer"></div>
    <div class="skeleton-line skeleton-shimmer short"></div>
  </div>
  <!-- 共 SKELETON_POOL_SIZE 个 .skeleton-row，cloneNode 来源 -->
</div>

<!-- 可见容器 -->
<div id="viewport">
  <div id="skeleton-layer" class="skeleton-hidden">
    <!-- 运行时 cloneNode 插入，最多 SKELETON_POOL_SIZE 行 -->
  </div>
  <div id="content-layer" class="content-active">
    <!-- 真实内容，DocumentFragment 批量插入 -->
  </div>
</div>
```

### 4.3 CSS 样式（P2 风格约束）

```css
/* 浅色扁平风格，参考 Notion/Figma/Linear */
.skeleton-row {
  height: 24px; /* 必须与 LINE_HEIGHT 一致 */
  padding: 4px 12px 4px 0;
  display: flex;
  gap: 8px;
  align-items: center;
  box-sizing: border-box;
}

.skeleton-indent {
  width: 0;
  height: 100%;
  flex-shrink: 0;
  /* 动态设置 width 模拟缩进层级 */
}

.skeleton-line {
  height: 12px;
  border-radius: 4px;
  background: #e5e7eb; /* 浅灰，Notion 风格 */
  flex: 1;
  min-width: 60px;
}

.skeleton-line.short {
  flex: 0.3;
  max-width: 120px;
}

/* shimmer 动画 */
.skeleton-shimmer {
  background: linear-gradient(
    90deg,
    #e5e7eb 25%,
    #f3f4f6 50%,
    #e5e7eb 75%
  );
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite linear;
}

@keyframes shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

/* 状态切换 - 用 opacity 替代 display 可避免部分重排 */
.skeleton-active {
  display: block;
  opacity: 1;
}

.skeleton-hidden {
  display: none;
  opacity: 0;
}

.content-active {
  display: block;
  opacity: 1;
}

.content-hidden {
  display: none;
  opacity: 0;
}
```

### 4.4 预生成逻辑（初始化时执行一次）

```typescript
// 内存预分配，只执行一次
const skeletonPool: HTMLElement[] = [];

function initSkeletonPool(): void {
  const poolSize = getSkeletonPoolSize();
  const template = document.createElement('div');
  template.className = 'skeleton-row';
  template.innerHTML = `
    <div class="skeleton-indent"></div>
    <div class="skeleton-line skeleton-shimmer"></div>
    <div class="skeleton-line skeleton-shimmer short"></div>
  `;

  for (let i = 0; i < poolSize; i++) {
    skeletonPool.push(template.cloneNode(true) as HTMLElement);
  }
}
```

### 4.5 骨架屏显示逻辑（SCROLLING_FAST 状态）

```typescript
function showSkeleton(visibleCount: number): void {
  const layer = document.getElementById('skeleton-layer')!;
  const contentLayer = document.getElementById('content-layer')!;

  // 切换显示
  layer.className = 'skeleton-active';
  contentLayer.className = 'content-hidden';

  // 只填充可见区域需要行数，不超过池大小
  const count = Math.min(visibleCount, skeletonPool.length);

  // 清空后重新填充
  layer.innerHTML = '';
  const fragment = document.createDocumentFragment();
  for (let i = 0; i < count; i++) {
    fragment.appendChild(skeletonPool[i].cloneNode(true));
  }
  layer.appendChild(fragment);
}
```

---

## 五、真实内容渲染细节（RENDERING / SCROLLING_SLOW 状态）

### 5.1 渲染流程

```typescript
function renderRealContent(
  startIndex: number,
  endIndex: number,
  memoryIndex: MemoryIndex
): DocumentFragment {
  const fragment = document.createDocumentFragment();

  for (let i = startIndex; i < endIndex; i++) {
    const node = memoryIndex.getNode(i); // TypedArray 索引，O(1)
    const row = createContentRow(node, i); // 复用现有行渲染逻辑
    fragment.appendChild(row);
  }

  return fragment;
}
```

### 5.2 慢速滚动直接渲染（SCROLLING_SLOW）

```typescript
function handleSlowScroll(scrollTop: number): void {
  // 直接渲染真实内容，不经过骨架屏
  const { start, end } = getVisibleRange(scrollTop);
  const fragment = renderRealContent(start, end, memoryIndex);

  const skeletonLayer = document.getElementById('skeleton-layer')!;
  const contentLayer = document.getElementById('content-layer')!;

  contentLayer.innerHTML = '';
  contentLayer.appendChild(fragment);

  skeletonLayer.className = 'skeleton-hidden';
  contentLayer.className = 'content-active';
}
```

### 5.3 渲染完成切换（RENDERING 状态）

```typescript
function commitRender(fragment: DocumentFragment): void {
  const skeletonLayer = document.getElementById('skeleton-layer')!;
  const contentLayer = document.getElementById('content-layer')!;

  // 一次性插入
  contentLayer.innerHTML = '';
  contentLayer.appendChild(fragment);

  // 切换显示
  skeletonLayer.className = 'skeleton-hidden';
  contentLayer.className = 'content-active';
}
```

---

## 六、RAF 驱动的主循环（核心，零 setTimeout）

### 6.1 时间戳记录

```typescript
interface ScrollMetrics {
  lastScrollTime: number;      // 最后一次 scroll 事件时间戳
  scrollStartTime: number;     // 当前滚动段开始时间
  lastScrollTop: number;       // 上一帧 scrollTop
  lastScrollSpeed: number;     // 上一帧滚动速度
  currentState: ScrollState;
  rafId: number | null;
  pendingFragment: DocumentFragment | null; // 取消机制用
  isFirstScroll: boolean;      // 用于判断滚动开始
}
```

### 6.2 RAF 循环实现

```typescript
const metrics: ScrollMetrics = {
  lastScrollTime: 0,
  scrollStartTime: 0,
  lastScrollTop: 0,
  lastScrollSpeed: 0,
  currentState: ScrollState.IDLE,
  rafId: null,
  pendingFragment: null,
  isFirstScroll: false,
};

function onScroll(): void {
  const now = performance.now();
  const scrollTop = container.scrollTop;

  // 计算滚动速度
  const speed = getScrollSpeed(
    scrollTop,
    metrics.lastScrollTop,
    now,
    metrics.lastScrollTime
  );

  metrics.lastScrollTime = now;
  metrics.lastScrollSpeed = speed;

  if (metrics.currentState === ScrollState.IDLE) {
    // 从静止开始滚动 → 判断快慢
    metrics.scrollStartTime = now;
    metrics.isFirstScroll = true;

    if (speed > FAST_SCROLL_THRESHOLD) {
      metrics.currentState = ScrollState.SCROLLING_FAST;
      showSkeleton(getVisibleCount());
    } else {
      metrics.currentState = ScrollState.SCROLLING_SLOW;
      handleSlowScroll(scrollTop);
    }
  } else if (metrics.currentState === ScrollState.RENDERING) {
    // 渲染中用户又滚动了 → 取消渲染
    metrics.pendingFragment = null;

    if (speed > FAST_SCROLL_THRESHOLD) {
      metrics.currentState = ScrollState.SCROLLING_FAST;
      showSkeleton(getVisibleCount());
    } else {
      metrics.currentState = ScrollState.SCROLLING_SLOW;
      handleSlowScroll(scrollTop);
    }
  }
  // SCROLLING_FAST / SCROLLING_SLOW：持续滚动，不做任何事

  // 确保 RAF 循环在跑
  if (!metrics.rafId) {
    metrics.rafId = requestAnimationFrame(rafLoop);
  }
}

function rafLoop(): void {
  const now = performance.now();
  const timeSinceLastScroll = now - metrics.lastScrollTime;
  const scrollTop = container.scrollTop;

  // 停留自动渲染：滚动中但位置没变超过 300ms
  const isStationary = scrollTop === metrics.lastScrollTop;
  const stationaryTime = isStationary ? timeSinceLastScroll : 0;

  switch (metrics.currentState) {
    case ScrollState.SCROLLING_FAST:
      // 条件1：停止滚动超过 100ms
      // 条件2：滚动中停留超过 300ms（scrollTop 未变）
      if (timeSinceLastScroll > 100 || stationaryTime > 300) {
        metrics.currentState = ScrollState.RENDERING;
        const { start, end } = getVisibleRange(scrollTop);
        const fragment = renderRealContent(start, end, memoryIndex);
        metrics.pendingFragment = fragment;

        // 检查是否被取消
        if (metrics.pendingFragment === fragment) {
          commitRender(fragment);
          metrics.currentState = ScrollState.READY;
          metrics.pendingFragment = null;
        }
      }
      break;

    case ScrollState.SCROLLING_SLOW:
      // 慢速滚动停止 100ms 后转入 IDLE
      if (timeSinceLastScroll > 100) {
        metrics.currentState = ScrollState.READY;
      }
      break;

    case ScrollState.READY:
      metrics.currentState = ScrollState.IDLE;
      break;

    case ScrollState.IDLE:
      // 停止 RAF 循环，节省资源
      metrics.rafId = null;
      return;
  }

  metrics.lastScrollTop = scrollTop;

  // 继续循环（非 IDLE 状态需要持续检测）
  if (metrics.currentState !== ScrollState.IDLE) {
    metrics.rafId = requestAnimationFrame(rafLoop);
  } else {
    metrics.rafId = null;
  }
}
```

### 6.3 关键：为什么不用 setTimeout

| setTimeout 问题 | RAF 解决方案 |
|-----------------|--------------|
| 延迟不稳定（4ms ~ 数百 ms） | 与显示器刷新同步（16.6ms@60Hz） |
| 后台标签页被节流（可能 1s+） | 后台时暂停，切回前台立即恢复 |
| 嵌套调用导致内存泄漏 | 单一 rafId，可 cancelAnimationFrame |
| 多 setTimeout 竞争条件 | 单一状态机，无竞争 |
| 无法与渲染管线同步 | 在 paint 前执行，避免布局抖动 |

---

## 七、数据完整性保证

### 7.1 行号计算（单一真相源）

```typescript
// 唯一正确的行号计算方式，所有地方必须用此函数
function getLineNumber(scrollTop: number, indexInVisibleRange: number): number {
  const startIndex = Math.floor(scrollTop / LINE_HEIGHT);
  return startIndex + indexInVisibleRange;
}

// 底部状态栏百分比
function getPercent(scrollTop: number, totalLines: number): string {
  const currentLine = Math.floor(scrollTop / LINE_HEIGHT);
  return ((currentLine / totalLines) * 100).toFixed(1) + '%';
}
```

### 7.2 可见范围计算

```typescript
function getVisibleRange(scrollTop: number): { start: number; end: number } {
  const start = Math.floor(scrollTop / LINE_HEIGHT);
  const visibleCount = Math.ceil(viewportHeight / LINE_HEIGHT);
  const end = Math.min(start + visibleCount + BUFFER_LINES, totalLines);
  return { start, end };
}
```

### 7.3 防丢行/跳行检查

- **startIndex**：`Math.floor(scrollTop / LINE_HEIGHT)` — 必须向下取整
- **endIndex**：`start + visibleCount + BUFFER` — 必须向上取整 + 缓冲
- **spacer 高度**：`totalLines * LINE_HEIGHT` — 必须精确，不能用估算
- **滚动到底验证**：`scrollTop + viewportHeight >= spacerHeight - 1` 时显示最后一行

---

## 八、与现有修复的兼容性约束

### 8.1 已有修复（零回归）

| 修复项 | 文件/位置 | 约束 |
|--------|---------|------|
| 滚动到底 | spacer 高度计算 | 骨架屏机制不得修改 `spacer.height` 计算逻辑 |
| 行号同步 | `scrollTop / LINE_HEIGHT` 基准 | 骨架屏机制不得引入第二套行号计算 |

### 8.2 集成点

骨架屏机制作为**独立层**（`#skeleton-layer`）叠加在内容层之上，不修改：
- `VirtualScroller.vue` 的滚动计算逻辑
- `MemoryIndex` 的索引查询
- `StreamingValidator` 的解析逻辑

只修改：
- 滚动事件处理函数（增加状态机调用）
- 渲染函数（增加骨架屏/真实内容切换）
- 初始化逻辑（增加骨架屏 DOM 预生成）

---

## 九、验证清单（Trae 执行后必须逐项确认）

### 9.1 功能验证

- [ ] **慢速滚动**：速度 < 2px/ms 时直接显示真实内容，无骨架屏闪烁
- [ ] **快速滚动**：速度 > 2px/ms 时显示骨架屏（灰色 shimmer）
- [ ] **停止渲染**：快速滚动停止 100ms 内显示真实内容
- [ ] **停留自动渲染**：滚动中停留 300ms 自动显示真实内容
- [ ] **滚动到底**：显示第 233 万行（不回归）
- [ ] **行号一致**：内容区行号与底部状态栏一致（不回归）
- [ ] **百分比正确**：底部百分比随滚动实时更新

### 9.2 稳定性验证

- [ ] 代码中无任何 `setTimeout` / `setInterval`（全局搜索确认）
- [ ] RAF 循环在 IDLE 状态正确停止（不空转）
- [ ] 快速连续滚动无闪烁、无空白
- [ ] 取消机制工作正常（滚动中打断渲染不崩溃）
- [ ] 慢速→快速切换时状态转换正确

### 9.3 内存验证

- [ ] 骨架屏预生成行数 = `Math.min(120, Math.max(60, visibleLines + 20))`
- [ ] 无运行时 DOM 创建（只 cloneNode）
- [ ] 无闭包泄漏（metrics 对象可清理）
- [ ] 50MB 文件内存 < 130MB（不回归）

### 9.4 数据完整性验证

- [ ] 不丢行（每行内容正确）
- [ ] 不跳行（行号连续）
- [ ] 不错位（scrollTop 与内容匹配）
- [ ] 高分辨率屏幕（4K）下骨架屏覆盖完整视口

### 9.5 性能验证

- [ ] 快速滚动帧率 > 45fps
- [ ] 骨架屏 shimmer 动画不导致主线程阻塞
- [ ] 真实内容渲染时间 < 16ms（一帧内完成）

---

## 十、Trae 执行约束（P5 级）

1. **修改前**：输出修改计划（改哪些文件、哪些函数、增减行数），等待用户确认
2. **修改中**：
   - 禁止修改已有修复的代码（滚动到底、行号同步）
   - 禁止重命名与骨架屏无关的方法/变量
   - 禁止修改 CSS 时连带修改逻辑代码
3. **修改后**：输出修改报告（问题+根因+方案+修改文件+验证结果）
4. **紧急制动**：若改动 > 3 文件 / 改方法签名 / 与架构冲突，必须停止询问
5. **上下文截断**：若告知上下文被截断，必须停止，禁止猜测

---

## 十一、决策记录

| 决策 | 原因 | 时间 |
|------|------|------|
| 骨架屏用 RAF 替代 setTimeout | setTimeout 不稳定，是赌博 | 0510 |
| 预生成动态行数（60-120） | 覆盖 4K/Retina 高分辨率大屏 | 0510 |
| 慢速滚动免骨架屏（阈值 2px/ms） | 短距离滚动不需要闪烁，直接渲染更流畅 | 0510 |
| 停留 300ms 自动渲染 | 防短滚动误触，提升体验 | 0510 |
| 取消机制（pendingFragment） | 避免滚动中插入真实内容导致错位 | 0510 |
| 骨架屏作为独立层 | 不修改已有修复逻辑，零回归 | 0510 |

---

*本文档为 P0 级架构约束，DeepSeek-V4-Pro 实现骨架屏机制时必须严格遵循。*
