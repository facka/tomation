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

function getHostFromUrl(urlStr: string): string | null {
  try {
    const u = new URL(urlStr);
    return u.hostname;
  } catch {
    try {
      const u2 = new URL('https://' + urlStr);
      return u2.hostname;
    } catch {
      return null;
    }
  }
}

const urlMismatchWarning = computed(() => {
  const spec = store.state.currentSpec;
  const hostname = store.state.currentHostname;
  if (!spec || !hostname) return null;

  const meta = spec.spec.meta;
  if (!meta) return null;

  const urls = meta.urls || (meta.url ? [meta.url] : []);
  if (urls.length === 0) return null;

  const currentHost = hostname.trim().toLowerCase();
  const anyMatch = urls.some((u) => {
    const h = getHostFromUrl(u);
    return h && h.trim().toLowerCase().includes(currentHost);
  });

  if (!anyMatch) {
    return `This spec targets ${urls.join(', ')} but current site is ${hostname}`;
  }

  return null;
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
    <div v-if="urlMismatchWarning" class="url-warning-banner" role="alert">
      ⚠️ {{ urlMismatchWarning }}
    </div>
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

.url-warning-banner {
  background-color: var(--warning-bg, #fff3cd);
  color: var(--warning-text, #856404);
  border: 1px solid var(--warning-border, #ffc107);
  border-radius: 4px;
  padding: 8px 12px;
  font-size: 12px;
  line-height: 1.4;
  margin-bottom: 8px;
}
</style>
