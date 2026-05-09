<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import Minimap from './Minimap.vue';
import FolderIcon from './icons/FolderIcon.vue';
import JsonIcon from './icons/JsonIcon.vue';
import SearchIcon from './icons/SearchIcon.vue';
import CloseIcon from './icons/CloseIcon.vue';
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
  searchQuery: {
    type: String,
    default: ''
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
  searchMatchIndex: {
    type: Number,
    default: 0
  },
  searchMatchCount: {
    type: Number,
    default: 0
  },
  memoryIndex: {
    type: Object,
    default: null
  },
  currentFileText: {
    type: String,
    default: ''
  },
  onNeedNodes: {
    type: Function,
    default: null
  }
});

const emit = defineEmits([
  'toggleNode',
  'scroll',
  'selectNode',
  'copyPath',
  'copyValue',
  'search',
  'searchNext',
  'searchPrev',
  'pasteContent'
]);

const containerRef = ref(null);
const scrollTop = ref(0);
const containerHeight = ref(600);
const ITEM_HEIGHT = 28;
const BUFFER_SIZE = 10;
const highlightedNodeId = ref(null);
const searchInputRef = ref(null);

function updateContainerHeight() {
  if (containerRef.value) {
    containerHeight.value = containerRef.value.clientHeight;
  }
}

const scrollProgress = computed(() => {
  if (!containerRef.value) return 0;
  const maxScroll = totalHeight.value - containerHeight.value;
  if (maxScroll <= 0) return 0;
  return (scrollTop.value / maxScroll) * 100;
});

function handleMinimapJump(scrollTop) {
  if (!containerRef.value) return;
  const maxScroll = totalHeight.value - containerHeight.value;
  const clampedScrollTop = Math.max(0, Math.min(scrollTop, maxScroll));
  containerRef.value.scrollTop = clampedScrollTop;
  
  if (props.onNeedNodes) {
    const itemCount = props.totalNodes > 0 ? props.totalNodes : props.visibleNodes.length;
    const visibleCount = Math.ceil(containerHeight.value / ITEM_HEIGHT) + BUFFER_SIZE * 2;
    const maxStart = Math.max(0, itemCount - visibleCount);
    const requestedStart = Math.floor(clampedScrollTop / ITEM_HEIGHT) - BUFFER_SIZE;
    const start = Math.max(0, Math.min(requestedStart, maxStart));
    const end = Math.min(itemCount, start + visibleCount);
    
    const bufferStart = Math.max(0, start - BUFFER_SIZE);
    const bufferEnd = Math.min(itemCount, end + BUFFER_SIZE);
    props.onNeedNodes(bufferStart, bufferEnd);
  }
}

function handleSearchKeydown(e) {
  if (e.key === 'Enter') {
    e.preventDefault();
    if (e.shiftKey) {
      emit('searchPrev');
    } else {
      emit('searchNext');
    }
  }
}

const matchCount = computed(() => {
  if (!props.searchQuery.trim()) return 0;
  const query = props.searchQuery.toLowerCase();
  return props.visibleNodes.filter(node =>
    node.key?.toLowerCase().includes(query) ||
    node.displayValue?.toLowerCase().includes(query) ||
    (node.fullValue?.toLowerCase() || '').includes(query)
  ).length;
});

const currentMatchIndex = ref(0);

const visibleRange = computed(() => {
  const itemCount = props.totalNodes > 0 ? props.totalNodes : props.visibleNodes.length;
  const visibleCount = Math.ceil(containerHeight.value / ITEM_HEIGHT) + BUFFER_SIZE * 2;
  const maxStart = Math.max(0, itemCount - visibleCount);
  const requestedStart = Math.floor(scrollTop.value / ITEM_HEIGHT) - BUFFER_SIZE;
  const start = Math.max(0, Math.min(requestedStart, maxStart));
  const end = Math.min(itemCount, start + visibleCount);
  
  return { start, end };
});

const visibleItems = computed(() => {
  const { start, end } = visibleRange.value;
  const items = props.visibleNodes.filter(node => node && node.id >= start && node.id < end);
  return items;
});

const totalHeight = computed(() => {
  const count = props.totalNodes > 0 ? props.totalNodes : props.visibleNodes.length;
  if (count === 0) {
    return containerHeight.value;
  }
  return count * ITEM_HEIGHT;
});

const offsetY = computed(() => {
  return visibleRange.value.start * ITEM_HEIGHT;
});

