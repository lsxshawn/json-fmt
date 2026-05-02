<script setup>
import FolderIcon from './icons/FolderIcon.vue';
import SearchIcon from './icons/SearchIcon.vue';
import ListTreeIcon from './icons/ListTreeIcon.vue';
import MoreIcon from './icons/MoreIcon.vue';

defineProps({
  activeView: {
    type: String,
    default: 'explorer'
  }
});

const emit = defineEmits(['navigate']);

const views = [
  { id: 'explorer', title: '文件资源管理器', icon: 'folder' },
  { id: 'search', title: '搜索', icon: 'search' },
  { id: 'outline', title: '大纲', icon: 'list-tree' },
  { id: 'settings', title: '设置', icon: 'more' }
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
        <FolderIcon v-if="view.id === 'explorer'" :size="24" class="icon-svg"/>
        <SearchIcon v-else-if="view.id === 'search'" :size="24" class="icon-svg"/>
        <ListTreeIcon v-else-if="view.id === 'outline'" :size="24" class="icon-svg"/>
        <MoreIcon v-else-if="view.id === 'settings'" :size="24" class="icon-svg"/>
      </button>
    </div>
    <div class="activity-bottom">
      <button class="activity-icon" title="账户">
        <svg class="icon-svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/>
          <circle cx="12" cy="7" r="4"/>
        </svg>
      </button>
    </div>
  </div>
</template>

<style scoped>
.activity-bar {
  width: 48px;
  background: #2c2c2c;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
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
  transition: all 150ms ease;
  color: #858585;
}

.activity-icon:hover {
  color: #ffffff;
  background: rgba(255, 255, 255, 0.1);
}

.activity-icon.active {
  color: #ffffff;
}

.activity-icon.active::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 2px;
  background: #007acc;
}

.icon-svg {
  width: 24px;
  height: 24px;
}

.activity-bottom {
  display: flex;
  flex-direction: column;
  padding-bottom: 8px;
}
</style>