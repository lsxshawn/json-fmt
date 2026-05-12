<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import FolderIcon from './icons/FolderIcon.vue';
import TriangleIcon from './icons/TriangleIcon.vue';

const props = defineProps({
  visibleNodes: {
    type: Array,
    default: () => []
  },
  totalNodes: {
    type: Number,
    default: 0
  },
  currentFile: {
    type: Object,
    default: null
  },
  parseStatus: {
    type: String,
    default: ''
  },
  errorMessage: {
    type: String,
    default: ''
  },
  onNeedNodes: {
    type: Function,
    default: null
  },
  jumpToLine: {
    type: Number,
    default: -1
  },
  searchHighlightLine: {
    type: Number,
    default: -1
  },
  flatVisibleStart: {
    type: Number,
    default: 0
  },
  flatVisibleEnd: {
    type: Number,
    default: 0
  },
  jumpTrigger: {
    type: Number,
    default: 0
  }
});

const emit = defineEmits([
  'toggleNode',
  'scroll',
  'selectNode',
  'copyPath',
  'copyValue',
  'pasteContent',
  'scrollData'
]);

const containerRef = ref(null);
const localScrollTop = ref(0);
const containerHeight = ref(600);
const ITEM_HEIGHT = 28;
const BUFFER_SIZE = 10;
const highlightedNodeId = ref(null);

// ─── State machine per SKELETON_SCREEN.md P0 spec ───
const ScrollState = Object.freeze({
  IDLE: 'IDLE',
  SCROLLING_FAST: 'SCROLLING_FAST',
  SCROLLING_SLOW: 'SCROLLING_SLOW',
  RENDERING: 'RENDERING',
  READY: 'READY'
});

// 双重判断：delta大→拖拽(低阈值)，delta小→滚轮(高阈值)
const DRAG_DELTA_THRESHOLD = 200;
const FAST_THRESHOLD_DRAG = 2;
const FAST_THRESHOLD_WHEEL = 10;

const STOP_DETECTION_THRESHOLD = 30;

const scrollState = ref(ScrollState.IDLE);

// RAF metrics per P0 spec
const lastScrollTop = ref(0);
const lastScrollTime = ref(0);
const lastDisplayScrollTop = ref(0);
const scrollStartTime = ref(0);
const lastWheelTime = ref(0);
let rafId = null;

// Skeleton: dynamic pool size covering 4K/Retina displays
const SKELETON_POOL_SIZE = computed(() => {
  const visibleLines = Math.ceil(containerHeight.value / ITEM_HEIGHT);
  return Math.min(120, Math.max(60, visibleLines + 20));
});
const skeletonTopLine = ref(0);
const showSkeleton = computed(() => {
  if (scrollState.value === ScrollState.SCROLLING_FAST) return true;
  if (scrollState.value === ScrollState.RENDERING) return true;
  if (scrollState.value !== ScrollState.IDLE && visibleItems.value.length === 0) return true;
  return false;
});

function updateContainerHeight() {
  if (containerRef.value) {
    containerHeight.value = containerRef.value.clientHeight;
  }
}

const MAX_BROWSER_ELEMENT_HEIGHT = 30_000_000;

const realTotalHeight = computed(() => props.totalNodes * ITEM_HEIGHT);

const totalHeight = computed(() => Math.min(realTotalHeight.value, MAX_BROWSER_ELEMENT_HEIGHT));

const scaleFactor = computed(() => realTotalHeight.value > totalHeight.value ? realTotalHeight.value / totalHeight.value : 1);

const scrollLine = computed(() => Math.floor(localScrollTop.value / ITEM_HEIGHT));

const viewportItemCount = computed(() => Math.ceil(containerHeight.value / ITEM_HEIGHT));

const startIndex = computed(() => Math.max(0, scrollLine.value - BUFFER_SIZE));

const endIndex = computed(() => Math.min(props.totalNodes, scrollLine.value + viewportItemCount.value + BUFFER_SIZE));

const visibleItems = computed(() => {
  if (!props.visibleNodes || props.visibleNodes.length === 0) return [];
  const startId = props.flatVisibleStart - 50;
  const endId = props.flatVisibleEnd + 50;
  let si = 0;
  while (si < props.visibleNodes.length && props.visibleNodes[si].id < startId) si++;
  let ei = si;
  while (ei < props.visibleNodes.length && props.visibleNodes[ei].id <= endId) ei++;
  if (si >= ei) return [];
  return props.visibleNodes.slice(si, ei);
});

