<script setup>
import { computed } from 'vue'

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

const totalDuration = computed(() => {
  return props.steps.reduce((sum, s) => sum + (s.duration || 0), 0)
})

const activeStep = computed(() => {
  return props.steps.find(s => s.active)
})

const completedSteps = computed(() => {
  return props.steps.filter(s => s.done)
})

const progressPercent = computed(() => {
  if (props.steps.length === 0) return 0
  return (completedSteps.value.length / props.steps.length) * 100
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
</script>

<template>
  <div class="console-panel" :class="{ expanded: isExpanded }">
    <!-- 进度条式步骤 -->
    <div class="console-body">
      <div
        v-for="step in steps"
        :key="step.id"
        class="console-step"
        :class="{ active: step.active, done: step.done, error: step.error }"
      >
        <span class="step-name">{{ step.message }}</span>
        
        <!-- 进度条 -->
        <div class="step-progress-bar">
          <div 
            class="step-progress-fill"
            :style="{ width: step.done ? '100%' : step.active ? '60%' : '0%' }"
          ></div>
        </div>
        
        <span class="step-duration" v-if="step.done">
          {{ step.duration }}ms
        </span>
        <span class="step-pulse" v-else-if="step.active"></span>
      </div>
    </div>
    
    <!-- 底部信息 -->
    <div class="console-footer" v-if="steps.length > 0">
      <div class="footer-left">
        <span class="total-time" v-if="totalDuration > 0">
          {{ totalDuration }}ms
        </span>
      </div>
      <div class="footer-right">
        <button class="console-btn" @click="copyLog">复制</button>
        <button class="console-btn" @click="clearLog" v-if="completedSteps.length === steps.length">清除</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.console-panel {
  position: absolute;
  bottom: 32px;
  left: 0;
  right: 60px;  /* 给 minimap 留空间 */
  max-height: 0;
  background: var(--bg-overlay);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  z-index: 50;
  overflow: hidden;
  opacity: 0;
  transition: max-height 250ms cubic-bezier(0.4, 0, 0.2, 1), opacity 200ms ease;
  /* 不用边框，用阴影自然浮起 */
  box-shadow: var(--shadow-lg);
  border-radius: var(--radius-lg) var(--radius-lg) 0 0;
}

.console-panel.expanded {
  max-height: 200px;
  opacity: 1;
}

.console-body {
  padding: 12px 16px;
  overflow-y: auto;
}

.console-step {
  display: flex;
  align-items: center;
  gap: 12px;
  height: 28px;
  font-size: 13px;
  color: var(--text-secondary);
  transition: opacity 200ms ease;
}

/* 已完成的步骤淡化到 30% */
.console-step.done {
  opacity: 0.3;
}

.console-step.active {
  color: var(--text-primary);
  opacity: 1;
}

.console-step.error {
  color: var(--error);
  opacity: 1;
}

.step-name {
  width: 80px;
  flex-shrink: 0;
  font-weight: var(--font-normal);
}

.step-progress-bar {
  flex: 1;
  height: 2px;
  background: var(--border-light);
  border-radius: 1px;
  overflow: hidden;
}

.step-progress-fill {
  height: 100%;
  background: var(--accent);
  transition: width 300ms ease;
}

.console-step.done .step-progress-fill {
  background: var(--accent-muted);
}

.step-duration {
  width: 50px;
  text-align: right;
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-tertiary);
}

/* 脉冲光点 - 呼吸灯效果 */
.step-pulse {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--accent);
  animation: breathe 2s ease-in-out infinite;
}

@keyframes breathe {
  0%, 100% { 
    opacity: 0.4;
    transform: scale(0.8);
  }
  50% { 
    opacity: 1;
    transform: scale(1);
  }
}

.console-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  height: 36px;
  padding: 0 16px;
  border-top: 1px solid var(--border-light);
}

.total-time {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--text-tertiary);
}

.footer-right {
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
</style>
