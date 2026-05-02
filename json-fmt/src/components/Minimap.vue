<script setup>
import { computed, ref } from 'vue'

const props = defineProps({
  visibleNodes: {
    type: Array,
    default: () => []
  },
  scrollTop: {
    type: Number,
    default: 0
  },
  viewportHeight: {
    type: Number,
    default: 600
  },
  totalHeight: {
    type: Number,
    default: 1000
  }
})

const emit = defineEmits(['jump'])

const minimapRef = ref(null)
const isDragging = ref(false)

const maxScroll = computed(() => Math.max(0, props.totalHeight - props.viewportHeight))

const scrollRatio = computed(() => {
  if (maxScroll.value <= 0) return 0
  return Math.min(props.scrollTop / maxScroll.value, 1)
})

const sliderStyle = computed(() => {
  const viewportRatio = Math.min(props.viewportHeight / props.totalHeight, 1)
  const viewportPercent = viewportRatio * 96
  const maxTop = 96 - viewportPercent
  const top = scrollRatio.value * maxTop
  
  return {
    top: `${Math.max(0, Math.min(top, maxTop))}%`,
    height: `${Math.max(viewportPercent, 3)}%`,
    minHeight: '12px'
  }
})

const maxNodes = 400
const sampleStep = computed(() => {
  if (!props.visibleNodes || props.visibleNodes.length <= maxNodes) return 1
  return Math.floor(props.visibleNodes.length / maxNodes)
})

const sampledNodes = computed(() => {
  if (!props.visibleNodes || props.visibleNodes.length === 0) return []
  const step = sampleStep.value
  const result = []
  for (let i = 0; i < props.visibleNodes.length; i += step) {
    result.push({
      ...props.visibleNodes[i],
      _originalIndex: i
    })
  }
  return result
})

function getNodeStyle(node, index) {
  if (props.totalHeight <= 0) {
    return {
      top: '0%',
      left: '4px',
      width: '20px',
      backgroundColor: '#888888',
      opacity: 0.9
    }
  }

  const actualIndex = node._originalIndex !== undefined ? node._originalIndex : index
  const y = (actualIndex * 28 / props.totalHeight) * 96
  const depthWidth = Math.min(node.depth * 3, 20)

  let bgColor = '#888888'
  let alpha = 0.9

  if (node.type === 'object' || node.type === 'object_start') {
    bgColor = '#007acc'
    alpha = 1
  } else if (node.type === 'array' || node.type === 'array_start') {
    bgColor = '#4ec9b0'
    alpha = 1
  } else if (node.type === 'string') {
    bgColor = '#ce9178'
  } else if (node.type === 'number') {
    bgColor = '#b5cea8'
  } else if (node.type === 'boolean' || node.type === 'null') {
    bgColor = '#569cd6'
  }

  return {
    top: `${Math.min(y, 96)}%`,
    left: `${depthWidth}px`,
    width: `${Math.max(24 - depthWidth, 2)}px`,
    backgroundColor: bgColor,
    opacity: alpha
  }
}

function handleClick(e) {
  const rect = e.currentTarget.querySelector('.minimap-content').getBoundingClientRect()
  const y = e.clientY - rect.top
  const ratio = Math.max(0, Math.min(y / rect.height, 1))
  
  const scrollTarget = ratio * maxScroll.value
  emit('jump', scrollTarget)
}

function startDrag(e) {
  e.stopPropagation()
  e.preventDefault()
  isDragging.value = true
  
  document.addEventListener('mousemove', onDrag)
  document.addEventListener('mouseup', stopDrag)
}

function onDrag(e) {
  if (!isDragging.value || !minimapRef.value) return
  
  const contentRect = minimapRef.value.querySelector('.minimap-content').getBoundingClientRect()
  const y = Math.max(0, Math.min(e.clientY - contentRect.top, contentRect.height))
  const ratio = y / contentRect.height
  
  const scrollTarget = ratio * maxScroll.value
  
  emit('jump', scrollTarget)
}

function stopDrag() {
  isDragging.value = false
  document.removeEventListener('mousemove', onDrag)
  document.removeEventListener('mouseup', stopDrag)
}
</script>

<template>
  <div class="minimap-wrapper">
    <div ref="minimapRef" class="minimap" @click="handleClick">
      <div class="minimap-content">
        <div
          v-for="(node, index) in sampledNodes"
          :key="index"
          class="minimap-node"
          :style="getNodeStyle(node, index)"
        />
      </div>
      <div
        class="minimap-slider"
        :style="sliderStyle"
        @mousedown="startDrag"
      >
        <div class="slider-top"></div>
        <div class="slider-bottom"></div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.minimap-wrapper {
  width: 80px;
  flex-shrink: 0;
  height: 100%;
}

.minimap {
  width: 100%;
  height: 100%;
  background: var(--bg-primary);
  border-left: 1px solid var(--border);
  position: relative;
  cursor: pointer;
  overflow: hidden;
  box-sizing: border-box;
}

.minimap-content {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  height: 100%;
}

.minimap-node {
  position: absolute;
  height: 2px;
  border-radius: 1px;
}

.minimap-slider {
  position: absolute;
  left: 0;
  right: 0;
  background: rgba(0, 122, 204, 0.2);
  border: 1px solid rgba(0, 122, 204, 0.4);
  cursor: ns-resize;
  z-index: 10;
}

.slider-top,
.slider-bottom {
  position: absolute;
  left: 0;
  right: 0;
  height: 2px;
  background: rgba(0, 122, 204, 0.6);
}

.slider-top {
  top: 0;
}

.slider-bottom {
  bottom: 0;
}
</style>
