<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import Minimap from './Minimap.vue';

const props = defineProps({
  visibleNodes: {
    type: Array,
    default: () => []
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
  'searchPrev'
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
  containerRef.value.scrollTop = scrollTop;
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
  const start = Math.max(0, Math.floor(scrollTop.value / ITEM_HEIGHT) - BUFFER_SIZE);
  const visibleCount = Math.ceil(containerHeight.value / ITEM_HEIGHT) + BUFFER_SIZE * 2;
  const end = Math.min(props.visibleNodes.length, start + visibleCount);
  return { start, end };
});

const visibleItems = computed(() => {
  return props.visibleNodes.slice(visibleRange.value.start, visibleRange.value.end);
});

const totalHeight = computed(() => props.visibleNodes.length * ITEM_HEIGHT);
const offsetY = computed(() => visibleRange.value.start * ITEM_HEIGHT);

function handleScroll(e) {
  scrollTop.value = e.target.scrollTop;
  emit('scroll', e.target.scrollTop);
}

function handleNodeClick(node, e) {
  emit('selectNode', node);
  highlightedNodeId.value = node.id;
}

function handleContextMenu(node, e) {
  e.preventDefault();
  emit('copyPath', node);
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
    <div class="search-bar">
      <div class="search-wrapper">
        <input
          ref="searchInputRef"
          type="text"
          class="search-input"
          :value="searchQuery"
          @input="e => emit('search', e.target.value)"
          placeholder="搜索..."
        />
        <span v-if="searchQuery" class="search-clear" @click="emit('search', '')">×</span>
      </div>
      <div v-if="matchCount > 0" class="search-count">
        {{ matchCount }}
      </div>
    </div>

    <div class="tree-content">
      <div v-if="!currentFile" class="empty-state">
        <div class="empty-text">未加载 JSON</div>
        <div class="empty-hint">打开文件以进行可视化</div>
        <button class="open-btn" @click="$emit('openFiles')">
          打开文件
        </button>
      </div>

      <div v-else-if="parseStatus === 'parsing'" class="parsing-status">
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
                  'is-highlighted': highlightedNodeId === node.id,
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
                  {{ node.key }}
                </span>
                <span
                  v-if="!node.isRoot && node.type !== 'object' && node.type !== 'array'"
                  class="colon">:</span>

                <template v-if="node.type === 'string'">
                  <span class="node-value string-value" :title="node.fullValue">
                    "{{ node.displayValue }}"
                  </span>
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
              </div>
            </div>
          </div>
        </div>
        <Minimap
          :visibleNodes="visibleNodes"
          :scrollTop="scrollTop"
          :viewportHeight="containerHeight"
          :totalHeight="totalHeight"
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
  background: var(--editor-bg);
  overflow: hidden;
}

.search-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 16px;
  background: var(--sidebar-bg);
  border-bottom: 1px solid var(--border);
}

.search-wrapper {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
}

.search-input {
  flex: 1;
  background: transparent;
  border: none;
  color: var(--text);
  padding: 4px 0;
  font-size: 13px;
  font-family: var(--font-ui);
  outline: none;
}

.search-input::placeholder {
  color: var(--text-secondary);
}

.search-clear {
  font-size: 14px;
  color: var(--text-secondary);
  cursor: pointer;
  padding: 2px 4px;
  transition: color var(--transition-fast);
}

.search-clear:hover {
  color: var(--text);
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

.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 40px;
}

.empty-text {
  font-size: 14px;
  color: var(--text);
}

.empty-hint {
  font-size: 13px;
  color: var(--text-secondary);
}

.open-btn {
  margin-top: 16px;
  padding: 8px 20px;
  background: transparent;
  border: none;
  color: var(--accent);
  font-size: 13px;
  font-family: var(--font-ui);
  cursor: pointer;
  transition: opacity var(--transition-fast);
}

.open-btn:hover {
  opacity: 0.7;
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
  background: var(--sidebar-bg);
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
  height: var(--line-height);
  display: flex;
  align-items: center;
  font-family: var(--font-code);
  font-size: 13px;
  cursor: default;
  transition: background var(--transition-fast);
  white-space: nowrap;
  position: relative;
}

.tree-node:hover {
  background: var(--hover-bg);
}

.tree-node.is-highlighted {
  background: var(--active-bg);
}

.tree-node.is-root {
  font-weight: 500;
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
