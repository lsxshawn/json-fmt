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
import CompressIcon from './CompressIcon.vue';
import EscapeIcon from './EscapeIcon.vue';
import ListTreeIcon from './ListTreeIcon.vue';
import ThemeIcon from './ThemeIcon.vue';
import MoreIcon from './MoreIcon.vue';
import PlusIcon from './PlusIcon.vue';
import PasteIcon from './PasteIcon.vue';
import JsonIcon from './JsonIcon.vue';
import CloseIcon from './CloseIcon.vue';

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
      'refresh': RefreshIcon,
      'compress': CompressIcon,
      'escape': EscapeIcon,
      'list-tree': ListTreeIcon,
      'theme': ThemeIcon,
      'more': MoreIcon,
      'plus': PlusIcon,
      'paste': PasteIcon,
      'json': JsonIcon,
      'close': CloseIcon
    }[name]"
    :style="{ width: size + 'px', height: size + 'px' }"
  />
</template>