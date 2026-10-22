<script setup lang="ts">
import { computed } from 'vue';
import { useStore } from '@/store';

const store = useStore();

const summary = computed(() => store.state.runSummary);

// Only tests get an explicit pass/fail verdict. Automations show just the time.
const isTest = computed(() => store.state.currentRunnable?.type === 'test');

// A test passes when it completed without failures and was not stopped.
const testPassed = computed(() => {
  if (!summary.value) return false;
  return !summary.value.stopped && summary.value.failed === 0;
});

const stoppedReason = computed(() => {
  if (!summary.value || !summary.value.stopped) return null;
  return summary.value.reason || 'manually stopped';
});

// Format a millisecond duration as a compact human-readable string:
//   920   → "0.9s"
//   4300  → "4.3s"
//   65000 → "1m 5s"
const durationLabel = computed(() => {
  const ms = summary.value?.durationMs;
  if (ms === undefined || ms === null) return null;
  if (ms < 1000) return (ms / 1000).toFixed(1) + 's';
  const totalSeconds = Math.round(ms / 1000);
  if (totalSeconds < 60) {
    return (ms / 1000).toFixed(1) + 's';
  }
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes + 'm ' + seconds + 's';
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
      <!-- Test verdict (tests only; automations show no pass/fail) -->
      <span
        v-if="isTest && !stoppedReason"
        class="run-verdict"
        :class="testPassed ? 'run-verdict-pass' : 'run-verdict-fail'"
      >
        <font-awesome-icon :icon="['fas', testPassed ? 'check' : 'xmark']" aria-hidden="true" />
        {{ testPassed ? 'Passed' : 'Failed' }}
      </span>

      <!-- Total execution time (tests and automations) -->
      <span v-if="durationLabel" class="run-duration">
        <font-awesome-icon :icon="['fas', 'stopwatch']" aria-hidden="true" />
        {{ durationLabel }}
      </span>
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

.log-summary {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 13px;
}

.run-verdict {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-weight: 600;
}

.run-verdict-pass {
  color: var(--success, #2e7d32);
}

.run-verdict-fail {
  color: var(--error, #c0392b);
}

.run-duration {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--text-secondary);
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
