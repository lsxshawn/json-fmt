<script setup>
import { ref, watch, computed } from 'vue';

const props = defineProps({
  node: {
    type: Object,
    default: null
  },
  visible: {
    type: Boolean,
    default: false
  }
});

const emit = defineEmits(['close', 'updateValue']);

const isEditing = ref(false);
const editValue = ref('');

watch(() => props.node, (newNode) => {
  if (newNode) {
    editValue.value = newNode.displayValue || '';
    isEditing.value = false;
  }
});

const fullPath = computed(() => {
  if (!props.node) return '';
  const path = props.node.pathStr || formatPath(props.node.path);
  return path;
});

const displayPath = computed(() => {
  const path = fullPath.value;
  if (!path) return 'root';
  
  if (path.length > 50) {
    const parts = path.split('.');
    if (parts.length > 4) {
      return parts.slice(0, 2).join('.') + '...' + parts.slice(-2).join('.');
    }
    return path.slice(0, 25) + '...' + path.slice(-20);
  }
  return path;
});

function startEdit() {
  if (props.node && (props.node.type === 'string' || props.node.type === 'number' || props.node.type === 'boolean')) {
    editValue.value = props.node.displayValue || '';
    isEditing.value = true;
  }
}

function saveEdit() {
  if (props.node) {
    emit('updateValue', editValue.value);
    isEditing.value = false;
  }
}

function cancelEdit() {
  isEditing.value = false;
  if (props.node) {
    editValue.value = props.node.displayValue || '';
  }
}

function copyToClipboard(text, type) {
  navigator.clipboard.writeText(text).then(() => {
    console.log(`Copied ${type} to clipboard`);
  });
}

function copyPath() {
  copyToClipboard(fullPath.value, 'path');
}

function formatPath(path) {
  if (!path || path.length === 0) return 'root';
  
  if (typeof path === 'string') {
    return path;
  }
  
  let result = [];
  for (let i = 0; i < path.length; i++) {
    const p = path[i];
    if (typeof p === 'number') {
      if (result.length > 0) {
        result[result.length - 1] += '[' + p + ']';
      } else {
        result.push('[' + p + ']');
      }
    } else {
      result.push(p);
    }
  }
  
  return result.join('.');
}
</script>

<template>
  <div v-if="visible" class="detail-panel">
    <div class="panel-header">
      <span class="panel-title">属性</span>
      <button class="panel-close" @click="emit('close')">×</button>
    </div>

    <div v-if="node" class="panel-content">
      <div class="property-item">
        <div class="property-label">属性名</div>
        <div class="property-value key-value">{{ node.key || '(root)' }}</div>
      </div>

      <div class="property-item">
        <div class="property-label">值</div>
        <template v-if="isEditing">
          <input
            v-model="editValue"
            class="property-value editable"
            @keyup.enter="saveEdit"
            @keyup.escape="cancelEdit"
            autofocus
          />
        </template>
        <template v-else>
          <div
            class="property-value"
            :class="{ editable: node.type === 'string' || node.type === 'number' || node.type === 'boolean' }"
            @dblclick="startEdit"
          >
            {{ node.displayValue || '(empty)' }}
            <span v-if="node.type === 'string' || node.type === 'number' || node.type === 'boolean'" class="edit-hint">双击编辑</span>
          </div>
        </template>
      </div>

      <div class="property-item">
        <div class="property-label">类型</div>
        <span class="type-badge" :class="node.type">
          {{ node.type }}
        </span>
      </div>

      <div class="property-item">
        <div class="property-label">路径</div>
        <div class="property-path-wrapper">
          <div class="property-path" :title="fullPath">{{ displayPath }}</div>
          <button class="path-copy" @click="copyPath" title="复制完整路径">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
            </svg>
          </button>
        </div>
      </div>

      <div v-if="node.childCount !== undefined" class="property-item">
        <div class="property-label">
          {{ node.type === 'array' ? '数组长度' : '对象键数' }}
        </div>
        <div class="property-value">{{ node.childCount }}</div>
      </div>
    </div>

    <div v-if="node" class="panel-actions">
      <button class="action-btn" @click="copyToClipboard(node.displayValue || '', 'value')">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
        </svg>
        复制值
      </button>
      <button class="action-btn" @click="copyToClipboard(formatPath(node.pathStr || node.path), 'path')">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
        </svg>
        复制路径
      </button>
    </div>

    <div v-else class="panel-empty">
      <p>选择节点以查看详情</p>
    </div>
  </div>
</template>

<style scoped>
.detail-panel {
  width: 280px;
  background: #111118;
  border-left: 1px solid #1e1e2e;
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
}

.panel-header {
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  border-bottom: 1px solid #1e1e2e;
}

.panel-title {
  font-size: 13px;
  font-weight: 600;
  color: #d4c5a9;
}

