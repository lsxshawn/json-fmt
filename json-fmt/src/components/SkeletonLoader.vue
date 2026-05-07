<template>
  <div class="skeleton-loader" v-if="loading">
    <div class="skeleton-header">
      <div class="skeleton-line skeleton-line-short"></div>
    </div>
    <div class="skeleton-content">
      <div v-for="i in 10" :key="i" class="skeleton-row" :style="{ paddingLeft: `${(i % 4) * 16}px` }">
        <div class="skeleton-key"></div>
        <div class="skeleton-separator"></div>
        <div class="skeleton-value" :class="{ 'skeleton-value-long': i % 3 === 0 }"></div>
      </div>
    </div>
  </div>
</template>

<script setup>
defineProps({
  loading: {
    type: Boolean,
    default: false
  },
  statusText: {
    type: String,
    default: '正在解析...'
  },
  progress: {
    type: Number,
    default: 0
  }
});
</script>

<style scoped>
.skeleton-loader {
  width: 100%;
  height: 100%;
  padding: 16px;
  box-sizing: border-box;
}

.skeleton-header {
  margin-bottom: 20px;
}

.skeleton-line {
  background: linear-gradient(90deg, #e0e0e0 25%, #f0f0f0 50%, #e0e0e0 75%);
  background-size: 200% 100%;
  animation: loading 1.5s infinite;
  border-radius: 4px;
}

.skeleton-line-short {
  height: 20px;
  width: 40%;
}

.skeleton-content {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.skeleton-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.skeleton-key {
  width: 80px;
  height: 16px;
  background: linear-gradient(90deg, #e0e0e0 25%, #f0f0f0 50%, #e0e0e0 75%);
  background-size: 200% 100%;
  animation: loading 1.5s infinite;
  border-radius: 3px;
}

.skeleton-separator {
  width: 10px;
  height: 16px;
  background: linear-gradient(90deg, #e0e0e0 25%, #f0f0f0 50%, #e0e0e0 75%);
  background-size: 200% 100%;
  animation: loading 1.5s infinite;
  border-radius: 3px;
}

.skeleton-value {
  width: 120px;
  height: 16px;
  background: linear-gradient(90deg, #e0e0e0 25%, #f0f0f0 50%, #e0e0e0 75%);
  background-size: 200% 100%;
  animation: loading 1.5s infinite;
  border-radius: 3px;
}

.skeleton-value-long {
  width: 200px;
}

@keyframes loading {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}

@keyframes spin {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}
</style>