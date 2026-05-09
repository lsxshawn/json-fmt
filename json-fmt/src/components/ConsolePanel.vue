<script setup>
import { ref, computed } from 'vue'

const props = defineProps({
  steps: {
    type: Array,
    default: () => []
  },
  isExpanded: {
    type: Boolean,
    default: false
  },
  backgroundProgress: {
    type: Number,
    default: 0
  },
  totalNodes: {
    type: Number,
    default: 0
  },
  isParsing: {
    type: Boolean,
    default: false
  },
  parseProgress: {
    type: Number,
    default: 0
  }
})

const emit = defineEmits(['toggle', 'copy', 'background', 'clear'])

function speedClass(ms) {
  if (ms === 0) return ''
  if (ms > 100) return 'slow'
  return ''
}

const totalDuration = computed(() => {
  return props.steps.reduce((sum, s) => sum + (s.duration || 0), 0)
})

function copyLog() {
  const log = props.steps.map(s => {
    const status = s.error ? '✗' : s.done ? '✓' : s.active ? '...' : '-'
    const duration = s.done ? `(${s.duration}ms)` : ''
    return `${status} ${s.message} ${duration} ${s.detail || ''}`
  }).join('\n')
  navigator.clipboard.writeText(log)
  emit('copy')
}

function clearLog() {
  emit('clear')
}

const hasActiveStep = computed(() => props.steps.some(s => s.active))
const allDone = computed(() => props.steps.length > 0 && props.steps.every(s => s.done))
</script>

<template>
  <div class="console-panel" :class="{ expanded: isExpanded }">
    <div class="console-body">
      <div
        v-for="step in steps"
        :key="step.id"
        class="console-line"
        :class="{ active: step.active, done: step.done, error: step.error }"
      >
        <span class="step-indicator">
          <svg v-if="step.error" class="icon" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
          <svg v-else-if="step.done" class="icon" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M20 6L9 17l-5-5"/>
          </svg>
          <svg v-else-if="step.active" class="icon spinning" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
          </svg>
          <span v-else class="icon-dot">•</span>
        </span>
        
        <span class="step-name">{{ step.message }}</span>
        
        <span class="console-duration" :class="speedClass(step.duration)">
          {{ step.done ? step.duration + 'ms' : step.active ? '...' : '' }}
        </span>
      </div>
    </div>
    
    <div class="console-footer" v-if="allDone">
      <span></span>
      <span class="total-duration">总计 {{ totalDuration }}ms</span>
    </div>
    
    <div class="console-actions" v-if="isExpanded && (allDone || hasActiveStep)">
      <div class="console-btn-group">
        <button class="console-btn" @click="copyLog">复制</button>
        <button class="console-btn" @click="clearLog" v-if="allDone">清除</button>
      </div>
      <div class="console-stats" v-if="allDone">
        {{ totalNodes.toLocaleString() }} 节点
      </div>
    </div>
  </div>
</template>

<style scoped>
.console-panel {
  position: absolute;
  bottom: 32px;
  left: 0;
  right: 0;
  max-height: 0;
  background: var(--bg-overlay);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-top: 1px solid var(--border-medium);
  z-index: 50;
  overflow-y: auto;
  opacity: 0;
  transition: max-height 250ms cubic-bezier(0.4, 0, 0.2, 1), opacity 200ms ease;
}

.console-panel.expanded {
  max-height: 160px;
  opacity: 1;
}

.console-body {
  overflow-y: auto;
}

.console-line {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 32px;
  padding: 0 16px;
  font-size: 13px;
  color: var(--text-secondary);
}

.console-line.active {
  color: var(--text-primary);
}

.console-line.done {
  color: var(--text-tertiary);
}

.console-line.error {
  color: var(--error);
}

.step-indicator {
  width: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.icon {
  color: var(--text-tertiary);
}

.console-line.done .icon {
  color: var(--accent);
  opacity: 0.6;
}

.console-line.active .icon {
  color: var(--accent);
}

.console-line.error .icon {
  color: var(--error);
}

.icon-dot {
  font-size: 12px;
  color: var(--text-tertiary);
}

.spinning {
  animation: spin 1s linear infinite;
}

.step-name {
  flex: 1;
  text-align: left;
}

.console-duration {
  width: 50px;
  text-align: right;
  flex-shrink: 0;
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--text-tertiary);
}

.console-duration.slow {
  color: var(--warning);
}

.console-footer {
  display: flex;
  justify-content: space-between;
  height: 24px;
  padding: 0 16px;
  align-items: center;
  font-size: 12px;
  color: var(--text-tertiary);
  border-top: 1px solid var(--border-light);
  background: var(--bg-elevated);
}

.total-duration {
  font-family: var(--font-mono);
}

.console-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  height: 32px;
  padding: 0 16px;
  border-top: 1px solid var(--border-light);
  background: var(--bg-elevated);
}

.console-btn-group {
  display: flex;
  gap: 8px;
}

.console-btn {
  padding: 4px 10px;
  background: transparent;
  border: none;
  color: var(--text-secondary);
  font-size: 12px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.console-btn:hover {
  background: var(--bg-sunken);
  color: var(--text-primary);
}

.console-stats {
  font-size: 12px;
  color: var(--text-tertiary);
  font-family: var(--font-mono);
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>
