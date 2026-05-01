<script setup>
defineProps({
  fileSize: {
    type: Number,
    default: 0
  },
  totalNodes: {
    type: Number,
    default: 0
  },
  parseTime: {
    type: Number,
    default: 0
  }
});

function formatFileSize(bytes) {
  if (!bytes) return '0 B';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
}
</script>

<template>
  <div class="status-bar">
    <div class="status-left">
      <span class="status-item">{{ formatFileSize(fileSize) }}</span>
      <span class="status-item">{{ totalNodes.toLocaleString() }} 节点</span>
      <span class="status-item">{{ parseTime }}ms</span>
    </div>
    <div class="status-right">
      <span class="status-item">本地处理</span>
    </div>
  </div>
</template>

<style scoped>
.status-bar {
  height: var(--statusbar-height);
  background: transparent;
  border-top: 1px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px;
  font-size: var(--font-size-small);
  color: var(--text-secondary);
  flex-shrink: 0;
}

.status-left,
.status-right {
  display: flex;
  align-items: center;
  gap: 16px;
}

.status-item {
  display: flex;
  align-items: center;
  cursor: default;
  font-family: var(--font-code);
}
</style>
