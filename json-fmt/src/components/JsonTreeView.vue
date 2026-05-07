<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import Minimap from './Minimap.vue';
import FolderIcon from './icons/FolderIcon.vue';
import JsonIcon from './icons/JsonIcon.vue';
import SearchIcon from './icons/SearchIcon.vue';
import CloseIcon from './icons/CloseIcon.vue';

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
  const itemCount = props.visibleNodes.length;
  const visibleCount = Math.ceil(containerHeight.value / ITEM_HEIGHT) + BUFFER_SIZE * 2;
  const maxStart = Math.max(0, itemCount - visibleCount);
  const start = Math.max(0, Math.min(
    Math.floor(scrollTop.value / ITEM_HEIGHT) - BUFFER_SIZE,
    maxStart
  ));
  const end = Math.min(itemCount, start + visibleCount);
  return { start, end };
});

const visibleItems = computed(() => {
  return props.visibleNodes.slice(visibleRange.value.start, visibleRange.value.end);
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
  scrollTop.value = Math.max(0, Math.min(e.target.scrollTop, maxScroll));
  emit('scroll', scrollTop.value);
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
        <div class="empty-decoration">
          <div class="grid-pattern"></div>
        </div>
        <div class="empty-content">
          <div class="empty-logo">
            <JsonIcon :size="64" />
          </div>
          <h2 class="empty-title">未加载 JSON</h2>
          <p class="empty-desc">打开文件以进行可视化</p>
          <div class="empty-actions">
            <button class="btn-primary" @click="$emit('openFiles')">
              <FolderIcon :size="16" />
              <span>打开文件</span>
            </button>
            <button class="btn-secondary" @click="handlePaste">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2"/>
                <rect x="8" y="2" width="8" height="4" rx="1"/>
              </svg>
              <span>粘贴内容</span>
            </button>
          </div>
          <div class="empty-shortcuts">
            <span class="shortcut">Ctrl+O</span>
            <span class="shortcut">Ctrl+V</span>
            <span class="shortcut">Ctrl+S</span>
          </div>
        </div>
      </div>

      <!-- ============================================ -->
      <!-- 重要：解析状态优先显示，确保整个内容区域在解析时显示加载状态 -->
      <!--       直到解析完成才显示内容 -->
      <!-- ============================================ -->
      <div v-if="parseStatus === 'parsing'" class="parsing-status">
        <span class="spinner">⟳</span>
        <span>解析中...</span>
      </div>

      <div v-else-if="errorMessage" class="error-state">
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
                :style="{ paddingLeft: (node.depth * 20) + 'px' }"
                @click="handleNodeClick(node, $event)"
                @contextmenu="handleContextMenu(node, $event)"
              >
                <span
                  v-if="node.type === 'object' || node.type === 'array'"
                  class="toggle-btn"
                  @click.stop="emit('toggleNode', node.id)"
                >
                  {{ node.collapsed ? '›' : '⌄' }}
                </span>
                <span v-else class="toggle-placeholder"></span>

                <span
                  v-if="!node.isRoot"
                  class="node-key"
                >
                  <template v-if="highlightMatch(node.key)?.isMatch">
                    {{ highlightMatch(node.key).before }}<mark class="search-match">{{ highlightMatch(node.key).match }}</mark>{{ highlightMatch(node.key).after }}
                  </template>
                  <template v-else>{{ node.key }}</template>
                </span>
                <span
                  v-if="!node.isRoot && node.type !== 'object' && node.type !== 'array'"
                  class="colon">:</span>

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
              </div>
            </div>
          </div>
        </div>
        <!-- ============================================ -->
        <!-- 重要：只有在有数据或正在解析时才显示Minimap -->
        <!-- ============================================ -->
        <Minimap
          v-if="visibleNodes.length > 0 || parseStatus === 'parsing'"
          :visibleNodes="visibleNodes"
          :scrollTop="scrollTop"
          :viewportHeight="containerHeight"
          :totalHeight="totalHeight"
          :isParsing="parseStatus === 'parsing'"
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
  background: var(--bg-primary);
  overflow: hidden;
}

.search-box {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 12px;
  height: 36px;
  background: var(--bg-input);
  border: 1px solid var(--border);
  border-radius: 4px;
  margin: 8px 12px;
}

.search-box:focus-within {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px var(--accent-light);
}

.search-icon {
  color: var(--text-tertiary);
  flex-shrink: 0;
}

.search-box input {
  flex: 1;
  border: none;
  background: transparent;
  font-size: 13px;
  color: var(--text-primary);
  outline: none;
}

.search-box input::placeholder {
  color: var(--text-tertiary);
}

.search-shortcut {
  font-size: 11px;
  padding: 2px 6px;
  background: var(--bg-hover);
  border-radius: 4px;
  color: var(--text-secondary);
  font-family: monospace;
}

.search-counter {
  font-size: 11px;
  padding: 2px 6px;
  background: var(--accent);
  color: white;
  border-radius: 4px;
  font-family: monospace;
  margin-right: 4px;
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
  border-radius: 3px;
  cursor: pointer;
  margin-right: 2px;
}

.search-btn:hover {
  background: var(--bg-hover);
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
  border-radius: 3px;
  cursor: pointer;
}

.search-clear:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.search-count {
  font-size: 11px;
  color: var(--text-secondary);
  font-family: var(--font-code);
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

.empty-decoration {
  position: absolute;
  inset: 0;
  opacity: 0.015;
}

.grid-pattern {
  width: 100%;
  height: 100%;
  background-image:
    linear-gradient(to right, #000 1px, transparent 1px),
    linear-gradient(to bottom, #000 1px, transparent 1px);
  background-size: 60px 60px;
}

.empty-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  z-index: 1;
}

.empty-logo {
  width: 80px;
  height: 80px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-hover);
  border-radius: 16px;
  margin-bottom: 24px;
  color: var(--accent);
}

.empty-title {
  font-size: 18px;
  font-weight: 500;
  color: var(--text-primary);
  margin-bottom: 8px;
}

.empty-desc {
  font-size: 14px;
  color: var(--text-secondary);
  margin-bottom: 24px;
}

.empty-actions {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
}

.btn-primary {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  background: var(--accent);
  color: var(--bg-primary);
  border: none;
  border-radius: 6px;
  font-size: 14px;
  cursor: pointer;
  transition: all 150ms;
}

.btn-primary:hover {
  opacity: 0.9;
  transform: translateY(-1px);
}

.empty-shortcuts {
  display: flex;
  gap: 16px;
}

.shortcut {
  padding: 2px 6px;
  background: var(--bg-hover);
  border-radius: 3px;
  font-family: monospace;
  font-size: 12px;
  color: var(--text-tertiary);
}

.btn-secondary {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  background: transparent;
  color: var(--text-secondary);
  border: 1px solid var(--border);
  border-radius: 6px;
  font-size: 14px;
  cursor: pointer;
  transition: all 150ms;
}

.btn-secondary:hover {
  background: var(--bg-hover);
  border-color: var(--text-secondary);
}

.parsing-status {
  flex: 1;
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--text-secondary);
  font-size: 13px;
}

.spinner {
  animation: spin 1s linear infinite;
  font-size: 16px;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
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
  background: var(--bg-secondary);
  padding: 16px;
  border-radius: 4px;
  font-size: 12px;
  white-space: pre-wrap;
  color: var(--text-secondary);
  max-height: 300px;
  overflow-y: auto;
  font-family: var(--font-code);
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
  align-items: center;
  height: 22px;
  padding: 0 8px;
  font-size: 13px;
  font-family: 'Consolas', 'Monaco', monospace;
  cursor: pointer;
}

.tree-node:hover {
  background: var(--bg-hover);
}

.tree-node.active,
.tree-node:focus {
  background: var(--bg-active);
  outline: none;
}

[data-theme="dark"] .tree-node:hover {
  background: #2a2d2e;
}

[data-theme="dark"] .tree-node.active {
  background: #37373d;
}

.tree-node.is-highlighted {
  background: var(--bg-active);
}

.tree-node.is-root {
  font-weight: 500;
}

.search-match {
  background: #fef08a;
  color: #000;
  border-radius: 2px;
  padding: 0 2px;
}

[data-theme="dark"] .search-match {
  background: #a16207;
  color: #fff;
}

.toggle-btn {
  width: 12px;
  font-size: 10px;
  color: var(--text-secondary);
  cursor: pointer;
  flex-shrink: 0;
  margin-right: 4px;
  position: relative;
  z-index: 1;
  transition: color var(--transition-fast);
  display: flex;
  align-items: center;
  justify-content: center;
}

.toggle-btn:hover {
  color: var(--text);
}

.toggle-placeholder {
  width: 12px;
  flex-shrink: 0;
  margin-right: 4px;
  position: relative;
  z-index: 1;
}

.node-key {
  color: var(--json-key);
  margin-right: 4px;
  position: relative;
  z-index: 1;
}

.colon {
  color: var(--text-secondary);
  margin-right: 4px;
  position: relative;
  z-index: 1;
}

.node-value {
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 500px;
  position: relative;
  z-index: 1;
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
  position: relative;
  z-index: 1;
}

.node-count {
  color: var(--text-secondary);
  font-size: 11px;
  margin: 0 4px;
  position: relative;
  z-index: 1;
}
</style>
