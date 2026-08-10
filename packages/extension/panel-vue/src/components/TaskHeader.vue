<script setup lang="ts">
import { computed } from 'vue';
import type { TaskHeaderStatus } from '@/types/store';

const props = defineProps<{
  name: string;
  label?: string;
  depth: number;
  params?: Record<string, unknown>;
  status: TaskHeaderStatus;
}>();

// --- Computed ---

const indentStyle = computed(() => {
  return { paddingLeft: (12 + props.depth * 12) + 'px' };
});

const statusClass = computed(() => {
  switch (props.status) {
    case 'queued': return 'queued';
    case 'in-progress': return 'task-in-progress';
    case 'pass': return 'task-pass';
    case 'warning': return 'task-warning';
    default: return '';
  }
});

const displayLabel = computed(() => {
  if (props.label) return props.label;
  return props.name.replace(/__/g, '.').replace(/\//g, ' > ');
});

const paramsDisplay = computed(() => {
  if (!props.params || typeof props.params !== 'object') return null;
  const keys = Object.keys(props.params);
  if (keys.length === 0) return null;

  const sensitiveKeys = /password|secret|token|key|auth/i;

  function maskValue(key: string, val: unknown): string {
    if (sensitiveKeys.test(key)) return '****';
    const str = String(val);
    if (typeof val === 'string' && str.length > 30) return str.slice(0, 27) + '...';
    return str;
  }

  if (keys.length <= 2) {
    const parts = keys.map((k) => k + ': "' + maskValue(k, props.params![k]) + '"');
    return { type: 'inline' as const, text: '{ ' + parts.join(', ') + ' }' };
  }

  const tooltipParts = keys.map((k) => k + ': ' + maskValue(k, props.params![k]));
  return { type: 'badge' as const, text: '(' + keys.length + ' params)', tooltip: tooltipParts.join('\n') };
});
</script>

<template>
  <div class="log-entry task-header" :class="statusClass" :style="indentStyle">
    <span class="step-action">Task</span>
    {{ displayLabel }}
    <span
      v-if="paramsDisplay?.type === 'inline'"
      class="step-params"
    >{{ paramsDisplay.text }}</span>
    <span
      v-else-if="paramsDisplay?.type === 'badge'"
      class="step-params-badge"
      :title="paramsDisplay.tooltip"
    >{{ paramsDisplay.text }}</span>
  </div>
</template>
