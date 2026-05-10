<script setup>
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue';
import SearchIcon from './icons/SearchIcon.vue';

const props = defineProps({
  flatNodes: { type: Array, default: () => [] },
  totalNodes: { type: Number, default: 0 }
});

const emit = defineEmits(['jumpToLine', 'close', 'heightChange']);

const query = ref('');
const results = ref([]);
const activeIndex = ref(-1);
const isCollapsed = ref(true);
const inputRef = ref(null);
const listRef = ref(null);

let worker = null;
let rafId = null;
let lastQueryTime = 0;

const DEBOUNCE_MS = 300;

const hasResults = computed(() => results.value.length > 0);
const currentResult = computed(() => activeIndex.value >= 0 ? activeIndex.value + 1 : 0);
const totalResults = computed(() => results.value.length);

function initWorker() {
  const workerCode = `
    let flatNodes = null;
    self.onmessage = function(e) {
      const { type, query, data } = e.data;
      if (type === 'init') { flatNodes = data || []; self.postMessage({ type: 'ready' }); return; }
      if (type === 'search') {
        if (!query || !query.trim()) { self.postMessage({ type: 'result', results: [], query: '' }); return; }
        const q = query.trim().toLowerCase();
        const results = [];
        const MAX = 1000;
        for (let i = 0; i < flatNodes.length && results.length < MAX; i++) {
          const node = flatNodes[i];
          if (!node) continue;
          const k = (node.k || '').toLowerCase();
          const v = (node.v || '').toLowerCase();
          if (k.includes(q) || v.includes(q)) {
            results.push({ line: node.id, key: node.k || '', value: node.v || '', type: node.t || 'string' });
          }
        }
        self.postMessage({ type: 'result', results, query: q, total: results.length });
      }
      if (type === 'destroy') { flatNodes = null; self.close(); }
    };
  `;
  const blob = new Blob([workerCode], { type: 'application/javascript' });
  worker = new Worker(URL.createObjectURL(blob));
  worker.onmessage = handleWorkerMessage;
  if (props.flatNodes && props.flatNodes.length > 0) {
    const serializable = props.flatNodes.map(n => ({
      id: n.id,
      k: String(n.key || ''),
      v: String(n.displayValue || n.value || '').substring(0, 80),
      t: n.type || 'string'
    }));
    worker.postMessage({ type: 'init', data: serializable });
  }
}

function handleWorkerMessage(e) {
  const { type, results: r, query: q } = e.data;
  if (type === 'result') {
    results.value = r || [];
    if (query.value.trim().toLowerCase() === (q || '').toLowerCase()) {
      activeIndex.value = r.length > 0 ? 0 : -1;
    }
  }
}

function doSearch() {
  const q = query.value.trim();
  if (!q) {
    results.value = [];
    activeIndex.value = -1;
    return;
  }
  lastQueryTime = performance.now();
  if (worker) {
    worker.postMessage({ type: 'search', query: q });
  }
}

function onInput() {
  if (rafId) cancelAnimationFrame(rafId);
  rafId = requestAnimationFrame(() => {
    const now = performance.now();
    if (now - lastQueryTime >= DEBOUNCE_MS) {
      doSearch();
    } else {
      rafId = requestAnimationFrame(() => doSearch());
    }
  });
}

function selectResult(idx) {
  activeIndex.value = idx;
  if (results.value[idx]) {
    scrollActiveIntoView();
    emit('jumpToLine', results.value[idx].line);
  }
}

function nextResult() {
  if (results.value.length === 0) return;
  activeIndex.value = (activeIndex.value + 1) % results.value.length;
  scrollActiveIntoView();
  emit('jumpToLine', results.value[activeIndex.value].line);
}

function prevResult() {
  if (results.value.length === 0) return;
  activeIndex.value = (activeIndex.value - 1 + results.value.length) % results.value.length;
  scrollActiveIntoView();
  emit('jumpToLine', results.value[activeIndex.value].line);
}

function scrollActiveIntoView() {
  nextTick(() => {
    const el = listRef.value?.querySelector('.search-result-row.active');
    if (el) {
      el.scrollIntoView({ block: 'center', behavior: 'auto' });
    }
  });
}