const offsetY = computed(() => {
  const line = Math.floor(localScrollTop.value / ITEM_HEIGHT)
  return Math.max(0, line - BUFFER_SIZE) * ITEM_HEIGHT / scaleFactor.value
})

watch(() => props.jumpTrigger, () => {
  const line = props.jumpToLine;
  if (line >= 0 && props.totalNodes > 0) {
    lastRenderedLine = -1;
    updateContainerHeight();
    const targetReal = line * ITEM_HEIGHT;
    const visibleRealHeight = containerHeight.value * scaleFactor.value;
    const targetCenter = targetReal - (visibleRealHeight / 2) + (ITEM_HEIGHT / 2);
    const maxScroll = Math.max(0, realTotalHeight.value - visibleRealHeight);
    localScrollTop.value = Math.max(0, Math.min(targetCenter, maxScroll));
    if (containerRef.value) {
      containerRef.value.scrollTop = localScrollTop.value / scaleFactor.value;
    }
  }
}, { immediate: false });

const prevTotalNodes = ref(-1);
watch(() => props.totalNodes, (newVal) => {
  if (newVal > 0 && prevTotalNodes.value !== newVal && prevTotalNodes.value <= 0) {
    lastRenderedLine = -1;
    localScrollTop.value = 0;
    if (containerRef.value) {
      containerRef.value.scrollTop = 0;
    }
  }
  prevTotalNodes.value = newVal;
}, { immediate: false });

// visibleItems 数据到达 → 关骨架屏（RENDERING / SCROLLING_SLOW 状态下生效）
watch(visibleItems, (newVal) => {
  const len = newVal ? newVal.length : 0;
  if (len > 0 && (scrollState.value === ScrollState.RENDERING || scrollState.value === ScrollState.SCROLLING_SLOW)) {
    scrollState.value = ScrollState.READY;
  }
});

let _lastReqS = -1

watch(startIndex, () => {
  const s = Math.max(0, startIndex.value - 50)
  const e = Math.min(props.totalNodes, endIndex.value + 50)
  if (s === _lastReqS) return
  _lastReqS = s
  console.log('[LOG-4] onNeedNodes request', 'startIndex=', startIndex.value, 'endIndex=', endIndex.value, 'reqRange=', s, '-', e, 'totalNodes=', props.totalNodes, 'visibleNodes.len=', props.visibleNodes.length)
  if (props.onNeedNodes) {
    props.onNeedNodes(s, e)
  }
})

// 滚动速度计算 per P0 spec
function getScrollSpeed(curST, prevST, curTime, prevTime) {
  const deltaY = Math.abs(curST - prevST);
  const deltaT = curTime - prevTime;
  return deltaT > 0 ? deltaY / deltaT : 0;
}

let lastRenderedLine = -1;

function handleScroll(e) {
  const now = performance.now();
  const displayMaxScroll = Math.max(0, totalHeight.value - containerHeight.value);
  const raw = Math.max(0, Math.min(e.target.scrollTop, displayMaxScroll));
  const displayScrollTop = raw;

  const newLocalScrollTop = displayScrollTop * scaleFactor.value;
  const newScrollLine = Math.floor(newLocalScrollTop / ITEM_HEIGHT);
  localScrollTop.value = newLocalScrollTop;

  const prevDisplay = lastDisplayScrollTop.value;
  const prevTime = lastScrollTime.value;
  lastScrollTime.value = now;
  lastScrollTop.value = newLocalScrollTop;
  lastDisplayScrollTop.value = displayScrollTop;

  const speed = getScrollSpeed(displayScrollTop, prevDisplay, now, prevTime);
  const displayDelta = Math.abs(displayScrollTop - prevDisplay);

  const skeletonLine = Math.floor(newLocalScrollTop / ITEM_HEIGHT);
  skeletonTopLine.value = Math.max(0, skeletonLine - BUFFER_SIZE);

  const isDrag = displayDelta > DRAG_DELTA_THRESHOLD;
  const effectiveThreshold = isDrag ? FAST_THRESHOLD_DRAG : FAST_THRESHOLD_WHEEL;

  emit('scroll', newScrollLine);

  const lineChanged = newScrollLine !== lastRenderedLine;
  if (lineChanged) {
    lastRenderedLine = newScrollLine;
    emit('scrollData', {
      scrollTop: newLocalScrollTop,
      maxScroll: realTotalHeight.value - containerHeight.value
    });
  }

  // ─── P0 state machine transitions ───
  // wheelRecent: 双重保险——wheel 事件标记 + 小 delta(滚轮特征) 永不走骨架屏
  const wheelRecent = (now - lastWheelTime.value) < 200 || !isDrag;

  if (scrollState.value === ScrollState.IDLE) {
    scrollStartTime.value = now;
    if (!wheelRecent && speed > effectiveThreshold) {
      scrollState.value = ScrollState.SCROLLING_FAST;
    } else {
      scrollState.value = ScrollState.SCROLLING_SLOW;
    }
  } else if (scrollState.value === ScrollState.RENDERING) {
    if (!wheelRecent && speed > effectiveThreshold) {
      scrollState.value = ScrollState.SCROLLING_FAST;
    } else {
      scrollState.value = ScrollState.SCROLLING_SLOW;
    }
  } else if (!wheelRecent && speed > effectiveThreshold && scrollState.value === ScrollState.SCROLLING_SLOW) {
    scrollState.value = ScrollState.SCROLLING_FAST;
  }

  // 确保 RAF 循环在跑
  if (!rafId) {
    rafId = requestAnimationFrame(rafLoop);
  }
}

