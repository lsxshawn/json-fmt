<script setup>
import { ref } from 'vue';
import PlusIcon from './icons/PlusIcon.vue';

const fileInputRef = ref(null);

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

function openFileClick() {
  emit('openFiles');
}
</script>

<template>
  <div class="sidebar">
    <div class="sidebar-header">
      <div class="header-left">
        <span class="sidebar-title">文件</span>
        <span class="file-count" v-if="files.length">{{ files.length }}</span>
      </div>
      <button class="sidebar-action" title="新建文件" @click="emit('openFiles')">
        <PlusIcon :size="14" />
      </button>
    </div>

    <div class="sidebar-content">
      <div v-if="files.length === 0" class="empty-state">
        <svg class="empty-icon" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
          <path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"/>
        </svg>
        <p class="empty-title">还没有文件</p>
        <p class="empty-desc">点击打开文件开始浏览 JSON</p>
      </div>

      <div v-else class="file-list">
        <div
          v-for="file in files"
          :key="file.id"
          class="file-item"
          :class="{ active: file.id === currentFileId }"
          @click="emit('selectFile', file.id)"
        >
          <svg class="file-icon" width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M3 1h7l3 3v10a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1z"/>
          </svg>
          <span class="file-name" :title="file.name">{{ file.name }}</span>
          <span class="file-size">{{ formatFileSize(file.size) }}</span>
          <button 
            class="file-close" 
            @click.stop="emit('deleteFile', file.id)"
            title="关闭文件"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>
      </div>
    </div>

    <div class="sidebar-footer">
      <button class="footer-btn" @click="openFileClick">
        <svg class="btn-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"/>
        </svg>
        <span>打开文件</span>
        <input
          ref="fileInputRef"
          type="file"
          accept=".json,application/json"
          multiple
          @change="e => emit('openFiles', Array.from(e.target.files))"
        />
      </button>
      <button class="footer-btn" :disabled="files.length === 0" @click="emit('clearCache')">
        <svg class="btn-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
        </svg>
        <span>清除全部</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.sidebar {
  width: 240px;
  display: flex;
  flex-direction: column;
  background: var(--bg-elevated);
  border-right: 1px solid var(--border-light);
  flex-shrink: 0;
}

.sidebar-header {
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 6px;
}

.sidebar-title {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-tertiary);
}

.file-count {
  font-size: 10px;
  padding: 1px 5px;
  background: var(--border-light);
  border-radius: 8px;
  color: var(--text-secondary);
  font-weight: 500;
}

.sidebar-action {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: var(--text-tertiary);
  border-radius: var(--radius-md);
  cursor: pointer;
  opacity: 0;
  transition: all var(--transition-fast);
}

.sidebar-header:hover .sidebar-action {
  opacity: 1;
}

.sidebar-action:hover {
  background: var(--bg-sunken);
  color: var(--text-secondary);
}

.sidebar-content {
  flex: 1;
  overflow-y: auto;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
  text-align: center;
}

.empty-icon {
  color: var(--text-tertiary);
  margin-bottom: 16px;
  opacity: 0.5;
}

.empty-title {
  font-size: 14px;
  color: var(--text-primary);
  margin-bottom: 4px;
}

.empty-desc {
  font-size: 12px;
  color: var(--text-secondary);
}

.file-list {
  padding: 4px;
}

.file-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-radius: var(--radius-md);
  cursor: pointer;
  font-size: 13px;
  color: var(--text-secondary);
  transition: all 100ms;
}

.file-item:hover {
  background: var(--accent-subtle);
  color: var(--text-primary);
}

.file-item.active {
  background: var(--accent-light);
  color: var(--accent);
}

.file-icon {
  color: var(--accent);
  flex-shrink: 0;
}

.file-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-size {
  font-size: 11px;
  color: var(--text-tertiary);
  flex-shrink: 0;
  margin-right: 4px;
}

.file-close {
  width: 18px;
  height: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: var(--text-tertiary);
  border-radius: var(--radius-sm);
  cursor: pointer;
  opacity: 0;
  transition: all var(--transition-fast);
}

.file-item:hover .file-close {
  opacity: 1;
}

.file-close:hover {
  background: var(--bg-sunken);
  color: var(--text-secondary);
}

.sidebar-footer {
  padding: 12px;
  border-top: 1px solid var(--border-light);
  display: flex;
  flex-direction: column;
  gap: 4px;
  position: sticky;
  bottom: 0;
  background: inherit;
}

.footer-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 8px 12px;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  font-size: 13px;
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.footer-btn:hover {
  background: var(--bg-sunken);
  color: var(--text-primary);
}

.footer-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.footer-btn:disabled:hover {
  background: transparent;
}

.footer-btn input {
  display: none;
}

.btn-icon {
  flex-shrink: 0;
}
</style>
