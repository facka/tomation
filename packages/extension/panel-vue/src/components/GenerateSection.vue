<script setup lang="ts">
import { ref } from 'vue';
import { useLabStore } from '@/store/lab';
import { useMessaging } from '@/composables/useMessaging';

const { labState, setGenerating, setError } = useLabStore();
const { send } = useMessaging();

const PRIVACY_TEXT = 'Email addresses, passwords, and personally identifiable information are automatically stripped from HTML before sending to the AI service.';

const generateError = ref<string | null>(null);

function generate() {
  generateError.value = null;

  // Validate AI config
  if (!labState.aiConfig) {
    generateError.value = 'Please configure your AI provider and API key first';
    return;
  }
  if (!labState.aiConfig.apiKey || !labState.aiConfig.apiKey.trim()) {
    generateError.value = 'Please enter a valid API key in the AI configuration';
    return;
  }
  if (!labState.aiConfig.model || !labState.aiConfig.model.trim()) {
    generateError.value = 'Please select a model in the AI configuration';
    return;
  }

  // Validate content availability based on context mode
  if (labState.contextMode === 'inspect' && labState.selectedNodes.length === 0) {
    generateError.value = 'Please select at least one element before generating';
    return;
  }

  if (!labState.codeViewerContent || !labState.codeViewerContent.trim()) {
    generateError.value = 'No HTML content available. Please select elements or switch to Full HTML mode.';
    return;
  }

  sendGenerateRequest(labState.codeViewerContent);
}

function sendGenerateRequest(htmlContext: string) {
  setGenerating(true);
  setError(null);

  send({
    type: 'GENERATE_POM',
    htmlContext,
    contextMode: labState.contextMode,
    aiConfig: labState.aiConfig!,
  });
}
</script>

<template>
  <div class="generate-section">
    <!-- Generate Button -->
    <button
      class="btn btn-primary generate-btn"
      :disabled="labState.isGenerating"
      @click="generate"
    >
      <font-awesome-icon
        v-if="labState.isGenerating"
        :icon="['fas', 'spinner']"
        spin
        aria-hidden="true"
      />
      {{ labState.isGenerating ? 'Generating…' : 'Generate POM' }}
    </button>

    <p class="privacy-label">{{ PRIVACY_TEXT }}</p>

    <!-- Error -->
    <p v-if="generateError" class="generate-error">{{ generateError }}</p>
  </div>
</template>

<style scoped>
.generate-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.generate-btn {
  align-self: flex-start;
}

.generate-error {
  color: var(--error);
  font-size: 12px;
  padding: 6px 8px;
  background: var(--error-soft);
  border-radius: var(--radius-sm);
}

.privacy-label {
  font-size: 11px;
  color: var(--text-secondary);
  margin: 0;
  font-style: italic;
}
</style>
