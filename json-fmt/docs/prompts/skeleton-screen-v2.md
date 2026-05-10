# JSON Pro 骨架屏机制深度修复规范（P0 级 - 第2轮迭代）

> **文档性质**：架构约束 + 深度排查清单，不可违背  
> **目标读者**：DeepSeek-V4-Pro（Trae Builder）  
> **核心原则**：零 setTimeout、RAF 状态机驱动、内存预分配、数据零丢失  
> **关联文档**：P0 ARCHITECTURE.md、P1 PERFORMANCE_BUDGET.md、P2 STYLE_GUIDE.md、SKELETON_SCREEN.md  
> **文件位置**：`docs/SKELETON_SCREEN_V2.md`

---

## 一、当前 BUG 现象（2026-05-10 实测）

### BUG 1：快速滚动后内容区显示真实内容而非骨架屏（图1）
- **现象**：快速滚动后，内容区显示真实数据（第22-29行），但底部状态栏显示"第32行"
- **异常点**：
  - 内容区显示的是真实内容，不是骨架屏 → 状态机未进入 `SCROLLING_FAST`
  - 行号22-29与底部"第32行"不一致 → 可见范围计算与状态栏计算基准不同
  - 快速滚动过程中应该显示骨架屏，但显示了真实内容 → 速度判断逻辑失效或 RAF 循环未正确启动

### BUG 2：慢速滚动后内容区完全空白（图2）
- **现象**：慢速滚动后，内容区完全空白，无任何内容
- **异常点**：
  - 慢速滚动应该直接渲染真实内容（`SCROLLING_SLOW`），但内容区空白
  - 或：慢速滚动被误判为快速滚动，骨架屏显示后未正确释放
  - 或：真实内容渲染完成但未正确插入 DOM
  - 或：RAF 循环在 `RENDERING` 状态后未正确转入 `READY → IDLE`

---

## 二、根因分析（禁止表面修复，必须深挖）

### 2.1 状态机实现缺陷（高概率根因）

**怀疑点1：RAF 循环未正确启动或过早停止**
- 代码中可能存在 `metrics.rafId = null` 的时机错误
- `onScroll` 触发后，RAF 循环可能未启动（`metrics.rafId` 已有值但循环已停止）
- 或：RAF 循环启动后，第一帧就判断为 `IDLE` 并停止，导致后续滚动事件无法触发状态转换

**排查命令**：
```typescript
// 在 rafLoop 第一行加日志
console.log('[RAF] state:', metrics.currentState, 'rafId:', metrics.rafId, 'timeSinceLastScroll:', timeSinceLastScroll);

// 在 onScroll 加日志
console.log('[SCROLL] state:', metrics.currentState, 'speed:', speed, 'scrollTop:', scrollTop);
```

**怀疑点2：状态转换条件错误**
- `SCROLLING_FAST → RENDERING` 的条件可能过于宽松，导致快速滚动中就被判定为"停止"
- 或：`SCROLLING_SLOW` 的处理逻辑未正确显示内容
- 或：`READY → IDLE` 转换后，`onScroll` 再次触发时，状态判断错误

**怀疑点3：取消机制导致 DOM 丢失**
- `pendingFragment = null` 后，如果真实内容已部分插入，再次滚动可能导致内容层被清空但未重新填充
- 或：`commitRender` 后骨架屏层隐藏，但内容层未正确显示（className 切换失败）

### 2.2 可见范围计算错误（中概率根因）

**怀疑点4：`getVisibleRange` 返回范围与 `getLineNumber` 不一致**
- 内容区显示第22-29行，但状态栏显示第32行
- 说明 `getVisibleRange` 计算的 `startIndex` 与状态栏用的 `scrollTop / LINE_HEIGHT` 不同
- 可能原因：
  - `getVisibleRange` 用了 `Math.ceil` 而状态栏用了 `Math.floor`
  - `BUFFER_LINES` 偏移未统一
  - 骨架屏显示时用了不同的计算路径

**排查命令**：
```typescript
console.log('[RANGE] scrollTop:', scrollTop, 'start:', start, 'end:', end, 'statusBarLine:', Math.floor(scrollTop / LINE_HEIGHT));
```

### 2.3 DOM 操作错误（中概率根因）

