<script setup>
import { ref } from 'vue';

const props = defineProps({
  files: {
    type: Array,
    default: () => []
  },
  currentFileId: {
    type: [String, Number],
    default: null
  }
});

const emit = defineEmits(['selectFile', 'deleteFile', 'openFiles', 'clearCache', 'expandAll', 'collapseAll']);

function formatFileSize(bytes) {
  if (!bytes) return '0 B';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}
</script>

<template>
  <div class="sidebar">
    <div class="sidebar-header">
      <span class="sidebar-title">资源管理器</span>
    </div>

    <div class="file-tree">
      <div v-if="files.length === 0" class="empty-tree">
        <div class="empty-text">暂无文件</div>
      </div>

      <div v-else>
        <div
          v-for="file in files"
          :key="file.id"
          class="file-tree-item"
          :class="{ active: file.id === currentFileId }"
          @click="emit('selectFile', file.id)"
        >
          <span class="file-name" :title="file.name">{{ file.name }}</span>
          <div class="file-actions">
            <span class="file-size">{{ formatFileSize(file.size) }}</span>
            <span
              class="file-delete"
              @click.stop="emit('deleteFile', file.id)"
              title="删除文件"
            >×</span>
          </div>
        </div>
      </div>
    </div>

    <div class="sidebar-footer">
      <label class="footer-btn">
        <span class="btn-text">打开文件</span>
        <input
          type="file"
          accept=".json,application/json"
          multiple
          @change="e => emit('openFiles', Array.from(e.target.files))"
        />
      </label>
      <button class="footer-btn" @click="emit('clearCache')">
        <span class="btn-text">清除全部</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.sidebar {
  width: var(--sidebar-width);
  background: var(--sidebar-bg);
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--border);
  flex-shrink: 0;
}

.sidebar-header {
  padding: 16px 16px 12px;
  border-bottom: 1px solid var(--border);
}

.sidebar-title {
  font-size: 11px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-secondary);
}

.file-tree {
  flex: 1;
  overflow-y: auto;
  padding: 8px 0;
}

.empty-tree {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 48px 16px;
}

.empty-text {
  font-size: 13px;
  color: var(--text-secondary);
}

.file-tree-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px;
  cursor: pointer;
  transition: background var(--transition-fast);
}

.file-tree-item:hover {
  background: var(--hover-bg);
}

.file-tree-item.active {
  background: var(--active-bg);
}

.file-name {
  font-size: 13px;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}

.file-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
  margin-left: 8px;
}

.file-size {
  font-size: 11px;
  color: var(--text-secondary);
  flex-shrink: 0;
}

.file-delete {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  font-size: 14px;
  color: var(--text-secondary);
  cursor: pointer;
  border-radius: 3px;
  opacity: 0;
  transition: all var(--transition-fast);
  flex-shrink: 0;
}

.file-tree-item:hover .file-delete {
  opacity: 1;
}

.file-delete:hover {
  background: rgba(0, 0, 0, 0.08);
  color: var(--text);
}

.sidebar-footer {
  padding: 12px 16px;
  border-top: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.footer-btn {
  display: flex;
  align-items: center;
  padding: 8px 0;
  background: transparent;
  border: none;
  color: var(--text-secondary);
  font-size: 13px;
  font-family: var(--font-ui);
  cursor: pointer;
  transition: color var(--transition-fast);
  text-align: left;
}

.footer-btn:hover {
  color: var(--accent);
}

.footer-btn input {
  display: none;
}
</style>