function rafLoop() {
  const now = performance.now();
  const timeSinceLastScroll = now - lastScrollTime.value;
  const stationaryTime = lastScrollTop.value === scrollTopAtLastCheck ? timeSinceLastScroll : 0;

  switch (scrollState.value) {
    case ScrollState.SCROLLING_FAST:
      if (timeSinceLastScroll > STOP_DETECTION_THRESHOLD) {
        if (visibleItems.value.length > 0) {
          scrollState.value = ScrollState.READY;
        } else {
          scrollState.value = ScrollState.RENDERING;
        }
      } else if (stationaryTime > 300) {
        if (visibleItems.value.length > 0) {
          scrollState.value = ScrollState.READY;
        } else {
          scrollState.value = ScrollState.RENDERING;
        }
      }
      break;

    case ScrollState.SCROLLING_SLOW:
      if (timeSinceLastScroll > STOP_DETECTION_THRESHOLD) {
        scrollState.value = ScrollState.READY;
      }
      break;

    case ScrollState.READY:
      scrollState.value = ScrollState.IDLE;
      rafId = null;
      return;

    case ScrollState.RENDERING:
      if (timeSinceLastScroll > 2000) {
        // 安全兜底：数据超过2秒未到，强制恢复 IDLE（防止数据异常导致骨架屏死循环）
        scrollState.value = ScrollState.READY;
      }
      break;

    case ScrollState.IDLE:
      rafId = null;
      return;
  }

  scrollTopAtLastCheck = lastScrollTop.value;

  if (scrollState.value !== ScrollState.IDLE) {
    rafId = requestAnimationFrame(rafLoop);
  } else {
    rafId = null;
  }
}

let scrollTopAtLastCheck = 0;

function handleNodeClick(node, e) {
  emit('selectNode', node);
  highlightedNodeId.value = node.id;
}

function handleContextMenu(node, e) {
  e.preventDefault();
  emit('copyPath', node);
}

async function handlePaste() {
  try {
    const text = await navigator.clipboard.readText();
    if (text) {
      emit('pasteContent', text);
    }
  } catch (err) {
    console.error('Failed to read clipboard');
  }
}

function handleMouseUp() {
  if (scrollState.value === ScrollState.SCROLLING_FAST) {
    if (visibleItems.value.length > 0) {
      scrollState.value = ScrollState.READY;
    } else {
      scrollState.value = ScrollState.RENDERING;
    }
  }
}

function handleWheel() {
  lastWheelTime.value = performance.now();
}

function setScrollTopToLine(line) {
  if (line < 0) return
  const targetLocal = line * ITEM_HEIGHT
  const maxLocal = Math.max(0, realTotalHeight.value - containerHeight.value * scaleFactor.value)
  localScrollTop.value = Math.min(targetLocal, maxLocal)
  if (containerRef.value) {
    containerRef.value.scrollTop = localScrollTop.value / scaleFactor.value
  }
}

onMounted(() => {
  updateContainerHeight();
  window.addEventListener('resize', updateContainerHeight);
  containerRef.value?.addEventListener('wheel', handleWheel, { passive: true });
  containerRef.value?.addEventListener('mouseup', handleMouseUp);
});

onUnmounted(() => {
  containerRef.value?.removeEventListener('wheel', handleWheel);
  containerRef.value?.removeEventListener('mouseup', handleMouseUp);
  if (rafId) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
});

defineExpose({ updateContainerHeight, setScrollTopToLine });
</script>

