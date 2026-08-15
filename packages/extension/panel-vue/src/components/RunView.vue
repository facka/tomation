<script setup lang="ts">
import { ref, computed } from 'vue';
import { useStore } from '@/store';
import ControllerBar from './ControllerBar.vue';
import LogContainer from './LogContainer.vue';
import ContextPopup from './ContextPopup.vue';
import RunSummary from './RunSummary.vue';
import TestDataPanel from './TestDataPanel.vue';

const props = defineProps<{
  manualPauseDescription?: string | null;
}>();

const store = useStore();

// --- State ---

const showContext = ref(false);

// --- Computed ---

const runnable = computed(() => store.state.currentRunnable);
const isRunning = computed(() => store.state.isRunning);
const isPaused = computed(() => store.state.isPaused);
const logEntries = computed(() => store.state.logEntries);
const runComplete = computed(() => store.state.runSummary !== null);

const displayName = computed(() => {
  if (!runnable.value) return '';
  const name = runnable.value.data.name;
  return name.indexOf('__') !== -1 ? name.split('__').slice(1).join('__') : name;
});

const sourceFile = computed(() => runnable.value?.data.sourceFile || '');

const resolvedTestData = computed(() => store.state.resolvedTestData);

const hasTestData = computed(() => {
  return resolvedTestData.value !== null && Object.keys(resolvedTestData.value).length > 0;
});
// --- Actions ---

function toggleContext() {
  showContext.value = !showContext.value;
}

function closeRun() {
  store.clearRunnable();
  store.setView('home');
}
</script>

<template>
  <div class="view active" v-if="runnable">
    <!-- Navigation row -->
    <div class="nav-row">
      <h2>
        <span v-if="sourceFile" class="runnable-path">{{ sourceFile }}</span>
        <span class="runnable-name">{{ displayName }}</span>
      </h2>
      <button
        v-if="runComplete || isPaused || (!isRunning && logEntries.length > 0)"
        class="btn btn-ghost btn-sm"
        title="Close"
        @click="closeRun"
      ><font-awesome-icon :icon="['fas', 'xmark']" /></button>
    </div>

    <!-- Controller bar (during execution) -->
    <ControllerBar
      v-if="isRunning || runComplete"
      @toggle-context="toggleContext"
    />

    <!-- Test Data panel (shown when resolved data exists) -->
    <TestDataPanel
      v-if="hasTestData"
      :data="resolvedTestData!"
    />

    <!-- Manual pause banner -->
    <div v-if="props.manualPauseDescription" class="manual-pause-banner">
      <span class="pause-icon"><font-awesome-icon :icon="['fas', 'pause']" /></span>
      <span class="pause-text">{{ props.manualPauseDescription }}</span>
    </div>

    <!-- Log container -->
    <LogContainer />

    <!-- Context popup overlay -->
    <ContextPopup
      v-if="showContext"
      @close="showContext = false"
    />

    <!-- Run summary (after completion) -->
    <RunSummary />
  </div>
</template>

<style scoped>
.manual-pause-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: var(--warning-bg, #fff3cd);
  border: 1px solid var(--warning-border, #ffc107);
  border-radius: var(--radius-sm, 4px);
  margin: 8px 12px;
  font-size: 13px;
}

.pause-icon {
  flex-shrink: 0;
}

.pause-text {
  word-break: break-word;
}
</style>
