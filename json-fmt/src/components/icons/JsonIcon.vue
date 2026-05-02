<script setup>
defineProps({
  size: {
    type: [Number, String],
    default: 16
  }
});
</script>

<template>
  <svg :width="size" :height="size" viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
    <rect x="8" y="4" width="48" height="56" rx="4"/>
    <path d="M20 24l-4 8 4 8M44 24l4 8-4 8M28 20l8 24"/>
  </svg>
</template>