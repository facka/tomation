<script setup lang="ts">
import { computed } from 'vue';
import type { TaskHeaderStatus } from '@/types/store';

const props = defineProps<{
  name: string;
  label?: string;
  depth: number;
  params?: Record<string, unknown>;
  status: TaskHeaderStatus;
  // Component marker (COM). When `isComponent` is true the header renders as a
  // clickable disclosure (chevron + button) that toggles its group's collapse
  // state; plain task headers leave these undefined and render as a plain div.
  isComponent?: boolean;
  componentName?: string;
  // Whether the component group is currently collapsed (drives the chevron
  // direction). Only meaningful when `isComponent` is true.
  collapsed?: boolean;
}>();

const emit = defineEmits<{
  (e: 'toggle'): void;
}>();

function onToggle() {
  if (props.isComponent) emit('toggle');
}

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
  <!-- Component header: a clickable disclosure that toggles its group's collapse
       state. Rendered as a button so it is keyboard-accessible. -->
  <button
    v-if="isComponent"
    type="button"
    class="log-entry task-header task-header-component"
    :class="statusClass"
    :style="indentStyle"
    :aria-expanded="!collapsed"
    @click="onToggle"
  >
    <font-awesome-icon
      class="task-header-chevron"
      :icon="['fas', collapsed ? 'chevron-right' : 'chevron-down']"
    />
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
  </button>

  <!-- Plain (non-component) task header: unchanged markup, no chevron, no click. -->
  <div v-else class="log-entry task-header" :class="statusClass" :style="indentStyle">
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

<style scoped>
/* Component header disclosure: reset the native button so it matches the plain
   `.task-header` div visually, then add the clickable affordance + chevron. */
.task-header-component {
  display: block;
  width: 100%;
  text-align: left;
  background: none;
  border: none;
  font: inherit;
  color: inherit;
  cursor: pointer;
}

.task-header-component:hover {
  filter: brightness(1.1);
}

.task-header-chevron {
  margin-right: 6px;
  font-size: 10px;
  opacity: 0.75;
}
</style>
