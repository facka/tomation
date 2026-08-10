<script setup lang="ts">
import { useLabStore } from '@/store/lab';
import { useMessaging } from '@/composables/useMessaging';

const { labState } = useLabStore();
const { send } = useMessaging();

function toggleInspect() {
  if (labState.inspectMode) {
    send({ type: 'REMOVE_INSPECTOR' });
    labState.inspectMode = false;
  } else {
    labState.error = null;
    send({ type: 'INJECT_INSPECTOR' });
    labState.inspectMode = true;
  }
}
</script>

<template>
  <div class="inspect-section">
    <button
      class="btn inspect-toggle-btn"
      :class="{ active: labState.inspectMode }"
      @click="toggleInspect"
    >
      <span class="inspect-indicator" :class="{ on: labState.inspectMode }"></span>
      {{ labState.inspectMode ? 'Stop Inspecting' : 'Inspect Element' }}
    </button>

    <p v-if="labState.error" class="inspect-error">{{ labState.error }}</p>
  </div>
</template>

<style scoped>
.inspect-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.inspect-toggle-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.inspect-toggle-btn.active {
  background: var(--accent);
  color: #fff;
  border-color: var(--accent);
}

.inspect-toggle-btn.active:hover {
  background: var(--accent-hover);
  border-color: var(--accent-hover);
}

.inspect-indicator {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--text-muted);
  flex-shrink: 0;
}

.inspect-indicator.on {
  background: #4ade80;
  box-shadow: 0 0 4px #4ade80;
}

.inspect-error {
  color: var(--error);
  font-size: 12px;
  padding: 6px 8px;
  background: var(--error-soft);
  border-radius: var(--radius-sm);
}
</style>