<template>
  <div class="json-tree-view">
    <div class="tree-content">
      <div v-if="!currentFile" class="empty-main">
        <div class="empty-content">
          <div class="empty-icon-large">
            <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="12" y1="18" x2="12" y2="12"/>
              <line x1="9" y1="15" x2="15" y2="15"/>
            </svg>
          </div>
          <p class="empty-invite">拖拽 JSON 文件到此处</p>
          <p class="empty-hint">支持 100MB+ 大文件，纯本地处理</p>
          <div class="empty-actions-vertical">
            <button class="btn-primary" @click="$emit('openFiles')">
              <FolderIcon :size="16" />
              <span>打开文件</span>
            </button>
            <button class="btn-text" @click="handlePaste">
              <span>粘贴内容</span>
            </button>
          </div>
          <div class="empty-shortcuts">
            <span class="shortcut-hint">Ctrl+O</span>
            <span class="shortcut-hint">Ctrl+V</span>
          </div>
        </div>
      </div>

      <div v-if="errorMessage" class="error-state">
        <p class="error-title">解析错误</p>
        <pre class="error-message">{{ errorMessage }}</pre>
      </div>

      <div class="tree-container" v-else>
        <div
          ref="containerRef"
          class="tree-scroll"
          @scroll="handleScroll"
        >
          <div :style="{ height: totalHeight + 'px' }" class="tree-content-inner">
            <div v-if="showSkeleton" :style="{ transform: `translateY(${skeletonTopLine * ITEM_HEIGHT / scaleFactor}px)` }" class="tree-nodes">
              <div class="skeleton-block">
                <div v-for="i in SKELETON_POOL_SIZE" :key="'skeleton-' + i" class="skeleton-bar skeleton-shimmer"></div>
              </div>
            </div>
            <div v-else :style="{ transform: `translateY(${offsetY}px)` }" class="tree-nodes">
              <div
                v-for="node in visibleItems"
                :key="node.id"
                class="tree-node"
                :class="{
                  'is-highlighted': highlightedNodeId === node.id,
                  'is-root': node.isRoot,
                  'search-highlight': searchHighlightLine === node.id
                }"
              >
                <span class="line-gutter">
                  <span class="line-number">{{ node.id + 1 }}</span>
                </span>
                
                <span class="node-content" :style="{ paddingLeft: (node.depth * 12) + 'px' }">
                  <span
                    v-if="node.type === 'object' || node.type === 'array'"
                    class="toggle-btn"
                    :class="{ expanded: !node.collapsed }"
                    @click.stop="emit('toggleNode', node.id)"
                  >
                    <TriangleIcon :size="10" />
                  </span>
                  <span v-else class="toggle-placeholder"></span>

                  <span v-if="!node.isRoot" class="node-key">{{ node.key }}</span>
                  <span v-if="!node.isRoot && node.type !== 'object' && node.type !== 'array'" class="colon">:</span>

                  <template v-if="node.type === 'string'">
                    <span class="node-value string-value" :title="node.fullValue">"{{ node.displayValue }}"</span>
                  </template>
                  <template v-else-if="node.type === 'number'">
                    <span class="node-value number-value">{{ node.displayValue }}</span>
                  </template>
                  <template v-else-if="node.type === 'boolean'">
                    <span class="node-value boolean-value">{{ node.displayValue }}</span>
                  </template>
                  <template v-else-if="node.type === 'null'">
                    <span class="node-value null-value">{{ node.displayValue }}</span>
                  </template>
                  <template v-else-if="node.type === 'array'">
                    <span class="bracket">[</span>
                    <span class="node-count">{{ node.collapsed ? node.childCount : '' }}</span>
                    <span class="bracket">]</span>
                  </template>
                  <template v-else-if="node.type === 'object'">
                    <span class="bracket">{</span>
                    <span class="node-count">{{ node.collapsed ? node.childCount : '' }}</span>
                    <span class="bracket">}</span>
                  </template>
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.json-tree-view {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: var(--bg-base);
  overflow: hidden;
}

.tree-content {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.empty-main {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  overflow: hidden;
}

.empty-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  z-index: 1;
}

.empty-icon-large {
  width: 80px;
  height: 80px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-tertiary);
  margin-bottom: 32px;
}

.empty-invite {
  font-size: 16px;
  font-weight: var(--font-normal);
  color: var(--text-primary);
  margin-bottom: 8px;
}

.empty-hint {
  font-size: 13px;
  color: var(--text-tertiary);
  margin-bottom: 32px;
}

