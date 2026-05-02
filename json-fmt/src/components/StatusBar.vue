<script setup>
import FileIcon from './icons/FileIcon.vue';
import ListTreeIcon from './icons/ListTreeIcon.vue';
import { formatSize, formatNumber, formatTime } from '@/composables/useFormat';

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
</script>

<template>
  <div class="status-bar">
    <div class="status-left">
      <span class="status-item" v-if="fileSize">
        {{ formatSize(fileSize) }}
      </span>
      <span class="status-divider" v-if="fileSize && (totalNodes || parseTime)">|</span>
      <span class="status-item" v-if="totalNodes">
        {{ formatNumber(totalNodes) }} 节点
      </span>
      <span class="status-divider" v-if="totalNodes && parseTime">|</span>
      <span class="status-item" v-if="parseTime">
        {{ formatTime(parseTime) }}
      </span>
    </div>
    <div class="status-right">
      <span class="status-badge local">
        <span class="dot"></span>
        本地处理
      </span>
    </div>
  </div>
</template>

<style scoped>
.status-bar {
  height: 24px;
  background: var(--bg-tertiary);
  border-top: 1px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px;
  font-size: 12px;
  color: var(--text-secondary);
  flex-shrink: 0;
}

.status-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.status-item {
  display: flex;
  align-items: center;
  gap: 4px;
}

.status-divider {
  color: var(--border);
}

.status-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.status-badge {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: var(--success);
}

.dot {
  width: 6px;
  height: 6px;
  background: var(--success);
  border-radius: 50%;
}
</style>