function clearSearch() {
  query.value = '';
  results.value = [];
  activeIndex.value = -1;
  if (worker) worker.postMessage({ type: 'search', query: '' });
}

function togglePanel() {
  isCollapsed.value = !isCollapsed.value;
  if (!isCollapsed.value) {
    nextTick(() => {
      inputRef.value?.focus();
      emit('heightChange', 264);
    });
  } else {
    nextTick(() => emit('heightChange', 36));
  }
}

function handleKeydown(e) {
  if (e.key === 'Enter') {
    e.preventDefault();
    e.shiftKey ? prevResult() : nextResult();
  }
  if (e.key === 'Escape') {
    e.preventDefault();
    isCollapsed.value = true;
    emit('close');
  }
}

function highlightKeyword(text, q) {
  if (!q || !text) return text;
  const s = String(text);
  const lower = s.toLowerCase();
  const ql = q.toLowerCase();
  const idx = lower.indexOf(ql);
  if (idx === -1) return s;
  return s.substring(0, idx) + '<mark class="match-highlight">' + s.substring(idx, idx + ql.length) + '</mark>' + s.substring(idx + ql.length);
}

function open(queryText) {
  if (queryText) {
    query.value = queryText;
  }
  isCollapsed.value = false;
  nextTick(() => {
    inputRef.value?.focus();
    if (queryText) doSearch();
  });
}

watch(() => props.flatNodes, (nodes) => {
  if (worker && nodes && nodes.length > 0) {
    const serializable = nodes.map(n => ({
      id: n.id,
      k: String(n.key || ''),
      v: String(n.displayValue || n.value || '').substring(0, 80),
      t: n.type || 'string'
    }));
    worker.postMessage({ type: 'init', data: serializable });
    if (query.value.trim()) doSearch();
  }
}, { deep: false });

onMounted(() => {
  initWorker();
  window.addEventListener('keydown', handleGlobalKeydown);
  nextTick(() => emit('heightChange', 36));
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleGlobalKeydown);
  if (rafId) cancelAnimationFrame(rafId);
  if (worker) {
    worker.postMessage({ type: 'destroy' });
    worker = null;
  }
});

function handleGlobalKeydown(e) {
  if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
    e.preventDefault();
    open();
  }
}

defineExpose({ open });
</script>

<template>
  <div class="search-panel" :class="{ collapsed: isCollapsed }">
    <div class="search-panel-header" @click="isCollapsed ? togglePanel() : undefined">
      <div class="search-panel-drag-handle"></div>
      <div class="search-panel-title" v-if="isCollapsed">
        <SearchIcon :size="14" />
        <span>搜索</span>
        <span class="shortcut-hint">Ctrl+F</span>
      </div>
      <button class="search-panel-toggle" @click.stop="togglePanel" :title="isCollapsed ? '展开' : '收起'">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path v-if="isCollapsed" d="M6 9l6 6 6-6"/>
          <path v-else d="M18 15l-6-6-6 6"/>
        </svg>
      </button>
    </div>

    <div class="search-panel-body" v-show="!isCollapsed">
      <div class="search-input-row">
        <SearchIcon :size="14" class="search-input-icon" />
        <input
          ref="inputRef"
          type="text"
          v-model="query"
          placeholder="搜索 JSON 键名或值..."
          @input="onInput"
          @keydown="handleKeydown"
          class="search-input"
        />
        <button v-if="query" class="search-clear-btn" @click="clearSearch" title="清除搜索">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      <div class="search-results" ref="listRef" v-if="hasResults">
        <div
          v-for="(item, idx) in results"
          :key="item.line"
          class="search-result-row"
          :class="{ active: idx === activeIndex }"
          @click="selectResult(idx)"
        >
          <span class="result-line">{{ item.line + 1 }}</span>
          <span class="result-key" v-if="item.key" v-html="highlightKeyword(item.key, query)"></span>
          <span class="result-value" v-if="item.value">
            <span v-html="highlightKeyword(item.value.substring(0, 60), query)"></span>
          </span>
        </div>
      </div>

      <div class="search-results-empty" v-else-if="query && !hasResults">
        <span>无匹配结果</span>
      </div>

      <div class="search-nav" v-if="hasResults">
        <button @click="prevResult" :disabled="totalResults === 0" title="上一个 (Shift+Enter)">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 15l-6-6-6 6"/></svg>
        </button>
        <span class="search-nav-count">{{ currentResult }} / {{ totalResults }}</span>
        <button @click="nextResult" :disabled="totalResults === 0" title="下一个 (Enter)">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>
        </button>
        <button class="search-nav-clear" @click="clearSearch">清除</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.search-panel {
  background: #ffffff;
  border-top: 1px solid #e5e7eb;
  box-shadow: 0 -4px 12px rgba(0, 0, 0, 0.08);
  transition: height 0.25s ease;
  flex-shrink: 0;
  height: 264px;
  display: flex;
  flex-direction: column;
}

