<script setup>
import { computed } from 'vue'

const props = defineProps({
  progress: {
    type: Number,
    default: 0
  },
  currentStep: {
    type: String,
    default: ''
  },
  isParsing: {
    type: Boolean,
    default: false
  }
})

const displayProgress = computed(() => Math.min(props.progress, 100))
</script>

<template>
  <div class="parse-progress" v-if="isParsing">
    <div class="progress-bar" :style="{ width: displayProgress + '%' }"></div>
    <span class="progress-text">{{ currentStep }}</span>
  </div>
</template>

<style scoped>
.parse-progress {
  position: relative;
  height: 2px;
  background: transparent;
  overflow: visible;
}

.progress-bar {
  height: 100%;
  background: linear-gradient(90deg, var(--accent), var(--accent-light));
  transition: width 300ms ease;
  box-shadow: 0 0 4px var(--accent);
  border-radius: 1px;
}

.progress-text {
  position: absolute;
  right: 12px;
  top: 4px;
  font-size: 11px;
  color: var(--text-secondary);
  background: var(--bg-primary);
  padding: 2px 8px;
  border-radius: 4px;
  border: 1px solid var(--border);
  white-space: nowrap;
}
</style>