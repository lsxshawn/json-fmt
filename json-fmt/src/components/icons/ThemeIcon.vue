<script setup>
defineProps({
  size: {
    type: [Number, String],
    default: 16
  }
});
</script>

<template>
  <svg :width="size" :height="size" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
    <circle cx="8" cy="8" r="6"/>
    <path d="M8 2a6 6 0 0 1 0 12V2z"/>
  </svg>
</template>