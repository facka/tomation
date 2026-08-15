<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useStore } from '@/store';
import { useMessaging } from '@/composables/useMessaging';
import StepChecklist from './StepChecklist.vue';
import ParamForm from './ParamForm.vue';
import ConfigSection from './ConfigSection.vue';
import TestDataPanel from './TestDataPanel.vue';
import type { AutomationEntry } from '@/types/spec';
import type { RunConfig } from '@/types/store';

const store = useStore();
const { send } = useMessaging();

// --- Refs ---

const paramFormRef = ref<InstanceType<typeof ParamForm> | null>(null);
const configSectionRef = ref<InstanceType<typeof ConfigSection> | null>(null);
const checkedSteps = ref<number[]>([]);
const paramValues = ref<Record<string, unknown>>({});
const persistedConfig = ref<Partial<RunConfig> | undefined>(undefined);

// --- Computed ---

const runnable = computed(() => store.state.currentRunnable);
const isAutomation = computed(() => runnable.value?.type === 'automation');

const hasParams = computed(() => {
  if (!isAutomation.value || !runnable.value) return false;
  const data = runnable.value.data as AutomationEntry;
  return data.params && data.params.length > 0;
});

const automationParams = computed(() => {
  if (!hasParams.value || !runnable.value) return [];
  return (runnable.value.data as AutomationEntry).params;
});

const steps = computed(() => runnable.value?.data.steps || []);

const tasks = computed(() => store.state.currentSpec?.spec.tasks || {});

const pageElements = computed(() => store.state.currentSpec?.spec.pageElements || {});

const displayName = computed(() => {
  if (!runnable.value) return '';
  const name = runnable.value.data.name;
  // Strip namespace prefix (e.g., "Todo__Add Todo Item" → "Add Todo Item")
  return name.indexOf('__') !== -1 ? name.split('__').slice(1).join('__') : name;
});

const sourceFile = computed(() => runnable.value?.data.sourceFile || '');

const resolvedTestData = computed(() => store.state.resolvedTestData);

const hasTestData = computed(() => {
  return resolvedTestData.value !== null && Object.keys(resolvedTestData.value).length > 0;
});

const savedParamValues = computed(() => {
  if (!store.state.currentProject?.savedParams || !runnable.value) return null;
  return store.state.currentProject.savedParams[runnable.value.data.name] || null;
});

// --- Lifecycle ---

onMounted(async () => {
  if (store.state.currentSpec && runnable.value) {
    const specId = store.state.currentSpec.id;
    const runnableIndex = runnable.value.index;
    const config = await store.getTestPlanConfig(specId, runnableIndex);
    if (config) {
      persistedConfig.value = config;
    } else if (isAutomation.value) {
      // Default automations to debug mode enabled
      persistedConfig.value = {
        allowContinueOnFailure: true,
        allowRetryOnFailure: true,
        executionSpeed: 'NORMAL',
      };
    }
  }
});

// --- Actions ---

function goBack() {
  store.clearRunnable();
  store.setView('home');
}

function onCheckedStepsUpdate(steps: number[]) {
  checkedSteps.value = steps;
}

function onParamValuesUpdate(values: Record<string, unknown>) {
  paramValues.value = values;
}

function onRun() {
  // Validate params if present
  if (hasParams.value && paramFormRef.value) {
    const isValid = paramFormRef.value.validate();
    if (!isValid) return;
  }

  // Get config
  const config: RunConfig = configSectionRef.value
    ? configSectionRef.value.getConfig()
    : { allowContinueOnFailure: false, allowRetryOnFailure: false, executionSpeed: 'NORMAL' };

  // Persist config to storage
  if (store.state.currentSpec && runnable.value) {
    const specId = store.state.currentSpec.id;
    const runnableIndex = runnable.value.index;
    store.saveTestPlanConfig(specId, runnableIndex, config);
  }

  if (isAutomation.value && runnable.value) {
    store.startRun(config, paramValues.value);
    send({
      type: 'RUN_AUTOMATION',
      automationIndex: runnable.value.index,
      params: paramValues.value,
      checkedSteps: checkedSteps.value,
      config,
    });
  } else if (runnable.value) {
    store.startRun(config);
    send({
      type: 'RUN_TEST',
      testIndex: runnable.value.index,
      checkedSteps: checkedSteps.value,
      config,
    });
  }
}
</script>

<template>
  <div class="view active" v-if="runnable">
    <!-- Navigation row -->
    <div class="nav-row">
      <button class="btn btn-ghost btn-sm" @click="goBack"><font-awesome-icon :icon="['fas', 'arrow-left']" aria-hidden="true" /> Back</button>
      <h2>
        <span v-if="sourceFile" class="runnable-path">{{ sourceFile }}</span>
        <span class="runnable-name">{{ displayName }}</span>
      </h2>
    </div>

    <!-- Config section -->
    <ConfigSection ref="configSectionRef" :initial-config="persistedConfig" @update:config="() => {}" />

    <!-- Action bar -->
    <div class="action-bar">
      <button class="btn btn-primary" @click="onRun"><font-awesome-icon :icon="['fas', 'play']" aria-hidden="true" /> Run</button>
    </div>

    <!-- Parameter form (only for automations with params) -->
    <ParamForm
      v-if="hasParams"
      ref="paramFormRef"
      :params="automationParams"
      :saved-values="savedParamValues"
      @update:values="onParamValuesUpdate"
    />

    <!-- Test Data panel (shown when resolved data exists) -->
    <TestDataPanel
      v-if="hasTestData"
      :data="resolvedTestData!"
    />

    <!-- Step checklist -->
    <StepChecklist
      :steps="steps"
      :tasks="tasks"
      :page-elements="pageElements"
      @update:checked-steps="onCheckedStepsUpdate"
    />
  </div>
</template>
