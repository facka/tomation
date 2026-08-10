<script setup lang="ts">
import { computed } from 'vue';
import { useStore } from '@/store';

const store = useStore();

const summary = computed(() => store.state.runSummary);

const skipped = computed(() => {
  if (!summary.value) return 0;
  return summary.value.total - summary.value.passed - summary.value.failed;
});

function goHome() {
  store.clearRunnable();
  store.setView('home');
}
</script>

<template>
  <div v-if="summary" class="run-summary-section">
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
</style>
