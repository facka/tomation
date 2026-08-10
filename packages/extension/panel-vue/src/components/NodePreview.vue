<script setup lang="ts">
import { computed } from 'vue';
import { useLabStore } from '@/store/lab';

const { labState, clearSelectedNode } = useLabStore();

const MAX_HTML_PREVIEW = 200;

const truncatedHtml = computed(() => {
  if (!labState.selectedNode) return '';
  const html = labState.selectedNode.outerHTML;
  if (html.length <= MAX_HTML_PREVIEW) return html;
  return html.slice(0, MAX_HTML_PREVIEW) + '…';
});

const childSummary = computed(() => {
  if (!labState.selectedNode) return '';
  const count = labState.selectedNode.childElementCount;
  if (count === 0) return 'No child elements';
  if (count === 1) return '1 child element';
  return `${count} child elements`;
});
</script>

<template>
  <div class="node-preview" v-if="labState.selectedNode">
    <div class="node-preview-header">
      <span class="node-tag">&lt;{{ labState.selectedNode.tagName.toLowerCase() }}&gt;</span>
      <button class="btn btn-ghost btn-sm" @click="clearSelectedNode">Clear</button>
    </div>
    <p class="node-child-summary">{{ childSummary }}</p>
    <pre class="node-html-preview"><code>{{ truncatedHtml }}</code></pre>
  </div>

  <div class="node-preview-empty" v-else>
    <p class="node-empty-text">No element selected. Use the inspector to select a DOM node.</p>
  </div>
</template>

<style scoped>
.node-preview {
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--bg-surface);
  padding: 10px 12px;
  box-shadow: var(--shadow-sm);
}

.node-preview-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}

.node-tag {
  font-family: var(--font-mono);
  font-size: 13px;
  font-weight: 600;
  color: var(--accent-text);
}

.node-child-summary {
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: 8px;
}

.node-html-preview {
  background: var(--bg-elevated);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  padding: 8px 10px;
  font-family: var(--font-mono);
  font-size: 11px;
  line-height: 1.5;
  overflow-x: auto;
  white-space: pre-wrap;
  word-break: break-all;
  color: var(--text-secondary);
  max-height: 120px;
  overflow-y: auto;
}

.node-preview-empty {
  border: 1px dashed var(--border);
  border-radius: var(--radius-md);
  padding: 16px 12px;
  text-align: center;
}

.node-empty-text {
  font-size: 12px;
  color: var(--text-muted);
}
</style>
