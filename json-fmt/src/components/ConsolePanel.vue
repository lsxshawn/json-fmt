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
  }
})

const emit = defineEmits(['toggle', 'copy', 'background', 'clear'])

function durationClass(ms) {
  if (ms === 0) return ''
  if (ms < 100) return 'fast'
  if (ms > 500) return 'slow'
  return ''
}

function formatTime(timestamp) {
  if (!timestamp) return ''
  const date = new Date(timestamp)
  return date.toLocaleTimeString('zh-CN', { hour12: false })
}

const totalDuration = computed(() => {
  return props.steps.reduce((sum, s) => sum + (s.duration || 0), 0)
})

const statusClass = computed(() => {
  if (props.steps.some(s => s.error)) return 'error'
  if (props.steps.some(s => s.active)) return 'running'
  if (props.steps.some(s => !s.done)) return 'pending'
  return 'done'
})

const summaryText = computed(() => {
  const done = props.steps.filter(s => s.done).length
  const total = props.steps.length
  if (done === total) {
    const ms = totalDuration.value
    if (ms < 500) return `完成 · 极速 ${ms}ms`
    if (ms > 3000) return `完成 · 大文件优化中 ${ms}ms`
    return `完成 · ${ms}ms`
  }
  const activeStep = props.steps.find(s => s.active)
  return `${done}/${total} · ${activeStep?.message || ''}`
})

const hasActiveStep = computed(() => props.steps.some(s => s.active))
const allDone = computed(() => props.steps.length > 0 && props.steps.every(s => s.done))

function toggle() {
  emit('toggle')
}

function copyLog() {
  const log = props.steps.map(s => {
    const time = formatTime(s.endTime || s.startTime)
    const status = s.error ? '✗' : s.done ? '✓' : s.active ? '...' : '-'
    const duration = s.done ? `(${s.duration}ms)` : ''
    return `${time} ${status} ${s.message} ${duration} ${s.detail || ''}`
  }).join('\n')
  navigator.clipboard.writeText(log)
  emit('copy')
}

function runInBackground() {
  emit('background')
}

function clearLog() {
  emit('clear')
}
</script>

<template>
  <div class="console-panel" :class="{ expanded: isExpanded }">
    <div class="console-header" @click="toggle">
      <div class="console-status-icon" :class="statusClass"></div>
      <span class="console-title">解析日志</span>
      <span class="console-summary" v-if="!isExpanded">
        {{ summaryText }}
      </span>
      <span class="console-toggle">{{ isExpanded ? '▲' : '▼' }}</span>
    </div>
    
    <div class="console-body" v-show="isExpanded">
      <div
        v-for="step in steps"
        :key="step.id"
        class="console-line"
        :class="{ active: step.active, done: step.done, error: step.error }"
      >
        <span class="console-time">{{ formatTime(step.endTime || step.startTime) }}</span>
        <span class="console-duration" :class="durationClass(step.duration)">
          {{ step.done ? step.duration + 'ms' : step.active ? '...' : '-' }}
        </span>
        <span class="console-icon">
          <span v-if="step.error" class="icon-error">✗</span>
          <span v-else-if="step.done" class="icon-done">✓</span>
          <span v-else-if="step.active" class="icon-active">◐</span>
          <span v-else class="icon-pending">•</span>
        </span>
        <span class="console-step">{{ step.message }}</span>
        
        <span class="console-detail" v-if="!step.active && step.done">
          {{ step.detail }}
        </span>
        <div class="console-progress" v-else-if="step.active && step.id === 'background'">
          <div class="console-progress-bar" :style="{ width: backgroundProgress + '%' }"></div>
        </div>
      </div>
      
      <div class="console-line console-total" v-if="allDone">
        <span class="console-time"></span>
        <span class="console-duration" :class="durationClass(totalDuration)">
          {{ totalDuration }}ms
        </span>
        <span class="console-icon"></span>
        <span class="console-step">总计</span>
        <span class="console-detail">{{ totalNodes.toLocaleString() }} 节点</span>
      </div>
    </div>
    
    <div class="console-actions" v-if="isExpanded">
      <button class="console-btn" @click="copyLog">复制日志</button>
      <button class="console-btn" @click="runInBackground" v-if="hasActiveStep">
        后台运行
      </button>
      <button class="console-btn" @click="clearLog" v-if="allDone">
        清除
      </button>
    </div>
  </div>
</template>

