<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import { useStore } from '@/store';
import { useMessaging } from '@/composables/useMessaging';
import HomeView from '@/components/HomeView.vue';
import TestPlanView from '@/components/TestPlanView.vue';
import RunView from '@/components/RunView.vue';
import ErrorView from '@/components/ErrorView.vue';
import type { BackgroundMessage } from '@/types/messages';

const store = useStore();
const { onMessage, getActiveTabUrl, api } = useMessaging();

const manualPauseDescription = ref<string | null>(null);

let unsubscribe: (() => void) | null = null;
let tabActivatedListener: (() => void) | null = null;
let tabUpdatedListener: ((tabId: number, changeInfo: { status?: string }) => void) | null = null;

function handleBackgroundMessage(msg: BackgroundMessage): void {
  switch (msg.type) {
    case 'STEP_PLAN':
      store.setStepPlan(msg.steps);
      break;

    case 'STEP_STARTING':
      store.setStepStatus(msg.stepIndex, 'in-progress', {
        action: msg.action,
        target: msg.target,
        value: msg.value,
      });
      break;

    case 'LOG':
      store.setStepStatus(msg.stepIndex, msg.ok ? 'pass' : 'fail', {
        action: msg.action,
        target: msg.target,
        value: msg.value,
        error: msg.error,
        retryAttempt: msg.retryAttempt,
      });
      if (msg.contextKey !== undefined) {
        store.updateContext(msg.contextKey, msg.savedValue);
      }
      break;

    case 'UPDATE_LOG_ENTRY':
      store.setStepStatus(msg.stepIndex, msg.ok ? 'pass' : 'fail', {
        retryAttempt: msg.retryAttempt,
        error: msg.error,
      });
      break;

    case 'STEP_FAILED_AWAITING_ACTION':
      store.setStepStatus(msg.stepIndex, 'fail', {
        action: msg.action,
        target: msg.target,
        value: msg.value,
        error: msg.error,
        retryAttempt: msg.retryAttempt,
      });
      break;

    case 'RUN_COMPLETE':
      manualPauseDescription.value = null;
      store.setRunComplete({ total: msg.total, passed: msg.passed, failed: msg.failed });

      // Persist automation params on successful run (zero failures)
      if (
        msg.failed === 0 &&
        store.state.automationParams !== null &&
        store.state.currentRunnable?.type === 'automation' &&
        store.state.currentHostname
      ) {
        const automationName = (store.state.currentRunnable.data as { name: string }).name;
        store.saveParamValues(
          store.state.currentHostname,
          automationName,
          store.state.automationParams as Record<string, unknown>,
        );
      }
      break;

    case 'RUN_STOPPED':
      manualPauseDescription.value = null;
      store.setRunComplete({ total: msg.total, passed: msg.passed, failed: msg.failed });
      break;

    case 'STATE_SYNC':
      if (msg.running) {
        store.state.isRunning = true;
        store.setView('run');
      }
      if (msg.paused) {
        store.setPaused(true);
      }
      break;

    case 'TAB_URL_UPDATE':
      store.state.lastKnownTabUrl = msg.url;
      break;

    case 'MANUAL_PAUSE':
      manualPauseDescription.value = msg.description;
      store.setPaused(true);
      break;

    case 'BUNDLED_SPEC_LOADED':
      store.loadSpec('facka.github.io', msg.filename, msg.spec);
      break;

    case 'BUNDLED_SPEC_ERROR':
      store.state.errorMessage = msg.error || 'Could not load playground tests';
      store.setView('error');
      break;

    case 'CONTEXT_STATE':
      store.setContextStore(msg.store);
      break;
  }
}

async function syncToActiveTab(): Promise<void> {
  if (store.state.isRunning) return;

  const url = await getActiveTabUrl();
  if (!url) return;

  let hostname: string | null = null;
  try {
    hostname = new URL(url).hostname;
  } catch {
    return;
  }

  if (hostname && hostname !== store.state.currentHostname) {
    store.setHostname(hostname);
    store.state.lastKnownTabUrl = url;
    store.setView('home');
    await store.loadProjectFromStorage(hostname);
  }
}

onMounted(async () => {
  unsubscribe = onMessage(handleBackgroundMessage);

  // Register tab sync listeners
  if (api.tabs && api.tabs.onActivated) {
    tabActivatedListener = () => { syncToActiveTab(); };
    api.tabs.onActivated.addListener(tabActivatedListener);
  }
  if (api.tabs && api.tabs.onUpdated) {
    tabUpdatedListener = (_tabId: number, changeInfo: { status?: string }) => {
      if (changeInfo.status === 'complete') {
        syncToActiveTab();
      }
    };
    api.tabs.onUpdated.addListener(tabUpdatedListener);
  }

  // Get active tab hostname and load persisted state (project, favourites, active tab)
  const url = await getActiveTabUrl();
  let hostname: string | null = null;

  if (url) {
    try {
      hostname = new URL(url).hostname;
    } catch {
      hostname = null;
    }
  }

  if (hostname) {
    store.setHostname(hostname);
    store.state.lastKnownTabUrl = url;
    await store.loadProjectFromStorage(hostname);
  }
});

onUnmounted(() => {
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }

  // Clean up tab sync listeners
  if (tabActivatedListener && api.tabs?.onActivated) {
    api.tabs.onActivated.removeListener(tabActivatedListener);
    tabActivatedListener = null;
  }
  if (tabUpdatedListener && api.tabs?.onUpdated) {
    api.tabs.onUpdated.removeListener(tabUpdatedListener);
    tabUpdatedListener = null;
  }
});
</script>

<template>
  <div class="app">
    <!-- HomeView -->
    <HomeView v-if="store.state.currentView === 'home'" />

    <!-- TestPlanView -->
    <TestPlanView v-if="store.state.currentView === 'test-plan'" />

    <!-- RunView -->
    <RunView
      v-if="store.state.currentView === 'run'"
      :manual-pause-description="manualPauseDescription"
    />

    <!-- ErrorView -->
    <ErrorView v-if="store.state.currentView === 'error'" />
  </div>
</template>

<style scoped>
.app {
  width: 100%;
  height: 100%;
}
</style>
