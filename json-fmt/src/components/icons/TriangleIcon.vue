<script setup>
defineProps({
  expanded: {
    type: Boolean,
    default: false
  }
});
</script>
<template>
  <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor">
    <path v-if="!expanded" d="M0 0l8 4-8 4z"/>
    <path v-else d="M0 0l4 8 4-8z"/>
  </svg>
</template>
