<script setup>
import { ref } from 'vue';
import FileIcon from './icons/FileIcon.vue';
import CloseIcon from './icons/CloseIcon.vue';
import { formatSize } from '@/composables/useFormat';

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
        <FileIcon :size="14" class="tab-icon" />
        <span class="tab-name">{{ file.name }}</span>
        <span class="tab-size">{{ formatSize(file.size) }}</span>
        <button class="tab-close" @click.stop="emit('closeTab', file.id)">
          <CloseIcon :size="12" />
        </button>
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
  gap: 6px;
  padding: 0 10px;
  height: 36px;
  background: var(--sidebar-bg);
  border-right: 1px solid var(--border);
  cursor: pointer;
  transition: all 150ms;
  min-width: 100px;
  max-width: 180px;
  position: relative;
}

.tab:hover {
  background: var(--hover-bg);
}

.tab.active {
  background: var(--bg-primary);
  color: var(--text-primary);
  border-top: 1px solid var(--accent);
}

.tab-icon {
  color: var(--accent);
  flex-shrink: 0;
}

.tab-name {
  max-width: 120px;
  font-size: 13px;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tab.active .tab-name {
  color: var(--text-primary);
}

.tab-size {
  font-size: 10px;
  color: var(--text-secondary);
  padding: 1px 4px;
  background: var(--bg-hover);
  border-radius: 3px;
  flex-shrink: 0;
}

.tab-close {
  width: 16px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  border-radius: 3px;
  cursor: pointer;
  opacity: 0;
  transition: all 150ms;
  flex-shrink: 0;
}

.tab:hover .tab-close {
  opacity: 1;
}

.tab-close:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}
</style>
