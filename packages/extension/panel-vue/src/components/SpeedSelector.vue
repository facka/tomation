<script setup lang="ts">
import { computed } from 'vue';

type Speed = 'FAST' | 'NORMAL' | 'SLOW';

const props = defineProps<{
  modelValue: Speed;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: Speed): void;
}>();

// Icon representing the currently selected speed.
//   Slow   → stopwatch (taking your time)
//   Normal → gauge
//   Fast   → bolt
const speedIcon = computed<string>(() => {
  switch (props.modelValue) {
    case 'SLOW': return 'stopwatch';
    case 'FAST': return 'bolt';
    default: return 'gauge';
  }
});

const speedLabel = computed<string>(() => {
  switch (props.modelValue) {
    case 'SLOW': return 'Slow';
    case 'FAST': return 'Fast';
    default: return 'Normal';
  }
});

function onChange(event: Event) {
  const value = (event.target as HTMLSelectElement).value as Speed;
  emit('update:modelValue', value);
}
</script>

<template>
  <div class="speed-selector" :title="'Execution speed: ' + speedLabel">
    <font-awesome-icon :icon="['fas', speedIcon]" class="speed-selector-icon" aria-hidden="true" />
    <select
      class="speed-selector-select"
      :value="props.modelValue"
      :aria-label="'Execution speed: ' + speedLabel"
      @change="onChange"
    >
      <option value="SLOW">Slow</option>
      <option value="NORMAL">Normal</option>
      <option value="FAST">Fast</option>
    </select>
  </div>
</template>

<style scoped>
.speed-selector {
  position: relative;
  display: inline-flex;
  align-items: center;
}

.speed-selector-icon {
  position: absolute;
  left: 8px;
  font-size: 12px;
  color: var(--text-secondary);
  pointer-events: none;
}

.speed-selector-select {
  appearance: none;
  -webkit-appearance: none;
  padding: 4px 8px 4px 26px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm, 4px);
  background: var(--bg-surface);
  color: var(--text-primary);
  font-size: 12px;
  cursor: pointer;
  line-height: 1.4;
}

.speed-selector-select:hover {
  border-color: var(--accent, #4f9eff);
}

.speed-selector-select:focus {
  outline: none;
  border-color: var(--accent, #4f9eff);
}
</style>
