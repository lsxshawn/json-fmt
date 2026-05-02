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
    <rect x="2" y="2" width="4" height="4" rx="1"/>
    <rect x="2" y="10" width="4" height="4" rx="1"/>
    <path d="M6 4h8M6 12h8M10 4v8"/>
  </svg>
</template>