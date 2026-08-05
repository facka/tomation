<script setup lang="ts">
import { useStore } from '@/store';

const store = useStore();

function dismiss(): void {
  store.state.errorMessage = null;
  store.setView('home');
}
</script>

<template>
  <div class="error-view">
    <div class="error-card">
      <div class="error-icon">⚠️</div>
      <p class="error-message">{{ store.state.errorMessage }}</p>
      <button class="dismiss-btn" @click="dismiss">Dismiss</button>
    </div>
  </div>
</template>

<style scoped>
.error-view {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  padding: 16px;
}

.error-card {
  text-align: center;
  padding: 24px;
  border-radius: 8px;
  background: var(--vscode-editorWidget-background, #1e1e1e);
  border: 1px solid var(--vscode-editorWidget-border, #454545);
  max-width: 400px;
  width: 100%;
}

.error-icon {
  font-size: 32px;
  margin-bottom: 12px;
}

.error-message {
  color: var(--vscode-errorForeground, #f48771);
  margin: 0 0 16px;
  font-size: 13px;
  line-height: 1.4;
  word-break: break-word;
}

.dismiss-btn {
  padding: 6px 14px;
  border: none;
  border-radius: 4px;
  background: var(--vscode-button-background, #0e639c);
  color: var(--vscode-button-foreground, #fff);
  cursor: pointer;
  font-size: 12px;
}

.dismiss-btn:hover {
  background: var(--vscode-button-hoverBackground, #1177bb);
}
</style>
