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

const sensitiveKeys = /password|secret|token|key|auth/i;

function maskValue(key: string, val: unknown): string {
  if (sensitiveKeys.test(key)) return '****';
  return String(val);
}

const paramsEntries = computed(() => {
  if (!props.params || typeof props.params !== 'object') return [];
  return Object.keys(props.params).map((key) => ({
    key,
    value: maskValue(key, props.params![key]),
  }));
});
</script>

<template>
  <div class="log-entry task-header" :class="statusClass" :style="indentStyle">
    {{ displayLabel }}
    <div v-if="paramsEntries.length" class="params-row">
      <div class="params-table-wrap">
        <table class="params-table">
          <tbody>
            <tr v-for="p in paramsEntries" :key="p.key">
              <td class="param-key">{{ p.key }}</td>
              <td class="param-val">{{ p.value }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
