<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import { useStore } from '@/store';
import { useLabStore } from '@/store/lab';
import { useMessaging } from '@/composables/useMessaging';
import HomeView from '@/components/HomeView.vue';
import TestPlanView from '@/components/TestPlanView.vue';
import RunView from '@/components/RunView.vue';
import ErrorView from '@/components/ErrorView.vue';
import type { BackgroundMessage } from '@/types/messages';

const store = useStore();
const lab = useLabStore();
const { send, onMessage, getActiveTabUrl } = useMessaging();

const manualPauseDescription = ref<string | null>(null);

let unsubscribe: (() => void) | null = null;

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
        taskDepth: msg.taskDepth,
        taskPath: msg.taskPath,
      });
      break;

    case 'LOG':
      store.setStepStatus(msg.stepIndex, msg.ok ? 'pass' : 'fail', {
        action: msg.action,
        target: msg.target,
        value: msg.value,
        error: msg.error,
        retryAttempt: msg.retryAttempt,
        resolvedContext: msg.resolvedContext,
        condition: msg.condition,
        taken: msg.taken,
        taskDepth: msg.taskDepth,
        taskPath: msg.taskPath,
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
      // Deactivate inspect mode when the user navigates away — tell the content script to clean up
      if (lab.labState.inspectMode) {
        send({ type: 'REMOVE_INSPECTOR' });
        lab.setInspectMode(false);
      }
      if (!store.state.isRunning && msg.url) {
        try {
          const newHostname = new URL(msg.url).hostname;
          if (newHostname && newHostname !== store.state.currentHostname) {
            store.setHostname(newHostname);
            store.state.currentProject = null;
            store.state.currentSpec = null;
            store.state.favourites = {};
            store.setView('home');
            store.loadProjectFromStorage(newHostname);
          }
        } catch {
          // malformed URL — ignore
        }
      }
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

    // --- Lab messages ---

    case 'INSPECTOR_INJECTED':
      if (msg.success) {
        lab.setInspectMode(true);
      } else {
        lab.setInspectMode(false);
        lab.setError(msg.error || 'Element inspection is not available on this page');
      }
      break;

    case 'NODE_SELECTED':
      lab.addSelectedNode({
        tagName: msg.tagName,
        attributes: msg.attributes,
        outerHTML: msg.outerHTML,
        childElementCount: msg.childElementCount,
      });
      break;

    case 'INSPECT_CANCELLED':
      lab.setInspectMode(false);
      break;

    case 'PAGE_HTML':
      if (msg.error) {
        lab.setError(msg.error);
        lab.setGenerating(false);
      }
      if (msg.html) {
        lab.setFullPageHtml(msg.html);
      }
      break;

    case 'POM_GENERATED':
      lab.setGeneratedCode(msg.code, msg.pomName);
      lab.setGenerating(false);
      lab.setError(null);
      break;

    case 'POM_GENERATION_ERROR':
      lab.setError(
        `${msg.provider} returned an error${msg.status ? ` (${msg.status})` : ''}: ${msg.error}`,
      );
      lab.setGenerating(false);
      break;

    case 'POM_GENERATION_TIMEOUT':
      lab.setError('Request timed out after 60 seconds. Try again or use a different model.');
      lab.setGenerating(false);
      break;

    case 'DATA_RESOLVED':
      store.setResolvedTestData(msg.data, msg.seeds);
      break;
  }
}


onMounted(async () => {
  unsubscribe = onMessage(handleBackgroundMessage);

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
