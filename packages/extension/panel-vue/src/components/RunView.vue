<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue';
import { useStore } from '@/store';
import { useRunExecution } from '@/composables/useRunExecution';
import ControllerBar from './ControllerBar.vue';
import LogContainer from './LogContainer.vue';
import ContextPopup from './ContextPopup.vue';
import RunSummary from './RunSummary.vue';
import TestDataPanel from './TestDataPanel.vue';

const props = defineProps<{
  manualPauseDescription?: string | null;
}>();

const emit = defineEmits<{
  (e: 'continue'): void;
}>();

const store = useStore();
const { resume, stop } = useRunExecution();

function continueManualStep() {
  resume();
  emit('continue');
}

// --- State ---

const showContext = ref(false);
const showCloseConfirm = ref(false);

// --- Computed ---

const runnable = computed(() => store.state.currentRunnable);
const isRunning = computed(() => store.state.isRunning);
const isPaused = computed(() => store.state.isPaused);
const runComplete = computed(() => store.state.runSummary !== null);

const displayName = computed(() => {
  if (!runnable.value) return '';
  const name = runnable.value.data.name;
  return name.indexOf('__') !== -1 ? name.split('__').slice(1).join('__') : name;
});

const sourceFile = computed(() => runnable.value?.data.sourceFile || '');

const resolvedTestData = computed(() => store.state.resolvedTestData);

const hasTestData = computed(() => {
  if (resolvedTestData.value !== null && Object.keys(resolvedTestData.value).length > 0) {
    return true;
  }
  if (runnable.value && runnable.value.data && (runnable.value.data as any).data) {
    return Object.keys((runnable.value.data as any).data).length > 0;
  }
  return false;
});

const testDataDisplay = computed((): Record<string, string | number> => {
  if (resolvedTestData.value !== null && Object.keys(resolvedTestData.value).length > 0) {
    return resolvedTestData.value;
  }
  const testEntry = runnable.value?.data as any;
  if (!testEntry || !testEntry.data) return {};
  const display: Record<string, string> = {};
  const templates = testEntry.data;
  for (const tmplName of Object.keys(templates)) {
    const tmpl = templates[tmplName];
    for (const field of Object.keys(tmpl)) {
      if (field === '__seed') continue;
      const value = tmpl[field];
      if (value && typeof value === 'object' && value.type === 'fake') {
        const opts = value.options && Object.keys(value.options).length > 0
          ? '(' + JSON.stringify(value.options) + ')'
          : '';
        display[tmplName + '.' + field] = 'Fake.' + value.method + opts;
      } else {
        display[tmplName + '.' + field] = String(value);
      }
    }
  }
  return display;
});

const runSeeds = computed((): Record<string, number | undefined> => {
  // Use the seeds that were actually used during the run (from DATA_RESOLVED message)
  if (store.state.resolvedDataSeeds) {
    return store.state.resolvedDataSeeds;
  }
  // Fallback: check JSON __seed
  const testEntry = runnable.value?.data as any;
  if (!testEntry || !testEntry.data) return {};
  const seeds: Record<string, number | undefined> = {};
  for (const tmplName of Object.keys(testEntry.data)) {
    const tmpl = testEntry.data[tmplName];
    if (tmpl && tmpl.__seed !== undefined) {
      seeds[tmplName] = tmpl.__seed;
    }
  }
  return seeds;
});
// --- Actions ---

function toggleContext() {
  showContext.value = !showContext.value;
}

// A run is "unfinished" when it is still executing or paused and has not yet
// produced a summary (i.e. it has not reached the last step).
const runUnfinished = computed(() => {
  return (isRunning.value || isPaused.value) && store.state.runSummary === null;
});

/**
 * Perform the actual close: if the run is still active, stop the background
 * execution and record the result as a failure with reason "manually stopped".
 */
function performClose() {
  if (isRunning.value || isPaused.value) {
    stop();
    store.markManuallyStopped();
  }
  store.clearRunnable();
  store.setView('home');
}

/**
 * Close button handler. Confirms first when the test hasn't finished yet;
 * otherwise closes immediately.
 */
function closeRun() {
  if (runUnfinished.value) {
    showCloseConfirm.value = true;
    return;
  }
  performClose();
}

function confirmClose() {
  showCloseConfirm.value = false;
  performClose();
}

function cancelClose() {
  showCloseConfirm.value = false;
}

function onConfirmKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    cancelClose();
  }
}

// Attach the Escape listener only while the confirmation dialog is open.
watch(showCloseConfirm, (open) => {
  if (open) {
    document.addEventListener('keydown', onConfirmKeydown);
  } else {
    document.removeEventListener('keydown', onConfirmKeydown);
  }
});

onUnmounted(() => {
  document.removeEventListener('keydown', onConfirmKeydown);
});
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
        class="btn btn-ghost btn-sm"
        :title="isRunning || isPaused ? 'Stop and close' : 'Close'"
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
      :data="testDataDisplay"
      :seeds="runSeeds"
      :readonly="true"
    />

    <!-- Manual pause banner -->
    <div v-if="props.manualPauseDescription" class="manual-pause-banner">
      <span class="pause-icon"><font-awesome-icon :icon="['fas', 'pause']" /></span>
      <span class="pause-text">{{ props.manualPauseDescription }}</span>
      <button
        class="btn btn-sm btn-primary manual-continue-btn"
        title="Continue the run"
        @click="continueManualStep"
      ><font-awesome-icon :icon="['fas', 'play']" aria-hidden="true" /> Continue</button>
    </div>

    <!-- Log container -->
    <LogContainer />

    <!-- Context popup overlay -->
    <ContextPopup
      v-if="showContext"
      @close="showContext = false"
    />

    <!-- Close confirmation popup (shown when closing an unfinished run) -->
    <template v-if="showCloseConfirm">
      <div class="confirm-backdrop" @click="cancelClose"></div>
      <div class="confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-close-title">
        <p id="confirm-close-title" class="confirm-title">Stop this run?</p>
        <p class="confirm-body">
          The test hasn't finished yet. Closing will stop execution and mark the run
          as failed (manually stopped).
        </p>
        <div class="confirm-actions">
          <button class="btn btn-sm" @click="cancelClose">Cancel</button>
          <button class="btn btn-sm btn-danger" @click="confirmClose">
            <font-awesome-icon :icon="['fas', 'stop']" aria-hidden="true" /> Stop and close
          </button>
        </div>
      </div>
    </template>

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
  flex: 1;
}

.manual-continue-btn {
  flex-shrink: 0;
}

.confirm-backdrop {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.35);
  z-index: 199;
}

.confirm-dialog {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: calc(100% - 32px);
  max-width: 320px;
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md, 8px);
  box-shadow: var(--shadow-md);
  padding: 16px;
  z-index: 200;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.confirm-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.confirm-body {
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-secondary, var(--text-primary));
}

.confirm-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