.search-panel.collapsed {
  height: 36px;
}

.search-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 36px;
  padding: 0 12px;
  cursor: pointer;
  flex-shrink: 0;
  user-select: none;
}

.search-panel.collapsed .search-panel-header:hover {
  background: #f9fafb;
}

.search-panel-drag-handle {
  display: none;
}

.search-panel-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: #6b7280;
}

.shortcut-hint {
  font-size: 11px;
  color: #9ca3af;
  background: #f3f4f6;
  padding: 1px 6px;
  border-radius: 3px;
  font-family: monospace;
}

.search-panel-toggle {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: #6b7280;
  border-radius: 4px;
  cursor: pointer;
}

.search-panel-toggle:hover {
  background: #f3f4f6;
  color: #374151;
}

.search-panel-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: 0 12px 8px;
}

.search-input-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 0 8px;
  flex-shrink: 0;
}

.search-input-icon {
  color: #9ca3af;
  flex-shrink: 0;
}

.search-input {
  flex: 1;
  padding: 6px 10px;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  font-size: 13px;
  background: #ffffff;
  color: #111827;
  outline: none;
}

.search-input:focus {
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

.search-clear-btn {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: #9ca3af;
  border-radius: 4px;
  cursor: pointer;
  flex-shrink: 0;
}

.search-clear-btn:hover {
  background: #f3f4f6;
  color: #374151;
}

.search-results {
  flex: 1;
  overflow-y: auto;
  border: 1px solid #f3f4f6;
  border-radius: 6px;
}

.search-result-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 10px;
  border-bottom: 1px solid #f9fafb;
  cursor: pointer;
  font-size: 12px;
  font-family: monospace;
}

.search-result-row:last-child {
  border-bottom: none;
}

.search-result-row:hover {
  background: #f9fafb;
}

.search-result-row.active {
  background: #eff6ff;
}

.result-line {
  color: #6b7280;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  min-width: 56px;
  text-align: right;
  flex-shrink: 0;
}

.result-key {
  color: #3b82f6;
  flex-shrink: 0;
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.result-value {
  color: #6b7280;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.search-results-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #9ca3af;
  font-size: 13px;
  border: 1px solid #f3f4f6;
  border-radius: 6px;
}

.search-nav {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 8px 0 0;
  flex-shrink: 0;
}

.search-nav button {
  padding: 4px 10px;
  border-radius: 4px;
  border: 1px solid #e5e7eb;
  background: #ffffff;
  cursor: pointer;
  font-size: 12px;
  display: flex;
  align-items: center;
  color: #374151;
}

.search-nav button:hover:not(:disabled) {
  background: #f3f4f6;
}

.search-nav button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.search-nav-count {
  font-size: 12px;
  color: #6b7280;
  font-variant-numeric: tabular-nums;
  min-width: 60px;
  text-align: center;
}

.search-nav-clear {
  flex-shrink: 0;
}
</style>

<style>
.search-panel .match-highlight {
  background: #fef08a;
  border-radius: 2px;
  padding: 0 2px;
  color: #111827;
  font-weight: 500;
}
</style>
