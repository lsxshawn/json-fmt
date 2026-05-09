<script setup>
import { computed, ref, watch, onMounted, onUnmounted } from 'vue'

const props = defineProps({
  visibleNodes: {
    type: Array,
    default: () => []
  },
  totalNodes: {
    type: Number,
    default: 0
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
  },
  isParsing: {
    type: Boolean,
    default: false
  },
  memoryIndex: {
    type: Object,
    default: null
  },
  content: {
    type: String,
    default: ''
  }
})

const emit = defineEmits(['jump'])

const minimapRef = ref(null)
const canvasRef = ref(null)
const isDragging = ref(false)

let renderFrameId = null
let isRendering = false
let lastRenderTime = 0
let loadingAnimationFrameId = null

// 使用从父组件传递的 totalHeight，确保与主内容区同步
const maxScroll = computed(() => Math.max(0, props.totalHeight - props.viewportHeight))

const scrollRatio = computed(() => {
  if (maxScroll.value <= 0) return 0
  return Math.min(props.scrollTop / maxScroll.value, 1)
})

const sliderStyle = computed(() => {
  const viewportRatio = Math.min(props.viewportHeight / props.totalHeight, 1)
  const viewportPercent = Math.max(viewportRatio * 100, 3)
  const maxTop = 100 - viewportPercent
  const top = scrollRatio.value * maxTop
  
  return {
    top: `${Math.max(0, Math.min(top, maxTop))}%`,
    height: `${viewportPercent}%`
  }
})

const RENDER_THROTTLE_MS = 32

// 基于节点类型的颜色（不是深度）
// 对象/数组：15% 靛蓝，字符串/数字：8% 靛蓝，其他：透明
const COLOR_OBJECT = 'rgba(99, 102, 241, 0.15)'   // 对象/数组
const COLOR_PRIMITIVE = 'rgba(99, 102, 241, 0.08)' // 字符串/数字/布尔/null
const COLOR_EMPTY = 'transparent'                   // 空行

function scheduleDrawMinimap() {
  const now = performance.now()
  if (now - lastRenderTime < RENDER_THROTTLE_MS) {
    if (!renderFrameId) {
      renderFrameId = requestAnimationFrame(() => {
        renderFrameId = null
        drawMinimap()
      })
    }
    return
  }
  lastRenderTime = now
  drawMinimap()
}

function drawMinimap() {
  if (isRendering) return
  isRendering = true
  
  try {
    const canvas = canvasRef.value
    if (!canvas) return
    
    const rect = canvas.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    
    canvas.width = rect.width * dpr
    canvas.height = rect.height * dpr
    
    const ctx = canvas.getContext('2d')
    ctx.scale(dpr, dpr)
    
    const width = rect.width
    const height = rect.height
    
    ctx.clearRect(0, 0, width, height)
    
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, width, height)
    
    if (!props.memoryIndex || !props.content) {
      if (props.isParsing) {
        drawLoading(ctx, width, height)
      }
      return
    }
    
    drawFromIndex(ctx, width, height)
    
  } finally {
    isRendering = false
  }
}

function drawLoading(ctx, width, height) {
  const centerX = width / 2
  const centerY = height / 2
  
  // 脉冲光点
  const time = Date.now() / 1000
  const alpha = 0.3 + Math.sin(time * 3) * 0.2
  
  ctx.beginPath()
  ctx.arc(centerX, centerY, 3, 0, Math.PI * 2)
  ctx.fillStyle = '#6366f1'
  ctx.globalAlpha = alpha
  ctx.fill()
  ctx.globalAlpha = 1
  
  loadingAnimationFrameId = requestAnimationFrame(() => {
    loadingAnimationFrameId = null
    drawMinimap()
  })
}