const currentMatchNodeId = computed(() => {
  if (!props.searchQuery.trim() || props.searchMatchCount === 0) {
    return null;
  }
  const matchNodes = props.visibleNodes.filter(node => {
    const q = props.searchQuery.toLowerCase();
    return node.key?.toLowerCase().includes(q) ||
      node.displayValue?.toLowerCase().includes(q) ||
      (node.fullValue?.toLowerCase() || '').includes(q);
  });
  if (matchNodes.length > 0 && props.searchMatchIndex > 0 && props.searchMatchIndex <= matchNodes.length) {
    return matchNodes[props.searchMatchIndex - 1].id;
  }
  return null;
});

watch(() => props.currentFile, () => {
  if (containerRef.value) {
    containerRef.value.scrollTop = 0;
    scrollTop.value = 0;
  }
});

watch(() => props.searchMatchIndex, (newIndex) => {
  if (newIndex > 0 && containerRef.value) {
    const matchNodes = props.visibleNodes.filter(node => {
      const q = props.searchQuery.toLowerCase();
      return node.key?.toLowerCase().includes(q) ||
        node.displayValue?.toLowerCase().includes(q) ||
        (node.fullValue?.toLowerCase() || '').includes(q);
    });
    if (matchNodes.length > 0 && newIndex <= matchNodes.length) {
      const targetNode = matchNodes[newIndex - 1];
      const nodeIndex = props.visibleNodes.findIndex(n => n.id === targetNode.id);
      if (nodeIndex !== -1) {
        const nodeTop = nodeIndex * ITEM_HEIGHT;
        const nodeBottom = nodeTop + ITEM_HEIGHT;
        if (nodeTop < scrollTop.value) {
          containerRef.value.scrollTop = nodeTop;
        } else if (nodeBottom > scrollTop.value + containerHeight.value) {
          containerRef.value.scrollTop = nodeBottom - containerHeight.value;
        }
      }
    }
  }
});

function highlightMatch(text) {
  if (!props.searchQuery.trim() || !text) return text;
  const query = props.searchQuery.toLowerCase();
  const lowerText = text.toLowerCase();
  const index = lowerText.indexOf(query);
  if (index === -1) return text;
  
  const before = text.slice(0, index);
  const match = text.slice(index, index + query.length);
  const after = text.slice(index + query.length);
  return { before, match, after, isMatch: true };
}

function handleScroll(e) {
  const maxScroll = Math.max(0, totalHeight.value - containerHeight.value);
  const newScrollTop = Math.max(0, Math.min(e.target.scrollTop, maxScroll));
  
  scrollTop.value = newScrollTop;
  emit('scroll', scrollTop.value);
  
  if (props.onNeedNodes) {
    const itemCount = props.totalNodes > 0 ? props.totalNodes : props.visibleNodes.length;
    const visibleCount = Math.ceil(containerHeight.value / ITEM_HEIGHT) + BUFFER_SIZE * 2;
    const maxStart = Math.max(0, itemCount - visibleCount);
    const requestedStart = Math.floor(scrollTop.value / ITEM_HEIGHT) - BUFFER_SIZE;
    const start = Math.max(0, Math.min(requestedStart, maxStart));
    const end = Math.min(itemCount, start + visibleCount);
    
    const bufferStart = Math.max(0, start - BUFFER_SIZE);
    const bufferEnd = Math.min(itemCount, end + BUFFER_SIZE);
    props.onNeedNodes(bufferStart, bufferEnd);
  }
}

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

function handleKeydown(e) {
  if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
    e.preventDefault();
    searchInputRef.value?.focus();
  }
}

onMounted(() => {
  updateContainerHeight();
  window.addEventListener('keydown', handleKeydown);
  window.addEventListener('resize', updateContainerHeight);
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown);
});

defineExpose({
  focusSearch: () => searchInputRef.value?.focus()
});
</script>

