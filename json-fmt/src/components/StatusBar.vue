<script setup>
import FileIcon from './icons/FileIcon.vue';
import ListTreeIcon from './icons/ListTreeIcon.vue';
import { formatSize, formatNumber, formatTime } from '@/composables/useFormat';

const props = defineProps({
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
  },
  isParsing: {
    type: Boolean,
    default: false
  },
  parseStatus: {
    type: String,
    default: ''
  }
});

const emit = defineEmits(['toggle-console']);
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
      <button class="console-toggle" @click="emit('toggle-console')" title="切换控制台">
        <span class="console-text">就绪</span>
        <span class="chevron-icon">▼</span>
      </button>
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
  background: #f1f3f4;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px;
  font-size: 12px;
  color: #5f6368;
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

.chevron-icon {
  font-size: 10px;
  color: #5f6368;
  margin-left: 4px;
}

.loading-spinner {
  width: 10px;
  height: 10px;
  border: 1px solid var(--accent);
  border-top-color: transparent;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.status-item.parsing {
  color: var(--accent);
}

.console-toggle {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  background: transparent;
  border: none;
  border-radius: 4px;
  color: var(--text-secondary);
  font-size: 11px;
  cursor: pointer;
  transition: background 150ms;
}

.console-toggle:hover {
  background: var(--bg-hover);
}

.console-text {
  margin-right: 2px;
}
</style>