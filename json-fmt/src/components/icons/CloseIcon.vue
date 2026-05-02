<script setup>
defineProps({
  size: {
    type: [Number, String],
    default: 16
  }
});
</script>

<template>
  <svg :width="size" :height="size" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
    <path d="M4 4l8 8M12 4l-8 8"/>
  </svg>
</template>