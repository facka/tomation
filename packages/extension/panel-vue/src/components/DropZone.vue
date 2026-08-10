<script setup lang="ts">
import { useFileLoader } from '@/composables/useFileLoader';

const { error, isDragOver, handleFile, handleDrop, handleDragEnter, handleDragLeave } =
  useFileLoader();

function onDragOver(event: DragEvent) {
  event.preventDefault();
}

function onClick() {
  const input = document.getElementById('spec-file-input') as HTMLInputElement | null;
  if (input) {
    input.click();
  }
}

function onFileChange(event: Event) {
  const input = event.target as HTMLInputElement;
  if (input.files && input.files.length > 0) {
    handleFile(input.files[0]);
    input.value = '';
  }
}
</script>

<template>
  <div
    class="drop-zone-unified"
    :class="{ 'drag-over': isDragOver }"
    tabindex="0"
    role="button"
    aria-label="Load spec file"
    @click="onClick"
    @drop="handleDrop"
    @dragover="onDragOver"
    @dragenter="handleDragEnter"
    @dragleave="handleDragLeave"
  >
    <span class="drop-zone-label">Load Spec File</span>
    <span class="drop-zone-helper">or drag and drop a .tomation.json file here</span>
    <input
      type="file"
      id="spec-file-input"
      accept=".json,.tomation.json"
      aria-hidden="true"
      @change="onFileChange"
    />
  </div>
  <p v-if="error" class="drop-zone-error" role="alert" aria-live="polite">{{ error }}</p>
</template>

<style scoped>
#spec-file-input {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
</style>
