<script setup lang="ts">
import { useStore } from '@/store';
import { useMessaging } from '@/composables/useMessaging';
import { buildAllStepsChecked, buildDefaultParams, hasRequiredParamsWithoutValues } from '@/logic/quickRunHelpers';
import LandingPage from './LandingPage.vue';
import LoadedHeader from './LoadedHeader.vue';
import TabBar from './TabBar.vue';
import TestList from './TestList.vue';
import AutomationList from './AutomationList.vue';
import LabView from './LabView.vue';
import type { TestEntry, AutomationEntry, AutomationInstance } from '@/types/spec';
import type { Runnable, RunConfig } from '@/types/store';

const store = useStore();
const { send } = useMessaging();

function selectTest(test: TestEntry, index: number) {
  if (!store.state.currentSpec) return;
  const runnable: Runnable = { type: 'test', index, data: test };
  store.selectRunnable(store.state.currentSpec, runnable);
  store.setView('test-plan');
}

function selectAutomation(automation: AutomationEntry, index: number) {
  if (!store.state.currentSpec) return;
  const runnable: Runnable = { type: 'automation', index, data: automation };
  store.selectRunnable(store.state.currentSpec, runnable);
  store.setView('test-plan');
}

function selectInstance(instance: AutomationInstance, source: AutomationEntry, sourceIndex: number) {
  if (!store.state.currentSpec) return;
  const runnable: Runnable = { type: 'automation', index: sourceIndex, data: source, instanceId: instance.id };
  store.selectRunnable(store.state.currentSpec, runnable);
  store.setView('test-plan');
}

async function quickRunTest(test: TestEntry, index: number) {
  if (!store.state.currentSpec) return;
  const runnable: Runnable = { type: 'test', index, data: test };
  store.selectRunnable(store.state.currentSpec, runnable);

  const checkedSteps = buildAllStepsChecked(test.steps);

  // Load persisted execution speed (falls back to NORMAL if none saved)
  const specId = store.state.currentSpec.id;
  const savedConfig = await store.getTestPlanConfig(specId, index);
  const executionSpeed = savedConfig?.executionSpeed ?? 'NORMAL';

  const config: RunConfig = {
    allowContinueOnFailure: false,
    allowRetryOnFailure: false,
    executionSpeed,
  };

  store.startRun(config);
  send({ type: 'RUN_TEST', testIndex: index, checkedSteps, config });
}

async function quickRunAutomation(automation: AutomationEntry, index: number) {
  if (!store.state.currentSpec) return;
  const specEntry = store.state.currentSpec;
  const runnable: Runnable = { type: 'automation', index, data: automation };
  store.selectRunnable(specEntry, runnable);

  // Load saved params and check if required params have values
  const hostname = store.state.currentHostname;
  const savedValues = hostname
    ? await store.loadParamValues(hostname, automation.name)
    : null;

  if (hasRequiredParamsWithoutValues(automation.params, savedValues)) {
    // Fall back to test-plan view when required params are missing
    store.setView('test-plan');
    return;
  }

  const checkedSteps = buildAllStepsChecked(automation.steps);
  const params = savedValues ?? buildDefaultParams(automation.params);

  // Load persisted execution speed (falls back to NORMAL if none saved)
  const specId = specEntry.id;
  const savedConfig = await store.getTestPlanConfig(specId, index);
  const executionSpeed = savedConfig?.executionSpeed ?? 'NORMAL';

  const config: RunConfig = {
    allowContinueOnFailure: false,
    allowRetryOnFailure: false,
    executionSpeed,
  };

  store.startRun(config, params);
  send({ type: 'RUN_AUTOMATION', automationIndex: index, params, checkedSteps, config });
}

async function quickRunInstance(instance: AutomationInstance, source: AutomationEntry, sourceIndex: number) {
  if (!store.state.currentSpec) return;
  const specEntry = store.state.currentSpec;
  const runnable: Runnable = { type: 'automation', index: sourceIndex, data: source, instanceId: instance.id };
  store.selectRunnable(specEntry, runnable);

  if (hasRequiredParamsWithoutValues(source.params, instance.params)) {
    // Fall back to test-plan view when required params are missing
    store.setView('test-plan');
    return;
  }

  const checkedSteps = buildAllStepsChecked(source.steps);
  const params = instance.params;

  const specId = specEntry.id;
  const savedConfig = await store.getTestPlanConfig(specId, sourceIndex);
  const executionSpeed = savedConfig?.executionSpeed ?? 'NORMAL';

  const config: RunConfig = {
    allowContinueOnFailure: false,
    allowRetryOnFailure: false,
    executionSpeed,
  };

  store.startRun(config, params);
  send({ type: 'RUN_AUTOMATION', automationIndex: sourceIndex, params, checkedSteps, config });
}

// Return to the landing page from the standalone Lab (no project loaded)
function backFromLab() {
  store.setActiveTab('tests');
}
</script>

<template>
  <div class="view active">
    <!-- Lab tab: visible regardless of project state -->
    <template v-if="store.state.activeTab === 'lab'">
      <!-- Standalone mode (no spec loaded): show a titled header + back button -->
      <div v-if="!store.state.currentProject" class="lab-standalone-header">
        <button class="btn btn-ghost btn-sm" @click="backFromLab" aria-label="Back">
          <font-awesome-icon :icon="['fas', 'arrow-left']" aria-hidden="true" />
        </button>
        <div class="lab-header-meta">
          <h2>Lab</h2>
          <p class="lab-header-subtitle">POM generation powered by AI</p>
        </div>
      </div>
      <!-- Loaded mode: normal tab navigation -->
      <TabBar v-else />
      <LabView />
    </template>

    <!-- Landing page: no spec loaded -->
    <LandingPage v-else-if="!store.state.currentProject" />

    <!-- Loaded state: spec loaded -->
    <template v-else>
      <LoadedHeader />
      <TabBar />

      <TestList
        v-if="store.state.activeTab === 'tests'"
        @select-test="selectTest"
        @quick-run-test="quickRunTest"
      />

      <AutomationList
        v-if="store.state.activeTab === 'automations'"
        @select-automation="selectAutomation"
        @quick-run-automation="quickRunAutomation"
        @select-instance="selectInstance"
        @quick-run-instance="quickRunInstance"
      />
    </template>
  </div>
</template>
