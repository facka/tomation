<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  modelValue: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
}>();

const DESCRIPTION =
  'Debug Mode: when enabled, failed steps can be retried or skipped without stopping the run.';

// Title starts with the current state, as requested.
const title = computed(
  () => (props.modelValue ? 'Active' : 'Inactive') + ' — ' + DESCRIPTION,
);

function toggle() {
  emit('update:modelValue', !props.modelValue);
}
</script>

<template>
  <button
    type="button"
    class="debug-toggle"
    :class="{ active: props.modelValue }"
    :title="title"
    :aria-pressed="props.modelValue"
    @click="toggle"
  >
    <font-awesome-icon
      :icon="['fas', props.modelValue ? 'bug' : 'bug-slash']"
      aria-hidden="true"
    />
  </button>
</template>

<style scoped>
.debug-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm, 4px);
  background: var(--bg-surface);
  color: var(--text-muted);
  cursor: pointer;
  font-size: 13px;
  transition: color 0.15s, border-color 0.15s, background 0.15s;
}

.debug-toggle:hover {
  color: var(--text-secondary);
  border-color: var(--accent, #4f9eff);
}

.debug-toggle.active {
  color: var(--accent, #4f9eff);
  border-color: var(--accent, #4f9eff);
  background: var(--accent-subtle, rgba(79, 158, 255, 0.1));
}
</style>
