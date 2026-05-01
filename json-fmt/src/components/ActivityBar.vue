<script setup>
defineProps({
  activeView: {
    type: String,
    default: 'explorer'
  }
});

const emit = defineEmits(['navigate']);

const views = [
  { id: 'explorer', icon: '📁', title: '文件资源管理器' },
  { id: 'search', icon: '🔍', title: '搜索' },
  { id: 'outline', icon: '🌲', title: '大纲' },
  { id: 'settings', icon: '⚙️', title: '设置' }
];
</script>

<template>
  <div class="activity-bar">
    <div class="activity-icons">
      <button
        v-for="view in views"
        :key="view.id"
        class="activity-icon"
        :class="{ active: activeView === view.id }"
        :title="view.title"
        @click="emit('navigate', view.id)"
      >
        <span class="icon">{{ view.icon }}</span>
      </button>
    </div>
    <div class="activity-bottom">
      <button class="activity-icon" title="账户">
        <span class="icon">👤</span>
      </button>
      <button class="activity-icon" title="主题">
        <span class="icon">🎨</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.activity-bar {
  width: var(--activitybar-width);
  background: var(--vscode-activitybar-bg);
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  border-right: 1px solid var(--vscode-border);
  flex-shrink: 0;
}

.activity-icons {
  display: flex;
  flex-direction: column;
  padding-top: 8px;
}

.activity-icon {
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  cursor: pointer;
  position: relative;
  transition: var(--transition-fast);
}

.activity-icon:hover {
  background: var(--vscode-hover-bg);
}

.activity-icon.active {
  background: var(--vscode-hover-bg);
}

.activity-icon.active::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 2px;
  background: var(--vscode-accent);
}

.icon {
  font-size: 24px;
  opacity: 0.7;
}

.activity-icon:hover .icon,
.activity-icon.active .icon {
  opacity: 1;
}

.activity-bottom {
  display: flex;
  flex-direction: column;
  padding-bottom: 8px;
}
</style>
