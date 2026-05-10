<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue';
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
  },
  currentLine: {
    type: Number,
    default: 0
  },
  windowSize: {
    type: Number,
    default: 100
  },
  scrollTop: {
    type: Number,
    default: 0
  },
  maxScroll: {
    type: Number,
    default: 0
  }
});

const emit = defineEmits(['toggle-console', 'jump']);

const statusClass = computed(() => {
  if (props.isParsing) return 'parsing';
  if (props.parseStatus === 'error') return 'error';
  return 'ready';
});

const WINDOW_SIZE = 100;
const progressRef = ref(null);
const showInput = ref(false);
const jumpLineInput = ref('');
const jumpLineInputRef = ref(null);
const isDragging = ref(false);

const percentage = computed(() => {
  if (props.totalNodes <= 1) return 0;
  return Math.min(100, Math.max(0, (props.currentLine / (props.totalNodes - 1)) * 100));
});

function getLineFromClientX(clientX) {
  if (!progressRef.value) return 0;
  const rect = progressRef.value.getBoundingClientRect();
  const x = clientX - rect.left;
  const pct = x / rect.width;
  return Math.floor(pct * props.totalNodes);
}

function handleMouseDown(e) {
  isDragging.value = true;
  document.addEventListener('mousemove', handleMouseMove);
  document.addEventListener('mouseup', handleMouseUp);
  const newLine = getLineFromClientX(e.clientX);
  emit('jump', newLine);
}

function handleMouseMove(e) {
  if (!isDragging.value) return;
  const newLine = getLineFromClientX(e.clientX);
  emit('jump', newLine);
}

function handleMouseUp() {
  isDragging.value = false;
  document.removeEventListener('mousemove', handleMouseMove);
  document.removeEventListener('mouseup', handleMouseUp);
}

function handleDoubleClick() {
  if (props.totalNodes <= 0) return;
  showInput.value = true;
  jumpLineInput.value = String(props.currentLine + 1);
  nextTick(() => {
    jumpLineInputRef.value?.focus();
    jumpLineInputRef.value?.select();
  });
}

function confirmJump() {
  const line = parseInt(jumpLineInput.value, 10);
  if (!isNaN(line) && line >= 1 && line <= props.totalNodes) {
    emit('jump', line - 1);
  }
  showInput.value = false;
}

function cancelJump() {
  showInput.value = false;
}

function handleInputKeydown(e) {
  if (e.key === 'Enter') confirmJump();
  if (e.key === 'Escape') cancelJump();
}

watch(showInput, (newVal) => {
  if (newVal) {
    setTimeout(() => {
      document.addEventListener('click', handleClickOutside);
    }, 0);
  } else {
    document.removeEventListener('click', handleClickOutside);
  }
});

function handleClickOutside(e) {
  const el = document.querySelector('.jump-input-container');
  if (el && !el.contains(e.target)) {
    showInput.value = false;
  }
}

onUnmounted(() => {
  document.removeEventListener('mousemove', handleMouseMove);
  document.removeEventListener('mouseup', handleMouseUp);
  document.removeEventListener('click', handleClickOutside);
});
</script>

<template>
  <div class="status-bar-wrapper">
    <div class="global-progress-area" v-if="totalNodes > 0">
      <div
        ref="progressRef"
        class="global-progress"
        @mousedown="handleMouseDown"
        @dblclick="handleDoubleClick"
      >
        <div class="global-progress-bg"></div>
        <div class="global-progress-fill" :style="{ width: percentage + '%' }"></div>
        <div class="global-progress-thumb" :style="{ left: percentage + '%' }"></div>
        <div class="global-progress-label">{{ percentage.toFixed(1) }}%</div>
      </div>
      <div class="jump-input-container" v-if="showInput">
        <span>跳到第</span>
        <input
          ref="jumpLineInputRef"
          v-model="jumpLineInput"
          type="number"
          :min="1"
          :max="totalNodes"
          @keydown="handleInputKeydown"
        />
        <span>行</span>
        <button class="jump-confirm" @click="confirmJump">确定</button>
        <button class="jump-cancel" @click="cancelJump">取消</button>
      </div>
    </div>
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
      
      <div class="status-center">
        <span class="status-position">
          第 {{ formatNumber(Math.min(currentLine + 1, totalNodes)) }} 行 / 共 {{ formatNumber(totalNodes) }} 行
        </span>
      </div>
      
      <div class="status-right">
        <button 
          class="status-dot" 
          :class="statusClass"
          @click="emit('toggle-console')"
          :title="isParsing ? '解析中' : parseStatus === 'error' ? '错误' : '就绪'"
        ></button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.status-bar-wrapper {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  background: var(--bg-sunken);
}

.global-progress-area {
  position: relative;
  height: 20px;
  user-select: none;
}

.global-progress {
  position: absolute;
  top: 8px;
  left: 0;
  right: 0;
  height: 4px;
  cursor: pointer;
}

.global-progress-bg {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 4px;
  background: var(--border-light);
}

.global-progress-fill {
  position: absolute;
  top: 0;
  left: 0;
  height: 4px;
  background: var(--accent);
  transition: width 0.08s linear;
}

.global-progress-thumb {
  position: absolute;
  top: -4px;
  width: 12px;
  height: 12px;
  margin-left: -6px;
  background: var(--accent);
  border-radius: 50%;
  opacity: 0;
  transition: opacity 0.15s ease;
}

.global-progress:hover .global-progress-thumb {
  opacity: 1;
}

.global-progress-label {
  position: absolute;
  top: -18px;
  right: 12px;
  font-size: 10px;
  color: var(--text-tertiary);
  padding: 2px 6px;
  background: var(--bg-elevated);
  border-radius: var(--radius-sm);
  font-family: var(--font-mono);
}

.jump-input-container {
  position: absolute;
  top: 24px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  background: var(--bg-base);
  border: 1px solid var(--border-medium);
  border-radius: var(--radius-md);
  z-index: 100;
  font-size: 12px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.12);
}

.jump-input-container input {
  width: 80px;
  padding: 4px 8px;
  border: 1px solid var(--border-medium);
  border-radius: var(--radius-sm);
  background: var(--bg-base);
  color: var(--text-primary);
  font-size: 12px;
  font-family: var(--font-mono);
  outline: none;
}

.jump-input-container input:focus {
  border-color: var(--accent);
}

.jump-confirm,
.jump-cancel {
  padding: 3px 8px;
  border: none;
  border-radius: var(--radius-sm);
  font-size: 11px;
  cursor: pointer;
  transition: background-color 0.15s ease;
}

.jump-confirm {
  background: var(--accent);
  color: var(--text-inverse);
}

.jump-confirm:hover {
  background: var(--accent-hover);
}

.jump-cancel {
  background: var(--bg-elevated);
  color: var(--text-secondary);
}

.jump-cancel:hover {
  background: var(--bg-sunken);
}

.status-bar {
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  background: var(--bg-base);
  border-top: 1px solid var(--border-light);
  font-size: 12px;
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
  display: flex;
  align-items: center;
  justify-content: center;
}

.status-position {
  color: var(--text-secondary);
  font-family: var(--font-mono);
  font-size: 11px;
}

.status-right {
  display: flex;
  align-items: center;
}

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
