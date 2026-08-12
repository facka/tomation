<script setup lang="ts">
import { useLabStore } from '@/store/lab';
import { useMessaging } from '@/composables/useMessaging';

const { labState, setContextMode, removeSelectedNode, clearSelectedNodes } = useLabStore();
const { send } = useMessaging();

function onContextModeChange(mode: 'full' | 'inspect') {
  setContextMode(mode);
  if (mode === 'full') {
    send({ type: 'GET_PAGE_HTML' });
  }
}

function toggleInspect() {
  if (labState.inspectMode) {
    send({ type: 'REMOVE_INSPECTOR' });
    labState.inspectMode = false;
  } else {
    labState.error = null;
    send({ type: 'INJECT_INSPECTOR' });
    labState.inspectMode = true;
  }
}
</script>

<template>
  <div class="inspect-section">
    <div class="context-mode-selector">
      <label class="context-mode-option">
        <input
          type="radio"
          name="contextMode"
          value="full"
          :checked="labState.contextMode === 'full'"
          @change="onContextModeChange('full')"
        />
        Generate with Full HTML
      </label>
      <label class="context-mode-option">
        <input
          type="radio"
          name="contextMode"
          value="inspect"
          :checked="labState.contextMode === 'inspect'"
          @change="onContextModeChange('inspect')"
        />
        Select elements with Inspect Element
      </label>
    </div>

    <button
      v-if="labState.contextMode === 'inspect'"
      class="btn inspect-toggle-btn"
      :class="{ active: labState.inspectMode }"
      @click="toggleInspect"
    >
      <span class="inspect-indicator" :class="{ on: labState.inspectMode }"></span>
      {{ labState.inspectMode ? 'Stop Inspecting' : 'Inspect Element' }}
    </button>

    <div v-if="labState.contextMode === 'inspect' && labState.selectedNodes.length > 0" class="selected-nodes-list">
      <div class="selected-nodes-header">
        <span class="selected-nodes-count">{{ labState.selectedNodes.length }} element{{ labState.selectedNodes.length !== 1 ? 's' : '' }} selected</span>
        <button class="btn btn-clear-all" @click="clearSelectedNodes()">Clear All</button>
      </div>

      <p v-if="labState.selectedNodes.length >= 20" class="cap-limit-message">
        Maximum of 20 nodes reached. Remove a node to add more.
      </p>

      <div
        v-for="(node, index) in labState.selectedNodes"
        :key="index"
        class="mini-editor"
      >
        <pre class="mini-editor-code">{{ node.outerHTML }}</pre>
        <button class="btn btn-delete-node" @click="removeSelectedNode(index)" title="Remove node">✕</button>
      </div>
    </div>

    <p v-if="labState.error" class="inspect-error">{{ labState.error }}</p>
  </div>
</template>

<style scoped>
.inspect-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.context-mode-selector {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.context-mode-option {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  cursor: pointer;
}

.context-mode-option input[type="radio"] {
  margin: 0;
}

.inspect-toggle-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.inspect-toggle-btn.active {
  background: var(--accent);
  color: #fff;
  border-color: var(--accent);
}

.inspect-toggle-btn.active:hover {
  background: var(--accent-hover);
  border-color: var(--accent-hover);
}

.inspect-indicator {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--text-muted);
  flex-shrink: 0;
}

.inspect-indicator.on {
  background: #4ade80;
  box-shadow: 0 0 4px #4ade80;
}

.inspect-error {
  color: var(--error);
  font-size: 12px;
  padding: 6px 8px;
  background: var(--error-soft);
  border-radius: var(--radius-sm);
}

.selected-nodes-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.selected-nodes-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.selected-nodes-count {
  font-size: 12px;
  color: var(--text-muted);
}

.btn-clear-all {
  font-size: 11px;
  padding: 2px 8px;
  color: var(--error);
  border-color: var(--error);
}

.btn-clear-all:hover {
  background: var(--error-soft);
}

.cap-limit-message {
  font-size: 12px;
  color: var(--warning, #f59e0b);
  padding: 4px 8px;
  background: var(--warning-soft, rgba(245, 158, 11, 0.1));
  border-radius: var(--radius-sm);
}

.mini-editor {
  position: relative;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--bg-elevated, #1e1e1e);
}

.mini-editor-code {
  margin: 0;
  padding: 8px 32px 8px 8px;
  font-size: 11px;
  line-height: 1.4;
  overflow-x: auto;
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 120px;
  overflow-y: auto;
  color: var(--text-primary, #d4d4d4);
  font-family: var(--font-mono, monospace);
}

.btn-delete-node {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 20px;
  height: 20px;
  padding: 0;
  font-size: 12px;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  color: var(--text-muted);
  border-color: transparent;
  background: transparent;
}

.btn-delete-node:hover {
  color: var(--error);
  background: var(--error-soft);
}
</style>
