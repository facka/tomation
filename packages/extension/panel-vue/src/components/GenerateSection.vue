<script setup lang="ts">
import { ref } from 'vue';
import { useLabStore } from '@/store/lab';
import { useMessaging } from '@/composables/useMessaging';

const { labState, setContextMode, setGenerating, setError } = useLabStore();
const { send, onMessage } = useMessaging();

const generateError = ref<string | null>(null);

function onContextModeChange(mode: 'full' | 'subtree') {
  setContextMode(mode);
}

function validatePrerequisites(): string | null {
  if (!labState.selectedNode) {
    return 'Please select an element first using the inspector';
  }
  if (!labState.aiConfig) {
    return 'Please configure your AI provider and API key first';
  }
  if (!labState.aiConfig.apiKey || !labState.aiConfig.apiKey.trim()) {
    return 'Please enter a valid API key in the AI configuration';
  }
  if (!labState.aiConfig.model || !labState.aiConfig.model.trim()) {
    return 'Please select a model in the AI configuration';
  }
  return null;
}

function generate() {
  generateError.value = null;

  const prerequisiteError = validatePrerequisites();
  if (prerequisiteError) {
    generateError.value = prerequisiteError;
    return;
  }

  if (labState.contextMode === 'subtree') {
    sendGenerateRequest(labState.selectedNode!.outerHTML);
  } else {
    // Full HTML mode: request page HTML first
    requestFullPageHtml();
  }
}

function requestFullPageHtml() {
  setGenerating(true);
  send({ type: 'GET_PAGE_HTML' });

  // Listen for PAGE_HTML response
  const unsubscribe = onMessage((msg) => {
    if (msg.type === 'PAGE_HTML') {
      unsubscribe();

      if (msg.error || !msg.html) {
        setGenerating(false);
        generateError.value = msg.error ?? 'Could not retrieve HTML from the current page';
        return;
      }

      // Insert marker before selected node's outerHTML
      const selectedHtml = labState.selectedNode!.outerHTML;
      const markerPosition = msg.html.indexOf(selectedHtml);
      let htmlContext: string;

      if (markerPosition >= 0) {
        htmlContext =
          msg.html.slice(0, markerPosition) +
          '<!-- SELECTED_NODE -->' +
          msg.html.slice(markerPosition);
      } else {
        // If outerHTML not found in page, fall back to prepending marker
        htmlContext = '<!-- SELECTED_NODE -->' + selectedHtml;
      }

      sendGenerateRequest(htmlContext);
    }
  });
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
    <!-- Context Mode -->
    <div class="context-mode">
      <h3>HTML Context</h3>
      <div class="context-mode-options">
        <label class="context-radio">
          <input
            type="radio"
            name="contextMode"
            value="subtree"
            :checked="labState.contextMode === 'subtree'"
            @change="onContextModeChange('subtree')"
          />
          Selected Node Subtree
        </label>
        <label class="context-radio">
          <input
            type="radio"
            name="contextMode"
            value="full"
            :checked="labState.contextMode === 'full'"
            @change="onContextModeChange('full')"
          />
          Full HTML
        </label>
      </div>
    </div>

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

.context-mode h3 {
  margin-bottom: 6px;
}

.context-mode-options {
  display: flex;
  gap: 16px;
}

.context-radio {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--text-primary);
  cursor: pointer;
}

.context-radio input[type="radio"] {
  accent-color: var(--accent);
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
</style>