.empty-actions-vertical {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  margin-bottom: 24px;
}

.btn-primary {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  background: var(--accent);
  color: var(--text-inverse);
  border: none;
  border-radius: var(--radius-md);
  font-size: 14px;
  font-weight: var(--font-medium);
  cursor: pointer;
  transition: background-color var(--transition-fast);
}

.btn-primary:hover {
  background: var(--accent-hover);
}

.btn-text {
  padding: 6px 12px;
  background: transparent;
  color: var(--text-secondary);
  border: none;
  font-size: 14px;
  cursor: pointer;
  transition: color var(--transition-fast);
}

.btn-text:hover {
  color: var(--text-primary);
}

.empty-shortcuts {
  display: flex;
  gap: 16px;
}

.shortcut-hint {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-muted);
}

.error-state {
  flex: 1;
  padding: 24px;
  text-align: left;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.error-title {
  color: var(--error);
  font-weight: 500;
  font-size: 14px;
}

.error-message {
  background: var(--bg-elevated);
  padding: 16px;
  border-radius: var(--radius-md);
  font-size: 12px;
  white-space: pre-wrap;
  color: var(--text-secondary);
  max-height: 300px;
  overflow-y: auto;
  font-family: var(--font-mono);
}

.tree-container {
  flex: 1;
  overflow: hidden;
  display: flex;
  position: relative;
}

.tree-scroll {
  flex: 1;
  overflow-y: scroll;
  overflow-x: auto;
  overflow-anchor: none;
}

.tree-content-inner {
  position: relative;
  min-width: max-content;
  contain: layout style;
}

.tree-nodes {
  position: absolute;
  left: 0;
  right: 0;
  will-change: transform;
}

.tree-node {
  display: flex;
  align-items: stretch;
  height: 28px;
  font-size: 13px;
  font-family: var(--font-mono);
  cursor: pointer;
  border-left: 2px solid transparent;
}

.tree-node:hover {
  background: var(--bg-elevated);
}

.tree-node.is-highlighted {
  background: var(--accent-subtle);
  border-left-color: var(--accent);
}

.tree-node.search-highlight {
  background: #fef9c3;
  border-left: 3px solid #f59e0b;
}

.line-gutter {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  min-width: 96px;
  width: 96px;
  padding: 0 16px 0 0;
  background: transparent;
  border-right: none;
  flex-shrink: 0;
  user-select: none;
}

.line-number {
  color: var(--text-tertiary);
  font-size: 12px;
  font-family: var(--font-mono);
  font-weight: var(--font-light);
  font-variant-numeric: tabular-nums;
  text-align: right;
}

.node-content {
  display: flex;
  align-items: center;
  flex: 1;
  padding: 0 8px;
  min-width: 0;
}

.toggle-btn {
  width: 16px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-tertiary);
  cursor: pointer;
  border-radius: var(--radius-sm);
  flex-shrink: 0;
  margin-right: 4px;
  transition: all var(--transition-fast);
}

.toggle-btn:hover {
  background: var(--border-light);
  color: var(--text-secondary);
}

.toggle-btn :deep(svg) {
  transition: transform 150ms ease;
}

.toggle-btn.expanded :deep(svg) {
  transform: rotate(90deg);
}

.toggle-placeholder {
  width: 16px;
  flex-shrink: 0;
  margin-right: 4px;
}

.node-key {
  color: var(--json-key);
  margin-right: 4px;
  font-weight: var(--font-medium);
}

.colon {
  color: var(--json-bracket);
  margin-right: 4px;
}

.node-value {
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 500px;
  font-weight: var(--font-normal);
}

.string-value {
  color: var(--json-string);
}

.number-value {
  color: var(--json-number);
}

.boolean-value {
  color: var(--json-boolean);
}

.null-value {
  color: var(--json-null);
  font-style: italic;
}

.bracket {
  color: var(--json-bracket);
}

.node-count {
  color: var(--text-secondary);
  font-size: 11px;
  margin: 0 4px;
}

.skeleton-block {
  padding: 8px 12px;
  background: #f3f4f6;
  border-radius: 4px;
  width: 100%;
}

.skeleton-bar {
  height: 12px;
  margin: 4px 0;
  border-radius: 4px;
}

.skeleton-shimmer {
  background: linear-gradient(
    90deg,
    #e5e7eb 0%,
    #e8e8e8 50%,
    #e5e7eb 100%
  );
  background-size: 200% 100%;
  animation: shimmer 3s infinite linear;
}

@keyframes shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
</style>
