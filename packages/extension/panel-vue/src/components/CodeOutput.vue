<script setup lang="ts">
import { ref } from 'vue';
import { useLabStore } from '@/store/lab';

const { labState, setCopyConfirmation } = useLabStore();

const copyError = ref<string | null>(null);

async function copyToClipboard() {
  if (!labState.generatedCode) return;

  copyError.value = null;

  try {
    await navigator.clipboard.writeText(labState.generatedCode);
    setCopyConfirmation(true);
    setTimeout(() => {
      setCopyConfirmation(false);
    }, 2000);
  } catch {
    copyError.value = 'Could not copy to clipboard. Try selecting and copying manually.';
  }
}

function download() {
  if (!labState.generatedCode) return;

  const filename = (labState.generatedPomName ?? 'generated') + '.pom.ts';
  const blob = new Blob([labState.generatedCode], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
</script>

<template>
  <div class="code-output" v-if="labState.generatedCode">
    <div class="code-output-header">
      <h3>Generated POM</h3>
      <div class="code-output-actions">
        <button class="btn btn-ghost btn-sm" @click="copyToClipboard">
          {{ labState.copyConfirmation ? 'Copied ✓' : 'Copy' }}
        </button>
        <button class="btn btn-ghost btn-sm" @click="download">Download</button>
      </div>
    </div>

    <pre class="code-block"><code class="language-typescript">{{ labState.generatedCode }}</code></pre>

    <p v-if="copyError" class="code-output-error">{{ copyError }}</p>
  </div>
</template>

<style scoped>
.code-output {
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--bg-surface);
  box-shadow: var(--shadow-sm);
  overflow: hidden;
}

.code-output-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  background: var(--bg-elevated);
  border-bottom: 1px solid var(--border-subtle);
}

.code-output-header h3 {
  margin: 0;
}

.code-output-actions {
  display: flex;
  gap: 4px;
}

.code-block {
  padding: 12px;
  font-family: var(--font-mono);
  font-size: 12px;
  line-height: 1.6;
  overflow-x: auto;
  max-height: 300px;
  overflow-y: auto;
  white-space: pre;
  color: var(--text-primary);
  background: var(--bg-surface);
  margin: 0;
}

.code-output-error {
  color: var(--error);
  font-size: 12px;
  padding: 6px 12px;
  background: var(--error-soft);
  border-top: 1px solid var(--border-subtle);
}
</style>
