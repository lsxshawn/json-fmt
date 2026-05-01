<script setup>
import FileIcon from './FileIcon.vue';
import FolderIcon from './FolderIcon.vue';
import TrashIcon from './TrashIcon.vue';
import TriangleIcon from './TriangleIcon.vue';
import UploadIcon from './UploadIcon.vue';
import SaveIcon from './SaveIcon.vue';
import SearchIcon from './SearchIcon.vue';
import SparklesIcon from './SparklesIcon.vue';
import RefreshIcon from './RefreshIcon.vue';

defineProps({
  name: {
    type: String,
    required: true
  },
  size: {
    type: [Number, String],
    default: 16
  }
});
</script>
<template>
  <component
    :is="{
      'file': FileIcon,
      'folder': FolderIcon,
      'trash': TrashIcon,
      'triangle': TriangleIcon,
      'upload': UploadIcon,
      'save': SaveIcon,
      'search': SearchIcon,
      'sparkles': SparklesIcon,
      'refresh': RefreshIcon
    }[name]"
    :style="{ width: size + 'px', height: size + 'px' }"
  />
</template>
