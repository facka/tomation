<script setup lang="ts">
import { ref, watch } from 'vue';
import type { RunConfig } from '@/types/store';

const props = defineProps<{
  initialConfig?: Partial<RunConfig>;
}>();

const emit = defineEmits<{
  (e: 'update:config', config: RunConfig): void;
}>();

const debugMode = ref(false);
const executionSpeed = ref<'FAST' | 'NORMAL' | 'SLOW'>('NORMAL');

// Apply initial config if provided
watch(
  () => props.initialConfig,
  (config) => {
    if (config) {
      debugMode.value = !!(config.allowContinueOnFailure && config.allowRetryOnFailure);
      executionSpeed.value = config.executionSpeed || 'NORMAL';
    }
  },
  { immediate: true },
);

function onConfigChange() {
  const config: RunConfig = {
    allowContinueOnFailure: debugMode.value,
    allowRetryOnFailure: debugMode.value,
    executionSpeed: executionSpeed.value,
  };
  emit('update:config', config);
}

function getConfig(): RunConfig {
  return {
    allowContinueOnFailure: debugMode.value,
    allowRetryOnFailure: debugMode.value,
    executionSpeed: executionSpeed.value,
  };
}

defineExpose({ getConfig });
</script>

<template>
  <div class="config-section">
    <h3>Settings</h3>

    <div class="config-row">
      <label>
        <input
          type="checkbox"
          v-model="debugMode"
          @change="onConfigChange"
        />
        Debug Mode
      </label>
      <button
        type="button"
        class="info-btn"
        title="When enabled, failed steps can be retried or skipped without stopping the test run."
      ><font-awesome-icon :icon="['fas', 'circle-info']" /></button>
    </div>

    <div class="config-row">
      <label>
        Speed
        <select
          v-model="executionSpeed"
          @change="onConfigChange"
        >
          <option value="FAST">Fast</option>
          <option value="NORMAL">Normal</option>
          <option value="SLOW">Slow</option>
        </select>
      </label>
    </div>
  </div>
</template>