<style scoped>
.console-panel {
  position: fixed;
  bottom: 28px;
  left: 0;
  right: 0;
  background: var(--bg-secondary, #111118);
  border-top: 1px solid var(--border, #1e1e2e);
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 12px;
  z-index: 100;
  transition: transform 250ms cubic-bezier(0.4, 0, 0.2, 1), opacity 200ms ease;
  transform: translateY(calc(100% - 28px));
}

.console-panel.expanded {
  transform: translateY(0);
}

.console-header {
  height: 28px;
  display: flex;
  align-items: center;
  padding: 0 12px;
  background: var(--bg-tertiary, #0d0d15);
  border-bottom: 1px solid var(--border, #1e1e2e);
  cursor: pointer;
  user-select: none;
}

.console-header:hover {
  background: var(--bg-hover, #1e1e2e);
}

.console-status-icon {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-right: 8px;
  flex-shrink: 0;
}

.console-status-icon.running {
  background: var(--accent, #c8b88a);
  animation: pulse 1.5s ease-in-out infinite;
}

.console-status-icon.done {
  background: var(--success, #4a9b8e);
}

.console-status-icon.error {
  background: var(--error, #8b3a3a);
}

.console-status-icon.pending {
  background: var(--text-tertiary, #3a3a4e);
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

.console-title {
  color: var(--text-secondary, #5a5a6e);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-right: auto;
}

.console-summary {
  color: var(--text-tertiary, #3a3a4e);
  font-size: 11px;
  margin-right: 12px;
}

.console-toggle {
  color: var(--text-secondary, #5a5a6e);
  font-size: 10px;
  transition: transform 200ms;
}

.console-panel.expanded .console-toggle {
  transform: rotate(180deg);
}

.console-body {
  max-height: 160px;
  overflow-y: auto;
  padding: 4px 0;
}

.console-line {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 2px 12px;
  height: 20px;
  color: var(--text-secondary, #5a5a6e);
  transition: background 100ms;
  animation: slideIn 150ms ease;
}

@keyframes slideIn {
  from {
    opacity: 0;
    transform: translateX(-10px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

.console-line:hover {
  background: var(--bg-hover, #1e1e2e);
}

.console-line.active {
  color: var(--text-primary, #d4c5a9);
}

.console-line.done {
  color: var(--text-tertiary, #3a3a4e);
}

.console-line.error {
  color: var(--error, #8b3a3a);
}

.console-line.console-total {
  border-top: 1px solid var(--border, #1e1e2e);
  margin-top: 4px;
}

.console-time {
  width: 60px;
  flex-shrink: 0;
  color: var(--text-tertiary, #3a3a4e);
  font-size: 11px;
}

.console-duration {
  width: 70px;
  flex-shrink: 0;
  text-align: right;
  color: var(--accent, #c8b88a);
  font-size: 11px;
  transition: color 200ms;
}

.console-duration.fast {
  color: var(--success, #4a9b8e);
}

.console-duration.slow {
  color: var(--warning, #b8860b);
}

.console-icon {
  width: 16px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.icon-done {
  color: var(--success, #4a9b8e);
}

.icon-active {
  color: var(--accent, #c8b88a);
  animation: spin 1s linear infinite;
}

.icon-pending {
  color: var(--text-tertiary, #3a3a4e);
}

.icon-error {
  color: var(--error, #8b3a3a);
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.console-step {
  width: 80px;
  flex-shrink: 0;
}

.console-detail {
  margin-left: auto;
  color: var(--text-tertiary, #3a3a4e);
  font-size: 11px;
  text-align: right;
}

.console-progress {
  width: 80px;
  height: 3px;
  background: var(--bg-tertiary, #0d0d15);
  border-radius: 2px;
  overflow: hidden;
  margin-left: auto;
}

.console-progress-bar {
  height: 100%;
  background: var(--accent, #c8b88a);
  border-radius: 2px;
  transition: width 300ms linear;
}

.console-actions {
  display: flex;
  gap: 8px;
  padding: 4px 12px;
  border-top: 1px solid var(--border, #1e1e2e);
}

.console-btn {
  padding: 2px 8px;
  background: transparent;
  border: 1px solid var(--border, #1e1e2e);
  color: var(--text-secondary, #5a5a6e);
  font-size: 11px;
  border-radius: 3px;
  cursor: pointer;
}

.console-btn:hover {
  border-color: var(--accent, #c8b88a);
  color: var(--accent, #c8b88a);
}

[data-theme="light"] .console-panel {
  background: #f8f9fa;
  border-top-color: #e5e5e5;
}

[data-theme="light"] .console-header {
  background: #f1f3f4;
  border-bottom-color: #e5e5e5;
}

[data-theme="light"] .console-line {
  color: #5f6368;
}

[data-theme="light"] .console-line.done {
  color: #80868b;
}

[data-theme="light"] .console-line.error {
  color: #d93026;
}

[data-theme="light"] .console-duration {
  color: #1a73e8;
}

[data-theme="light"] .console-duration.slow {
  color: #f9ab00;
}

[data-theme="light"] .console-duration.fast {
  color: #34a853;
}

[data-theme="light"] .console-status-icon.running {
  background: #1a73e8;
}

[data-theme="light"] .console-status-icon.done {
  background: #34a853;
}

[data-theme="light"] .console-status-icon.error {
  background: #d93026;
}

[data-theme="light"] .console-btn {
  border-color: #dadce0;
  color: #5f6368;
}

[data-theme="light"] .console-btn:hover {
  border-color: #1a73e8;
  color: #1a73e8;
}
</style>