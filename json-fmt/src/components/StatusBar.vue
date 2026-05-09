<script setup>
import { computed } from 'vue';
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
  },
  isConsoleOpen: {
    type: Boolean,
    default: false
  }
});

const emit = defineEmits(['toggle-console']);

const statusClass = computed(() => {
  if (props.isParsing) return 'parsing';
  if (props.parseStatus === 'error') return 'error';
  return 'ready';
});
</script>

<template>
  <div class="status-bar">
    <div class="status-left">
      <span class="status-item" v-if="fileSize">
        {{ formatSize(fileSize) }}
      </span>
      <span class="status-separator" v-if="fileSize && (totalNodes || parseTime)">|</span>
      <span class="status-item" v-if="totalNodes">
        {{ formatNumber(totalNodes) }} 节点
      </span>
      <span class="status-separator" v-if="totalNodes && parseTime">|</span>
      <span class="status-item" v-if="parseTime">
        {{ formatTime(parseTime) }}
      </span>
    </div>
    
    <div class="status-center"></div>
    
    <div class="status-right">
      <!-- 状态光点 - 极简到只剩一个光点 -->
      <button 
        class="status-dot" 
        :class="statusClass"
        @click="emit('toggle-console')"
        :title="isParsing ? '解析中' : parseStatus === 'error' ? '错误' : '就绪'"
      ></button>
    </div>
  </div>
</template>

<style scoped>
.status-bar {
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  background: var(--bg-base);
  border-top: 1px solid var(--border-light);
  font-size: 12px;
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
  color: var(--text-secondary);
  font-family: var(--font-mono);
  font-weight: var(--font-normal);
}

.status-separator {
  color: var(--border-medium);
}

.status-center {
  flex: 1;
}

.status-right {
  display: flex;
  align-items: center;
}

/* 状态光点 - Apple 设备风格 */
.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  border: none;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.status-dot.ready {
  background: var(--success);
}

.status-dot.parsing {
  background: var(--warning);
  animation: breathe 2s ease-in-out infinite;
}

.status-dot.error {
  background: var(--error);
}

.status-dot:hover {
  transform: scale(1.2);
}

@keyframes breathe {
  0%, 100% { 
    opacity: 0.4;
    transform: scale(0.9);
  }
  50% { 
    opacity: 1;
    transform: scale(1);
  }
}
</style>
