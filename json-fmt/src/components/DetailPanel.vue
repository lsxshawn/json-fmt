<script setup>
import { ref, watch } from 'vue';

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

function getTypeColor(type) {
  const colors = {
    string: 'var(--json-string)',
    number: 'var(--json-number)',
    boolean: 'var(--json-boolean)',
    null: 'var(--json-null)',
    object: 'var(--json-key)',
    array: 'var(--json-key)'
  };
  return colors[type] || 'var(--vscode-text)';
}
</script>

<template>
  <div v-if="visible" class="detail-panel">
    <div class="panel-header">
      <span class="panel-title">属性</span>
      <button class="close-btn" @click="emit('close')">×</button>
    </div>

    <div v-if="node" class="panel-content">
      <div class="detail-section">
        <div class="detail-row">
          <span class="detail-label">属性名</span>
          <span class="detail-value key-value">{{ node.key || '(root)' }}</span>
        </div>

        <div class="detail-row">
          <span class="detail-label">值</span>
          <div class="value-container">
            <template v-if="isEditing">
              <input
                v-model="editValue"
                class="edit-input"
                @keyup.enter="saveEdit"
                @keyup.escape="cancelEdit"
              />
              <div class="edit-actions">
                <button class="edit-btn save" @click="saveEdit">✓</button>
                <button class="edit-btn cancel" @click="cancelEdit">×</button>
              </div>
            </template>
            <template v-else>
              <span
                class="detail-value"
                :style="{ color: getTypeColor(node.type) }"
                @dblclick="startEdit"
              >
                {{ node.displayValue || '(empty)' }}
              </span>
              <button
                v-if="node.type === 'string' || node.type === 'number' || node.type === 'boolean'"
                class="edit-trigger"
                title="双击编辑"
                @click="startEdit"
              >✎</button>
            </template>
          </div>
        </div>

        <div class="detail-row">
          <span class="detail-label">类型</span>
          <span class="detail-value type-badge" :style="{ color: getTypeColor(node.type) }">
            {{ node.type }}
          </span>
        </div>

        <div class="detail-row">
          <span class="detail-label">路径</span>
          <span class="detail-value path-value" :title="node.pathStr">
            {{ node.pathStr || 'root' }}
          </span>
        </div>

        <div v-if="node.childCount !== undefined" class="detail-row">
          <span class="detail-label">
            {{ node.type === 'array' ? '数组长度' : '对象键数' }}
          </span>
          <span class="detail-value">{{ node.childCount }}</span>
        </div>
      </div>
    </div>

    <div v-else class="panel-empty">
      <p>选择节点以查看详情</p>
    </div>
  </div>
</template>

<style scoped>
.detail-panel {
  width: 280px;
  background: var(--vscode-sidebar-bg);
  border-left: 1px solid var(--vscode-border);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px 8px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--vscode-text-secondary);
  border-bottom: 1px solid var(--vscode-border);
}

.close-btn {
  background: transparent;
  border: none;
  color: var(--vscode-text-secondary);
  cursor: pointer;
  font-size: 16px;
  font-family: var(--font-ui);
  font-weight: 400;
  padding: 0 4px;
  border-radius: 2px;
  transition: var(--transition-fast);
}

.close-btn:hover {
  background: var(--vscode-hover-bg);
  color: var(--vscode-text);
}

.panel-content {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
}

.panel-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--vscode-text-secondary);
  font-size: 12px;
}

.detail-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.detail-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.detail-label {
  font-size: 11px;
  color: var(--vscode-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.3px;
}

.detail-value {
  font-size: 13px;
  color: var(--vscode-text);
  font-family: var(--font-code);
  word-break: break-all;
}

.key-value {
  color: var(--json-key);
}

.type-badge {
  display: inline-block;
  padding: 2px 8px;
  background: var(--vscode-selection-bg);
  border-radius: 4px;
  font-size: 12px;
  width: fit-content;
}

.path-value {
  font-size: 11px;
  color: var(--vscode-text-secondary);
  background: var(--vscode-bg);
  padding: 4px 8px;
  border-radius: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.value-container {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.edit-input {
  flex: 1;
  background: var(--vscode-bg);
  border: 1px solid var(--vscode-accent);
  color: var(--vscode-text);
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 13px;
  font-family: var(--font-code);
  outline: none;
}

.edit-actions {
  display: flex;
  gap: 4px;
}

.edit-btn {
  background: transparent;
  border: 1px solid var(--vscode-border);
  color: var(--vscode-text);
  width: 24px;
  height: 24px;
  border-radius: 2px;
  cursor: pointer;
  font-size: 13px;
  font-family: var(--font-ui);
  font-weight: 400;
  transition: var(--transition-fast);
}

.edit-btn:hover {
  background: var(--vscode-hover-bg);
}

.edit-btn.save {
  border-color: var(--vscode-success);
  color: var(--vscode-success);
}

.edit-btn.cancel {
  border-color: var(--vscode-error);
  color: var(--vscode-error);
}

.edit-trigger {
  background: transparent;
  border: none;
  color: var(--vscode-text-secondary);
  cursor: pointer;
  font-size: 13px;
  font-family: var(--font-ui);
  font-weight: 400;
  padding: 2px 4px;
  opacity: 0;
  transition: var(--transition-fast);
}

.value-container:hover .edit-trigger {
  opacity: 1;
}

.edit-trigger:hover {
  color: var(--vscode-accent);
}
</style>
