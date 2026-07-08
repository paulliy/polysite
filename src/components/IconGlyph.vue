<script setup lang="ts">
import { computed } from 'vue'
import { iconSvg } from '@/engine/icons'

/** Renders an icon face (a character-set PUA glyph) as inline SVG. The markup
 *  is a static, trusted string from engine/icons.ts. */
const props = defineProps<{ char: string }>()
const svg = computed(() => iconSvg(props.char) ?? '')
</script>

<template><span class="icon" v-html="svg" /></template>

<style scoped>
.icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
</style>
