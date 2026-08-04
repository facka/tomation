<script setup lang="ts">
import { computed } from 'vue';
import { useStore } from '@/store';
import { useFileLoader } from '@/composables/useFileLoader';

const store = useStore();
const { handleFile } = useFileLoader();

const specName = computed(() => {
  const spec = store.state.currentSpec;
  return spec?.spec.meta?.name || spec?.filename || 'Loaded Spec';
});

const specDescription = computed(() => {
  return store.state.currentSpec?.spec.meta?.description || '';
});

const fileInfo = computed(() => {
  const spec = store.state.currentSpec;
  if (!spec) return '';
  return spec.filename;
});

function onReload() {
  const input = document.getElementById('spec-file-input-alt') as HTMLInputElement | null;
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
  <div class="loaded-header">
    <div class="loaded-meta">
      <h2>{{ specName }}</h2>
      <p v-if="specDescription" class="loaded-description">{{ specDescription }}</p>
      <p class="loaded-file-info">{{ fileInfo }}</p>
    </div>
    <div class="loaded-actions">
      <button class="btn btn-sm btn-ghost" title="Load another spec" @click="onReload">⟳</button>
      <input
        type="file"
        id="spec-file-input-alt"
        accept=".json,.tomation.json"
        @change="onFileChange"
      />
    </div>
  </div>
</template>

<style scoped>
#spec-file-input-alt {
  display: none;
}
</style>
