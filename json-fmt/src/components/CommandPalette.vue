<script setup>
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue';
import Icon from '@/components/icons/Icon.vue';

const emit = defineEmits([
  'close',
  'openFile',
  'saveFile',
  'format',
  'escape',
  'toggleTheme',
  'search'
]);

const props = defineProps({
  visible: {
    type: Boolean,
    default: false
  }
});

const inputRef = ref(null);
const query = ref('');
const selectedIndex = ref(0);

const commands = [
  { id: 'open', icon: 'folder', text: '打开文件', shortcut: 'Ctrl+O', handler: () => emit('openFile') },
  { id: 'save', icon: 'save', text: '保存文件', shortcut: 'Ctrl+S', handler: () => emit('saveFile') },
  { id: 'format', icon: 'sparkles', text: '格式化 JSON', shortcut: 'Ctrl+Shift+F', handler: () => emit('format') },
  { id: 'escape', icon: 'refresh', text: '转义/反转义', shortcut: '', handler: () => emit('escape') },
  { id: 'theme', icon: 'sparkles', text: '切换主题', shortcut: '', handler: () => emit('toggleTheme') },
  { id: 'search', icon: 'search', text: '搜索', shortcut: 'Ctrl+F', handler: () => emit('search') }
];

const filteredCommands = computed(() => {
  if (!query.value.trim()) return commands;
  const q = query.value.toLowerCase();
  return commands.filter(cmd => cmd.text.toLowerCase().includes(q));
});

function handleKeydown(e) {
  if (e.key === 'Escape') {
    emit('close');
    return;
  }
  if (e.key === 'Enter' && filteredCommands.value[selectedIndex.value]) {
    filteredCommands.value[selectedIndex.value].handler();
    emit('close');
    return;
  }
  if (e.key === 'ArrowUp') {
    e.preventDefault();
    selectedIndex.value = Math.max(0, selectedIndex.value - 1);
    return;
  }
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    selectedIndex.value = Math.min(filteredCommands.value.length - 1, selectedIndex.value + 1);
  }
}

watch(() => props.visible, (val) => {
  if (val) {
    query.value = '';
    selectedIndex.value = 0;
    nextTick(() => {
      inputRef.value?.focus();
    });
    window.addEventListener('keydown', handleKeydown);
  } else {
    window.removeEventListener('keydown', handleKeydown);
  }
});

function handleCommandClick(cmd) {
  cmd.handler();
  emit('close');
}

function handleOverlayClick() {
  emit('close');
}
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="visible" class="command-palette-overlay" @click.self="handleOverlayClick">
        <div class="command-palette">
          <input
            ref="inputRef"
            type="text"
            class="command-palette-input"
            v-model="query"
            placeholder="输入命令或搜索..."
            autocomplete="off"
          />
          <div class="command-list">
            <div
              v-for="(cmd, index) in filteredCommands"
              :key="cmd.id"
              class="command-item"
              :class="{ selected: index === selectedIndex }"
              @click="handleCommandClick(cmd)"
            >
              <Icon :name="cmd.icon" :size="16" class="command-icon"/>
              <span class="command-text">{{ cmd.text }}</span>
              <span v-if="cmd.shortcut" class="command-shortcut">{{ cmd.shortcut }}</span>
            </div>
            <div v-if="filteredCommands.length === 0" class="command-empty">
              未找到匹配的命令
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.command-palette-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 100px;
  z-index: 9999;
}

.command-palette {
  background: var(--vscode-sidebar-bg);
  border: 1px solid var(--vscode-border);
  border-radius: 4px;
  width: 600px;
  max-height: 400px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
}

.command-palette-input {
  width: 100%;
  background: var(--vscode-bg);
  border: none;
  border-bottom: 1px solid var(--vscode-border);
  color: var(--vscode-text);
  padding: 12px 16px;
  font-size: 14px;
  font-family: var(--font-ui);
  outline: none;
}

.command-palette-input::placeholder {
  color: var(--vscode-text-secondary);
}

.command-list {
  flex: 1;
  overflow-y: auto;
}

.command-item {
  padding: 10px 16px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 12px;
  transition: background 0.1s;
}

.command-item:hover,
.command-item.selected {
  background: var(--vscode-hover-bg);
}

.command-item.selected {
  background: var(--vscode-selection-bg);
}

.command-icon {
  width: 14px;
  height: 14px;
}

.command-text {
  flex: 1;
  font-size: 14px;
}

.command-shortcut {
  font-size: 11px;
  color: var(--vscode-text-secondary);
  font-family: var(--font-code);
  background: var(--vscode-bg);
  padding: 2px 6px;
  border-radius: 2px;
}

.command-empty {
  padding: 20px;
  text-align: center;
  color: var(--vscode-text-secondary);
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.15s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
