<script setup lang="ts">
import { useStore } from '@/store';
import { useMessaging } from '@/composables/useMessaging';
import { buildAllStepsChecked, buildDefaultParams } from '@/logic/quickRunHelpers';
import LandingPage from './LandingPage.vue';
import LoadedHeader from './LoadedHeader.vue';
import TabBar from './TabBar.vue';
import TestList from './TestList.vue';
import AutomationList from './AutomationList.vue';
import type { TestEntry, AutomationEntry } from '@/types/spec';
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

function quickRunTest(test: TestEntry, index: number) {
  if (!store.state.currentSpec) return;
  const runnable: Runnable = { type: 'test', index, data: test };
  store.selectRunnable(store.state.currentSpec, runnable);

  const checkedSteps = buildAllStepsChecked(test.steps);
  const config: RunConfig = {
    allowContinueOnFailure: false,
    allowRetryOnFailure: false,
    executionSpeed: 'NORMAL',
  };

  store.startRun(config);
  send({ type: 'RUN_TEST', testIndex: index, checkedSteps, config });
}

function quickRunAutomation(automation: AutomationEntry, index: number) {
  if (!store.state.currentSpec) return;
  const runnable: Runnable = { type: 'automation', index, data: automation };
  store.selectRunnable(store.state.currentSpec, runnable);

  const checkedSteps = buildAllStepsChecked(automation.steps);
  const params = buildDefaultParams(automation.params);
  const config: RunConfig = {
    allowContinueOnFailure: false,
    allowRetryOnFailure: false,
    executionSpeed: 'NORMAL',
  };

  store.startRun(config, params);
  send({ type: 'RUN_AUTOMATION', automationIndex: index, params, checkedSteps, config });
}
</script>

<template>
  <div class="view active">
    <!-- Landing page: no spec loaded -->
    <LandingPage v-if="!store.state.currentProject" />

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
      />
    </template>
  </div>
</template>