.panel-close {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: #5a5a6e;
  border-radius: 4px;
  cursor: pointer;
  font-size: 18px;
  line-height: 1;
}

.panel-close:hover {
  background: #1e1e2e;
  color: #d4c5a9;
}

.panel-content {
  flex: 1;
  overflow-y: auto;
  padding: 12px 0;
}

.panel-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #5a5a6e;
  font-size: 12px;
}

.property-item {
  padding: 12px 16px;
  border-bottom: 1px solid #1a1a22;
}

.property-item:last-child {
  border-bottom: none;
}

.property-label {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: #5a5a6e;
  margin-bottom: 8px;
}

.property-value {
  font-size: 13px;
  color: #d4c5a9;
  word-break: break-all;
  line-height: 1.5;
}

.property-value.editable {
  padding: 8px 12px;
  background: #0d0d15;
  border: 1px solid #1e1e2e;
  border-radius: 4px;
  font-family: 'Consolas', monospace;
  min-height: 32px;
  cursor: text;
  color: #d4c5a9;
}

.property-value.editable:focus {
  border-color: #c8b88a;
  outline: none;
}

.key-value {
  color: #9cdcfe;
}

.edit-hint {
  font-size: 11px;
  color: #5a5a6e;
  margin-left: 8px;
  opacity: 0;
  transition: opacity 150ms;
}

.property-value:hover .edit-hint {
  opacity: 1;
}

.type-badge {
  display: inline-block;
  padding: 2px 8px;
  background: #1e1e2e;
  border-radius: 4px;
  font-size: 12px;
  font-family: 'Consolas', monospace;
  color: #c8b88a;
}

.type-badge.string { color: #89d185; }
.type-badge.number { color: #b5cea8; }
.type-badge.boolean { color: #569cd6; }
.type-badge.null { color: #5a5a6e; }
.type-badge.array { color: #ce9178; }
.type-badge.object { color: #9cdcfe; }

.property-path-wrapper {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.property-path {
  flex: 1;
  font-size: 12px;
  font-family: 'Consolas', monospace;
  color: #5a5a6e;
  background: #0d0d15;
  padding: 8px 12px;
  border-radius: 4px;
  word-break: break-all;
  line-height: 1.6;
}

.path-copy {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: #5a5a6e;
  border-radius: 4px;
  cursor: pointer;
  flex-shrink: 0;
  margin-top: 4px;
}

.path-copy:hover {
  background: #1e1e2e;
  color: #c8b88a;
}

.panel-actions {
  display: flex;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid #1e1e2e;
}

.action-btn {
  flex: 1;
  padding: 8px 12px;
  background: transparent;
  border: 1px solid #2a2a3a;
  color: #5a5a6e;
  font-size: 12px;
  border-radius: 4px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  transition: all 0.2s ease;
}

.action-btn:hover {
  border-color: #c8b88a;
  color: #c8b88a;
}

[data-theme="light"] .detail-panel {
  background: #f8f9fa;
  border-left: 1px solid #e5e5e5;
}

[data-theme="light"] .panel-header {
  border-bottom: 1px solid #e5e5e5;
}

[data-theme="light"] .panel-title {
  color: #202124;
}

[data-theme="light"] .panel-close {
  color: #5f6368;
}

[data-theme="light"] .panel-close:hover {
  background: #e8eaed;
  color: #202124;
}

[data-theme="light"] .property-item {
  border-bottom: 1px solid #e8eaed;
}

[data-theme="light"] .property-label {
  color: #80868b;
}

[data-theme="light"] .property-value {
  color: #202124;
}

[data-theme="light"] .property-value.editable {
  background: #ffffff;
  border-color: #dadce0;
}

[data-theme="light"] .property-value.editable:focus {
  border-color: #1a73e8;
}

[data-theme="light"] .key-value {
  color: #1967d2;
}

[data-theme="light"] .type-badge {
  background: #e8eaed;
}

[data-theme="light"] .type-badge.string { color: #188038; }
[data-theme="light"] .type-badge.number { color: #188038; }
[data-theme="light"] .type-badge.boolean { color: #1967d2; }
[data-theme="light"] .type-badge.null { color: #80868b; }
[data-theme="light"] .type-badge.array { color: #c5221f; }
[data-theme="light"] .type-badge.object { color: #1967d2; }

[data-theme="light"] .property-path {
  color: #5f6368;
  background: #f1f3f4;
}

[data-theme="light"] .panel-actions {
  border-top: 1px solid #e5e5e5;
}

[data-theme="light"] .action-btn {
  border-color: #dadce0;
  color: #5f6368;
}

[data-theme="light"] .action-btn:hover {
  border-color: #1a73e8;
  color: #1a73e8;
}

[data-theme="light"] .panel-empty {
  color: #80868b;
}
</style>