function drawFromIndex(ctx, width, height) {
  const index = props.memoryIndex
  const text = props.content
  const totalNodes = props.totalNodes
  
  console.log('=== Minimap Debug ===')
  console.log('memoryIndex:', index)
  console.log('content length:', text?.length)
  console.log('totalNodes:', totalNodes)
  console.log('index.lineCount:', index?.lineCount)
  console.log('index.keyCount:', index?.keyCount)
  console.log('canvas height:', height)
  
  if (!index || !text || totalNodes === 0) {
    console.log('缺少数据，无法绘制')
    return
  }
  
  const rowHeight = height / Math.max(1, totalNodes)
  const barWidth = Math.max(width - 4, 2)
  
  console.log('rowHeight:', rowHeight)
  console.log('barWidth:', barWidth)
  
  const typeColors = {
    '{': COLOR_OBJECT,
    '[': COLOR_OBJECT,
    '"': COLOR_PRIMITIVE,
    "'": COLOR_PRIMITIVE,
    't': COLOR_PRIMITIVE,
    'f': COLOR_PRIMITIVE,
    'n': COLOR_PRIMITIVE,
    '-': COLOR_PRIMITIVE,
    '0': COLOR_PRIMITIVE,
    '1': COLOR_PRIMITIVE,
    '2': COLOR_PRIMITIVE,
    '3': COLOR_PRIMITIVE,
    '4': COLOR_PRIMITIVE,
    '5': COLOR_PRIMITIVE,
    '6': COLOR_PRIMITIVE,
    '7': COLOR_PRIMITIVE,
    '8': COLOR_PRIMITIVE,
    '9': COLOR_PRIMITIVE
  }
  
  for (let k = 0; k < index.keyCount; k++) {
    const line = index.keys[k] >> 8
    const depth = index.keys[k] & 0xFF
    const keyPos = index.keyPositions[k]
    const keyLen = index.keyLengths[k]
    
    let valPos = keyPos + keyLen + 1
    while (valPos < text.length && /[:\s]/.test(text[valPos])) {
      valPos++
    }
    
    if (valPos >= text.length) continue
    
    const firstChar = text[valPos]
    const color = typeColors[firstChar] || COLOR_EMPTY
    
    if (color !== COLOR_EMPTY) {
      const y = line * rowHeight
      const h = Math.max(rowHeight, 1)
      
      ctx.fillStyle = color
      ctx.fillRect(2, y, barWidth, h)
    }
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

watch(() => props.memoryIndex, () => {
  scheduleDrawMinimap()
}, { deep: true })

watch(() => props.content, () => {
  scheduleDrawMinimap()
})

watch(() => props.totalHeight, () => {
  scheduleDrawMinimap()
})

onMounted(() => {
  scheduleDrawMinimap()
})

onUnmounted(() => {
  if (renderFrameId) {
    cancelAnimationFrame(renderFrameId)
    renderFrameId = null
  }
  if (loadingAnimationFrameId) {
    cancelAnimationFrame(loadingAnimationFrameId)
    loadingAnimationFrameId = null
  }
  document.removeEventListener('mousemove', onDrag)
  document.removeEventListener('mouseup', stopDrag)
})
</script>

<template>
  <div class="minimap-wrapper">
    <div ref="minimapRef" class="minimap" @click="handleClick">
      <div class="minimap-content">
        <canvas ref="canvasRef" class="minimap-canvas"></canvas>
      </div>
      <div
        class="minimap-slider"
        :class="{ dragging: isDragging }"
        :style="sliderStyle"
        @mousedown="startDrag"
      ></div>
    </div>
  </div>
</template>

<style scoped>
.minimap-wrapper {
  width: 60px;
  flex-shrink: 0;
  align-self: stretch;
  margin-left: 12px;
  display: flex;
  flex-direction: column;
}

.minimap {
  width: 100%;
  flex: 1;
  background: #ffffff;
  border: none;
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
}

.minimap-canvas {
  width: 100%;
  height: 100%;
}

.minimap-slider {
  position: absolute;
  left: 0;
  right: 0;
  background: rgba(99, 102, 241, 0.4);
  border: 1px solid rgba(99, 102, 241, 0.3);
  border-radius: 2px;
  cursor: ns-resize;
  z-index: 100;
  pointer-events: auto;
  transition: background-color 150ms ease;
}

.minimap-slider:hover,
.minimap-slider.dragging {
  background: rgba(99, 102, 241, 0.5);
}
</style>
