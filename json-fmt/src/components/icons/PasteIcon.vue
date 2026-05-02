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
    <rect x="4" y="2" width="8" height="12" rx="1"/>
    <rect x="6" y="5" width="4" height="1" fill="currentColor"/>
    <rect x="6" y="8" width="4" height="1" fill="currentColor"/>
  </svg>
</template>