<script setup lang="ts">
import { computed } from 'vue';
import { useStore } from '@/store';

const store = useStore();

const summary = computed(() => store.state.runSummary);

const skipped = computed(() => {
  if (!summary.value) return 0;
  const s = summary.value.total - summary.value.passed - summary.value.failed;
  return s > 0 ? s : 0;
});

const stoppedReason = computed(() => {
  if (!summary.value || !summary.value.stopped) return null;
  return summary.value.reason || 'manually stopped';
});

function goHome() {
  store.clearRunnable();
  store.setView('home');
}
</script>

<template>
  <div v-if="summary" class="run-summary-section">
    <div v-if="stoppedReason" class="run-stopped-banner">
      <font-awesome-icon :icon="['fas', 'xmark']" aria-hidden="true" />
      Test failed — {{ stoppedReason }}
    </div>
    <div class="log-summary">
      Total: {{ summary.total }} | Passed: {{ summary.passed }} | Failed: {{ summary.failed }}
      <template v-if="skipped > 0"> | Skipped: {{ skipped }}</template>
    </div>
    <div class="run-done-actions">
      <button class="btn btn-primary" @click="goHome"><font-awesome-icon :icon="['fas', 'arrow-left']" aria-hidden="true" /> Back to Home</button>
    </div>
  </div>
</template>

<style scoped>
.run-summary-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.run-done-actions {
  display: flex;
  gap: 8px;
}

.run-stopped-banner {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  border-radius: var(--radius-sm, 4px);
  background: var(--error-soft, #fdecea);
  color: var(--error, #c0392b);
  border: 1px solid var(--error, #c0392b);
  font-size: 12px;
  font-weight: 500;
}
</style>