**怀疑点5：DocumentFragment 插入时机错误**
- 慢速滚动空白可能是因为 `DocumentFragment` 构建成功但未插入
- 或：插入后 `contentLayer.className` 切换失败
- 或：`innerHTML = ''` 清空后，新内容未 append

**排查命令**：
```typescript
console.log('[DOM] fragment children:', fragment.childNodes.length, 'contentLayer children:', contentLayer.childNodes.length, 'skeleton display:', getComputedStyle(skeletonLayer).display);
```

### 2.4 滚动事件绑定错误（低概率但致命）

**怀疑点6：滚动事件监听器丢失或重复**
- 可能用了 `passive: true` 但浏览器不支持
- 或：事件监听器在状态转换中被移除未重新添加
- 或：多个监听器竞争，一个触发 `onScroll` 另一个触发旧逻辑

---

## 三、深度修复要求（禁止表面修复）

### 3.1 必须修复的核心问题

| 优先级 | 问题 | 修复标准 |
|--------|------|----------|
| P0 | 快速滚动未显示骨架屏 | 速度>阈值时必须进入`SCROLLING_FAST`，内容区显示灰色shimmer |
| P0 | 慢速滚动后内容空白 | 速度≤阈值时必须进入`SCROLLING_SLOW`，内容区立即显示真实内容 |
| P0 | 行号与状态栏不一致 | 内容区第一行行号必须等于`Math.floor(scrollTop / LINE_HEIGHT)` |
| P1 | 状态机转换不稳定 | 连续滚动时状态不抖动，不反复`SCROLLING→RENDERING→SCROLLING` |
| P1 | 取消机制导致内容丢失 | 滚动中打断渲染后，新状态必须正确显示内容（骨架或真实） |

### 3.2 禁止的表面修复（必须深挖）

❌ **禁止**：加 setTimeout 延迟修复（"加个100ms延迟就好了"）  
✅ **必须**：找到 RAF 循环或状态转换的真正错误

❌ **禁止**：直接修改 `getVisibleRange` 的取整方式（"把ceil改成floor就好了"）  
✅ **必须**：统一所有行号计算的基准，确保单一真相源

❌ **禁止**：在空白时强制重新渲染（"空白时调用一次render就好了"）  
✅ **必须**：找到空白的原因（状态错误/DOM未插入/计算错误）

❌ **禁止**：增加骨架屏行数掩盖问题（"行数不够所以空白"）  
✅ **必须**：骨架屏机制本身正确工作，行数只影响覆盖范围

---

## 四、关联检查清单（必须逐一排查）

### 4.1 状态机关联检查

- [ ] **RAF 循环生命周期**：
  - [ ] `onScroll` 触发时，`metrics.rafId` 为 null 时是否正确启动 RAF？
  - [ ] `rafLoop` 中 `IDLE` 状态停止后，再次滚动是否能重新启动 RAF？
  - [ ] 是否存在 RAF 循环"僵尸"状态（rafId 有值但循环已停止）？

- [ ] **状态转换完整性**：
  - [ ] 每个状态转换是否都有对应的日志输出？
  - [ ] 是否存在未定义的状态转换路径（如 `RENDERING → SCROLLING_FAST` 未处理）？
  - [ ] 状态转换时是否清理了上一状态的临时数据（pendingFragment、时间戳等）？

- [ ] **滚动速度计算**：
  - [ ] `getScrollSpeed` 在首次滚动时（`isFirstScroll`）是否返回正确值？
  - [ ] 速度计算是否用了正确的时间差（`now - lastScrollTime` 还是 `now - scrollStartTime`）？
  - [ ] 阈值比较是否用了 `>` 而不是 `>=`（边界条件）？

### 4.2 DOM 操作关联检查

- [ ] **骨架屏层**：
  - [ ] `skeleton-layer` 初始化时是否正确创建了？
  - [ ] `showSkeleton` 被调用时，`skeleton-layer` 是否确实在 DOM 中？
  - [ ] `cloneNode(true)` 是否复制了所有子节点（shimmer 动画元素）？

- [ ] **内容层**：
  - [ ] `content-layer` 在 `SCROLLING_FAST` 时是否被正确隐藏？
  - [ ] `commitRender` 后 `content-layer` 是否被正确显示？
  - [ ] `innerHTML = ''` 是否清空了之前的内容？
  - [ ] `DocumentFragment` 插入后，`contentLayer.childNodes.length` 是否 > 0？

