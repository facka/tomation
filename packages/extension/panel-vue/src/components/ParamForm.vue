<script setup lang="ts">
import { ref, watch } from 'vue';
import type { Param } from '@/types/spec';

const props = defineProps<{
  params: Param[];
  savedValues?: Record<string, unknown> | null;
}>();

const emit = defineEmits<{
  (e: 'update:values', values: Record<string, unknown>): void;
}>();

// Local form values keyed by param name
const formValues = ref<Record<string, string>>({});
const fieldErrors = ref<Record<string, boolean>>({});
const validationMessage = ref<string | null>(null);

// Initialize form values when params or savedValues change
watch(
  () => [props.params, props.savedValues] as const,
  ([params, saved]) => {
    const values: Record<string, string> = {};
    for (const param of params) {
      // Pre-fill from saved values, else use default, else empty
      if (saved && saved[param.name] !== undefined && saved[param.name] !== null) {
        values[param.name] = String(saved[param.name]);
      } else if (param.defaultValue) {
        values[param.name] = param.defaultValue;
      } else if (param.type === 'enum' && param.options && param.options.length > 0) {
        values[param.name] = param.options[0];
      } else {
        values[param.name] = '';
      }
    }
    formValues.value = values;
    fieldErrors.value = {};
    validationMessage.value = null;
    emitValues();
  },
  { immediate: true },
);

function onInput(paramName: string, value: string) {
  formValues.value[paramName] = value;
  // Clear error on edit
  if (fieldErrors.value[paramName]) {
    fieldErrors.value[paramName] = false;
  }
  validationMessage.value = null;
  emitValues();
}

function emitValues() {
  const result: Record<string, unknown> = {};
  for (const param of props.params) {
    const raw = formValues.value[param.name] || '';
    if (param.type === 'number' && raw) {
      result[param.name] = parseFloat(raw);
    } else {
      result[param.name] = raw;
    }
  }
  emit('update:values', result);
}

/**
 * Validate required fields. Returns true if valid, false otherwise.
 * Sets field errors and validation message on failure.
 */
function validate(): boolean {
  const emptyFields: string[] = [];
  const errors: Record<string, boolean> = {};

  for (const param of props.params) {
    if (param.optional) continue;
    const val = formValues.value[param.name];
    if (!val) {
      emptyFields.push(param.name);
      errors[param.name] = true;
    }
  }

  fieldErrors.value = errors;

  if (emptyFields.length > 0) {
    const plural = emptyFields.length > 1 ? 's' : '';
    validationMessage.value = `Required field${plural} missing: ${emptyFields.join(', ')}`;
    return false;
  }

  validationMessage.value = null;
  return true;
}

defineExpose({ validate });
</script>

<template>
  <div class="param-form">
    <h3>Parameters</h3>

    <div
      v-for="param in params"
      :key="param.name"
      class="param-row"
      :class="{ 'param-optional': param.optional }"
    >
      <label :for="'param-' + param.name">
        {{ param.name }}
        <span v-if="param.optional" class="optional-badge"> (optional)</span>
      </label>

      <!-- Enum: select input -->
      <select
        v-if="param.type === 'enum' && param.options && param.options.length > 0"
        :id="'param-' + param.name"
        :class="{ 'param-error': fieldErrors[param.name] }"
        :value="formValues[param.name]"
        @input="onInput(param.name, ($event.target as HTMLSelectElement).value)"
      >
        <option
          v-for="opt in param.options"
          :key="opt"
          :value="opt"
        >{{ opt }}</option>
      </select>

      <!-- Number input -->
      <input
        v-else-if="param.type === 'number'"
        :id="'param-' + param.name"
        type="number"
        :class="{ 'param-error': fieldErrors[param.name] }"
        :value="formValues[param.name]"
        :placeholder="param.defaultValue || ''"
        @input="onInput(param.name, ($event.target as HTMLInputElement).value)"
      />

      <!-- Date input -->
      <input
        v-else-if="param.type === 'date'"
        :id="'param-' + param.name"
        type="date"
        :class="{ 'param-error': fieldErrors[param.name] }"
        :value="formValues[param.name]"
        :placeholder="param.defaultValue || ''"
        @input="onInput(param.name, ($event.target as HTMLInputElement).value)"
      />

      <!-- Text input (default) -->
      <input
        v-else
        :id="'param-' + param.name"
        type="text"
        :class="{ 'param-error': fieldErrors[param.name] }"
        :value="formValues[param.name]"
        :placeholder="param.defaultValue || ''"
        @input="onInput(param.name, ($event.target as HTMLInputElement).value)"
      />
    </div>

    <div v-if="validationMessage" class="param-validation-message">
      {{ validationMessage }}
    </div>
  </div>
</template>
