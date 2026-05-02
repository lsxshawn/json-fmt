<script setup>
defineProps({
  size: {
    type: [Number, String],
    default: 16
  }
});
</script>

<template>
  <svg :width="size" :height="size" viewBox="0 0 16 16" fill="currentColor">
    <circle cx="3" cy="8" r="1.5"/>
    <circle cx="8" cy="8" r="1.5"/>
    <circle cx="13" cy="8" r="1.5"/>
  </svg>
</template>