<template>
  <div class="json-tree-view">
    <div class="search-box">
      <SearchIcon :size="14" class="search-icon" />
      <input
        ref="searchInputRef"
        type="text"
        placeholder="搜索 JSON..."
        :value="searchQuery"
        @input="e => emit('search', e.target.value)"
        @keydown="handleSearchKeydown"
      />
      <span class="search-counter" v-if="searchQuery && props.searchMatchCount > 0">
        {{ props.searchMatchIndex }}/{{ props.searchMatchCount }}
      </span>
      <span class="search-shortcut" v-if="!searchQuery">Ctrl+F</span>
      <button class="search-btn" v-if="searchQuery" @click="emit('searchPrev')" title="上一个">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M18 15l-6-6-6 6"/>
        </svg>
      </button>
      <button class="search-btn" v-if="searchQuery" @click="emit('searchNext')" title="下一个">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M6 9l6 6 6-6"/>
        </svg>
      </button>
      <button class="search-clear" v-if="searchQuery" @click="emit('search', '')">
        <CloseIcon :size="12" />
      </button>
    </div>

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
            <div :style="{ transform: `translateY(${offsetY}px)` }" class="tree-nodes">
              <div
                v-for="node in visibleItems"
                :key="node.id"
                class="tree-node"
                :class="{
                  'is-highlighted': currentMatchNodeId === node.id,
                  'is-root': node.isRoot
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

                  <span v-if="!node.isRoot" class="node-key">
                    <template v-if="highlightMatch(node.key)?.isMatch">
                      {{ highlightMatch(node.key).before }}<mark class="search-match">{{ highlightMatch(node.key).match }}</mark>{{ highlightMatch(node.key).after }}
                    </template>
                    <template v-else>{{ node.key }}</template>
                  </span>
                  <span v-if="!node.isRoot && node.type !== 'object' && node.type !== 'array'" class="colon">:</span>

                  <template v-if="node.type === 'string'">
                    <span class="node-value string-value" :title="node.fullValue">
                      <template v-if="highlightMatch(node.displayValue)?.isMatch">
                        "{{ highlightMatch(node.displayValue).before }}<mark class="search-match">{{ highlightMatch(node.displayValue).match }}</mark>{{ highlightMatch(node.displayValue).after }}"
                      </template>
                      <template v-else>"{{ node.displayValue }}"</template>
                    </span>
                  </template>
                  <template v-else-if="node.type === 'number'">
                    <span class="node-value number-value">
                      <template v-if="highlightMatch(node.displayValue)?.isMatch">
                        {{ highlightMatch(node.displayValue).before }}<mark class="search-match">{{ highlightMatch(node.displayValue).match }}</mark>{{ highlightMatch(node.displayValue).after }}
                      </template>
                      <template v-else>{{ node.displayValue }}</template>
                    </span>
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
        
        <Minimap
          v-if="visibleNodes.length > 0 || parseStatus === 'parsing'"
          :visibleNodes="visibleNodes"
          :totalNodes="totalNodes"
          :scrollTop="scrollTop"
          :viewportHeight="containerHeight"
          :totalHeight="totalHeight"
          :isParsing="parseStatus === 'parsing'"
          :memoryIndex="memoryIndex"
          :content="currentFileText"
          @jump="handleMinimapJump"
        />
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

.search-box {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 16px;
  height: 44px;
  border-bottom: 1px solid var(--border-light);
}

.search-box:focus-within {
  border-bottom-color: var(--accent);
}

.search-icon {
  color: var(--text-tertiary);
  flex-shrink: 0;
}

.search-box input {
  flex: 1;
  border: none;
  background: transparent;
  font-size: 14px;
  color: var(--text-primary);
  outline: none;
}

.search-box input::placeholder {
  color: var(--text-tertiary);
}

.search-shortcut {
  font-size: 11px;
  padding: 2px 6px;
  background: var(--bg-elevated);
  border: 1px solid var(--border-medium);
  border-radius: var(--radius-sm);
  color: var(--text-tertiary);
  font-family: var(--font-mono);
}

.search-counter {
  font-size: 11px;
  padding: 2px 6px;
  background: var(--accent);
  color: var(--text-inverse);
  border-radius: var(--radius-sm);
  font-family: var(--font-mono);
}

.search-btn {
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  border-radius: var(--radius-sm);
  cursor: pointer;
}

.search-btn:hover {
  background: var(--bg-elevated);
  color: var(--text-primary);
}

.search-clear {
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  border-radius: var(--radius-sm);
  cursor: pointer;
}

.search-clear:hover {
  background: var(--bg-elevated);
  color: var(--text-primary);
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
  border-radius: var(--radius-md);  /* 6px，更克制 */
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
  color: var(--text-muted);  /* 极淡 */
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
}

.tree-content-inner {
  position: relative;
  min-width: max-content;
}

.tree-nodes {
  position: absolute;
  left: 0;
  right: 0;
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

.line-gutter {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  width: 56px;
  padding: 0 16px 0 0;  /* 只用右内边距留白，不用竖线 */
  background: transparent;
  border-right: none;  /* 去掉竖线 */
  flex-shrink: 0;
  user-select: none;
}

.line-number {
  color: var(--text-tertiary);
  font-size: 12px;
  font-family: var(--font-mono);
  font-weight: var(--font-light);  /* 字重 300，细 */
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

.search-match {
  background: var(--warning-light);
  color: var(--text-primary);
  border-radius: 2px;
  padding: 0 2px;
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
  font-weight: var(--font-medium);  /* 键名字重 500 */
}

.colon {
  color: var(--json-bracket);  /* 极淡灰，融入背景 */
  margin-right: 4px;
}

.node-value {
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 500px;
  font-weight: var(--font-normal);  /* 值字重 400 */
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
</style>