- [ ] **层叠顺序**：
  - [ ] 骨架屏层和内容层是否在同一个父容器内？
  - [ ] 是否存在 CSS `z-index` 导致内容被骨架屏遮挡？
  - [ ] 是否存在 `position: absolute` 导致布局错位？

### 4.3 计算逻辑关联检查

- [ ] **行号一致性**：
  - [ ] 内容区第一行的行号 = `Math.floor(scrollTop / LINE_HEIGHT)`？
  - [ ] 状态栏显示的行号 = `Math.floor(scrollTop / LINE_HEIGHT)`？
  - [ ] 底部百分比 = `Math.floor(scrollTop / LINE_HEIGHT) / totalLines`？
  - [ ] 三个计算是否用了同一个函数？

- [ ] **可见范围**：
  - [ ] `getVisibleRange` 的 `start` 是否与状态栏行号一致？
  - [ ] `end` 是否不超过 `totalLines`？
  - [ ] 返回的 range 是否被骨架屏和真实内容渲染共用？

- [ ] **spacer 高度**：
  - [ ] `spacer.height = totalLines * LINE_HEIGHT` 是否被骨架屏机制修改？
  - [ ] 滚动到底时 `scrollTop + viewportHeight >= spacerHeight - 1` 是否仍成立？

### 4.4 内存关联检查

- [ ] **DOM 池**：
  - [ ] `skeletonPool` 是否在初始化时正确填充？
  - [ ] 运行时是否有新的 `createElement` 调用？
  - [ ] `cloneNode` 是否每次都创建新对象（应该只创建一次，后续 clone）？

- [ ] **Fragment 清理**：
  - [ ] `pendingFragment` 取消后是否被垃圾回收？
  - [ ] `commitRender` 后 `pendingFragment` 是否设为 null？
  - [ ] 是否存在闭包引用导致 Fragment 无法回收？

### 4.5 事件关联检查

- [ ] **滚动事件**：
  - [ ] `container.addEventListener('scroll', onScroll)` 是否在初始化时绑定？
  - [ ] 是否存在 `removeEventListener` 导致事件丢失？
  - [ ] 是否用了 `{ passive: true }`？
  - [ ] 是否存在防抖/节流函数干扰？

- [ ] **resize 事件**：
  - [ ] 窗口 resize 后 `SKELETON_POOL_SIZE` 是否重新计算？
  - [ ] resize 后可见范围是否重新计算？
  - [ ] resize 时是否处于正确状态（不应该是 `RENDERING`）？

---

## 五、调试日志规范（必须实现）

在修复过程中，**必须**在以下位置添加日志，输出到控制台：

```typescript
// 1. onScroll 入口
console.log('[JSONPro:Scroll] state=%s scrollTop=%d speed=%.2f threshold=%d', 
  metrics.currentState, scrollTop, speed, FAST_SCROLL_THRESHOLD);

// 2. 状态转换
console.log('[JSONPro:State] %s → %s (reason=%s)', 
  oldState, newState, reason);

// 3. RAF 循环
console.log('[JSONPro:RAF] state=%s timeSinceLastScroll=%d stationaryTime=%d', 
  metrics.currentState, timeSinceLastScroll, stationaryTime);

// 4. 可见范围
console.log('[JSONPro:Range] start=%d end=%d statusBarLine=%d', 
  start, end, Math.floor(scrollTop / LINE_HEIGHT));

// 5. DOM 操作
console.log('[JSONPro:DOM] skeletonChildren=%d contentChildren=%d skeletonDisplay=%s contentDisplay=%s', 
  skeletonLayer.childNodes.length, contentLayer.childNodes.length, 
  getComputedStyle(skeletonLayer).display, getComputedStyle(contentLayer).display);

// 6. 渲染完成
console.log('[JSONPro:Render] type=%s lineCount=%d duration=%dms', 
  'skeleton' | 'real', count, performance.now() - renderStart);
```

**修复完成后，日志可以注释掉，但代码必须保留（用 `// DEBUG:` 前缀）**

---

## 六、修复后验证清单（必须逐项通过）

### 6.1 基础功能

