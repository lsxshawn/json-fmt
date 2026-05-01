<script setup>
import { ref } from 'vue';

const props = defineProps({
  files: {
    type: Array,
    default: () => []
  },
  currentFileId: {
    type: [String, Number],
    default: null
  }
});

const emit = defineEmits(['selectTab', 'closeTab', 'reorder']);

const draggedIndex = ref(null);

function handleDragStart(e, index) {
  draggedIndex.value = index;
  e.dataTransfer.effectAllowed = 'move';
}

function handleDragOver(e, index) {
  e.preventDefault();
  if (draggedIndex.value === null || draggedIndex.value === index) return;
  const newFiles = [...props.files];
  const [removed] = newFiles.splice(draggedIndex.value, 1);
  newFiles.splice(index, 0, removed);
  emit('reorder', newFiles);
  draggedIndex.value = index;
}

function handleDragEnd() {
  draggedIndex.value = null;
}

function handleMiddleClick(e, fileId) {
  if (e.button === 1) {
    emit('closeTab', fileId);
  }
}
</script>

<template>
  <div class="editor-tabs">
    <div class="tabs-container">
      <div
        v-for="file in files"
        :key="file.id"
        class="tab"
        :class="{ active: file.id === currentFileId }"
        @click="emit('selectTab', file.id)"
        @mousedown="handleMiddleClick($event, file.id)"
        draggable="true"
        @dragstart="handleDragStart($event, files.indexOf(file))"
        @dragover="handleDragOver($event, files.indexOf(file))"
        @dragend="handleDragEnd"
      >
        <span class="tab-name">{{ file.name }}</span>
        <span
          class="tab-close"
          @click.stop="emit('closeTab', file.id)"
        >×</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.editor-tabs {
  height: var(--tab-height);
  background: var(--sidebar-bg);
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: flex-end;
  overflow-x: auto;
  overflow-y: hidden;
  flex-shrink: 0;
}

.editor-tabs::-webkit-scrollbar {
  height: 3px;
}

.editor-tabs::-webkit-scrollbar-thumb {
  background: var(--border);
}

.tabs-container {
  display: flex;
  height: 100%;
}

.tab {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 12px;
  height: 100%;
  background: var(--sidebar-bg);
  border-right: 1px solid var(--border);
  cursor: pointer;
  transition: background var(--transition-fast);
  min-width: 100px;
  max-width: 180px;
  position: relative;
}

.tab:hover {
  background: var(--hover-bg);
}

.tab.active {
  background: var(--bg);
}

.tab.active::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 2px;
  background: var(--accent);
}

.tab-name {
  flex: 1;
  font-size: 13px;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tab.active .tab-name {
  color: var(--text);
}

.tab-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  color: var(--text-secondary);
  font-size: 16px;
  cursor: pointer;
  border-radius: 4px;
  opacity: 1;
  transition: all var(--transition-fast);
  flex-shrink: 0;
  line-height: 1;
}

.tab-close:hover {
  background: rgba(0, 0, 0, 0.08);
  color: var(--text);
}
</style>
