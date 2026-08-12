<script setup lang="ts">
import { ref, watch, computed, onMounted } from 'vue';
import { useLabStore } from '@/store/lab';
import type { AIConfig } from '@/types/lab';

const { labState, saveAIConfig } = useLabStore();

const isCollapsed = ref(false);

onMounted(() => {
  const key = labState.aiConfig?.apiKey ?? '';
  isCollapsed.value = key.trim().length > 0;
});

const PROVIDER_MODELS: Record<string, string[]> = {
  openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'],
  anthropic: ['claude-sonnet-4-20250514', 'claude-haiku-4-20250514', 'claude-3-5-sonnet-20241022'],
  gemini: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash'],
};

const PROVIDER_ENDPOINTS: Record<string, string> = {
  openai: 'https://api.openai.com/v1/chat/completions',
  anthropic: 'https://api.anthropic.com/v1/messages',
  gemini: 'https://generativelanguage.googleapis.com/v1beta',
};

const provider = ref<AIConfig['provider']>(labState.aiConfig?.provider ?? 'openai');
const apiKey = ref(labState.aiConfig?.apiKey ?? '');
const model = ref(labState.aiConfig?.model ?? '');
const endpointUrl = ref(labState.aiConfig?.endpointUrl ?? PROVIDER_ENDPOINTS['openai'] ?? '');
const showKey = ref(false);
const validationError = ref<string | null>(null);
const saveSuccess = ref(false);

// Sync form fields when stored config loads
watch(
  () => labState.aiConfig,
  (config) => {
    if (config) {
      provider.value = config.provider;
      apiKey.value = config.apiKey;
      model.value = config.model;
      endpointUrl.value = config.endpointUrl;
    }
  },
  { immediate: true },
);

// When provider changes, update endpoint and reset model
watch(provider, (newProvider) => {
  if (newProvider !== 'custom') {
    endpointUrl.value = PROVIDER_ENDPOINTS[newProvider] ?? '';
    // Reset model to first available for that provider
    const models = PROVIDER_MODELS[newProvider];
    if (models && models.length > 0 && !models.includes(model.value)) {
      model.value = models[0];
    }
  }
});

const isCustomProvider = computed(() => provider.value === 'custom');

const currentModels = computed(() => {
  if (isCustomProvider.value) return [];
  return PROVIDER_MODELS[provider.value] ?? [];
});

const PROVIDER_LABELS: Record<string, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  gemini: 'Google Gemini',
  custom: 'Custom Endpoint',
};

const collapsedProviderName = computed(() => {
  return PROVIDER_LABELS[provider.value] ?? provider.value;
});

const collapsedModelName = computed(() => {
  return model.value || 'No model';
});

async function onSave() {
  validationError.value = null;
  saveSuccess.value = false;

  const config: AIConfig = {
    provider: provider.value,
    endpointUrl: endpointUrl.value,
    apiKey: apiKey.value,
    model: model.value,
  };

  const result = await saveAIConfig(config);
  if (!result.success) {
    validationError.value = result.error ?? 'Validation failed';
  } else {
    saveSuccess.value = true;
    setTimeout(() => { saveSuccess.value = false; }, 2000);
  }
}
</script>

<template>
  <div class="ai-config-section">
    <div class="ai-config-summary" @click="isCollapsed = !isCollapsed">
      <span v-if="isCollapsed" class="ai-config-collapsed-info">
        AI Configuration — {{ collapsedProviderName }} · {{ collapsedModelName }} <span class="ai-config-check">✓</span>
      </span>
      <span v-else>AI Configuration</span>
    </div>

    <div v-if="!isCollapsed" class="ai-config-form">
      <!-- Provider -->
      <div class="config-field">
        <label class="config-label">Provider</label>
        <select v-model="provider" class="config-select">
          <option value="openai">OpenAI</option>
          <option value="anthropic">Anthropic</option>
          <option value="gemini">Google Gemini</option>
          <option value="custom">Custom Endpoint</option>
        </select>
      </div>

      <!-- API Key -->
      <div class="config-field">
        <label class="config-label">API Key</label>
        <div class="key-input-wrapper">
          <input
            :type="showKey ? 'text' : 'password'"
            v-model="apiKey"
            class="config-input"
            placeholder="Enter your API key"
          />
          <button
            type="button"
            class="btn btn-ghost btn-sm key-toggle"
            @click="showKey = !showKey"
          >
            {{ showKey ? 'Hide' : 'Show' }}
          </button>
        </div>
      </div>

      <!-- Model -->
      <div class="config-field">
        <label class="config-label">Model</label>
        <select v-if="!isCustomProvider && currentModels.length > 0" v-model="model" class="config-select">
          <option v-for="m in currentModels" :key="m" :value="m">{{ m }}</option>
        </select>
        <input
          v-else
          type="text"
          v-model="model"
          class="config-input"
          placeholder="Model name"
        />
      </div>

      <!-- Endpoint (custom provider) -->
      <div v-if="isCustomProvider" class="config-field">
        <label class="config-label">Endpoint URL</label>
        <input
          type="text"
          v-model="endpointUrl"
          class="config-input"
          placeholder="https://your-api-endpoint.com/v1/chat/completions"
        />
      </div>

      <!-- Validation Error -->
      <p v-if="validationError" class="config-validation-error">{{ validationError }}</p>

      <!-- Save -->
      <div class="config-actions">
        <button class="btn btn-primary btn-sm" @click="onSave">Save</button>
        <span v-if="saveSuccess" class="config-save-success">Saved ✓</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ai-config-section {
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--bg-surface);
  box-shadow: var(--shadow-sm);
}

.ai-config-summary {
  padding: 10px 12px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  color: var(--text-primary);
}

.ai-config-form {
  padding: 0 12px 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.config-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.config-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-secondary);
}

.config-input,
.config-select {
  width: 100%;
  padding: 6px 10px;
  font-size: 13px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--bg-surface);
  color: var(--text-primary);
  outline: none;
  transition: border-color 0.12s;
}

.config-input:focus,
.config-select:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px var(--accent-soft);
}

.key-input-wrapper {
  display: flex;
  gap: 6px;
  align-items: center;
}

.key-input-wrapper .config-input {
  flex: 1;
}

.key-toggle {
  flex-shrink: 0;
}

.config-validation-error {
  color: var(--error);
  font-size: 12px;
  padding: 6px 8px;
  background: var(--error-soft);
  border-radius: var(--radius-sm);
}

.config-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.config-save-success {
  font-size: 12px;
  color: var(--success);
  font-weight: 500;
}

.ai-config-collapsed-info {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.ai-config-check {
  color: var(--success);
  font-weight: 600;
}
</style>