- [ ] **快速滚动**：拖动滚动条快速下滑，内容区显示灰色 shimmer 骨架屏（不是真实内容）
- [ ] **快速停止**：停止拖动后 100ms 内，骨架屏消失，真实内容出现
- [ ] **慢速滚动**：慢速拖动，内容区直接显示真实内容，无骨架屏闪烁
- [ ] **慢速停止**：停止后内容保持显示，无空白

### 6.2 数据一致性

- [ ] **行号一致**：内容区第一行行号 = 状态栏显示行号 = `Math.floor(scrollTop / LINE_HEIGHT)`
- [ ] **百分比正确**：底部百分比 = 当前行 / 总行数
- [ ] **不丢行**：任意滚动位置，内容区行号连续（如显示22-29，则下一屏30-37）
- [ ] **不跳行**：不会出现行号跳跃（如22-29后直接40-47）

### 6.3 边界场景

- [ ] **滚动到底**：拖到最底部，显示最后一行（233万行），状态栏显示"第 2330000 行"
- [ ] **滚动到顶**：拖到最顶部，显示第1行，状态栏显示"第 1 行"
- [ ] **中段停留**：滚到100万行后停止300ms，自动显示真实内容
- [ ] **连续快速滚动**：快速上下反复滚动，无空白、无闪烁、状态不抖动

### 6.4 性能

- [ ] **无 setTimeout**：全局搜索 `setTimeout` / `setInterval`，结果为 0
- [ ] **RAF 停止**：静止状态下 `metrics.rafId` 为 null（控制台验证）
- [ ] **内存稳定**：50MB 文件内存 < 130MB，骨架屏机制增加 < 8MB
- [ ] **帧率**：快速滚动时帧率 > 45fps

---

## 七、Trae 执行约束（P5 级 - 更严格）

1. **修改前**：
   - 输出**根因分析报告**（不是修改计划），说明你认为的 BUG 根因
   - 输出**关联影响分析**，说明修复这个根因可能影响的其他模块
   - 等待用户确认根因后再输出修改计划

2. **修改中**：
   - 每修改一个文件，输出该文件的**变更摘要**（改了什么、为什么）
   - 禁止修改已有修复的代码（滚动到底、行号同步）
   - 禁止重命名与骨架屏无关的方法/变量
   - 禁止修改 CSS 时连带修改逻辑代码
   - **新增**：每修改一处，必须说明是否引入了新的 setTimeout（如果引入了，必须说明为什么 RAF 无法实现）

3. **修改后**：
   - 输出**修复报告**：根因 + 方案 + 修改文件 + 验证结果
   - 输出**回归风险清单**：修复可能影响的其他功能
   - 输出**未解决问题**：如果还有已知未修复的问题，必须列出

4. **紧急制动**（比 P5 更严格）：
   - 改动 > 2 文件 → 必须停止询问（不是3个）
   - 改方法签名 → 必须停止询问
   - 与架构冲突 → 必须停止询问
   - 需要引入 setTimeout → 必须停止询问并说明原因
   - 上下文截断 → 必须停止，禁止猜测

---

## 八、决策记录（新增）

| 决策 | 原因 | 时间 |
|------|------|------|
| 骨架屏用 RAF 替代 setTimeout | setTimeout 不稳定，是赌博 | 0510 |
| 预生成动态行数（60-120） | 覆盖 4K/Retina 高分辨率大屏 | 0510 |
| 慢速滚动免骨架屏（阈值 2px/ms） | 短距离滚动不需要闪烁，直接渲染更流畅 | 0510 |
| 停留 300ms 自动渲染 | 防短滚动误触，提升体验 | 0510 |
| 取消机制（pendingFragment） | 避免滚动中插入真实内容导致错位 | 0510 |
| **骨架屏作为独立层** | 不修改已有修复逻辑，零回归 | 0510 |
| **第2轮深度修复** | 第1轮实现存在状态机不稳定、DOM操作错误、行号不一致等表面修复 | 0510 |
| **强制调试日志** | 表面现象无法定位根因，必须用日志追踪状态机全流程 | 0510 |
| **关联检查清单** | 禁止只修表面，必须排查所有关联影响 | 0510 |

---

*本文档为 P0 级架构约束，DeepSeek-V4-Pro 第2轮修复骨架屏机制时必须严格遵循。禁止表面修复，必须深挖根因。*
