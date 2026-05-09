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

const statusText = computed(() => {
  if (props.isParsing) return '解析中';
  if (props.parseStatus === 'error') return '错误';
  return '就绪';
});

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
      <button 
        class="status-toggle" 
        @click="emit('toggle-console')"
        :class="{ active: isConsoleOpen }"
      >
        <span class="status-dot" :class="statusClass"></span>
        <span class="status-label">{{ statusText }}</span>
        <svg 
          class="chevron-icon" 
          :class="{ expanded: isConsoleOpen }"
          width="12" 
          height="12" 
          viewBox="0 0 24 24" 
          fill="none" 
          stroke="currentColor" 
          stroke-width="2"
        >
          <path d="M6 9l6 6 6-6"/>
        </svg>
      </button>
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
  gap: 12px;
}

.status-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  background: transparent;
  border: none;
  color: var(--text-tertiary);
  font-size: 12px;
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.status-toggle:hover {
  background: var(--bg-elevated);
  color: var(--text-secondary);
}

.status-label {
  font-weight: 500;
}

.status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
}

.status-dot.ready {
  background: var(--success);
}

.status-dot.parsing {
  background: var(--warning);
  animation: pulse 1.5s ease-in-out infinite;
}

.status-dot.error {
  background: var(--error);
}

.chevron-icon {
  transition: transform 200ms ease;
}

.chevron-icon.expanded {
  transform: rotate(180deg);
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}
</style>
